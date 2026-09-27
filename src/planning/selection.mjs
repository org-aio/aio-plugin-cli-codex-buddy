import { selectModel } from '../routing/policy.mjs';
import { modelTier, tiers } from '../routing/tiers.mjs';
import { normalizePlanning } from './model.mjs';
import { executorCapabilityStatus, executorProfiles } from './capabilities.mjs';

export function selectPlanning(profiles, policy, fallback, metadata = []) {
  const config = normalizePlanning(policy.planning);
  if (!config.enabled) return null;
  const choose = (role, tier, preferred, available = profiles) => {
    const eligible = available.filter(m => m.purpose === 'general' && m.tools === true && !m.disabled
      && tiers.indexOf(modelTier(m, policy)) >= tiers.indexOf(tier));
    const pinned = eligible.find(m => m.id === preferred);
    const choice = selectModel(pinned ? [pinned] : available, policy, { tier, role }, fallback, metadata);
    return { model: choice.model, effort: choice.effort, taskTier: tier, modelTier: choice.modelTier,
      preferred: preferred || null, preferredAvailable: preferred ? Boolean(pinned) : null };
  };
  const planner = choose('planner', 'advanced', config.plannerModel);
  const unavailable = reason => ({ mode: 'planner-only', planner, executor: null, maxAttempts: config.maxAttempts,
    executorCandidates: [], executorStatus: 'unavailable', executorReason: reason, distinctModels: false });
  const capabilityStatus = executorCapabilityStatus(config.executorCapabilities);
  if (capabilityStatus) return unavailable(capabilityStatus);
  const supported = new Map(config.executorCapabilities.models.map(model => [model.id, model]));
  const available = executorProfiles(profiles, config.executorCapabilities)
    .filter(m => tiers.indexOf(modelTier(m, policy)) >= tiers.indexOf(config.executorTier));
  if (!available.length) return unavailable('no-compatible-executor');
  const constrainEffort = choice => {
    const toolEfforts = supported.get(choice.model).efforts;
    const providerEfforts = metadata.find(m => m.slug === choice.model)?.supported_reasoning_levels?.map(item => item.effort) || [];
    const common = toolEfforts.filter(effort => providerEfforts.includes(effort));
    return { ...choice, effort: common.includes(choice.effort) ? choice.effort : common[0] || null };
  };
  const executor = constrainEffort(choose('executor', config.executorTier, config.executorModel, available));
  if (executor.preferredAvailable === false) {
    const preferred = profiles.find(m => m.id === config.executorModel);
    executor.preferredUnavailableReason = !preferred ? 'provider-model-missing'
      : !supported.has(preferred.id) ? 'tool-model-unsupported' : 'provider-model-ineligible';
  }
  const candidates = [executor];
  // 先过滤工具支持范围，再在同一能力梯队内排序，避免前五名全是不可启动模型。
  let remaining = available.filter(m => modelTier(m, policy) === executor.modelTier && m.id !== executor.model);
  while (remaining.some(m => m.purpose === 'general' && m.tools === true && !m.disabled) && candidates.length < 5) {
    const next = selectModel(remaining, policy, { tier: config.executorTier, role: 'executor' }, fallback, metadata);
    candidates.push(constrainEffort({ model: next.model, effort: next.effort, taskTier: config.executorTier, modelTier: next.modelTier }));
    remaining = remaining.filter(m => m.id !== next.model);
  }
  return { mode: 'plan-execute', planner, executor, maxAttempts: config.maxAttempts,
    executorCandidates: candidates, executorStatus: 'recommended', distinctModels: planner.model !== executor.model };
}
