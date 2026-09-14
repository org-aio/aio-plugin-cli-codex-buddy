import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { uninstall } from '../src/service/uninstall.mjs';
import { removeService } from '../src/service/remove.mjs';
import { withLock } from '../src/runtime/index.mjs';

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'uninstall-'));
  const directory = join(home, 'model-sync');
  await mkdir(directory);
  t.after(() => rm(home, { recursive: true, force: true }));
  const configPath = join(home, 'config.toml');
  await writeFile(configPath, `model_catalog_json = ${JSON.stringify(join(directory, 'catalog.json'))}\nmodel = "keep-model"\n[unrelated]\nkeep = true\n`);
  const auth = '{"OPENAI_API_KEY":"keep-fixture-key"}';
  await writeFile(join(home, 'auth.json'), auth);
  const save = (name, value) => writeFile(join(directory, name), JSON.stringify(value));
  const removed = async () => ({ service: null, warnings: [] });
  return { home, directory, configPath, auth, save, removed };
}

test('scheduler failures still restore config, preserve credentials, and retain cleanup metadata for retry', async t => {
  const { home, directory, configPath, auth, save, removed } = await fixture(t);
  const service = { id: 'fixture', platform: 'win32', files: [] };
  await save('state.json', { configured: true, originalCatalog: 'original.json', service });
  const result = await uninstall(home, { remove: async () => ({ service, warnings: ['scheduler unavailable'] }) });
  assert.equal(result.ok, false);
  assert.equal(result.restored, true);
  assert.equal(result.serviceRemoved, false);
  assert.deepEqual(parse(await readFile(configPath, 'utf8')), { model_catalog_json: 'original.json', model: 'keep-model', unrelated: { keep: true } });
  assert.equal(await readFile(join(home, 'auth.json'), 'utf8'), auth);
  const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
  assert.equal(state.configured, true); // Pre-0.1.3 workers reject the restored path with this guard.
  assert.equal(state.uninstalled, true);
  assert.deepEqual(state.service, service);
  assert.equal((await uninstall(home, { remove: removed })).ok, true);
});

test('partial installation recovers original setting from backup and preserves a manual override', async t => {
  const { home, configPath, save, removed } = await fixture(t);
  await save('initial-catalog-setting.json', { model_catalog_json: 'before.json' });
  assert.equal((await uninstall(home, { remove: removed })).restored, true);
  assert.equal(parse(await readFile(configPath, 'utf8')).model_catalog_json, 'before.json');
  await writeFile(configPath, 'model_catalog_json = "manual.json"\n');
  assert.equal((await uninstall(home, { remove: removed })).restored, false);
  assert.equal(await readFile(configPath, 'utf8'), 'model_catalog_json = "manual.json"\n');
});

test('uninstall waits for an active sync before restoring its final config and backup', async t => {
  const { home, directory, configPath, save, removed } = await fixture(t);
  let pending;
  await withLock(directory, async () => {
    pending = uninstall(home, { remove: removed });
    await new Promise(resolve => setTimeout(resolve, 80));
    await save('state.json', { configured: true, originalCatalog: null });
  });
  assert.equal((await pending).restored, true);
  assert.equal(parse(await readFile(configPath, 'utf8')).model_catalog_json, undefined);
});

test('missing Windows task is tolerated, but task deletion failures are reported', async () => {
  const service = { id: 'codex-model-sync-fixture', platform: 'win32', files: [] };
  const run = listing => async (_, args) => {
    if (args[0] === '/Query') return listing;
    throw Object.assign(new Error('scheduler rejected request'), { code: 1 });
  };
  const missing = await removeService('/unused', service, run('"\\unrelated-task","Ready"'));
  assert.equal(missing.service, null);
  const denied = await removeService('/unused', service, run('"\\codex-model-sync-fixture","Ready"'));
  assert.equal(denied.warnings.length, 1);
  assert.deepEqual(denied.service, service);
});
