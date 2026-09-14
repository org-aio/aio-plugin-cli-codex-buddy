import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm, chmod, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'smol-toml';
import { genericModel } from '../src/catalog/index.mjs';
import { withLock, command } from '../src/runtime/index.mjs';

const exec = promisify(execFile);
const cli = resolve('dist/cli.mjs');

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'model-sync-e2e-'));
  const native = { ...genericModel('native'), description: 'Native fixture', priority: 1 };
  const binary = join(home, 'fake-codex.mjs');
  await writeFile(binary, `#!${process.execPath}\nimport fs from 'node:fs';\nconst args = process.argv.slice(2);\nif (args.includes('--version')) console.log('codex-cli 0.153.4');\nelse if (args.includes('--bundled')) console.log(${JSON.stringify(JSON.stringify({ models: [native] }))});\nelse {\n if (fs.existsSync(${JSON.stringify(join(home, 'validation-fails'))})) process.exit(2);\n const value = args.find(arg => arg.startsWith('model_catalog_json='));\n console.log(fs.readFileSync(JSON.parse(value.slice(value.indexOf('=') + 1)), 'utf8'));\n}\n`);
  await chmod(binary, 0o755);
  const state = { ids: ['native', 'old-custom'], httpStatus: 200, requests: [], key: 'fixture-key', manifestStatus: 404 };
  const server = createServer((request, response) => {
    state.requests.push({ url: request.url, authorization: request.headers.authorization });
    if (request.headers.authorization !== `Bearer ${state.key}`) {
      response.writeHead(401).end('{}'); return;
    }
    if (request.url.includes('client_version')) { response.writeHead(state.manifestStatus).end('{}'); return; }
    response.writeHead(state.httpStatus, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ object: 'list', data: state.ids.map(id => ({ id })) }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = `# preserve my config\nmodel_provider = "custom"\nmodel = "native"\n[model_providers.custom]\nbase_url = "${base}"\nwire_api = "responses"\nrequires_openai_auth = true\n[features]\ngoals = true\n`;
  await writeFile(join(home, 'config.toml'), config);
  await writeFile(join(home, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: state.key }));
  const env = { ...process.env }; delete env.OPENAI_API_KEY;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(home, { recursive: true, force: true }); });
  const run = (...args) => exec(process.execPath, [cli, ...args, '--home', home, '--codex-bin', binary, '--json'], { env, timeout: 30000 });
  return { home, state, run, config, server, env };
}

test('packaged CLI configures from auth.json, tracks additions/removals and rereads credentials', async t => {
  const { home, state, run, config } = await fixture(t);
  const first = JSON.parse((await run('setup', '--no-service')).stdout);
  assert.equal(first.visibleCount, 2);
  assert.equal(state.requests[0].url, '/v1/models');
  assert.equal(state.requests[0].authorization, 'Bearer fixture-key');
  const configFile = join(home, 'config.toml');
  const path = parse(await readFile(configFile, 'utf8')).model_catalog_json;
  const firstContent = await readFile(path, 'utf8');
  assert.ok(!firstContent.includes('fixture-key'));
  assert.deepEqual(parse(await readFile(configFile, 'utf8')), { ...parse(config), model_catalog_json: path });
  state.ids = ['new-custom', 'native'];
  const second = JSON.parse((await run('sync')).stdout);
  assert.deepEqual(second.added, ['new-custom']);
  assert.deepEqual(second.removed, ['old-custom']);
  const unchangedMtime = (await stat(path)).mtimeMs;
  state.ids.reverse();
  assert.equal(JSON.parse((await run('sync')).stdout).changed, false);
  assert.equal((await stat(path)).mtimeMs, unchangedMtime);
  state.key = 'rotated-fixture-key';
  await writeFile(join(home, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: state.key }));
  await run('sync');
  assert.equal(state.requests.at(-1).authorization, 'Bearer rotated-fixture-key');
  await writeFile(configFile, (await readFile(configFile, 'utf8')) + '\n[unrelated]\nkeep = true\n');
  await run('uninstall');
  assert.deepEqual(parse(await readFile(configFile, 'utf8')), { ...parse(config), unrelated: { keep: true } });
});

