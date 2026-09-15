import { selectModel } from '../routing/policy.mjs';
import { modelTier, tiers } from '../routing/tiers.mjs';
import { normalizePlanning } from './model.mjs';

export function selectPlanning(profiles, policy, fallback, metadata = []) {
  const config = normalizePlanning(policy.planning);
  if (!config.enabled) return null;
  const choose = (role, tier, preferred) => {
    const eligible = profiles.filter(m => m.purpose === 'general' && m.tools === true && !m.disabled
      && tiers.indexOf(modelTier(m, policy)) >= tiers.indexOf(tier));
    const pinned = eligible.find(m => m.id === preferred);
    const choice = selectModel(pinned ? [pinned] : profiles, policy, { tier, role }, fallback, metadata);
    return { model: choice.model, effort: choice.effort, taskTier: tier, modelTier: choice.modelTier,
      preferred: preferred || null, preferredAvailable: preferred ? Boolean(pinned) : null };
  };
  const planner = choose('planner', 'advanced', config.plannerModel);
  const executor = choose('executor', config.executorTier, config.executorModel);
  const candidates = [executor];
  // The provider catalog and a client's spawn-model enum can differ. Offer live,
  // equally capable alternatives; the parent must intersect with its tool schema.
  let remaining = profiles.filter(m => modelTier(m, policy) === executor.modelTier && m.id !== executor.model);
  while (remaining.some(m => m.purpose === 'general' && m.tools === true && !m.disabled) && candidates.length < 5) {
    const next = selectModel(remaining, policy, { tier: config.executorTier, role: 'executor' }, fallback, metadata);
    candidates.push({ model: next.model, effort: next.effort, taskTier: config.executorTier, modelTier: next.modelTier });
    remaining = remaining.filter(m => m.id !== next.model);
  }
  return { mode: 'plan-execute', planner, executor, maxAttempts: config.maxAttempts,
    executorCandidates: candidates, executorStatus: 'recommended', distinctModels: planner.model !== executor.model };
}
