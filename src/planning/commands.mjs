import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readJson, atomicWrite } from '../runtime/index.mjs';
import { normalizePolicy } from '../routing/policy.mjs';
import { routeTurn } from '../routing/index.mjs';
import { normalizePlanning } from './model.mjs';
import { selectPlanning } from './selection.mjs';

export async function configurePlanning(home, action, options = {}) {
  const file = join(home, 'model-router', 'policy.json');
  const policy = normalizePolicy(await readJson(file, {}));
  if (action === 'status' || (!action && !options.plannerModel && !options.executorModel && !options.executorTier && !options.executorCapabilities)) return policy.planning;
  if (!['', 'auto', 'off'].includes(action)) throw new Error('Use router planning [auto|off|status] --planner-model ID --executor-model ID --executor-tier simple|standard.');
  const explicit = Object.fromEntries(['plannerModel', 'executorModel', 'executorTier'].filter(key => options[key] !== undefined).map(key => [key, options[key]]));
  if (options.executorCapabilities) explicit.executorCapabilities = JSON.parse(await readFile(options.executorCapabilities, 'utf8'));
  const planning = normalizePlanning({ ...policy.planning, ...(action === 'auto' ? { plannerModel: null, executorModel: null } : {}), ...explicit, enabled: action !== 'off' });
  let selection = null;
  if (planning.enabled) {
    const inventory = await routeTurn(home, { inventoryOnly: true });
    selection = selectPlanning(inventory.models, { ...policy, planning });
    const requested = [['plannerModel', selection.planner], ['executorModel', selection.executor]];
    if (requested.some(([key, role]) => options[key] && (!role || role.preferredAvailable === false))) throw new Error('指定模型不在当前供应商与工具的合格交集或能力不足；策略未修改。请检查 router models 和 executorCapabilities。');
  }
  await atomicWrite(file, { ...policy, planning });
  return { planning, selection, effective: 'next eligible turn; existing agents keep their model' };
}
