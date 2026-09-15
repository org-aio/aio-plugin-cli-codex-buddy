import { spawnCommand } from '../runtime/process.mjs';

const killGroup = pid => { try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
const resultCode = (code, signal) => code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);

// The native shell can SIGKILL its direct child. A detached supervisor watches
// that parent and owns the command's entire process group, including npm children.
export async function executeRecipe(cwd, argv, entry, parentPid) {
  if (process.platform === 'win32' || !cwd || !argv.length) throw new Error('Native recipe execution requires POSIX, cwd and argv.');
  const supervised = Number.isSafeInteger(parentPid) && parentPid > 1;
  if (supervised && process.ppid !== parentPid) return 1;
  const child = supervised
    ? spawnCommand(argv[0], argv.slice(1), { cwd, stdio: 'inherit' })
    : spawnCommand(process.execPath, [entry, '--router-worker', String(process.pid), cwd, ...argv], { detached: true, stdio: 'inherit' });
  const timer = supervised ? setInterval(() => { if (process.ppid !== parentPid) killGroup(process.pid); }, 100) : null;
  const stop = () => killGroup(supervised ? process.pid : child.pid);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
  try {
    return await new Promise(resolve => {
      child.once('error', error => { console.error(`Rule command failed: ${error.code || 'spawn error'}`); resolve(1); });
      child.once('exit', (code, signal) => resolve(resultCode(code, signal)));
    });
  } finally {
    clearInterval(timer);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, stop);
    if (!supervised && child.pid) killGroup(child.pid);
  }
}
