import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { probeBinding, probeCooldownMs, probeModel, probeModels, probeNextDueAt, reuseProbeResult, specializedModelReason } from '../src/probe/index.mjs';
import { inspectProbeResponse, probeRequest, runProbeRequest } from '../src/probe/request.mjs';

const exec = promisify(execFile);
const completedText = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }] };
const completedTool = { status: 'completed', output: [{ type: 'function_call', name: 'codex_buddy_probe', arguments: '{"probe":"ok"}' }] };
const connection = { providerId: 'fixture', url: new URL('https://fixture.invalid/v1/models'), headers: new Headers({ Authorization: 'Bearer fixture-secret' }) };

test('text and function probes require completed output and exact function arguments', () => {
  assert.deepEqual(inspectProbeResponse(completedText, 'text'), { status: 'passed' });
  assert.deepEqual(inspectProbeResponse(completedTool, 'tools'), { status: 'passed' });
  for (const body of [{}, { status: 'completed', output: [] }, { ...completedText, status: 'failed' }, { ...completedText, status: 'incomplete' }, { ...completedText, error: { message: 'secret' } }]) {
    assert.equal(inspectProbeResponse(body, 'text').status, 'failed');
  }
  for (const args of ['{}', '{"probe":"wrong"}', '{"probe":"ok","extra":1}', 'not-json']) {
    const body = { ...completedTool, output: [{ ...completedTool.output[0], arguments: args }] };
    assert.equal(inspectProbeResponse(body, 'tools').status, 'failed');
  }
  assert.equal(inspectProbeResponse({ ...completedTool, output: [...completedTool.output, ...completedTool.output] }, 'tools').status, 'failed');
  const request = probeRequest('custom', 'tools', { supported_reasoning_levels: [{ effort: 'low' }, { effort: 'none' }] });
  assert.deepEqual(request.tool_choice, { type: 'function', name: 'codex_buddy_probe' });
  assert.deepEqual(request.reasoning, { effort: 'none' });
  assert.equal(request.store, false);
  assert.equal(request.stream, false);
  assert.equal(request.max_output_tokens, 128);
  assert.equal(probeRequest('unknown', 'text').max_output_tokens, 512);
  assert.equal(probeRequest('reasoner', 'tools', { supported_reasoning_levels: [{ effort: 'low' }] }).max_output_tokens, 512);
});

test('specialized models skip inference and routed success cannot certify the requested model', async () => {
  for (const id of ['text-embedding-3-small', 'baai/bge-m3', 'gpt-image-1', 'flux.1', 'model-audio', 'rerank-v3']) {
    assert.equal(specializedModelReason({ id }), 'specialized_endpoint');
  }
  assert.equal(specializedModelReason({ id: 'unknown', input_modalities: ['audio'] }), 'non_text_model');
  assert.equal(specializedModelReason({ id: 'glm-5v-turbo', input_modalities: ['text', 'image'] }), null);
  let requests = 0;
  const fetcher = async (_url, options) => {
    requests += 1;
    const request = JSON.parse(options.body);
    const body = { ...(request.tools ? completedTool : completedText), model: 'actual' };
    return Response.json(body, { headers: {
      'x-sub2api-fallback-model': 'actual', 'x-sub2api-requested-model': request.model, 'x-sub2api-selected-model': 'initial',
    } });
  };
  assert.equal((await probeModel(connection, { id: 'bge-m3' }, 1000, fetcher)).status, 'skipped');
  assert.equal(requests, 0);
  const model = await probeModel(connection, { id: 'configured' }, 1000, fetcher);
  assert.equal(model.status, 'fallback');
  assert.equal(model.text.reportedModel, 'actual');
  assert.equal(model.text.requestedModel, 'configured');
  assert.equal(model.text.selectedModel, 'initial');
  assert.equal((await probeModel(connection, { id: 'auto' }, 1000, fetcher)).status, 'available');
  assert.equal(requests, 4);
  const alias = await probeModel(connection, { id: 'alias' }, 1000, async (_url, options) =>
    Response.json({ ...(JSON.parse(options.body).tools ? completedTool : completedText), model: 'actual' }));
  assert.equal(alias.status, 'different_model');
});

