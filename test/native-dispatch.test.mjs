import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { createServer } from 'node:http';

// Optional real-protocol acceptance: no user config, credentials, or inference required.
test('real App Server preserves zero-model shell turns, failures and interruption', { skip: !process.env.CODEX_TEST_BINARY || process.platform === 'win32', timeout: 30000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'native-dispatch-'));
  const cwd = join(home, 'project'); await mkdir(cwd);
  execFileSync('git', ['init', '-q', cwd]);
  await writeFile(join(cwd, 'package.json'), '{"scripts":{"test":"node failure.mjs","dev":"node server.mjs"}}');
  await writeFile(join(cwd, 'failure.mjs'), 'console.log("EXPECTED_FAILURE"); process.exit(7);');
  await writeFile(join(cwd, 'server.mjs'), 'console.log("NATIVE_RUNNING:"+process.pid); setInterval(()=>{},1000);');
  let providerRequests = 0;
  const server = createServer((req, res) => { providerRequests++; res.writeHead(503).end(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  await writeFile(join(home, 'config.toml'), `model="fixture"\nmodel_provider="fixture"\n[model_providers.fixture]\nname="fixture"\nbase_url="http://127.0.0.1:${server.address().port}/v1"\nwire_api="responses"\nexperimental_bearer_token="fixture-only"\n`);
  const child = spawn(process.execPath, [resolve('dist/router.mjs'), '--router-home', home, '--router-binary', process.env.CODEX_TEST_BINARY, 'app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.resume(); const messages = [], waiters = new Set(); let id = 0;
  createInterface({ input: child.stdout }).on('line', line => {
    const m = JSON.parse(line); messages.push(m);
    for (const w of waiters) if (w.predicate(m)) { waiters.delete(w); clearTimeout(w.timer); w.resolve(m); }
  });
  const wait = predicate => {
    const found = messages.find(predicate); if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const w = { predicate, resolve }; w.timer = setTimeout(() => { waiters.delete(w); reject(Error('native event timeout')); }, 10000); waiters.add(w);
    });
  };
  const call = (method, params) => {
    const requestId = ++id;
    const answer = wait(m => !m.method && m.id === requestId);
    child.stdin.write(JSON.stringify({ id: requestId, method, params }) + '\n');
    return answer.then(m => { assert.equal(m.error, undefined, JSON.stringify(m.error)); return m.result; });
  };
  t.after(async () => {
    for (const w of waiters) clearTimeout(w.timer);
    if (child.exitCode === null && child.signalCode === null) {
      const done = once(child, 'exit'); child.stdin.end();
      const timer = setTimeout(() => child.kill(), 1000); await done; clearTimeout(timer);
    }
    server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(home, { recursive: true, force: true });
  });
  await call('initialize', { clientInfo: { name: 'dispatch-test', version: '1' }, capabilities: { experimentalApi: true } });
  child.stdin.write('{"method":"initialized"}\n');
  const { thread } = await call('thread/start', { cwd, model: 'fixture', approvalPolicy: 'never', sandbox: 'danger-full-access', experimentalRawEvents: false });
  const start = text => call('turn/start', { threadId: thread.id, input: [{ type: 'text', text }] });
  const completed = turnId => wait(m => m.method === 'turn/completed' && m.params.turn.id === turnId);
  const inspect = await start('当前分支'); await completed(inspect.turn.id);
  const failed = await start('跑测试'); await completed(failed.turn.id);
  const failure = messages.find(m => m.method === 'item/completed' && m.params.turnId === failed.turn.id);
  assert.equal(failure.params.item.exitCode, 7); assert.match(failure.params.item.aggregatedOutput, /EXPECTED_FAILURE/);
  const running = await start('跑起来看看');
  const ready = await wait(m => m.method === 'item/commandExecution/outputDelta' && m.params.turnId === running.turn.id && /NATIVE_RUNNING:\d+/.test(m.params.delta));
  const workerPid = Number(/NATIVE_RUNNING:(\d+)/.exec(ready.params.delta)[1]);
  await call('turn/interrupt', { threadId: thread.id, turnId: running.turn.id }); await completed(running.turn.id);
  // The native command can finish before the orphan supervisor's next 100 ms check.
  let alive = true;
  for (let i = 0; i < 30 && alive; i++) {
    try { process.kill(workerPid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
    if (alive) await new Promise(r => setTimeout(r, 50));
  }
  if (alive) process.kill(workerPid, 'SIGKILL');
  assert.equal(alive, false, 'interruption must clean up the npm child process');
  await mkdir(join(home, 'model-router'), { recursive: true });
  await writeFile(join(home, 'model-router/policy.json'), '{"dispatch":{"timeoutMs":1000}}');
  const timed = await start('跑起来');
  const timedReady = await wait(m => m.method === 'item/commandExecution/outputDelta' && m.params.turnId === timed.turn.id && /NATIVE_RUNNING:\d+/.test(m.params.delta));
  const timedPid = Number(/NATIVE_RUNNING:(\d+)/.exec(timedReady.params.delta)[1]);
  await completed(timed.turn.id);
  for (let i = 0; i < 30; i++) {
    try { process.kill(timedPid, 0); } catch (error) { if (error.code === 'ESRCH') break; else throw error; }
    if (i === 29) { process.kill(timedPid, 'SIGKILL'); assert.fail('timeout must clean up the npm child process'); }
    await new Promise(r => setTimeout(r, 50));
  }
  const history = await call('thread/read', { threadId: thread.id, includeTurns: true });
  assert.equal(history.thread.turns.length, 4);
  assert.ok(history.thread.turns.every(turn => turn.items.some(item => item.type === 'commandExecution' && item.source === 'userShell')));
  assert.ok(history.thread.turns.some(turn => turn.items.some(item => item.command?.includes('跑起来看看'))));
  assert.equal(providerRequests, 0);
  const path = history.thread.path;
  const { readFile } = await import('node:fs/promises');
  const transcript = await readFile(path, 'utf8');
  assert.ok(transcript.includes('EXPECTED_FAILURE'));
  assert.ok(transcript.includes('command aborted by user'));
  // Native interruption persists the abort result, not previously streamed partial stdout.
  assert.ok(messages.some(m => m.method === 'warning' && m.params.message.includes('模型：无')));
});
