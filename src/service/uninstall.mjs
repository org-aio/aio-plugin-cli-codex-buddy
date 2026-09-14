import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { parse } from 'smol-toml';
import { atomicWrite, readJson, withLock } from '../runtime/index.mjs';
import { editCatalogSetting } from '../config/index.mjs';
import { removeService } from './remove.mjs';

export async function uninstall(home, { remove = removeService } = {}) {
  const directory = join(home, 'model-sync');
  const statePath = join(directory, 'state.json');
  const warnings = [];
  const recoverJson = async path => {
    try { return await readJson(path, {}); }
    catch { warnings.push(`Unreadable recovery metadata: ${path}`); return {}; }
  };
  const state = await recoverJson(statePath);
  const removal = Object.hasOwn(state, 'configured') && !state.service ? { service: null, warnings: [] }
    : await remove(home, state.service);
  warnings.push(...removal.warnings);
  const restore = async () => {
    // Read again after any in-flight sync has finished; a partial setup may have saved its backup meanwhile.
    const latest = await recoverJson(statePath);
    const backup = await recoverJson(join(directory, 'initial-catalog-setting.json'));
    const catalogPath = join(directory, 'catalog.json');
    let original = Object.hasOwn(latest, 'originalCatalog') ? latest.originalCatalog : backup.model_catalog_json;
    if (typeof original === 'string' && resolve(home, original) === catalogPath) original = backup.model_catalog_json;
    if (typeof original === 'string' && resolve(home, original) === catalogPath) original = undefined;
    const path = join(home, 'config.toml');
    let source;
    try { source = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const current = source === undefined ? undefined : parse(source).model_catalog_json;
    const restored = typeof current === 'string' && resolve(home, current) === catalogPath;
    if (restored && !Object.hasOwn(latest, 'originalCatalog') && !Object.hasOwn(backup, 'model_catalog_json')) {
      warnings.push('Original catalog setting is unavailable; removed only this tool\'s override.');
    }
    if (restored) await atomicWrite(path, editCatalogSetting(source, original ?? undefined));
    // Keep the legacy guard enabled: older runtime.mjs versions must reject the restored catalog too.
    await atomicWrite(statePath, { ...latest, originalCatalog: original ?? null, configured: true,
      uninstalled: true, service: removal.service });
    const result = { ok: warnings.length === 0, uninstalled: true, restored,
      config: source === undefined ? 'missing' : restored ? 'restored' : 'unchanged',
      serviceRemoved: !removal.service, warnings, backups: directory };
    await atomicWrite(join(directory, 'status.json'), { ...result, checkedAt: new Date().toISOString() });
    return result;
  };
  const deadline = Date.now() + 180000;
  for (;;) {
    try { return await withLock(directory, restore); }
    catch (error) {
      if (error.code !== 'ELOCKED' || Date.now() >= deadline) throw error;
      await setTimeout(250);
    }
  }
}