test('explicit models require returned identity for both probes even with matching selected headers', async () => {
  const probe = (bodyModel, headers = {}) => probeModel(connection, { id: 'requested' }, 1000, async (_url, options) => {
    const request = JSON.parse(options.body);
    const body = request.tools ? completedTool : completedText;
    return Response.json({ ...body, model: typeof bodyModel === 'function' ? bodyModel(request) : bodyModel }, { headers });
  });
  for (const model of [undefined, '', '   ', null]) {
    assert.equal((await probe(model)).status, 'unverified_identity');
  }
  assert.equal((await probe(undefined, { 'x-sub2api-requested-model': 'requested', 'x-sub2api-selected-model': 'requested' })).status, 'unverified_identity');
  assert.equal((await probe(request => request.tools ? undefined : 'requested')).status, 'unverified_identity');
  assert.equal((await probe('requested', { 'x-sub2api-selected-model': 'different' })).status, 'different_model');
  assert.equal((await probe('requested')).status, 'available');
});

test('failures do not persist upstream bodies or credentials and oversized bodies fail closed', async () => {
  const failed = await probeModel(connection, { id: 'model' }, 1000,
    async () => new Response('fixture-secret upstream details', { status: 429 }));
  assert.equal(failed.status, 'unavailable');
  assert.deepEqual(failed.tools, { status: 'skipped', reason: 'text_probe_failed' });
  assert.equal(failed.text.httpStatus, 429);
  assert.equal(JSON.stringify(failed).includes('fixture-secret'), false);
  const oversized = await runProbeRequest(connection, 'model', 'text', {}, 1000,
    async () => new Response('a'.repeat(1024 * 1024 + 1)));
  assert.equal(oversized.reason, 'response_too_large');
  const malformed = await runProbeRequest(connection, 'model', 'text', {}, 1000,
    async () => new Response('fixture-secret'));
  assert.equal(malformed.reason, 'invalid_json');
  assert.equal(JSON.stringify(malformed).includes('fixture-secret'), false);
});

test('HTTP diagnostics retain bounded machine codes and selected headers without messages or secrets', async () => {
  const run = body => runProbeRequest(connection, 'model', 'text', {}, 1000, async () => Response.json(body, {
    status: 400, headers: { 'x-sub2api-selected-model': 'actual' },
  }));
  const invalid = await run({ error: { code: 'unsupported_parameter', type: 'invalid_request_error', message: 'fixture-secret' } });
  assert.equal(invalid.reason, 'http_error');
  assert.equal(invalid.httpStatus, 400);
  assert.equal(invalid.errorCode, 'unsupported_parameter');
  assert.equal(invalid.errorType, 'invalid_request_error');
  assert.equal(invalid.selectedModel, 'actual');
  assert.equal(JSON.stringify(invalid).includes('fixture-secret'), false);
  for (const code of ['fixture-secret', 'Bearer fixture-secret', 'a'.repeat(65), { secret: 'fixture-secret' }, '<error>']) {
    const result = await run({ error: { code, type: code, message: 'fixture-secret' } });
    assert.equal(result.errorCode, undefined);
    assert.equal(result.errorType, undefined);
    assert.equal(JSON.stringify(result).includes('fixture-secret'), false);
  }
  const oversized = await run({ error: { code: 'valid_code', message: 'a'.repeat(65536) } });
  assert.equal(oversized.httpStatus, 400);
  assert.equal(oversized.reason, 'http_error');
  assert.equal(oversized.diagnosticFailure, 'response_too_large');
  assert.equal(oversized.errorCode, undefined);
});

