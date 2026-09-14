import { homedir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { command } from '../runtime/index.mjs';
import { serviceId } from './templates.mjs';

function inferredService(home) {
  const id = serviceId(home);
  const platform = process.platform;
  const folder = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'systemd', 'user');
  const files = platform === 'darwin' ? [join(homedir(), 'Library', 'LaunchAgents', `${id}.plist`)]
    : platform === 'linux' ? [join(folder, `${id}.service`), join(folder, `${id}.timer`)]
      : platform === 'win32' ? [join(home, 'model-sync', 'task.xml')] : [];
  return { id, platform, files };
}

// 调度器异常不能阻止配置回滚；仅确认任务不存在时才忽略删除错误。
export async function removeService(home, recorded, run = command) {
  const service = recorded || inferredService(home);
  const { id, platform, files = [] } = service;
  const warnings = [];
  const absent = async unit => {
    if (platform === 'darwin') {
      try { await run('launchctl', ['print', `gui/${process.getuid()}/${id}`]); }
      catch (error) { if (error.code === 113) return true; throw error; }
    } else if (platform === 'linux') {
      return (await run('systemctl', ['--user', 'show', unit, '--property=LoadState', '--value'])).trim() === 'not-found';
    } else if (platform === 'win32') {
      const tasks = await run('schtasks.exe', ['/Query', '/FO', 'CSV', '/NH']);
      return !tasks.toLowerCase().includes(`"\\${id.toLowerCase()}"`);
    }
    return false;
  };
  const stop = async (binary, args, unit = id) => {
    try { await run(binary, args); }
    catch (error) {
      try { if (await absent(unit)) return; } catch { /* Report the original failure. */ }
      warnings.push(`Could not remove background task ${unit}: ${error.message}`);
    }
  };
  if (platform === 'darwin') await stop('launchctl', ['bootout', `gui/${process.getuid()}/${id}`]);
  else if (platform === 'linux') {
    await stop('systemctl', ['--user', 'disable', '--now', `${id}.timer`], `${id}.timer`);
    await stop('systemctl', ['--user', 'stop', `${id}.service`], `${id}.service`);
  } else if (platform === 'win32') {
    // Delete alone does not stop an already running task. End first, then remove it.
    try { await run('schtasks.exe', ['/End', '/TN', id]); } catch { /* It may not be running. */ }
    await stop('schtasks.exe', ['/Delete', '/TN', id, '/F']);
  }
  for (const path of files) {
    try { await rm(path, { force: true }); }
    catch { warnings.push(`Could not remove scheduler file: ${path}`); }
  }
  if (platform === 'linux') {
    try { await run('systemctl', ['--user', 'daemon-reload']); }
    catch (error) { warnings.push(`Could not reload user scheduler: ${error.message}`); }
  }
  return { service: warnings.length ? service : null, warnings };
}
