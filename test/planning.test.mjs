import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizePolicy } from '../src/routing/policy.mjs';
import { selectPlanning } from '../src/planning/selection.mjs';
import { planningGuidance } from '../src/planning/guidance.mjs';
import { notice, rewriteTurn } from '../src/bridge/protocol.mjs';
import { guidance } from '../src/lifecycle/guidance.mjs';
import { runHook } from '../src/lifecycle/index.mjs';
import { saveAdvice } from '../src/lifecycle/advice.mjs';
import { readConnection } from '../src/config/index.mjs';
import { atomicWrite } from '../src/runtime/index.mjs';
import { installAgent } from '../src/agents/install.mjs';
import { findAgent } from '../src/agents/discovery.mjs';
import * as execution from '../src/execution-agent/profile.mjs';
import { configurePlanning } from '../src/planning/commands.mjs';

const profile = (id, capability, economy, extra = {}) => ({ id, capability, economy, tools: true, purpose: 'general', ...extra });
const models = [profile('fixture/strong', 98, 10), profile('fixture/planner', 94, 30), profile('fixture/worker', 75, 95), profile('fixture/balanced', 89, 50), profile('fixture/tiny', 40, 100)];
const policy = normalizePolicy();

test('complex work uses an advanced planner with a separate economical bounded executor', () => {
  const plan = selectPlanning(models, policy, 'fixture/strong', [{ slug: 'fixture/worker', supported_reasoning_levels: [{ effort: 'low' }], default_reasoning_level: 'medium' }]);
  assert.equal(plan.planner.model, 'fixture/strong');
  assert.equal(plan.executor.model, 'fixture/worker');
  assert.equal(plan.executor.taskTier, 'standard');
  assert.equal(plan.executor.effort, 'low');
  assert.equal(plan.executorStatus, 'recommended');
  assert.equal(plan.distinctModels, true);
  assert.deepEqual(plan.executorCandidates.map(item => item.model), ['fixture/worker', 'fixture/balanced']);
  assert.ok(plan.executorCandidates.every(item => item.modelTier === 'standard'));
  assert.equal(selectPlanning(models, normalizePolicy({ planning: { executorTier: 'simple' } })).executor.model, 'fixture/tiny');
});

test('explicit live role preferences, disappeared models, uncertainty and disabling are handled', () => {
  const pinned = normalizePolicy({ planning: { plannerModel: 'fixture/planner', executorModel: 'fixture/balanced' } });
  const plan = selectPlanning(models, pinned);
  assert.equal(plan.planner.model, 'fixture/planner');
  assert.equal(plan.executor.model, 'fixture/balanced');
  assert.equal(plan.planner.preferredAvailable, true);
  const replaced = selectPlanning(models.filter(m => m.id !== 'fixture/balanced'), pinned);
  assert.equal(replaced.executor.model, 'fixture/worker');
  assert.equal(replaced.executor.preferredAvailable, false);
  const uncertain = selectPlanning([...models, profile('fixture/unknown', 100, 100, { tools: null })], normalizePolicy({ planning: { executorModel: 'fixture/unknown' } }));
  assert.equal(uncertain.executor.model, 'fixture/worker');
  assert.equal(uncertain.executor.preferredAvailable, false);
  assert.equal(selectPlanning(models, normalizePolicy({ planning: { enabled: false } })), null);
  assert.throws(() => selectPlanning(models.filter(m => m.capability < 90), policy), { code: 'ECAPABILITY' });
  assert.equal(selectPlanning(models.slice(0, 1), policy).distinctModels, false);
});

test('subagent planning hints never claim an executor was started or override permissions', () => {
  const plan = selectPlanning(models, policy);
  const text = planningGuidance(plan, { name: 'plan-executor' });
  assert.match(text, /精简任务包/);
  assert.match(text, /fork_turns.*none/);
  assert.match(text, /最多尝试 2 次/);
  assert.match(text, /运行时不接受该 ID/);
  assert.match(text, /同级经济备选.*fixture\/balanced/);
  const announcement = notice('thread', { model: plan.planner.model, planning: plan }, true);
  assert.match(announcement.params.message, /执行候选.*尚未创建/);
  const start = guidance({ hook_event_name: 'SubagentStart', model: 'fixture/worker' }, { planning: plan });
  assert.match(start.systemMessage, /实际模型 "fixture\/worker"/);
  assert.equal(start.model, undefined);
  const forwarded = rewriteTurn({ serviceTier: 'fast', serviceTierForTurn: 'fast', approvalPolicy: 'never' }, { model: plan.planner.model, tier: 'advanced', planning: plan });
  assert.equal(forwarded.serviceTier, null);
  assert.equal(forwarded.serviceTierForTurn, 'default');
  assert.equal(forwarded.approvalPolicy, 'never');
});

