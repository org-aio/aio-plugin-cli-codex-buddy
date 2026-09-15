import { join } from 'node:path';
import { readJson, atomicWrite } from '../runtime/index.mjs';
import { readConnection } from '../config/index.mjs';
import { connectionBinding } from '../routing/health.mjs';
import { selectModel } from '../routing/policy.mjs';
import { modelTier } from '../routing/tiers.mjs';

// Advisory snapshot only: discovery and metrics requests belong to the turn router.
export async function saveAdvice(home, connection, discovered, health) {
  await atomicWrite(join(home, 'model-router', 'advice.json'), {
    at: Date.now(), binding: connectionBinding(connection), provider: connection.providerId, endpoint: connection.url.href,
    models: discovered.models, healthThrough: health.dataThrough || null, healthGroup: health.groupId || null,
  });
}

export async function loadAdvice(home, policy) {
  try {
    const snapshot = await readJson(join(home, 'model-router', 'advice.json'), {});
    const age = Date.now() - snapshot.at;
    if (!Number.isFinite(age) || age < 0 || age > 300000) return null;
    const connection = await readConnection(home);
    if (snapshot.binding !== connectionBinding(connection) || snapshot.provider !== connection.providerId || snapshot.endpoint !== connection.url.href) return null;
    const healthAge = Date.now() - Date.parse(snapshot.healthThrough);
    const freshHealth = policy.health?.providerBinding === snapshot.binding && policy.health.groupId === snapshot.healthGroup && healthAge >= -60000
      && healthAge <= (policy.health.maxAgeSeconds ?? 300) * 1000;
    const models = snapshot.models.map(m => ({ ...m, ...policy.models?.[m.id], id: m.id, health: freshHealth ? m.health : null }));
    const choice = tier => { try { return selectModel(models, policy, { tier }, connection.config.model).model; } catch { return null; } };
    return { simple: choice('simple'), standard: choice('standard'), advanced: choice('advanced'),
      modelTiers: Object.fromEntries(models.filter(m => m.purpose === 'general' && m.tools === true && !m.disabled).map(m => [m.id, modelTier(m, policy)])) };
  } catch { return null; }
}
