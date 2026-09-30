import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readConnection } from '../config/index.mjs';
import { indexModels, visibleModelIds } from '../catalog/index.mjs';
import { atomicWrite, readJson, withLock } from '../runtime/index.mjs';
import { fetchJson } from '../sync/http.mjs';
import { runProbeRequest } from './request.mjs';

export const probeCooldownMs = 7 * 24 * 60 * 60 * 1000;

// 已完成的失败也占用冷却期；中断在模型级结果写入前的任务不能冒充完整探测。
export function probeNextDueAt(result) {
  if (!result || !['available', 'unavailable', 'fallback', 'different_model', 'unverified_identity'].includes(result.status)) {
    return null;
  }
  const textDone = ['passed', 'failed'].includes(result.text?.status);
  const toolsDone = ['passed', 'failed'].includes(result.tools?.status)
    || (result.text?.status === 'failed' && result.tools?.status === 'skipped' && result.tools.reason === 'text_probe_failed');
  if (!textDone || !toolsDone) {
    return null;
  }
  // 兼容旧报告：使用各请求结束时间中的最大值，不把整份报告的更新时间当成探测时间。
  const checkedAt = Date.parse(result.checkedAt);
  if (!Number.isFinite(checkedAt)) {
    return null;
  }
  const times = [checkedAt, Date.parse(result.completedAt)];
  for (const request of [result.text, result.tools]) {
    const startedAt = Date.parse(request?.checkedAt);
    const duration = Number.isFinite(request?.latencyMs) && request.latencyMs >= 0 ? request.latencyMs : 0;
    times.push(startedAt + duration);
  }
  const completedAt = Math.max(...times.filter(Number.isFinite));
  const nextProbe = new Date(completedAt + probeCooldownMs);
  return Number.isFinite(nextProbe.getTime()) ? nextProbe.toISOString() : null;
}

export function reuseProbeResult(result, now = Date.now()) {
  const nextProbeAt = probeNextDueAt(result);
  if (!nextProbeAt || Date.parse(nextProbeAt) - probeCooldownMs > now || Date.parse(nextProbeAt) <= now) {
    return null;
  }
  return { ...result, nextProbeAt };
}

export function probeBinding(connection) {
  return createHash('sha256').update(JSON.stringify([
    connection.providerId, connection.url.href, [...connection.headers.entries()].sort(),
  ])).digest('hex');
}

export function specializedModelReason(model) {
  const name = String(model.id || model.slug || '').toLowerCase();
  const task = String(model.task || model.type || '').toLowerCase();
  if (/(?:embedding|rerank|reward|moderation|text-to-image|text-to-speech|transcription|text-to-video)/.test(task)) {
    return 'specialized_endpoint';
  }
  if (/(?:^|[/:_.-])(?:embed(?:ding)?s?|bge|rerank(?:er)?|reward|moderation|whisper|tts|stt|speech|transcription|realtime|audio|video|image|flux|sdxl)(?:$|[/:_.-])/.test(name)) {
    return 'specialized_endpoint';
  }
  if (Array.isArray(model.input_modalities) && !model.input_modalities.includes('text')) {
    return 'non_text_model';
  }
  return null;
}

function probeStatus(text, tools, model) {
  if (text.status !== 'passed' || tools.status !== 'passed') {
    return 'unavailable';
  }
  if (model !== 'auto' && [text, tools].some(result => result.fallbackModel && result.fallbackModel !== model)) {
    return 'fallback';
  }
  if (model !== 'auto' && [text, tools].some(result =>
    (result.reportedModel && result.reportedModel !== model) || (result.selectedModel && result.selectedModel !== model))) {
    return 'different_model';
  }
  if (model !== 'auto' && [text, tools].some(result => !result.reportedModel)) {
    return 'unverified_identity';
  }
  return 'available';
}

