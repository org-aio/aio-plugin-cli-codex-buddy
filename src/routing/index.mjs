import { join } from 'node:path';
import { readConnection } from '../config/index.mjs';
import { readJson } from '../runtime/index.mjs';
import { indexModels } from '../catalog/index.mjs';
import { normalizePolicy, selectModel } from './policy.mjs';
import { assess } from './assessment.mjs';
export { assess } from './assessment.mjs';

import { loadHealth } from './health.mjs';
import { inventory } from './inventory.mjs';
import { saveAdvice } from '../lifecycle/advice.mjs';
import { modelTier } from './tiers.mjs';

export async function routeTurn(home, params, thread = {}) {
  const policy = normalizePolicy(await readJson(join(home, 'model-router', 'policy.json'), {}));
  if (!policy.enabled && !params.inventoryOnly) return null;
  const assessment = params.inventoryOnly ? null : await assess(params.input, params.cwd || thread.cwd);
  const connection = await readConnection(home);
  if (thread.provider && thread.provider !== connection.providerId) {
    throw new Error('此任务使用不同供应商，保留原模型。');
  }
  // Re-read credentials and the live list every turn. Never persist headers or prompts.
  const response = await fetch(connection.url, {
    headers: connection.headers, redirect: 'error', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`模型列表请求失败 HTTP ${response.status}`);
  const listing = (await response.json()).data;
  indexModels(listing, 'id');
  const metadata = connection.catalogPath ? (await readJson(connection.catalogPath, {})).models || [] : [];
  const [discovered, health] = await Promise.all([inventory(home, connection, listing, metadata, policy), loadHealth(connection, policy.health)]);
  discovered.models = discovered.models.map(m => ({ ...m, capabilityTier: modelTier(m, policy), health: health.models.find(h => h.id === m.id) || null }));
  discovered.healthStatus = health.status;
  await saveAdvice(home, connection, discovered, health).catch(() => {});
  if (params.inventoryOnly) return discovered;
  return { ...selectModel(discovered.models, policy, assessment, connection.config.model, metadata), healthStatus: health.status, inventoryWarning: discovered.warning };
}
