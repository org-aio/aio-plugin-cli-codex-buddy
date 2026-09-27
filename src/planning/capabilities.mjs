const validText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);

export function normalizeExecutorCapabilities(value) {
  if (value == null) return null;
  if (!validText(value.source) || !Number.isFinite(Date.parse(value.observedAt)) || !Array.isArray(value.models)
    || value.models.length > 256 || value.models.some(model => !validText(model?.id) || !Array.isArray(model.efforts)
      || model.efforts.some(effort => !validText(effort)))
    || new Set(value.models.map(model => model.id)).size !== value.models.length) {
    throw new Error('Invalid executor capabilities: expected source, observedAt and unique models [{id, efforts: []}].');
  }
  return { source: value.source, observedAt: value.observedAt,
    models: value.models.map(({ id, efforts }) => ({ id, efforts: [...new Set(efforts)] })) };
}

export function executorCapabilityStatus(capabilities, now = Date.now()) {
  if (!capabilities) return 'tool-capabilities-missing';
  const age = now - Date.parse(capabilities.observedAt);
  if (age < -60000 || age > 24 * 60 * 60 * 1000) return 'tool-capabilities-stale';
  return null;
}

export function executorProfiles(profiles, capabilities) {
  if (executorCapabilityStatus(capabilities)) return [];
  const supported = new Set(capabilities.models.map(model => model.id));
  return profiles.filter(model => supported.has(model.id) && model.purpose === 'general' && model.tools === true && !model.disabled);
}
