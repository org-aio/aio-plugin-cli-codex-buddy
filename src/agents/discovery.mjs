import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'smol-toml';
import { tiers } from '../routing/tiers.mjs';

const exec = promisify(execFile);
export async function findAgent(home, cwd, advice, { name: installedName, match }, required = 'advanced') {
  const root = cwd ? await exec('git', ['rev-parse', '--show-toplevel'], { cwd, timeout: 500 }).then(r => r.stdout.trim(), () => null) : null;
  const directories = [...new Set([cwd && join(cwd, '.codex', 'agents'), root && join(root, '.codex', 'agents'), join(home, 'agents')].filter(Boolean))];
  const found = new Map();
  for (const directory of directories) {
    const files = await readdir(directory).catch(() => []);
    for (const file of files.filter(f => f.endsWith('.toml')).sort()) {
      try {
        const role = parse(await readFile(join(directory, file), 'utf8'));
        if (typeof role.name !== 'string' || !/^[\w-]{1,64}$/.test(role.name) || found.has(role.name)) continue;
        // Project definitions shadow personal definitions, including disabled/unsuitable roles.
        found.set(role.name, role);
      } catch { /* An invalid unrelated profile must not break a hook. */ }
    }
  }
  const suitable = [...found.values()].filter(role => typeof role.developer_instructions === 'string'
    && match.test(`${role.name} ${role.description || ''}`)
    && (!role.model || tiers.indexOf(advice?.modelTiers?.[role.model]) >= tiers.indexOf(required)));
  suitable.sort((a, b) => Number(a.name === installedName) - Number(b.name === installedName));
  const role = suitable[0];
  return role ? { name: role.name, fixedModel: role.model || null } : null;
}
