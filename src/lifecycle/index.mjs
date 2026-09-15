import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readJson, atomicWrite, withLock } from '../runtime/index.mjs';
import { normalizePolicy } from '../routing/policy.mjs';
import { loadAdvice } from './advice.mjs';
import { guidance, toolFailed } from './guidance.mjs';
import { assess } from '../routing/assessment.mjs';
import { findAgent } from '../agents/discovery.mjs';
import { definitions } from '../agents/index.mjs';
import { gitGuidance } from '../git-agent/guidance.mjs';
import { projectGuidance, projectContext } from '../project-agent/guidance.mjs';
import { inspectProject } from '../project-tools/index.mjs';
import { planningGuidance } from '../planning/guidance.mjs';

export async function runHook(home, input) {
  const policy = normalizePolicy(await readJson(join(home, 'model-router', 'policy.json'), {}));
  if (!policy.enabled || policy.hooks?.enabled === false) return null;
  if (input.hook_event_name === 'UserPromptSubmit') {
    if (input.agent_id) return null;
    const [project, advice] = await Promise.all([inspectProject(input.cwd), loadAdvice(home, policy)]);
    const assessment = await assess([{ type: 'text', text: input.prompt }], input.cwd, project);
    const planning = assessment.tier === 'advanced' ? advice?.planning : null;
    const executor = planning ? await findAgent(home, input.cwd, advice, { ...definitions.execution, model: planning.executor.model }, planning.executor.taskTier) : null;
    const planningContext = planningGuidance(planning, executor);
    const definition = definitions[assessment.intent];
    if (!definition) {
      const additionalContext = planningContext + projectContext(project);
      return additionalContext ? { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } } : null;
    }
    const agent = await findAgent(home, input.cwd, advice, definition, assessment.tier);
    if (assessment.intent === 'project') {
      const output = projectGuidance(assessment, agent, advice, project);
      output.hookSpecificOutput.additionalContext += planningContext;
      return output;
    }
    const output = gitGuidance(assessment, agent, advice);
    output.hookSpecificOutput.additionalContext += planningContext + projectContext(project);
    return output;
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
