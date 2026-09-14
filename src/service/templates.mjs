import { createHash } from 'node:crypto';

export const serviceId = home => `codex-model-sync-${createHash('sha256').update(home).digest('hex').slice(0, 12)}`;
const xml = value => String(value).replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);
const systemd = value => `"${String(value).replace(/[%\\"$\n\r]/g, character => ({ '%': '%%', '\\': '\\\\', '"': '\\"', '$': '$$', '\n': '\\n', '\r': '\\r' })[character])}"`;
export const windowsArg = value => `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;

export function launchAgent({ id, node, runtime, home, interval, directory }) {
  const args = [node, runtime, 'sync', '--home', home].map(arg => `<string>${xml(arg)}</string>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(id)}</string>
<key>ProgramArguments</key><array>${args}</array>
<key>RunAtLoad</key><true/><key>StartInterval</key><integer>${interval}</integer>
<key>StandardOutPath</key><string>${xml(directory + '/service.log')}</string>
<key>StandardErrorPath</key><string>${xml(directory + '/service-error.log')}</string>
</dict></plist>\n`;
}

export function userService({ node, runtime, home }) {
  return `[Unit]\nDescription=Synchronize Codex model catalog\n[Service]\nType=oneshot\nExecStart=${[node, runtime, 'sync', '--home', home].map(systemd).join(' ')}\n`;
}

export function userTimer({ interval }) {
  return `[Unit]\nDescription=Periodically synchronize Codex models\n[Timer]\nOnStartupSec=30\nOnUnitActiveSec=${interval}s\n[Install]\nWantedBy=timers.target\n`;
}

export function windowsTask({ node, runtime, home, interval, user }) {
  const args = [runtime, 'sync', '--home', home].map(windowsArg).join(' ');
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<Triggers><TimeTrigger><Repetition><Interval>PT${interval / 60}M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>${new Date().toISOString()}</StartBoundary><Enabled>true</Enabled></TimeTrigger><LogonTrigger><Enabled>true</Enabled><UserId>${xml(user)}</UserId></LogonTrigger></Triggers>
<Principals><Principal id="Author"><UserId>${xml(user)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT5M</ExecutionTimeLimit></Settings>
<Actions Context="Author"><Exec><Command>${xml(node)}</Command><Arguments>${xml(args)}</Arguments></Exec></Actions>
</Task>`;
}
