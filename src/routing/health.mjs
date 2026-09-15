import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const connectionBinding = connection => createHash('sha256').update(connection.url.origin + '\n' + (connection.headers?.get('authorization') || '')).digest('hex');

export async function loadHealth(connection, config) {
  if (!config?.keyFile) return { models: [], status: 'not-configured' };
  try {
    if (config.providerBinding !== connectionBinding(connection)) return { models: [], status: 'scope-mismatch' };
    const url = new URL(config.url || '/api/v1/router/models/health', connection.url);
    if (url.origin !== connection.url.origin) throw new Error('metrics must belong to the configured provider');
    const key = (await readFile(config.keyFile, 'utf8')).trim();
    if (!key) throw new Error('missing metrics key');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('metrics unavailable');
    const body = await response.json();
    const age = Date.now() - Date.parse(body.data_through);
    if (!Number.isFinite(age) || age < -60000 || age > (config.maxAgeSeconds ?? 300) * 1000) return { models: [], status: 'stale' };
    if (body.scope !== 'group' || !Number.isSafeInteger(config.groupId) || body.group_id !== config.groupId) return { models: [], status: 'scope-mismatch' };
    if (!Array.isArray(body.models)) throw new Error('invalid metrics');
    const models = body.models.filter(m => typeof m.id === 'string' && Number.isSafeInteger(m.sample_count) && m.sample_count >= 0
      && Number.isSafeInteger(m.success_requests) && m.success_requests >= 0 && m.success_requests <= m.sample_count)
      .map(m => ({ id: m.id, samples: m.sample_count, successes: m.success_requests,
        successRate: m.sample_count ? m.success_requests / m.sample_count : null,
        minimumSamples: Math.max(config.minSamples ?? 10, body.minimum_samples || 10) }));
    return { models, status: 'live', dataThrough: body.data_through, groupId: body.group_id };
  } catch { return { models: [], status: 'unavailable' }; }
}

export function reliability(profile) {
  const h = profile.health;
  if (!h || h.samples < h.minimumSamples || h.successRate === null) return 1;
  const confidence = h.samples / (h.samples + 20);
  return 1 - 0.75 * (1 - h.successRate) * confidence;
}
