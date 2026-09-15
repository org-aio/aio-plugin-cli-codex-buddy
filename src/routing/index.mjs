import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readConnection } from '../config/index.mjs';
import { readJson } from '../runtime/index.mjs';
import { indexModels } from '../catalog/index.mjs';
import { normalizePolicy, classify, selectModel } from './policy.mjs';

import { loadHealth } from './health.mjs';
import { inventory } from './inventory.mjs';

const exec = promisify(execFile);

export async function assess(input, cwd) {
  const result = classify(input);
  if (result.tier !== 'simple') return result;
  if (!cwd) return { tier: 'advanced', reason: '工作目录未知，不能确认 Git 操作难度' };
  try {
    const { stdout } = await exec('git', ['ls-files', '--unmerged'], { cwd, timeout: 3000, maxBuffer: 1024 * 1024 });
    if (stdout.trim()) return { tier: 'advanced', reason: '工作区存在合并冲突' };
    for (const state of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
      const found = await exec('git', ['rev-parse', '--verify', '-q', state], { cwd, timeout: 3000 }).then(() => true, () => false);
      if (found) return { tier: 'advanced', reason: 'Git 正在合并、拣选或回退中' };
    }
  } catch { return { tier: 'advanced', reason: '无法确认 Git 工作区状态' }; }
  return result;
}

export async function routeTurn(home, params, thread = {}) {
  const policy = normalizePolicy(await readJson(join(home, 'model-router', 'policy.json'), {}));
  if (!policy.enabled && !params.inventoryOnly) return null;
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
  discovered.models = discovered.models.map(m => ({ ...m, health: health.models.find(h => h.id === m.id) || null }));
  discovered.healthStatus = health.status;
  if (params.inventoryOnly) return discovered;
  const assessment = await assess(params.input, params.cwd || thread.cwd);
  return { ...selectModel(discovered.models, policy, assessment, connection.config.model, metadata), healthStatus: health.status, inventoryWarning: discovered.warning };
}
