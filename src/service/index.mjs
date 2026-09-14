import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { atomicWrite, command, readJson } from '../runtime/index.mjs';
import { serviceId, launchAgent, userService, userTimer, windowsTask } from './templates.mjs';

export async function installService(home, interval) {
  if (typeof __BUNDLED__ === 'undefined') throw new Error('Run npm run build before installing the background service.');
  const directory = join(home, 'model-sync');
  const runtime = join(directory, 'runtime.mjs');
  const id = serviceId(home);
  const values = { id, home, directory, runtime, node: process.execPath, interval };
  await atomicWrite(runtime, await readFile(fileURLToPath(import.meta.url), 'utf8'));
  const saveService = async files => {
    const path = join(directory, 'state.json');
    await atomicWrite(path, { ...await readJson(path), service: { id, platform: process.platform, files, interval } });
  };
  let files;
  if (process.platform === 'darwin') {
    files = [join(homedir(), 'Library', 'LaunchAgents', `${id}.plist`)];
    await atomicWrite(files[0], launchAgent(values));
    try { await command('launchctl', ['bootout', `gui/${process.getuid()}/${id}`]); } catch { /* Not loaded yet. */ }
    await saveService(files);
    await command('launchctl', ['bootstrap', `gui/${process.getuid()}`, files[0]]);
  } else if (process.platform === 'linux') {
    const folder = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'systemd', 'user');
    files = [join(folder, `${id}.service`), join(folder, `${id}.timer`)];
    await atomicWrite(files[0], userService(values));
    await atomicWrite(files[1], userTimer(values));
    await saveService(files);
    await command('systemctl', ['--user', 'daemon-reload']);
    await command('systemctl', ['--user', 'enable', '--now', `${id}.timer`]);
    await command('systemctl', ['--user', 'restart', `${id}.timer`]);
  } else if (process.platform === 'win32') {
    files = [join(directory, 'task.xml')];
    const user = [process.env.USERDOMAIN, process.env.USERNAME].filter(Boolean).join('\\');
    await mkdir(dirname(files[0]), { recursive: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(files[0], '\uFEFF' + windowsTask({ ...values, user }), 'utf16le');
    await saveService(files);
    await command('schtasks.exe', ['/Create', '/TN', id, '/XML', files[0], '/F']);
  } else {
    throw new Error('Automatic service setup is unsupported on this OS. Use the watch command.');
  }
  return { id, interval };
}

export { uninstall } from './uninstall.mjs';
