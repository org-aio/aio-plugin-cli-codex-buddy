import { join } from 'node:path';
import { readJson, atomicWrite } from '../runtime/index.mjs';
import { normalizePolicy } from '../routing/policy.mjs';
import { routeTurn } from '../routing/index.mjs';
import { normalizePlanning } from './model.mjs';
import { selectPlanning } from './selection.mjs';

export async function configurePlanning(home, action, options = {}) {
  const file = join(home, 'model-router', 'policy.json');
  const policy = normalizePolicy(await readJson(file, {}));
  if (action === 'status' || (!action && !options.plannerModel && !options.executorModel && !options.executorTier)) return policy.planning;
  if (!['', 'auto', 'off'].includes(action)) throw new Error('Use router planning [auto|off|status] --planner-model ID --executor-model ID --executor-tier simple|standard.');
  const explicit = Object.fromEntries(['plannerModel', 'executorModel', 'executorTier'].filter(key => options[key] !== undefined).map(key => [key, options[key]]));
  const planning = normalizePlanning({ ...policy.planning, ...(action === 'auto' ? { plannerModel: null, executorModel: null } : {}), ...explicit, enabled: action !== 'off' });
  let selection = null;
  if (planning.enabled) {
    const inventory = await routeTurn(home, { inventoryOnly: true });
    selection = selectPlanning(inventory.models, { ...policy, planning });
    if ([selection.planner, selection.executor].some(role => role.preferredAvailable === false)) throw new Error('指定模型不在当前供应商的合格目录或能力不足；策略未修改。请先运行 router models。');
  }
  await atomicWrite(file, { ...policy, planning });
  return { planning, selection, effective: 'next eligible turn; existing agents keep their model' };
}