export async function probeModel(connection, model, timeoutMs, fetcher = fetch) {
  const id = model.id || model.slug;
  const checkedAt = new Date().toISOString();
  const skip = specializedModelReason(model);
  if (skip) {
    return { id, checkedAt, status: 'skipped', reason: skip };
  }
  const text = await runProbeRequest(connection, id, 'text', model, timeoutMs, fetcher);
  const tools = text.status === 'passed'
    ? await runProbeRequest(connection, id, 'tools', model, timeoutMs, fetcher)
    : { status: 'skipped', reason: 'text_probe_failed' };
  const result = { id, checkedAt, completedAt: new Date().toISOString(), status: probeStatus(text, tools, id), text, tools };
  return { ...result, nextProbeAt: probeNextDueAt(result) };
}

export async function probeModels(home, { concurrency = 4, timeoutMs = 30000, modelIds = [], force = false, onProgress } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error('--concurrency must be an integer from 1 to 16.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new Error('--timeout-ms must be an integer from 1000 to 120000.');
  }
  const connection = await readConnection(home);
  const binding = probeBinding(connection);
  const directory = join(home, 'model-sync', 'probes', binding);
  return withLock(directory, async () => {
    const listing = await fetchJson(connection.url, connection.headers);
    const live = visibleModelIds(listing);
    // 本地目录只补充本次供应商仍声明的模型元数据；不把旧目录当作在线证据。
    const catalog = connection.catalogPath ? await readJson(connection.catalogPath, {}) : {};
    const metadata = indexModels(catalog.models || [], 'slug', true);
    const requested = [...new Set(modelIds)];
    if (requested.some(id => !live.has(id))) {
      throw new Error('Requested probe model is absent from the current provider catalog.');
    }
    const selected = requested.length ? requested : [...live.keys()];
    const reportPath = join(directory, 'latest.json');
    const previous = await readJson(reportPath, {});
    const results = new Map((previous.binding === binding ? previous.results || [] : [])
      .filter(result => live.has(result.id)).map(result => [result.id, result]));
    const snapshot = {
      version: 2, provider: connection.providerId, binding,
      endpoint: connection.url.origin + connection.url.pathname,
      startedAt: new Date().toISOString(), completedAt: null,
      catalogCount: live.size, selectedCount: selected.length, selectedIds: selected, checkedCount: 0,
      concurrency, timeoutMs, force, cooldownDays: 7, probedCount: 0, reusedCount: 0, reusedIds: [],
      complete: false, results: [], reportPath,
    };
    let next = 0;
    let writes = Promise.resolve();
    const save = () => {
      const current = { ...snapshot, results: [...results.values()].sort((a, b) => a.id.localeCompare(b.id)) };
      writes = writes.then(() => atomicWrite(reportPath, current));
      return writes;
    };
    await save();
    const worker = async () => {
      while (next < selected.length) {
        const id = selected[next++];
        const model = { ...metadata.get(id), ...live.get(id), id };
        const cached = !force && !specializedModelReason(model) ? reuseProbeResult(results.get(id)) : null;
        const result = cached || await probeModel(connection, model, timeoutMs);
        if (cached) {
          snapshot.reusedCount += 1;
          snapshot.reusedIds.push(id);
        } else if (result.status !== 'skipped') {
          snapshot.probedCount += 1;
        }
        results.set(id, result);
        snapshot.checkedCount += 1;
        await save();
        onProgress?.(result, snapshot.checkedCount, selected.length, { reused: Boolean(cached), nextProbeAt: result.nextProbeAt });
      }
    };
    const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, selected.length) }, worker));
    const failedWorker = workers.find(result => result.status === 'rejected');
    if (failedWorker) {
      throw failedWorker.reason;
    }
    const latest = await readConnection(home);
    if (probeBinding(latest) !== binding) {
      throw new Error('Provider or credentials changed during probing; results remain scoped to the previous connection.');
    }
    const checked = selected.map(id => results.get(id));
    snapshot.counts = Object.fromEntries(['available', 'unavailable', 'fallback', 'different_model', 'unverified_identity', 'skipped']
      .map(status => [status, checked.filter(result => result.status === status).length]));
    snapshot.complete = true;
    snapshot.ok = snapshot.counts.unavailable === 0 && snapshot.counts.fallback === 0
      && snapshot.counts.different_model === 0 && snapshot.counts.unverified_identity === 0 && snapshot.counts.available > 0;
    snapshot.completedAt = new Date().toISOString();
    snapshot.reusedIds.sort();
    await save();
    return { ...snapshot, results: [...results.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  });
}
