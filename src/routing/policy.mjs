import { reliability } from './health.mjs';
import { capablePool, capabilityThresholds } from './tiers.mjs';
import { normalizePlanning } from '../planning/model.mjs';
export { classify } from './intent.mjs';

export const defaultPolicy = {
  version: 4,
  enabled: true,
  assessment: 'model',
  assessmentTimeoutMs: 45000,
  inventoryTtlHours: 24,
  simpleEffort: 'low',
  standardEffort: 'medium',
  advancedEffort: 'high',
  executorEffort: 'low',
  planning: normalizePlanning(),
  capabilityThresholds,
  models: {},
};

export function normalizePolicy(saved = {}) {
  // Migrate the prototype's family allowlists; explicit per-model overrides remain supported.
  const { simplePatterns, advancedPatterns, ...rest } = saved;
  return { ...defaultPolicy, ...rest, version: 4, planning: normalizePlanning(rest.planning), capabilityThresholds: { ...capabilityThresholds, ...rest.capabilityThresholds } };
}

export function selectModel(profiles, policy, assessment, fallback, metadata = []) {
  const available = profiles.filter(item => item.purpose === 'general' && item.tools === true && !item.disabled);
  const pool = capablePool(available, policy, assessment.tier);
  const rank = item => (assessment.role === 'executor' ? item.economy * 0.9 + item.capability * 0.1 : assessment.tier === 'simple'
    ? item.economy * 0.7 + item.capability * 0.3
    : assessment.tier === 'standard' ? item.capability * 0.6 + item.economy * 0.4 : item.capability) * reliability(item);
  pool.models.sort((a, b) => rank(b) - rank(a) || Number(b.id === fallback) - Number(a.id === fallback) || a.id.localeCompare(b.id));
  const selected = pool.models[0];
  const info = metadata.find(item => item.slug === selected.id);
  const supported = info?.supported_reasoning_levels?.map(item => item.effort) || [];
  const requested = policy[assessment.role === 'executor' ? 'executorEffort' : `${assessment.tier}Effort`];
  const effort = supported.includes(requested) ? requested : info?.default_reasoning_level || null;
  return { model: selected.id, effort, ...assessment, modelTier: pool.tier, tierCandidateCount: pool.models.length,
    selectionSource: selected.source, health: selected.health || null, candidateCount: profiles.length, eligibleCount: available.length };
}