test('result binding changes with path, provider, any credential header and query configuration', () => {
  const initial = probeBinding(connection);
  const variants = [
    { ...connection, providerId: 'another' },
    { ...connection, url: new URL('https://fixture.invalid/other/models') },
    { ...connection, url: new URL('https://fixture.invalid/v1/models?group=2') },
    { ...connection, headers: new Headers({ Authorization: 'Bearer rotated' }) },
    { ...connection, headers: new Headers({ Authorization: 'Bearer fixture-secret', 'x-api-key': 'different' }) },
  ];
  for (const variant of variants) {
    assert.notEqual(probeBinding(variant), initial);
  }
});

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'buddy-probe-'));
  const state = { ids: ['one', 'two', 'three', 'bge-m3'], active: 0, maximum: 0, requests: [], fail: null, reportIdentity: true, key: 'fixture-probe-key' };
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${state.key}`) {
      response.writeHead(401).end('{}');
      return;
    }
    if (request.method === 'GET') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ data: state.ids.map(id => ({ id })) }));
      return;
    }
    let text = '';
    for await (const chunk of request) {
      text += chunk;
    }
    const body = JSON.parse(text);
    state.requests.push(body);
    state.active += 1;
    state.maximum = Math.max(state.maximum, state.active);
    if (body.model === 'timeout') {
      response.on('close', () => { state.active -= 1; });
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
    state.active -= 1;
    if (body.model === state.fail) {
      response.writeHead(503).end('fixture-probe-key');
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ...(body.tools ? completedTool : completedText), ...(state.reportIdentity ? { model: body.model } : {}) }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = `model_provider = "fixture"\n[model_providers.fixture]\nbase_url = "http://127.0.0.1:${server.address().port}/v1"\nexperimental_bearer_token = "${state.key}"\n`;
  await writeFile(join(home, 'config.toml'), config);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(home, { recursive: true, force: true });
  });
  return { home, state, config };
}

test('bounded probes persist every outcome and keep partial rechecks separate from history', async t => {
  const { home, state, config } = await fixture(t);
  let partial;
  const first = await probeModels(home, { concurrency: 2, timeoutMs: 1000,
    onProgress: (_result, checked) => { partial = checked; } });
  assert.equal(first.complete, true);
  assert.equal(first.ok, true);
  assert.equal(partial, 4);
  assert.equal(first.checkedCount, 4);
  assert.deepEqual(first.counts, { available: 3, unavailable: 0, fallback: 0, different_model: 0, unverified_identity: 0, skipped: 1 });
  assert.equal(state.maximum, 2);
  assert.equal(state.requests.length, 6);
  assert.equal(state.requests.filter(request => request.tools).length, 3);
  assert.deepEqual(JSON.parse(await readFile(first.reportPath, 'utf8')), first);
  assert.equal((await readFile(first.reportPath, 'utf8')).includes(state.key), false);
  assert.equal(await readFile(join(home, 'config.toml'), 'utf8'), config);
  state.fail = 'two';
  const second = await probeModels(home, { modelIds: ['two'], timeoutMs: 1000, force: true });
  assert.equal(second.selectedCount, 1);
  assert.equal(second.counts.unavailable, 1);
  assert.equal(second.results.length, 4);
  assert.deepEqual(second.results.find(result => result.id === 'one'), first.results.find(result => result.id === 'one'));
  await assert.rejects(probeModels(home, { modelIds: ['absent'] }), /absent from/);
  await assert.rejects(probeModels(home, { concurrency: 17 }), /concurrency/);
  await assert.rejects(probeModels(home, { timeoutMs: 0 }), /timeout-ms/);
});

test('completed successes and failures wait seven days from the last request; incomplete or skipped work is not cached', () => {
  const started = Date.parse('2026-09-29T00:00:00Z');
  const base = { id: 'one', checkedAt: new Date(started).toISOString(), status: 'available',
    text: { status: 'passed', checkedAt: new Date(started).toISOString(), latencyMs: 50 },
    tools: { status: 'passed', checkedAt: new Date(started + 50).toISOString(), latencyMs: 100 } };
  const due = started + 150 + probeCooldownMs;
  assert.equal(probeNextDueAt(base), new Date(due).toISOString());
  assert.ok(reuseProbeResult(base, due - 1));
  assert.equal(reuseProbeResult(base, due), null);
  assert.equal(reuseProbeResult(base, started), null);
  const failure = { ...base, status: 'unavailable', text: { ...base.text, status: 'failed' }, tools: { status: 'skipped', reason: 'text_probe_failed' } };
  assert.ok(reuseProbeResult(failure, started + 100));
  assert.equal(probeNextDueAt({ ...base, tools: undefined }), null);
  assert.equal(probeNextDueAt({ ...base, status: 'skipped' }), null);
  assert.equal(probeNextDueAt({ ...base, checkedAt: 'invalid' }), null);
});

test('repeated audits reuse completed results and failed or routed models remain unhealthy without new inference', async t => {
  const { home, state } = await fixture(t);
  state.fail = 'two';
  const first = await probeModels(home, { timeoutMs: 1000 });
  const requests = state.requests.length;
  let progress;
  const second = await probeModels(home, { timeoutMs: 1000, onProgress: (_result, _done, _total, event) => { progress = event; } });
  assert.equal(state.requests.length, requests);
  assert.equal(second.reusedCount, 3);
  assert.equal(second.probedCount, 0);
  assert.deepEqual(second.counts, first.counts);
  assert.equal(second.ok, false);
  assert.equal(second.cooldownDays, 7);
  assert.equal(second.results.find(result => result.id === 'two').checkedAt, first.results.find(result => result.id === 'two').checkedAt);
  assert.equal(typeof progress.reused, 'boolean');
  const stored = JSON.parse(await readFile(second.reportPath, 'utf8'));
  const one = stored.results.find(result => result.id === 'one');
  one.status = 'fallback';
  one.text.fallbackModel = 'different';
  await writeFile(second.reportPath, JSON.stringify(stored));
  const routed = await probeModels(home, { modelIds: ['one'], timeoutMs: 1000 });
  assert.equal(routed.counts.fallback, 1);
  assert.equal(routed.counts.available, 0);
  assert.equal(routed.ok, false);
  assert.equal(state.requests.length, requests);
});

test('interrupted reports retain completed model cooldowns while unfinished models and expired results are probed', async t => {
  const { home, state } = await fixture(t);
  const first = await probeModels(home, { modelIds: ['one', 'two'], timeoutMs: 1000 });
  const stored = JSON.parse(await readFile(first.reportPath, 'utf8'));
  stored.complete = false;
  stored.completedAt = null;
  delete stored.results.find(result => result.id === 'two').tools;
  await writeFile(first.reportPath, JSON.stringify(stored));
  state.requests = [];
  const resumed = await probeModels(home, { modelIds: ['one', 'two'], timeoutMs: 1000 });
  assert.equal(resumed.reusedCount, 1);
  assert.equal(resumed.probedCount, 1);
  assert.deepEqual(state.requests.map(request => request.model), ['two', 'two']);
  const stale = JSON.parse(await readFile(first.reportPath, 'utf8'));
  const one = stale.results.find(result => result.id === 'one');
  const expired = new Date(Date.now() - probeCooldownMs - 10000).toISOString();
  one.checkedAt = expired;
  one.completedAt = expired;
  one.text.checkedAt = expired;
  one.tools.checkedAt = expired;
  await writeFile(first.reportPath, JSON.stringify(stale));
  state.requests = [];
  const rechecked = await probeModels(home, { modelIds: ['one'], timeoutMs: 1000 });
  assert.equal(rechecked.probedCount, 1);
  assert.equal(rechecked.reusedCount, 0);
  assert.equal(state.requests.length, 2);
});

test('changed provider credentials isolate cooldown reports and force explicitly permits early rechecks', async t => {
  const { home, state, config } = await fixture(t);
  const first = await probeModels(home, { modelIds: ['one'], timeoutMs: 1000 });
  const forced = await probeModels(home, { modelIds: ['one'], timeoutMs: 1000, force: true });
  assert.equal(forced.reusedCount, 0);
  assert.equal(forced.probedCount, 1);
  assert.equal(state.requests.length, 4);
  state.key = 'rotated-probe-key';
  await writeFile(join(home, 'config.toml'), config.replace('fixture-probe-key', state.key));
  const changed = await probeModels(home, { modelIds: ['one'], timeoutMs: 1000 });
  assert.notEqual(changed.binding, first.binding);
  assert.notEqual(changed.reportPath, first.reportPath);
  assert.equal(changed.probedCount, 1);
  assert.equal(changed.reusedCount, 0);
  assert.equal(state.requests.length, 6);
});

test('unexpected worker failures wait for remaining workers and retain incomplete progress', async t => {
  const { home, state } = await fixture(t);
  await assert.rejects(probeModels(home, { concurrency: 2, timeoutMs: 1000, onProgress: () => {
    throw new Error('progress_failure');
  } }), /progress_failure/);
  assert.equal(state.active, 0);
  const root = join(home, 'model-sync', 'probes');
  const bindings = await readdir(root);
  assert.equal(bindings.length, 1);
  const result = JSON.parse(await readFile(join(root, bindings[0], 'latest.json'), 'utf8'));
  assert.equal(result.complete, false);
  assert.equal(result.completedAt, null);
  assert.equal(result.ok, undefined);
  assert.equal(result.checkedCount, 2);
  assert.equal(result.results.length, 2);
  assert.deepEqual(await readdir(join(root, bindings[0])), ['latest.json']);
});

test('packaged probe command reports timeouts and failures with nonzero exit without executing tools', async t => {
  const { home, state } = await fixture(t);
  const run = (...args) => exec(process.execPath, [resolve('dist/cli.mjs'), 'probe', '--home', home, '--json', ...args], { timeout: 10000 });
  const result = JSON.parse((await run('--model', 'one', '--concurrency', '1')).stdout);
  assert.equal(result.counts.available, 1);
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests.some(request => Array.isArray(request.input)), false);
  const cached = JSON.parse((await run('--model', 'one')).stdout);
  assert.equal(cached.reusedCount, 1);
  assert.equal(cached.probedCount, 0);
  assert.equal(state.requests.length, 2);
  assert.ok(cached.results[0].nextProbeAt);
  const forced = JSON.parse((await run('--model', 'one', '--force')).stdout);
  assert.equal(forced.probedCount, 1);
  assert.equal(forced.reusedCount, 0);
  assert.equal(state.requests.length, 4);
  state.ids = ['timeout'];
  await assert.rejects(run('--timeout-ms', '1000'), error => {
    assert.equal(error.code, 1);
    const failed = JSON.parse(error.stdout);
    assert.equal(failed.complete, true);
    assert.equal(failed.results[0].text.reason, 'timeout');
    assert.equal(failed.results[0].tools.reason, 'text_probe_failed');
    return true;
  });
});

test('source CLI exits nonzero when successful concrete model responses omit identity', async t => {
  const { home, state } = await fixture(t);
  state.reportIdentity = false;
  await assert.rejects(exec(process.execPath, [resolve('src/cli.mjs'), 'probe', '--home', home, '--json', '--model', 'one'], { timeout: 10000 }), error => {
    assert.equal(error.code, 1);
    const result = JSON.parse(error.stdout);
    assert.equal(result.complete, true);
    assert.equal(result.ok, false);
    assert.equal(result.counts.available, 0);
    assert.equal(result.counts.unverified_identity, 1);
    assert.equal(result.results[0].text.status, 'passed');
    assert.equal(result.results[0].tools.status, 'passed');
    return true;
  });
});
