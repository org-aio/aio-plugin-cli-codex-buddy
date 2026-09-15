export const defaultPlanning = {
  enabled: true,
  plannerModel: null,
  executorModel: null,
  executorTier: 'standard',
  maxAttempts: 2,
};

export function normalizePlanning(saved = {}) {
  const value = { ...defaultPlanning, ...saved };
  if (typeof value.enabled !== 'boolean' || !['simple', 'standard'].includes(value.executorTier)
    || !Number.isInteger(value.maxAttempts) || value.maxAttempts < 1 || value.maxAttempts > 3
    || ['plannerModel', 'executorModel'].some(key => value[key] !== null && (typeof value[key] !== 'string' || !value[key].trim() || /[\u0000-\u001f\u007f]/.test(value[key])))) {
    throw new Error('Invalid planning policy. Use live model IDs, simple|standard executorTier and 1–3 maxAttempts.');
  }
  return value;
}