test('failed HTTP, empty list, duplicate IDs, and Codex rejection preserve the last catalog', async t => {
  const { home, state, run } = await fixture(t);
  await run('setup', '--no-service');
  const path = join(home, 'model-sync', 'catalog.json');
  const configPath = join(home, 'config.toml');
  const before = await readFile(path, 'utf8');
  const beforeConfig = await readFile(configPath, 'utf8');
  for (const change of [() => { state.httpStatus = 503; }, () => { state.httpStatus = 200; state.ids = []; }, () => { state.ids = ['x', 'x']; }, async () => { state.ids = ['new']; await writeFile(join(home, 'validation-fails'), 'yes'); }]) {
    await change();
    await assert.rejects(run('sync'));
    assert.equal(await readFile(path, 'utf8'), before);
    assert.equal(await readFile(configPath, 'utf8'), beforeConfig);
  }
  const status = JSON.parse((await run('status')).stdout);
  assert.equal(status.ok, false);
  assert.ok(!JSON.stringify(status).includes('fixture-key'));
});

test('changing provider base_url is picked up and a manual catalog override is respected', async t => {
  const { home, run, state } = await fixture(t);
  await run('setup', '--no-service');
  const configPath = join(home, 'config.toml');
  let source = await readFile(configPath, 'utf8');
  source = source.replace(/base_url = "([^"]+)"/, 'base_url = "$1/custom-api"');
  await writeFile(configPath, source);
  await run('sync');
  assert.ok(state.requests.some(request => request.url === '/custom-api/models'));
  await writeFile(configPath, source.replace(/model_catalog_json = .*/, 'model_catalog_json = "manual.json"'));
  await assert.rejects(run('sync'), error => error.stderr.includes('changed outside this tool'));
  assert.ok((await readFile(configPath, 'utf8')).includes('"manual.json"'));
});

test('process lock blocks concurrent writes and recovers a dead owner', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-lock-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await withLock(directory, async () => {
    await assert.rejects(withLock(directory, async () => {}), /Another model sync/);
  });
  const exited = execFile(process.execPath, ['-e', 'process.exit(0)']);
  const pid = exited.pid;
  await new Promise(resolve => exited.on('exit', resolve));
  await mkdir(join(directory, 'sync.lock'));
  await writeFile(join(directory, 'sync.lock', 'owner.json'), JSON.stringify({ pid }));
  await withLock(directory, async () => assert.ok(true));
});

test('background commands can run npm Node shims with a minimal service PATH', { skip: process.platform === 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'node-shim-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binary = join(directory, 'shim');
  await writeFile(binary, '#!/usr/bin/env node\nconsole.log("shim-ok")\n');
  await chmod(binary, 0o755);
  assert.equal((await command(binary, [], { env: { PATH: '/usr/bin:/bin' } })).trim(), 'shim-ok');
});

test('Windows accepts the scheduled task and uninstall removes it', { skip: process.platform !== 'win32' }, async t => {
  const { home, run, env } = await fixture(t);
  const { serviceId } = await import('../src/service/templates.mjs');
  const id = serviceId(home);
  t.after(async () => { try { await exec('schtasks.exe', ['/Delete', '/TN', id, '/F'], { env }); } catch { /* Already removed. */ } });
  try {
    await run('setup');
    await exec('schtasks.exe', ['/Query', '/TN', id], { env });
    await run('uninstall');
    await assert.rejects(exec('schtasks.exe', ['/Query', '/TN', id], { env }));
  } catch (error) {
    const xml = await readFile(join(home, 'model-sync', 'task.xml'), 'utf8').catch(() => '');
    t.diagnostic(`Task registration failed: ${error.stderr || error.message}; XML bytes: ${xml.length}`);
    throw error;
  }
});
