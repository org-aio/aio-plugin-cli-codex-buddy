import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { readFile, chmod, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicWrite, readJson } from '../runtime/index.mjs';
import { defaultPolicy, normalizePolicy } from '../routing/policy.mjs';

const exec = promisify(execFile);
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const label = 'site.addzero.codex-model-router';
const agentPath = () => join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);

export async function install(home, binary, entry) {
  if (process.platform !== 'darwin') throw new Error('Desktop setup currently supports macOS. Use the stdio proxy directly on other systems.');
  const directory = join(home, 'model-router');
  const prior = await readJson(join(directory, 'install.json'), {});
  const previousCli = prior.installed ? prior.previousCli
    : await exec('/bin/launchctl', ['getenv', 'CODEX_CLI_PATH']).then(r => r.stdout.trim(), () => '');
  const launcher = join(directory, 'codex');
  if (resolve(binary) === launcher) throw new Error('Real Codex binary cannot be the router.');
  await atomicWrite(join(directory, 'router.mjs'), await readFile(entry, 'utf8'));
  await atomicWrite(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(directory, 'router.mjs'))} --router-home ${quote(home)} --router-binary ${quote(binary)} "$@"\n`);
  await chmod(launcher, 0o755);
  const policyFile = join(directory, 'policy.json');
  const policy = await readJson(policyFile, defaultPolicy);
  await atomicWrite(policyFile, { ...normalizePolicy(policy), enabled: true });
  await atomicWrite(join(directory, 'install.json'), { installed: true, binary, launcher, previousCli });
  // launchd exports this to newly launched desktop apps; the current app is left running.
  await atomicWrite(agentPath(), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>/bin/launchctl</string><string>setenv</string><string>CODEX_CLI_PATH</string><string>${xml(launcher)}</string></array><key>RunAtLoad</key><true/></dict></plist>\n`);
  await exec('/bin/launchctl', ['setenv', 'CODEX_CLI_PATH', launcher]);
  const target = `gui/${process.getuid()}`;
  await exec('/bin/launchctl', ['bootout', `${target}/${label}`]).catch(() => {});
  await exec('/bin/launchctl', ['bootstrap', target, agentPath()]);
  return { installed: true, launcher, policyFile, restartRequired: true };
}

export async function uninstallRouter(home) {
  const directory = join(home, 'model-router');
  const state = await readJson(join(directory, 'install.json'), {});
  if (!state.installed) return { installed: false };
  const policy = await readJson(join(directory, 'policy.json'), defaultPolicy);
  await atomicWrite(join(directory, 'policy.json'), { ...policy, enabled: false });
  const current = await exec('/bin/launchctl', ['getenv', 'CODEX_CLI_PATH']).then(r => r.stdout.trim(), () => '');
  if (current === state.launcher) {
    await exec('/bin/launchctl', state.previousCli ? ['setenv', 'CODEX_CLI_PATH', state.previousCli] : ['unsetenv', 'CODEX_CLI_PATH']);
  }
  await exec('/bin/launchctl', ['bootout', `gui/${process.getuid()}/${label}`]).catch(() => {});
  await rm(agentPath(), { force: true });
  await atomicWrite(join(directory, 'install.json'), { ...state, installed: false });
  // Keep the disabled shim until the app exits; live desktop subprocesses may still use it.
  return { installed: false, disabled: true, restartRequired: true, retained: directory };
}
