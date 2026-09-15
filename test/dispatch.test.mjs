import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveDispatch } from '../src/dispatch/resolve.mjs';
import { shellCommand } from '../src/dispatch/command.mjs';
import { compatibleTurn, prepareDispatch, dispatchLifecycle, turnState } from '../src/dispatch/bridge.mjs';

async function fixture(t, scripts = { dev: 'echo fixture', test: 'echo fixture' }) {
  const cwd = await mkdtemp(join(tmpdir(), 'dispatch-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts }));
  return cwd;
}
const params = text => ({ threadId: 't', input: [{ type: 'text', text }] });
const thread = cwd => ({ cwd, approvalPolicy: 'never', sandbox: { type: 'dangerFullAccess' }, environments: [{ environmentId: 'local' }] });

test('closed utterances resolve to structured recipes with no provider configuration', async t => {
  const cwd = await fixture(t);
  for (const text of ['跑起来', '跑起来看看', '帮我把项目跑起来看看', '启动项目', 'npm run dev']) {
    const plan = await resolveDispatch(text, cwd);
    assert.equal(plan.route, 'tool', text); assert.equal(plan.model, null); assert.equal(plan.providerRequests, 0);
    assert.deepEqual(plan.recipe.argv, ['npm', 'run', 'dev']);
  }
  execFileSync('git', ['init', '-q', cwd]);
  assert.deepEqual((await resolveDispatch('当前分支', cwd)).recipe.argv, ['git', '--no-pager', 'branch', '--show-current']);
  for (const text of ['不要跑起来', '怎么跑起来', '跑起来并修复报错', '启动项目并打开浏览器', '运行前端', 'npm run dev && echo bad', 'npm run dev\n修改代码', 'npm run dev -- --host public', '提交代码', '推送代码', '合并分支', '解决代码冲突', '查看状态']) {
    assert.equal((await resolveDispatch(text, cwd)).route, 'llm', text);
  }
});

test('missing or multiple manifest entries never guess commands', async t => {
  const cwd = await fixture(t, { dev: 'echo one', start: 'echo two' });
  assert.equal((await resolveDispatch('跑起来', cwd)).route, 'clarify');
  assert.equal((await resolveDispatch('跑测试', cwd)).reason, 'missing-project-entry');
  assert.equal((await resolveDispatch('npm run start', cwd)).route, 'tool');
  await mkdir(join(cwd, 'web'));
  await writeFile(join(cwd, 'web/package.json'), '{"scripts":{"start":"echo other"}}');
  assert.equal((await resolveDispatch('npm run start', cwd)).route, 'clarify');
  assert.equal((await resolveDispatch('npm run start', join(cwd, 'web'))).recipe.cwd, join(cwd, 'web'));
});

test('native permission, plan, environment and rich-input boundaries stay closed', async t => {
  const cwd = await fixture(t), p = params('跑起来'), confirmed = thread(cwd);
  assert.equal(compatibleTurn(p, confirmed, 'darwin'), true);
  for (const [overrides, state] of [
    [{}, {}], [{}, { ...confirmed, sandbox: { type: 'workspaceWrite' } }],
    [{}, { ...confirmed, approvalPolicy: 'on-request' }], [{}, { ...confirmed, mode: 'plan' }],
    [{}, { ...confirmed, environments: [{ environmentId: 'ssh' }] }],
    [{ approvalPolicy: 'on-request' }, confirmed], [{ permissions: ':workspace' }, confirmed],
    [{ collaborationMode: { mode: 'plan' } }, confirmed], [{ outputSchema: {} }, confirmed],
    [{ cwd: join(cwd, 'web') }, confirmed], [{ input: [...p.input, { type: 'image' }] }, confirmed],
    [{ input: [{ type: 'text', text: '跑起来', text_elements: [{}] }] }, confirmed],
  ]) assert.equal(compatibleTurn({ ...p, ...overrides }, state, 'darwin'), false);
  assert.equal(compatibleTurn(p, confirmed, 'win32'), false);
  assert.equal(compatibleTurn(p, turnState({ permissions: ':workspace' }, confirmed), 'darwin'), false);
  await mkdir(join(cwd, 'model-router'));
  await writeFile(join(cwd, 'model-router/policy.json'), '{"dispatch":{"enabled":false}}');
  assert.equal(await prepareDispatch(cwd, p, confirmed), null);
});

test('POSIX rendering treats a project path as a literal argument', { skip: process.platform === 'win32' }, async t => {
  const cwd = await fixture(t), nested = join(cwd, "quote'$(echo injected)`echo bad`");
  await mkdir(nested);
  const output = execFileSync('/bin/sh', ['-c', shellCommand({ cwd: nested, argv: ['pwd', '-P'] }, '当前分支', resolve('dist/router.mjs'))], { encoding: 'utf8' });
  assert.ok(output.trim().endsWith("quote'$(echo injected)`echo bad`"));
});

test('native lifecycle uses actual turn IDs, exit codes and errors without replay', () => {
  const messages = [], states = [], released = [];
  const adapter = dispatchLifecycle({ send: m => messages.push(m), warn: (threadId, message) => messages.push({ threadId, message }), record: s => states.push(s), release: id => released.push(id) });
  const plan = { recipe: { id: 'project.test' }, command: 'test', timeoutMs: 1000 };
  for (const first of ['ack', 'event']) {
    const id = first; adapter.submit(id, 't', plan);
    const ack = { id, result: {} }, event = { method: 'turn/started', params: { threadId: 't', turn: { id: 'native', status: 'inProgress' } } };
    adapter.handle(first === 'ack' ? ack : event); assert.ok(!messages.some(m => m.id === id));
    adapter.handle(first === 'ack' ? event : ack);
    assert.equal(messages.find(m => m.id === id).result.turn.id, 'native');
    adapter.handle({ method: 'item/completed', params: { threadId: 't', turnId: 'native', item: { type: 'commandExecution', status: 'completed', exitCode: 7 } } });
    adapter.handle({ method: 'turn/completed', params: { threadId: 't', turn: { id: 'native', status: 'completed' } } });
    assert.equal(states.at(-1).success, false); assert.equal(states.at(-1).exitCode, 7);
  }
  adapter.submit('unsupported', 't', plan);
  adapter.handle({ id: 'unsupported', error: { code: -32601, message: 'unsupported' } });
  assert.equal(messages.find(m => m.id === 'unsupported').error.code, -32601); assert.deepEqual(released, ['t']);
  adapter.close();
});
