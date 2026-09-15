import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { editCatalogSetting, modelUrl, readConnection } from '../src/config/index.mjs';
import { genericModel, buildCatalog } from '../src/catalog/index.mjs';
import { launchAgent, userService, windowsTask, windowsArg, serviceId } from '../src/service/templates.mjs';

test('provider URL preserves configured API prefixes', () => {
  assert.equal(modelUrl('https://example.com').href, 'https://example.com/v1/models');
  assert.equal(modelUrl('https://example.com/v1/').href, 'https://example.com/v1/models');
  assert.equal(modelUrl('https://example.com/api/openai?tenant=1').href, 'https://example.com/api/openai/models?tenant=1');
  assert.throws(() => modelUrl('https://key@example.com'), /credentials/);
});

test('TOML editing preserves nested keys, comments and misleading multiline strings', () => {
  const source = `# keep\ntext = '''\nmodel_catalog_json = "inside string"\n'''\nmodel_catalog_json = "old.json" # old setting\n[other]\nmodel_catalog_json = "nested.json"\n`;
  const updated = editCatalogSetting(source, '/new path/catalog.json');
  assert.deepEqual(parse(updated), { ...parse(source), model_catalog_json: '/new path/catalog.json' });
  assert.ok(updated.includes('# keep'));
  assert.ok(updated.includes('model_catalog_json = "inside string"'));
  const removed = parse(editCatalogSetting(updated, undefined));
  assert.equal(removed.model_catalog_json, undefined);
  assert.equal(removed.other.model_catalog_json, 'nested.json');
});

test('credentials use explicit env_key, auth file and configured headers without cross-account fallback', async t => {
  const home = await mkdtemp(join(tmpdir(), 'model-config-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const base = 'model_provider = "custom"\n[model_providers.custom]\nbase_url = "https://example.com"\n';
  await writeFile(join(home, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'fixture-file-key' }));
  await writeFile(join(home, 'config.toml'), base);
  assert.equal((await readConnection(home, {})).headers.get('Authorization'), 'Bearer fixture-file-key');
  await writeFile(join(home, 'config.toml'), base + 'env_key = "CUSTOM_KEY"\n');
  await assert.rejects(readConnection(home, { OPENAI_API_KEY: 'wrong-account' }), /CUSTOM_KEY/);
  assert.equal((await readConnection(home, { CUSTOM_KEY: 'fixture-env-key' })).headers.get('Authorization'), 'Bearer fixture-env-key');
  await writeFile(join(home, 'config.toml'), base + '[model_providers.custom.http_headers]\nAuthorization = "Bearer fixture-header-key"\n');
  assert.equal((await readConnection(home, {})).headers.get('Authorization'), 'Bearer fixture-header-key');
  await writeFile(join(home, 'config.toml'), base + 'env_key = "CUSTOM_KEY"\n');
  await assert.rejects(readConnection(home, { CUSTOM_KEY: 'private-value\ninvalid' }), error => !error.message.includes('private-value'));
  await writeFile(join(home, 'config.toml'), base + `[model_providers.custom.auth]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ["-e", "console.log('fixture-command-key')"]\n`);
  assert.equal((await readConnection(home, {})).headers.get('Authorization'), 'Bearer fixture-command-key');
});

test('only API IDs appear, in API order, while matching models retain their capabilities', () => {
  const native = { ...genericModel('native'), display_name: 'Old label', supported_reasoning_levels: [{ effort: 'xhigh', description: 'native' }] };
  const existing = { models: [{ ...genericModel('removed') }, { ...genericModel('internal'), visibility: 'hide' }] };
  const bundled = { models: [native, genericModel('bundled-only')] };
  const manifest = { models: [genericModel('manifest-only')] };
  const listing = { data: [{ id: 'new' }, { id: 'native' }] };
  const output = buildCatalog(listing, existing, bundled, manifest);
  assert.deepEqual(output.models.map(model => model.slug), ['new', 'native']);
  assert.deepEqual(output.models.map(model => model.display_name), ['new', 'native']);
  assert.deepEqual(output.models[1].supported_reasoning_levels, native.supported_reasoning_levels);
  assert.deepEqual(buildCatalog(listing, output, bundled, manifest), output);
  const reversed = buildCatalog({ data: [...listing.data].reverse() }, output, bundled, manifest);
  assert.deepEqual(reversed.models.map(model => model.slug), ['native', 'new']);
  assert.deepEqual(buildCatalog({ data: [{ id: 'new' }] }, output, bundled, manifest).models.map(model => model.slug), ['new']);
  assert.throws(() => buildCatalog({ data: [] }, existing, bundled), /empty/);
  assert.throws(() => buildCatalog({ data: [{ id: 'x' }, { id: 'x' }] }, existing, bundled), /duplicate/);
});

test('scheduler templates escape executable and argument paths', () => {
  const options = { id: 'sample', home: '/home/a & b', directory: '/tmp/a & b', runtime: '/tmp/worker %.mjs', node: '/node $path', interval: 300, user: 'DOMAIN\\user' };
  assert.match(launchAgent(options), /a &amp; b/);
  assert.match(userService(options), /worker %%\.mjs/);
  assert.ok(userService(options).includes('/node $$path'));
  assert.match(windowsTask(options), /PT5M/);
  assert.match(windowsTask(options), /a &amp; b/);
  assert.equal(windowsArg('C:\\test path\\'), '"C:\\test path\\\\"');
  assert.notEqual(serviceId('/home/a'), serviceId('/home/b'));
});
