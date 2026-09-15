import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readJson, atomicWrite } from '../src/runtime/index.mjs';

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'router-test-'));
  execFileSync('git', ['init', '-q', home]);
  const remote = { ids: ['gpt-5.6-luna', 'gpt-6-astra'], code: 200, delay: 0 };
  const server = createServer((req, res) => setTimeout(() => {
    const profiles = remote.ids.map(id => ({ id, capability: id.includes('luna') || id.includes('flash') ? 50 : 90, economy: id.includes('luna') || id.includes('flash') ? 90 : 40, tools: true, purpose: 'general', ...remote.profiles?.[id] }));
    const body = req.url.endsWith('/responses') ? { output_text: remote.assessmentFails ? 'invalid assessment' : JSON.stringify({ models: profiles }) } : { data: remote.ids.map(id => ({ id })) };
    res.writeHead(remote.code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  }, remote.delay));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  await writeFile(join(home, 'config.toml'), `model="gpt-6-astra"\nmodel_provider="fixture"\n[model_providers.fixture]\nbase_url="http://127.0.0.1:${server.address().port}/v1"\nexperimental_bearer_token="never-log-this"\n`);
  const binary = join(home, 'fake.mjs');
  await writeFile(binary, `#!${process.execPath}\nimport {createInterface} from 'node:readline';
if(process.argv.includes('--version')){console.log('codex-cli 0.154.0');process.exit(0)}
for await (const l of createInterface({input:process.stdin})) {const m=JSON.parse(l); if(!m.method)continue;
let result=m.params;
if(m.method==='thread/start')result={thread:{id:'t'},cwd:${JSON.stringify(home)},modelProvider:'fixture',model:'gpt-6-astra'};
if(m.method==='turn/start')result={turn:{id:'turn'},seen:m.params};
console.log(JSON.stringify({id:m.id,result})); }
`, { mode: 0o755 });
  const child = spawn(process.execPath, [resolve('dist/router.mjs'), '--router-home', home, '--router-binary', binary, 'app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', d => stderr += d);
  const messages = []; const waiters = new Map();
  createInterface({ input: child.stdout }).on('line', line => { const m = JSON.parse(line); messages.push(m); if (!m.method) { waiters.get(m.id)?.(m); waiters.delete(m.id); } });
  let id = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { waiters.delete(requestId); reject(new Error('RPC timeout '+stderr)); }, 10000);
    waiters.set(requestId, m => { clearTimeout(timer); resolve(m); });
    child.stdin.write(JSON.stringify({ id: requestId, method, params }) + '\n');
  });
  t.after(async () => {
    try {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit', { signal: AbortSignal.timeout(5000) });
        child.kill();
        await exited;
      }
    } finally {
      server.closeAllConnections();
      await new Promise(r => server.close(r));
      await rm(home, { recursive: true, force: true });
    }
  });
  await call('thread/start', {});
  return { home, remote, call, messages };
}
const params = text => ({ threadId: 't', model: 'gpt-6-astra', input: [{ type: 'text', text }], approvalPolicy: 'never' });

async function planningStatus(home, model) {
  // The bridge intentionally persists status asynchronously, without delaying RPC responses.
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await readJson(join(home, 'model-router/status.json'), {});
    if (state.planning?.executor.model === model) return state;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Planning status was not persisted');
}

test('live planning preferences route the main turn while reporting the worker only as a candidate', async t => {
  const f = await fixture(t);
  f.remote.ids = ['fixture/planner', 'fixture/strong', 'fixture/worker'];
  f.remote.profiles = { 'fixture/planner': { capability: 94 }, 'fixture/strong': { capability: 98 }, 'fixture/worker': { capability: 75, economy: 95 } };
  await atomicWrite(join(f.home, 'model-router/policy.json'), { planning: { plannerModel: 'fixture/planner', executorModel: 'fixture/worker' } });
  const result = await f.call('turn/start', params('设计并重构复杂模块'));
  assert.equal(result.result.seen.model, 'fixture/planner');
  assert.equal(result.result.seen.approvalPolicy, 'never');
  assert.deepEqual(result.result.seen.input, params('设计并重构复杂模块').input);
  assert.ok(f.messages.some(m => /执行候选：fixture\/worker.*尚未创建/.test(m.params?.message || '')));
  let state = await planningStatus(f.home, 'fixture/worker');
  assert.equal(state.planning.executorStatus, 'recommended');
  assert.equal(state.eligibleCount, 3);
  f.remote.ids = ['fixture/planner', 'fixture/strong', 'fixture/new-worker'];
  f.remote.profiles['fixture/new-worker'] = { capability: 78, economy: 92 };
  await f.call('turn/start', params('继续设计复杂模块'));
  state = await planningStatus(f.home, 'fixture/new-worker');
  assert.equal(state.planning.executor.model, 'fixture/new-worker');
  assert.equal(state.planning.executor.preferredAvailable, false);
});

