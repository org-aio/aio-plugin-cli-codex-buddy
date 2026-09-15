import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, selectModel, defaultPolicy, normalizePolicy } from '../src/routing/policy.mjs';
import { validateProfiles, estimateProfile } from '../src/routing/inventory.mjs';
import { rewriteTurn } from '../src/bridge/protocol.mjs';
const input = text => [{ type: 'text', text }];
const profile = (id, capability, economy, tools = true, purpose = 'general') => ({ id, capability, economy, tools, purpose });
test('only unambiguous Git tasks are downgraded', () => {
  for (const text of ['提交代码', '帮我提交当前改动并推送', 'git status', 'merge feature into main']) assert.equal(classify(input(text)).tier, 'simple', text);
  for (const text of ['提交代码并重构登录', '帮我设计一个提交代码系统', '继续', 'fix a bug', '合并并解决业务冲突']) assert.equal(classify(input(text)).tier, 'advanced', text);
  assert.equal(classify([{ type: 'image' }]).tier, 'advanced');
});
test('all provider IDs compete using profiles, including previously unknown families', () => {
  const models = [profile('glm-5.3-flash', 65, 95), profile('kimi-k3', 94, 55), profile('deepseek-v4-flash', 75, 85), profile('my-private-new-model', 98, 40)];
  assert.equal(selectModel(models, defaultPolicy, { tier: 'simple' }, 'kimi-k3').model, 'glm-5.3-flash');
  assert.equal(selectModel(models, defaultPolicy, { tier: 'advanced' }, 'glm-5.3-flash').model, 'my-private-new-model');
  assert.equal(selectModel(models.slice(0, 3), defaultPolicy, { tier: 'advanced' }).model, 'kimi-k3');
});
test('specialized and non-tool models stay visible but cannot execute agent tasks', () => {
  const rows = [profile('image-generator', 100, 100, false, 'specialized'), profile('general', 60, 60)];
  const choice = selectModel(rows, defaultPolicy, { tier: 'simple' });
  assert.equal(choice.model, 'general'); assert.equal(choice.candidateCount, 2); assert.equal(choice.eligibleCount, 1);
  assert.throws(() => selectModel(rows.slice(0, 1), defaultPolicy, { tier: 'simple' }));
});
test('rejects invented IDs, duplicates, incomplete results and bad scoring', () => {
  assert.throws(() => validateProfiles([profile('invented', 90, 90)], ['real']));
  assert.throws(() => validateProfiles([profile('a', 90, 90), profile('a', 90, 90)], ['a', 'b']));
  assert.throws(() => validateProfiles([], ['real']));
  assert.throws(() => validateProfiles([profile('real', 900, 90)], ['real']));
  assert.equal(validateProfiles([profile('real', 50, 50, null, 'unknown')], ['real'])[0].source, 'model-estimate');
});
test('fallback estimates are family neutral and prototype restrictions migrate away', () => {
  assert.equal(estimateProfile({ id: 'provider-a/new-flash' }).economy, 85);
  assert.equal(estimateProfile({ id: 'provider-b/private-14b' }).economy, 85);
  assert.equal(estimateProfile({ id: 'provider-c/new' }).purpose, 'unknown');
  assert.equal(normalizePolicy({ simplePatterns: ['^gpt-only$'] }).simplePatterns, undefined);
});
test('keeps permissions, input, and collaboration instructions intact', () => {
  const p = { model: 'large', effort: 'ultra', approvalPolicy: 'never', input: input('提交代码'), collaborationMode: { mode: 'default', settings: { model: 'large', reasoning_effort: 'ultra', developer_instructions: 'keep' } } };
  const changed = rewriteTurn(p, { model: 'small', effort: 'low', tier: 'simple' });
  assert.equal(changed.collaborationMode.settings.model, 'small');
  assert.equal(changed.collaborationMode.settings.developer_instructions, 'keep');
  assert.equal(changed.approvalPolicy, p.approvalPolicy);
  assert.deepEqual(changed.input, p.input);
  assert.equal(p.model, 'large');
});
test('unknown tool compatibility cannot execute a task during assessment failure', () => {
  const unknown = { ...estimateProfile({ id: 'tiny-4b' }), economy: 100 };
  const known = { ...profile('previously-assessed', 70, 70), source: 'model-estimate' };
  assert.equal(selectModel([unknown, known], defaultPolicy, { tier: 'simple' }).model, known.id);
  assert.throws(() => selectModel([unknown], defaultPolicy, { tier: 'simple' }));
});

test('task difficulty and specialist intent are separate dimensions', () => {
  for (const text of ['git status', '提交代码', '推送代码', '合并分支 feature']) {
    assert.equal(classify(input(text)).intent, 'git');
    assert.equal(classify(input(text)).tier, 'simple');
  }
  for (const text of ['解决代码冲突', 'rebase with conflicts', '重构登录后提交代码', '开发一个 git 路由器']) {
    assert.equal(classify(input(text)).intent, 'git');
    assert.equal(classify(input(text)).tier, 'advanced');
  }
  assert.equal(classify(input('修改按钮文案')).tier, 'standard');
  assert.equal(classify(input('修改按钮文案')).intent, 'general');
  assert.equal(classify(input('修改按钮并重构跨模块架构')).tier, 'advanced');
});

test('perfect success never promotes a weak model into a stronger tier', () => {
  const weak = { ...profile('weak-healthy', 65, 100), health: { samples: 1000, successRate: 1, minimumSamples: 10 } };
  const medium = { ...profile('medium', 85, 80), health: { samples: 1000, successRate: 1, minimumSamples: 10 } };
  const strong = { ...profile('strong-unreliable', 95, 10), health: { samples: 1000, successRate: 0.01, minimumSamples: 10 } };
  for (const [tier, expected] of [['simple', weak.id], ['standard', medium.id], ['advanced', strong.id]]) {
    const chosen = selectModel([weak, medium, strong], defaultPolicy, { tier });
    assert.equal(chosen.model, expected); assert.equal(chosen.modelTier, tier);
  }
  assert.throws(() => selectModel([weak, medium], defaultPolicy, { tier: 'advanced' }), { code: 'ECAPABILITY' });
  const upgraded = selectModel([strong], defaultPolicy, { tier: 'simple' });
  assert.equal(upgraded.tier, 'simple'); assert.equal(upgraded.modelTier, 'advanced');
});

test('capability boundaries and explicit tier overrides remain configurable', () => {
  const item = profile('private-calibrated', 85, 75);
  assert.equal(selectModel([item], { ...defaultPolicy, capabilityThresholds: { standard: 60, advanced: 80 } }, { tier: 'advanced' }).modelTier, 'advanced');
  assert.equal(selectModel([{ ...item, modelTier: 'advanced' }], defaultPolicy, { tier: 'advanced' }).modelTier, 'advanced');
  assert.throws(() => selectModel([item], { ...defaultPolicy, capabilityThresholds: { standard: 90, advanced: 70 } }, { tier: 'standard' }));
});
