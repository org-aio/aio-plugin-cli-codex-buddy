import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHealth, reliability, connectionBinding } from '../src/routing/health.mjs';
import { selectModel, defaultPolicy } from '../src/routing/policy.mjs';

test('dedicated key, credential scope, stale data and zero samples', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'router-health-'));
  const keyFile = join(dir, 'key'); await writeFile(keyFile, 'fixture-metrics-key');
  const state = { group_id: 6, scope: 'group', data_through: new Date().toISOString(), minimum_samples: 10,
    models: [{ id: 'glm', sample_count: 0, success_requests: 0 }, { id: 'kimi', sample_count: 20, success_requests: 18 }] };
  let seen;
  const server = createServer((req, res) => { seen = req.headers.authorization; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(state)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(dir, { recursive: true, force: true }); });
  const connection = { url: new URL(`http://127.0.0.1:${server.address().port}/v1/models`) };
  const config = { keyFile, groupId: 6, providerBinding: connectionBinding(connection) };
  const live = await loadHealth(connection, config);
  assert.equal(live.status, 'live'); assert.equal(seen, 'Bearer fixture-metrics-key');
  assert.equal(live.models[0].successRate, null); assert.equal(live.models[1].successRate, 0.9);
  assert.equal((await loadHealth(connection, { ...config, groupId: 7 })).status, 'scope-mismatch');
  assert.equal((await loadHealth({ ...connection, headers: new Headers({ Authorization: 'Bearer rotated' }) }, config)).status, 'scope-mismatch');
  assert.equal((await loadHealth(connection, { ...config, url: 'https://example.invalid/health' })).status, 'unavailable');
  state.data_through = '2000-01-01T00:00:00Z';
  assert.equal((await loadHealth(connection, config)).status, 'stale');
});
test('success rate selects alternatives inside the same capability tier with sufficient samples', () => {
  const a = { id: 'powerful-but-failing', capability: 95, economy: 90, purpose: 'general', tools: true,
    health: { samples: 100, successRate: 0.2, minimumSamples: 10 } };
  const b = { id: 'healthy-alternative', capability: 92, economy: 70, purpose: 'general', tools: true };
  assert.equal(selectModel([a, b], defaultPolicy, { tier: 'advanced' }).model, b.id);
  a.health.samples = 1;
  assert.equal(reliability(a), 1);
  assert.equal(selectModel([a, b], defaultPolicy, { tier: 'advanced' }).model, a.id);
});
