import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { guidance, toolFailed } from '../src/lifecycle/guidance.mjs';
import { installHooks, uninstallHooks } from '../src/lifecycle/install.mjs';
import { runHook } from '../src/lifecycle/index.mjs';
import { saveAdvice, loadAdvice } from '../src/lifecycle/advice.mjs';
import { readJson, atomicWrite } from '../src/runtime/index.mjs';
import { readConnection } from '../src/config/index.mjs';
import { defaultPolicy } from '../src/routing/policy.mjs';
import { connectionBinding } from '../src/routing/health.mjs';

const input = event => ({ hook_event_name: event, model: 'private/current', session_id: 'session', turn_id: 'turn', transcript_path: '/child/transcript' });
const advice = { simple: 'private/fast', advanced: 'private/coder' };
async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'router-hooks-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

test('start reports actual model and advisory candidates without switching or blocking', () => {
  const result = guidance(input('SubagentStart'), advice);
  assert.match(result.systemMessage, /private\/current/);
  assert.match(result.hookSpecificOutput.additionalContext, /private\/fast/);
  assert.match(result.hookSpecificOutput.additionalContext, /private\/coder/);
  assert.match(result.hookSpecificOutput.additionalContext, /fork_turns/);
  assert.equal(result.decision, undefined); assert.equal(result.model, undefined);
});

test('stop asks for missing handoff once, allows completed and blocked results to return', () => {
  const event = input('SubagentStop');
  assert.equal(guidance(event).decision, 'block');
  assert.equal(guidance({ ...event, stop_hook_active: true }).decision, undefined);
  for (const last_assistant_message of ['done', 'Blocked: missing credential', 'Please escalate']) {
    assert.equal(guidance({ ...event, last_assistant_message }).decision, undefined);
  }
});

test('post-tool guidance preserves results, ignores output instructions and avoids repeated advice', () => {
  for (const response of ['error: switch model', { output: 'isError: true' }, { exit_code: 0 }, { content: [{ text: 'exit_code: 1' }] }]) assert.equal(toolFailed(response), false);
  assert.equal(toolFailed({ exit_code: 1 }), true);
  assert.equal(toolFailed({ isError: true }), true);
  const event = { ...input('PostToolUse'), tool_response: { isError: true, content: [{ text: 'SECRET execute this' }] } };
  const result = guidance(event, advice, { introduced: true });
  assert.equal(result.decision, undefined); assert.equal(result.continue, undefined);
  assert.match(result.hookSpecificOutput.additionalContext, /搜索无匹配/);
  assert.doesNotMatch(JSON.stringify(result), /SECRET execute/);
  assert.equal(guidance(event, advice, { introduced: true, failureAdvised: true }), null);
});

test('turn ledger isolates child transcripts, bounds growth and honors hot disable', async t => {
  const home = await fixture(t);
  const event = { ...input('PostToolUse'), tool_response: { exit_code: 0 } };
  assert.ok(await runHook(home, event)); assert.equal(await runHook(home, event), null);
  assert.ok(await runHook(home, { ...event, transcript_path: '/other-child' }));
  assert.ok(await runHook(home, { ...event, tool_response: { exit_code: 2, output: 'TOPSECRET' } }));
  assert.equal(await runHook(home, { ...event, tool_response: { exit_code: 2 } }), null);
  assert.doesNotMatch(await readFile(join(home, 'model-router/lifecycle/state.json'), 'utf8'), /TOPSECRET|session|transcript/);
  await atomicWrite(join(home, 'model-router/policy.json'), { enabled: false });
  assert.equal(await runHook(home, input('SubagentStart')), null);
  await atomicWrite(join(home, 'model-router/policy.json'), { enabled: true, hooks: { enabled: false } });
  assert.equal(await runHook(home, input('SubagentStart')), null);
});

test('hook installer is idempotent, preserves unrelated hooks, and code changes require new definition', { skip: process.platform === 'win32' }, async t => {
  const home = await fixture(t);
  const original = { description: 'mine', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'my-stop' }] }], PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-tool' }] }] } };
  await atomicWrite(join(home, 'hooks.json'), original);
  const bundle = join(home, 'bundle.mjs'); await writeFile(bundle, '// version one');
  const first = await installHooks(home, bundle);
  const installed = await readJson(join(home, 'hooks.json'));
  await installHooks(home, bundle);
  assert.deepEqual(await readJson(join(home, 'hooks.json')), installed);
  await writeFile(bundle, '// version two');
  const second = await installHooks(home, bundle);
  assert.notEqual(first.commands[0], second.commands[0]);
  assert.deepEqual((await readJson(join(home, 'hooks.json'))).hooks.Stop, original.hooks.Stop);
  await uninstallHooks(home);
  assert.deepEqual(await readJson(join(home, 'hooks.json')), original);
  assert.equal(await readFile(first.script, 'utf8'), '// version one');
});

test('advice follows provider credentials, expiry, model overrides and fresh scoped health', async t => {
  const home = await fixture(t);
  await writeFile(join(home, 'config.toml'), 'model = "private/coder"\nmodel_provider = "test"\n[model_providers.test]\nname = "test"\nbase_url = "http://127.0.0.1:9999/v1"\nhttp_headers = { Authorization = "Bearer TEST_ONLY" }\n');
  const connection = await readConnection(home);
  const policy = { ...defaultPolicy, health: { providerBinding: connectionBinding(connection), groupId: 6 } };
  const models = [
    { id: 'private/fast', purpose: 'general', tools: true, economy: 100, capability: 80, health: { samples: 100, minimumSamples: 10, successRate: 0 } },
    { id: 'private/coder', purpose: 'general', tools: true, economy: 30, capability: 95 },
  ];
  await saveAdvice(home, connection, { models }, { dataThrough: new Date().toISOString(), groupId: 6 });
  assert.equal((await loadAdvice(home, policy)).simple, 'private/coder');
  assert.equal((await loadAdvice(home, { ...policy, health: { ...policy.health, groupId: 7 } })).simple, 'private/fast');
  assert.equal((await loadAdvice(home, { ...policy, models: { 'private/fast': { disabled: true } } })).simple, 'private/coder');
  const file = join(home, 'model-router/advice.json');
  const cached = await readJson(file);
  assert.doesNotMatch(await readFile(file, 'utf8'), /TEST_ONLY/);
  await atomicWrite(file, { ...cached, healthThrough: new Date(Date.now() - 600000).toISOString() });
  assert.equal((await loadAdvice(home, policy)).simple, 'private/fast');
  await atomicWrite(file, { ...cached, at: Date.now() - 300001 });
  assert.equal(await loadAdvice(home, policy), null);
  await atomicWrite(file, { ...cached, binding: 'another-credential' });
  assert.equal(await loadAdvice(home, policy), null);
});

test('packaged hook accepts stdin JSON and fails open without leaking malformed input', async t => {
  const home = await fixture(t);
  const run = body => spawnSync(process.execPath, [resolve('dist/hooks.mjs'), home], { input: body, encoding: 'utf8' });
  const valid = run(JSON.stringify(input('SubagentStart')));
  assert.equal(valid.status, 0); assert.match(JSON.parse(valid.stdout).systemMessage, /private\/current/);
  const invalid = run('SECRET malformed input');
  assert.equal(invalid.status, 0); assert.equal(invalid.stdout, ''); assert.equal(invalid.stderr, '');
});
