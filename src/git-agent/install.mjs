import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from '../runtime/index.mjs';
import { name, profile } from './profile.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const read = file => readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });

export async function installGitAgent(home, prior = {}) {
  const file = join(home, 'agents', `${name}.toml`);
  const current = await read(file);
  if (current !== null && current !== profile && digest(current) !== prior.hash) return { file, name, managed: false, preserved: true };
  if (current !== profile) await atomicWrite(file, profile);
  return { file, name, managed: true, hash: digest(profile) };
}

export async function uninstallGitAgent(state) {
  if (!state?.managed) return;
  const current = await read(state.file);
  if (current !== null && digest(current) === state.hash) await rm(state.file);
}
