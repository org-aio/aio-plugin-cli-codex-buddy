import { join } from 'node:path';
import { atomicWrite, readJson } from '../runtime/index.mjs';
import { normalizePolicy } from '../routing/policy.mjs';
import { resolveDispatch } from './resolve.mjs';

export async function dispatchCommand(home, action, prompt, cwd = process.cwd()) {
  if (action === 'match') return resolveDispatch(prompt, cwd);
  const file = join(home, 'model-router', 'policy.json');
  const policy = normalizePolicy(await readJson(file, {}));
  if (!prompt || prompt === 'status') return policy.dispatch;
  if (!['on', 'off'].includes(prompt)) throw new Error('Use router dispatch on|off|status, or router match "PROMPT".');
  policy.dispatch.enabled = prompt === 'on';
  await atomicWrite(file, policy);
  return { ...policy.dispatch, effective: 'next turn' };
}