test('planning policy validates configuration while preserving the legacy router settings', () => {
  const saved = normalizePolicy({ version: 3, enabled: false, simpleEffort: 'medium' });
  assert.equal(saved.version, 4); assert.equal(saved.enabled, false); assert.equal(saved.simpleEffort, 'medium');
  for (const planning of [{ executorTier: 'advanced' }, { maxAttempts: 0 }, { maxAttempts: 4 }, { plannerModel: 42 }, { executorModel: 'bad\nmodel' }]) assert.throws(() => normalizePolicy({ planning }));
});

test('fresh advice gives complex prompts a task packet without affecting simple prompts or child prompts', async t => {
  const home = await mkdtemp(join(tmpdir(), 'planning-hooks-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await writeFile(join(home, 'config.toml'), 'model="fixture/strong"\nmodel_provider="fixture"\n[model_providers.fixture]\nbase_url="http://127.0.0.1:9999/v1"\nexperimental_bearer_token="TEST_ONLY"\n');
  await writeFile(join(home, 'package.json'), '{"scripts":{"dev":"vite"}}');
  await installAgent(home, execution);
  const connection = await readConnection(home);
  await saveAdvice(home, connection, { models }, {});
  const input = { hook_event_name: 'UserPromptSubmit', cwd: home, prompt: '重构模块并设计新的接口' };
  const output = await runHook(home, input);
  assert.match(output.hookSpecificOutput.additionalContext, /fixture\/strong.*fixture\/worker/);
  assert.match(output.hookSpecificOutput.additionalContext, /plan-executor/);
  assert.match(output.hookSpecificOutput.additionalContext, /项目预检/);
  assert.doesNotMatch(JSON.stringify(output), /TEST_ONLY/);
  assert.equal(await runHook(home, { ...input, agent_id: 'child' }), null);
  assert.doesNotMatch(JSON.stringify(await runHook(home, { ...input, prompt: '跑起来' })), /规划与执行分工/);
  await atomicWrite(join(home, 'model-router/policy.json'), { planning: { enabled: false } });
  assert.doesNotMatch(JSON.stringify(await runHook(home, input)), /规划与执行分工/);
  await atomicWrite(join(home, 'model-router/advice.json'), {});
  assert.doesNotMatch(JSON.stringify(await runHook(home, input)), /fixture\/worker/);
});

test('an execution role with an incompatible fixed model cannot silently override the chosen worker', async t => {
  const home = await mkdtemp(join(tmpdir(), 'planning-roles-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await installAgent(home, { name: execution.name, profile: execution.profile + '\nmodel = "fixture/strong"\n' });
  const advice = { modelTiers: { 'fixture/strong': 'advanced', 'fixture/worker': 'standard' } };
  const definition = { ...execution, model: 'fixture/worker' };
  assert.equal(await findAgent(home, home, advice, definition, 'standard'), null);
});

test('configuration checks live role IDs before committing and supports automatic/off policies', async t => {
  const home = await mkdtemp(join(tmpdir(), 'planning-config-'));
  let requests = 0;
  const server = createServer((req, res) => { requests++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: models.map(({ id }) => ({ id })) })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(home, { recursive: true, force: true }); });
  await writeFile(join(home, 'config.toml'), `model="fixture/strong"\nmodel_provider="fixture"\n[model_providers.fixture]\nbase_url="http://127.0.0.1:${server.address().port}/v1"\nexperimental_bearer_token="TEST_ONLY"\n`);
  const file = join(home, 'model-router/policy.json');
  await atomicWrite(file, { enabled: true, assessment: 'heuristic', models: Object.fromEntries(models.map(m => [m.id, m])) });
  const before = await readFile(file, 'utf8');
  await assert.rejects(configurePlanning(home, '', { plannerModel: 'fixture/missing' }), /策略未修改/);
  assert.equal(await readFile(file, 'utf8'), before);
  const selected = await configurePlanning(home, '', { plannerModel: 'fixture/planner', executorModel: 'fixture/worker' });
  assert.equal(selected.selection.planner.model, 'fixture/planner');
  assert.equal(selected.selection.executor.model, 'fixture/worker');
  const automatic = await configurePlanning(home, 'auto');
  assert.equal(automatic.planning.plannerModel, null);
  assert.equal(automatic.selection.planner.model, 'fixture/strong');
  const priorRequests = requests;
  assert.equal((await configurePlanning(home, 'off')).planning.enabled, false);
  assert.equal(requests, priorRequests);
  assert.doesNotMatch(await readFile(file, 'utf8'), /TEST_ONLY/);
});
