import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { installAgent, uninstallAgent } from '../src/agents/install.mjs';
import { definitions } from '../src/agents/index.mjs';
import { findAgent } from '../src/agents/discovery.mjs';
import { runHook } from '../src/lifecycle/index.mjs';

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'git-agent-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const cwd = join(home, 'project'); await mkdir(cwd);
  execFileSync('git', ['init', '-q', cwd]);
  const agent = await installAgent(home, definitions.git);
  return { home, cwd, agent };
}
const role = (name, model) => `name = "${name}"\ndescription = "Git specialist"\ndeveloper_instructions = "Handle assigned Git work"\n${model ? `model = "${model}"\n` : ''}`;

test('installs a model-neutral Git profile and preserves user modifications', async t => {
  const { home, agent } = await fixture(t);
  const profile = parse(await readFile(agent.file, 'utf8'));
  assert.equal(profile.name, 'git-operations'); assert.equal(profile.model, undefined);
  assert.match(profile.developer_instructions, /不再转交/);
  await writeFile(agent.file, role('git-operations', 'my-custom-model'));
  assert.equal((await installAgent(home, definitions.git, agent)).preserved, true);
  await uninstallAgent(agent);
  assert.match(await readFile(agent.file, 'utf8'), /my-custom-model/);
});

test('prefers existing Git agents but excludes fixed models below the required tier', async t => {
  const { home, cwd } = await fixture(t);
  const folder = join(cwd, '.codex', 'agents'); await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'git.toml'), role('project-git', 'weak'));
  const advice = { modelTiers: { weak: 'simple' } };
  assert.equal((await findAgent(home, cwd, advice, definitions.git, 'simple')).name, 'project-git');
  assert.equal((await findAgent(home, cwd, advice, definitions.git, 'advanced')).name, 'git-operations');
  await writeFile(join(folder, 'git.toml'), role('project-git'));
  assert.equal((await findAgent(home, cwd, advice, definitions.git, 'advanced')).name, 'project-git');
});

test('user prompt detects Git before tool execution and protects conflicts and mixed tasks', async t => {
  const { home, cwd } = await fixture(t);
  const event = { hook_event_name: 'UserPromptSubmit', cwd, prompt: '提交代码' };
  const result = await runHook(home, event);
  assert.match(result.systemMessage, /simple/); assert.match(result.systemMessage, /git-operations/);
  assert.equal(result.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(result.decision, undefined);
  await writeFile(join(cwd, '.git', 'MERGE_HEAD'), 'in-progress');
  assert.match((await runHook(home, event)).systemMessage, /advanced/);
  assert.match((await runHook(home, { ...event, prompt: '重构模块后提交代码' })).systemMessage, /advanced/);
  assert.match((await runHook(home, { ...event, prompt: '开发 git 意图路由器' })).hookSpecificOutput.additionalContext, /只把实际且已获授权/);
  assert.equal(await runHook(home, { ...event, prompt: '修改按钮样式' }), null);
  assert.equal(await runHook(home, { ...event, agent_id: 'already-a-child' }), null);
});
