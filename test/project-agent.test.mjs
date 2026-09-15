import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { runHook } from '../src/lifecycle/index.mjs';
import { installHooks, uninstallHooks } from '../src/lifecycle/install.mjs';
import { installAgent } from '../src/agents/install.mjs';
import { definitions } from '../src/agents/index.mjs';
import { findAgent } from '../src/agents/discovery.mjs';
import { atomicWrite } from '../src/runtime/index.mjs';

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'project-agent-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const cwd = join(home, 'project'); await mkdir(cwd);
  await writeFile(join(cwd, 'package.json'), '{"scripts":{"dev":"vite"},"devDependencies":{"vite":"1"}}');
  return { home, cwd };
}
test('prompt-submit supplies stack commands before any tool and preserves difficulty boundaries', async t => {
  const { home, cwd } = await fixture(t);
  await installAgent(home, definitions.project);
  const event = { hook_event_name: 'UserPromptSubmit', cwd, prompt: '跑起来看看' };
  const output = await runHook(home, event);
  assert.match(output.systemMessage, /simple.*project-operations/);
  assert.match(output.hookSpecificOutput.additionalContext, /npm run dev/);
  assert.match(output.hookSpecificOutput.additionalContext, /model\/fork_turns|现有指令允许委派/);
  assert.equal(output.model, undefined); assert.equal(output.decision, undefined);
  const mixed = await runHook(home, { ...event, prompt: '跑起来并重构登录模块' });
  assert.match(mixed.systemMessage, /advanced/);
  const general = await runHook(home, { ...event, prompt: '修改按钮文案' });
  assert.match(general.hookSpecificOutput.additionalContext, /npm run dev/);
  assert.equal(general.systemMessage, undefined);
  assert.equal(await runHook(home, { ...event, agent_id: 'already-specialist' }), null);
});

test('existing project operations roles are selected only when their fixed model meets the task tier', async t => {
  const { home, cwd } = await fixture(t);
  await installAgent(home, definitions.project);
  await mkdir(join(cwd, '.codex/agents'), { recursive: true });
  await writeFile(join(cwd, '.codex/agents/runner.toml'), 'name="local-runner"\ndescription="项目运行"\nmodel="private/tiny"\ndeveloper_instructions="Handle project operations"');
  const advice = { modelTiers: { 'private/tiny': 'simple' } };
  assert.equal((await findAgent(home, cwd, advice, definitions.project, 'simple')).name, 'local-runner');
  assert.equal((await findAgent(home, cwd, advice, definitions.project, 'advanced')).name, 'project-operations');
});

test('installer migrates the existing Git role, installs both model-neutral roles and preserves user edits', async t => {
  const { home } = await fixture(t);
  const agent = await installAgent(home, definitions.git);
  await atomicWrite(join(home, 'model-router/hooks-install.json'), { installed: true, agent });
  const bundle = join(home, 'bundle.mjs'); await writeFile(bundle, '// hook fixture');
  const installed = await installHooks(home, bundle);
  assert.equal(installed.agents.length, 2); assert.equal(installed.agent, undefined);
  for (const role of installed.agents) assert.equal(parse(await readFile(role.file, 'utf8')).model, undefined);
  const project = installed.agents.find(item => item.name === 'project-operations');
  await writeFile(project.file, '# user modified\n' + await readFile(project.file, 'utf8'));
  assert.equal((await installHooks(home, bundle)).agents.find(item => item.name === project.name).preserved, true);
  await uninstallHooks(home);
  await assert.rejects(readFile(agent.file), { code: 'ENOENT' });
  assert.match(await readFile(project.file, 'utf8'), /user modified/);
});
