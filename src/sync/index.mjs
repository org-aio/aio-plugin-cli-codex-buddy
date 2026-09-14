import { join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readConnection, editCatalogSetting } from '../config/index.mjs';
import { findBinary } from '../runtime/binary.mjs';
import { atomicWrite, command, readJson, withLock } from '../runtime/index.mjs';
import { buildCatalog, indexModels } from '../catalog/index.mjs';
import { fetchJson } from './http.mjs';

export async function syncModels(home, { codexBin, setup = false } = {}) {
  const directory = join(home, 'model-sync');
  return withLock(directory, async () => {
    try {
      const state = await readJson(join(directory, 'state.json'), {});
      if (state.uninstalled && !setup) throw new Error('Model sync was uninstalled. Run setup to enable it again.');
      const connection = await readConnection(home);
      const catalogPath = join(directory, 'catalog.json');
      if (state.configured && !setup && connection.catalogPath !== catalogPath) {
        throw new Error('model_catalog_json was changed outside this tool. Run setup to reconfigure.');
      }
      const binary = await findBinary(codexBin || state.codexBinary);
      const bundled = JSON.parse(await command(binary, ['debug', 'models', '--bundled']));
      const listing = await fetchJson(connection.url, connection.headers);
      indexModels(listing.data, 'id');
      const version = (await command(binary, ['--version'])).trim().split(/\s+/).at(-1);
      const manifestUrl = new URL(connection.url);
      manifestUrl.searchParams.set('client_version', version);
      let manifest = {};
      try {
        const result = await fetchJson(manifestUrl, connection.headers);
        if (Array.isArray(result.models)) manifest = result;
      } catch { /* Standard OpenAI-compatible servers need not implement a Codex manifest. */ }
      const existing = connection.catalogPath ? await readJson(connection.catalogPath, {}) : {};
      const catalog = buildCatalog(listing, existing, bundled, manifest);
      const current = await readJson(catalogPath, {});
      const changed = !isDeepStrictEqual(current, catalog);
      if (changed) {
        const candidate = join(directory, `candidate-${randomUUID()}.json`);
        try {
          await atomicWrite(candidate, catalog);
          const loaded = JSON.parse(await command(binary, ['debug', 'models', '-c', `model_catalog_json=${JSON.stringify(candidate)}`]));
          const expected = [...indexModels(catalog.models, 'slug').keys()].sort();
          const actual = [...indexModels(loaded.models, 'slug').keys()].sort();
          if (!isDeepStrictEqual(expected, actual)) throw new Error('Codex did not load the complete catalog.');
        } finally { await rm(candidate, { force: true }); }
        if (current.models) await atomicWrite(join(directory, 'previous-catalog.json'), current);
        await atomicWrite(catalogPath, catalog);
      }
      if (!state.configured || state.uninstalled) {
        state.originalCatalog = connection.config.model_catalog_json ?? null;
        await atomicWrite(join(directory, 'initial-catalog-setting.json'), { model_catalog_json: state.originalCatalog });
      }
      const source = await readFile(connection.configFile, 'utf8');
      if (source !== connection.source) throw new Error('Codex config changed during synchronization; retry.');
      if (connection.catalogPath !== catalogPath) {
        await atomicWrite(connection.configFile, editCatalogSetting(source, catalogPath));
      }
      await atomicWrite(join(directory, 'state.json'), { ...state, configured: true, uninstalled: false, codexBinary: binary });
      const before = new Set((existing.models || []).filter(model => model.visibility !== 'hide').map(model => model.slug));
      const after = new Set(listing.data.map(model => model.id));
      const result = {
        ok: true, checkedAt: new Date().toISOString(), changed, provider: connection.providerId,
        endpoint: connection.url.origin + connection.url.pathname, visibleCount: after.size,
        added: [...after].filter(id => !before.has(id)).sort(),
        removed: [...before].filter(id => !after.has(id)).sort(), catalogPath,
      };
      await atomicWrite(join(directory, 'status.json'), result);
      return result;
    } catch (error) {
      await atomicWrite(join(directory, 'status.json'), { ok: false, checkedAt: new Date().toISOString(), error: error.message });
      throw error;
    }
  });
}
