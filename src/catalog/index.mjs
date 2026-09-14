export function indexModels(items, field, allowEmpty = false) {
  if (!Array.isArray(items) || (!allowEmpty && !items.length)) throw new Error('Model endpoint returned an empty or invalid catalog.');
  const result = new Map();
  for (const item of items) {
    const id = item?.[field];
    if (typeof id !== 'string' || !id.trim() || result.has(id)) throw new Error('Model catalog contains invalid or duplicate IDs.');
    result.set(id, item);
  }
  return result;
}

export function genericModel(id) {
  return {
    slug: id, display_name: id, description: 'Provider model; capabilities have not been verified.',
    default_reasoning_level: 'none', supported_reasoning_levels: [{ effort: 'none', description: 'Provider default' }],
    shell_type: 'shell_command', visibility: 'list', supported_in_api: true, priority: 1000,
    availability_nux: null, upgrade: null,
    base_instructions: 'You are a coding assistant. Use the available tools to complete the user request.',
    supports_reasoning_summaries: false, supports_reasoning_summary_parameter: false,
    support_verbosity: false, default_verbosity: null, apply_patch_tool_type: null,
    web_search_tool_type: 'text', truncation_policy: { mode: 'bytes', limit: 10000 },
    supports_parallel_tool_calls: false, context_window: 32000, input_modalities: ['text'],
    experimental_supported_tools: [],
  };
}

export function buildCatalog(listing, existing, bundled, manifest = {}) {
  const ids = indexModels(listing.data, 'id');
  const previous = indexModels(existing.models || [], 'slug', true);
  const native = indexModels(bundled.models, 'slug');
  const remote = indexModels(manifest.models || [], 'slug', true);
  const order = id => native.has(id) ? native.get(id).priority ?? 1000 : 100000;
  const sorted = [...ids.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'en'));
  const models = sorted.map((slug, index) => ({
    ...(native.get(slug) || previous.get(slug) || remote.get(slug) || genericModel(slug)),
    slug, visibility: 'list', supported_in_api: true, priority: index + 1,
  }));
  for (const [slug, model] of previous) {
    if (!ids.has(slug) && model.visibility === 'hide') models.push(model);
  }
  return { models };
}
