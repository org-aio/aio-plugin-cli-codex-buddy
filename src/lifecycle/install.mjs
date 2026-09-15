import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite, readJson, withLock } from '../runtime/index.mjs';

const events = ['SubagentStart', 'SubagentStop', 'PostToolUse'];
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const manifestPath = home => join(home, 'model-router', 'hooks-install.json');

function removeOwned(config, commands) {
  for (const event of events) {
    if (!config.hooks?.[event]) continue;
    config.hooks[event] = config.hooks[event].flatMap(group => {
      const hooks = group.hooks.filter(hook => !(hook.type === 'command' && commands.includes(hook.command)));
      return hooks.length === group.hooks.length ? [group] : hooks.length ? [{ ...group, hooks }] : [];
    });
    if (!config.hooks[event].length) delete config.hooks[event];
  }
  return config;
}

export async function installHooks(home, entry) {
  if (process.platform === 'win32') return { installed: false, reason: 'Lifecycle hook installation currently requires a POSIX shell.' };
  return withLock(join(home, 'model-router', 'hooks-install'), async () => {
    const source = await readFile(entry, 'utf8');
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 20);
    // Content-addressed scripts make changed code produce a new hook trust definition.
    const script = join(home, 'model-router', `hooks-${hash}.mjs`);
    await atomicWrite(script, source);
    const command = `${quote(process.execPath)} ${quote(script)} ${quote(home)}`;
    const file = join(home, 'hooks.json');
    const old = await readJson(file, {});
    const prior = await readJson(manifestPath(home), {});
    const next = removeOwned(structuredClone(old), [...(prior.commands || []), command]);
    next.hooks ||= {};
    for (const event of events) (next.hooks[event] ||= []).push({
      hooks: [{ type: 'command', command, timeout: 3, statusMessage: `Auto Router: ${event}` }],
    });
    if (JSON.stringify(old) !== JSON.stringify(next)) {
      await atomicWrite(join(home, 'model-router', `hooks-backup-${Date.now()}.json`), old);
      await atomicWrite(file, next);
    }
    const state = { installed: true, file, script, commands: [command], events, trust: 'Review in Codex /hooks; installer does not grant trust.' };
    await atomicWrite(manifestPath(home), state);
    return state;
  });
}

export async function uninstallHooks(home) {
  return withLock(join(home, 'model-router', 'hooks-install'), async () => {
    const state = await readJson(manifestPath(home), {});
    if (!state.installed) return { installed: false };
    const file = join(home, 'hooks.json');
    const old = await readJson(file, {});
    const next = removeOwned(structuredClone(old), state.commands || []);
    if (JSON.stringify(old) !== JSON.stringify(next)) await atomicWrite(file, next);
    await atomicWrite(manifestPath(home), { ...state, installed: false });
    return { installed: false, retained: 'Hook scripts retained for running Codex sessions.' };
  });
}
