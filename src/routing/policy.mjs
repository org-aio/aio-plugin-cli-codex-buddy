import { reliability } from './health.mjs';

export const defaultPolicy = {
  version: 2,
  enabled: true,
  assessment: 'model',
  assessmentTimeoutMs: 45000,
  inventoryTtlHours: 24,
  simpleEffort: 'low',
  advancedEffort: 'high',
  models: {},
};

export function normalizePolicy(saved = {}) {
  // Migrate the prototype's family allowlists; explicit per-model overrides remain supported.
  const { simplePatterns, advancedPatterns, ...rest } = saved;
  return { ...defaultPolicy, ...rest, version: 2 };
}

export function classify(input) {
  if (!Array.isArray(input) || input.some(item => item.type !== 'text')) {
    return { tier: 'advanced', reason: '包含附件或非文本输入' };
  }
  const text = input.map(item => item.text || '').join('\n').trim();
  // A closed grammar avoids downgrading requests such as “commit then refactor”.
  const simple = /^(?:(?:请|帮我|麻烦|把|将)\s*)*(?:(?:查看|检查|显示)(?:一下)?\s*(?:git\s*)?(?:状态|分支|提交记录)|(?:提交|推送)(?:一下)?(?:当前|现有|这些|已暂存|所有)?(?:的)?(?:代码|改动|更改)?(?:并推送|并提交)?|(?:合并)(?:一下)?(?:分支|代码)?\s*[\w./-]*(?:\s*(?:到|至|into)\s*[\w./-]+)?|git\s+(?:status|log|branch)|(?:commit|push)(?:\s+(?:the\s+)?(?:current\s+)?(?:changes|code))?|merge\s+[\w./-]+\s+into\s+[\w./-]+)[。.!！\s]*$/i;
  return simple.test(text)
    ? { tier: 'simple', reason: '明确的 Git 操作，执行前检查冲突状态' }
    : { tier: 'advanced', reason: '开发、分析或无法确定为简单操作的任务' };
}

export function selectModel(profiles, policy, assessment, fallback, metadata = []) {
  const available = profiles.filter(item => item.purpose !== 'specialized' && item.tools !== false && !item.disabled);
  if (!available.length) throw new Error('实时列表中没有可用于代理任务的模型。');
  const rank = item => (assessment.tier === 'simple'
    ? item.economy * 0.7 + item.capability * 0.3
    : item.capability) * reliability(item);
  available.sort((a, b) => rank(b) - rank(a) || Number(b.id === fallback) - Number(a.id === fallback) || a.id.localeCompare(b.id));
  const selected = available[0];
  const info = metadata.find(item => item.slug === selected.id);
  const supported = info?.supported_reasoning_levels?.map(item => item.effort) || [];
  const requested = policy[assessment.tier === 'simple' ? 'simpleEffort' : 'advancedEffort'];
  const effort = supported.includes(requested) ? requested : info?.default_reasoning_level || null;
  return { model: selected.id, effort, tier: assessment.tier, reason: assessment.reason,
    selectionSource: selected.source, health: selected.health || null, candidateCount: profiles.length, eligibleCount: available.length };
}