test('stdio bridge changes models on live list changes and reports the accepted model', async t => {
  const f = await fixture(t);
  let r = await f.call('turn/start', params('提交代码'));
  assert.equal(r.result.seen.model, 'gpt-5.6-luna');
  assert.equal(r.result.seen.approvalPolicy, 'never');
  assert.ok(f.messages.some(m => m.method === 'warning' && m.params.message.includes('已启用：gpt-5.6-luna')));
  f.remote.ids = ['z-ai/glm-5.3-flash', 'gpt-6-astra'];
  r = await f.call('turn/start', params('提交代码'));
  assert.equal(r.result.seen.model, 'z-ai/glm-5.3-flash');
  r = await f.call('turn/start', params('开发新功能'));
  assert.equal(r.result.seen.model, 'gpt-6-astra');
  f.remote.ids = ['gpt-6-astra'];
  r = await f.call('turn/start', params('提交代码'));
  assert.equal(r.result.seen.model, 'gpt-6-astra');
  f.remote.code = 503;
  r = await f.call('turn/start', params('提交代码'));
  assert.equal(r.result.seen.model, 'gpt-6-astra');
  assert.ok(f.messages.some(m => m.params?.message?.includes('分流未生效')));
  const status = await readFile(join(f.home, 'model-router', 'status.json'), 'utf8');
  assert.ok(!status.includes('never-log-this'));
  assert.ok(!status.includes('提交代码'));
});

test('interrupt during discovery prevents the queued turn from starting', async t => {
  const f = await fixture(t);
  f.remote.delay = 300;
  const started = f.call('turn/start', params('提交代码'));
  await new Promise(r => setTimeout(r, 50));
  await f.call('turn/interrupt', { threadId: 't' });
  assert.equal((await started).error.code, -32800);
});

test('existing merge state upgrades a simple Git request', async t => {
  const f = await fixture(t);
  execFileSync('git', ['-C', f.home, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture']);
  const head = execFileSync('git', ['-C', f.home, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await writeFile(join(f.home, '.git', 'MERGE_HEAD'), head + '\n');
  const r = await f.call('turn/start', params('提交代码'));
  assert.equal(r.result.seen.model, 'gpt-6-astra');
});


test('a failed inventory reassessment preserves known profiles and quarantines new unknown models', async t => {
  const f = await fixture(t);
  await f.call('turn/start', params('提交代码'));
  f.remote.ids.push('private-tiny-flash');
  f.remote.assessmentFails = true;
  const r = await f.call('turn/start', params('提交代码'));
  assert.equal(r.result.seen.model, 'gpt-5.6-luna');
  assert.ok(f.messages.some(m => m.params?.message?.includes('保留已有评估')));
});

test('an advanced task is not forwarded when only weak models are live', async t => {
  const f = await fixture(t);
  f.remote.ids = ['private-flash'];
  const result = await f.call('turn/start', params('解决代码冲突'));
  assert.equal(result.error.code, -32000);
  assert.match(result.error.message, /advanced/);
  assert.equal(result.result, undefined);
});

test('project commands change the forwarded model before execution and refresh after manifest edits', async t => {
  const f = await fixture(t);
  await writeFile(join(f.home, 'package.json'), '{"scripts":{"dev":"vite"}}');
  let result = await f.call('turn/start', params('跑起来看看'));
  assert.equal(result.result.seen.model, 'gpt-5.6-luna');
  assert.ok(f.messages.some(item => item.params?.message?.includes('项目运行意图')));
  result = await f.call('turn/start', params('跑起来并重构模块'));
  assert.equal(result.result.seen.model, 'gpt-6-astra');
  await writeFile(join(f.home, 'package.json'), '{"scripts":{}}');
  result = await f.call('turn/start', params('跑起来看看'));
  // The fixture has no standard model: upward fallback must never use its simple model.
  assert.equal(result.result.seen.model, 'gpt-6-astra');
  const status = await readFile(join(f.home, 'model-router/status.json'), 'utf8');
  assert.doesNotMatch(status, /package.json|vite|跑起来/);
});
