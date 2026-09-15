import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readJson, atomicWrite, withLock } from '../runtime/index.mjs';
import { normalizePolicy } from '../routing/policy.mjs';
import { loadAdvice } from './advice.mjs';
import { guidance, toolFailed } from './guidance.mjs';
import { detectIntent } from '../routing/intent.mjs';
import { assess } from '../routing/assessment.mjs';
import { findGitAgent } from '../git-agent/discovery.mjs';
import { gitGuidance } from '../git-agent/guidance.mjs';

export async function runHook(home, input) {
  const policy = normalizePolicy(await readJson(join(home, 'model-router', 'policy.json'), {}));
  if (!policy.enabled || policy.hooks?.enabled === false) return null;
  if (input.hook_event_name === 'UserPromptSubmit') {
    if (input.agent_id || detectIntent(input.prompt).intent !== 'git') return null;
    const [assessment, advice] = await Promise.all([assess([{ type: 'text', text: input.prompt }], input.cwd), loadAdvice(home, policy)]);
    return gitGuidance(assessment, await findGitAgent(home, input.cwd, advice, assessment.tier), advice);
  }
  if (!['SubagentStart', 'SubagentStop', 'PostToolUse'].includes(input.hook_event_name)) return null;
  if (input.hook_event_name !== 'PostToolUse') return guidance(input, await loadAdvice(home, policy));
  // A compact bounded ledger deduplicates concurrent tool hooks without storing prompts/results.
  const directory = join(home, 'model-router', 'lifecycle');
  return withLock(directory, async () => {
    const file = join(directory, 'state.json');
    const ledger = await readJson(file, {});
    const key = createHash('sha256').update(JSON.stringify([input.session_id, input.transcript_path, input.turn_id])).digest('hex');
    const state = ledger[key] || {};
    if (state.introduced && (!toolFailed(input.tool_response) || state.failureAdvised)) return null;
    const output = guidance(input, await loadAdvice(home, policy), state);
    if (output) {
      delete ledger[key];
      ledger[key] = { introduced: true, failureAdvised: state.failureAdvised || toolFailed(input.tool_response) };
      await atomicWrite(file, Object.fromEntries(Object.entries(ledger).slice(-256)));
    }
    return output;
  });
}
