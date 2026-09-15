export const tiers = ['simple', 'standard', 'advanced'];
export const capabilityThresholds = { simple: 0, standard: 70, advanced: 90 };

export function modelTier(profile, policy) {
  if (tiers.includes(profile.modelTier)) return profile.modelTier;
  const thresholds = { ...capabilityThresholds, ...policy.capabilityThresholds };
  return tiers.findLast(tier => profile.capability >= thresholds[tier]);
}

export function capablePool(profiles, policy, required) {
  const minimum = tiers.indexOf(required);
  if (minimum < 0) throw new Error('Unknown task difficulty.');
  const thresholds = { ...capabilityThresholds, ...policy.capabilityThresholds };
  if (thresholds.simple !== 0 || !Number.isFinite(thresholds.standard) || !Number.isFinite(thresholds.advanced)
    || thresholds.standard <= 0 || thresholds.standard >= thresholds.advanced || thresholds.advanced > 100) throw new Error('Invalid capability thresholds.');
  // Prefer the least expensive capability band that can do the task; fallback is upward only.
  for (const tier of tiers.slice(minimum)) {
    const models = profiles.filter(profile => modelTier(profile, policy) === tier);
    if (models.length) return { tier, models };
  }
  throw Object.assign(new Error(`Auto：没有满足 ${required} 能力梯队的代理模型，本轮未启动。`), { code: 'ECAPABILITY' });
}
