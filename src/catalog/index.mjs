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
  const models = [...ids.keys()].map((slug, index) => ({
    ...(native.get(slug) || previous.get(slug) || remote.get(slug) || genericModel(slug)),
    ...inputCapabilities(remote.get(slug)),
    slug, display_name: slug, visibility: 'list', supported_in_api: true, priority: index + 1,
  }));
  return { models };
}

// 网关可动态提供或撤回视觉辅助；旧目录和客户端内置值不能覆盖当前能力。
function inputCapabilities(model) {
  const modalities = model?.input_modalities;
  if (!Array.isArray(modalities) || !modalities.length ||
      !modalities.every(value => value === 'text' || value === 'image')) return {};
  return {
    input_modalities: [...new Set(modalities)],
    supports_image_detail_original: modalities.includes('image') && model.supports_image_detail_original === true,
  };
}
