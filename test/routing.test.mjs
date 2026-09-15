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
