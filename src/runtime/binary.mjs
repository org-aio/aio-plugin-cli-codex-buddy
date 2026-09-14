import { realpath } from 'node:fs/promises';
import { dirname, join, resolve, delimiter } from 'node:path';
import { command, environmentPath } from './index.mjs';

const npmLauncher = directory => join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');

export async function findBinary(explicit, env = process.env) {
  const directories = environmentPath(env).split(delimiter).filter(Boolean);
  const candidates = explicit ? [explicit] : [
    env.CODEX_CLI_PATH,
    ...directories.flatMap(directory => process.platform === 'win32'
      ? [join(directory, 'codex.exe'), npmLauncher(directory)]
      : [join(directory, 'codex')]),
    ...(process.platform === 'win32' && env.APPDATA ? [npmLauncher(join(env.APPDATA, 'npm'))] : []),
    ...(process.platform === 'darwin' ? [
      '/Applications/ChatGPT.app/Contents/Resources/codex',
      '/Applications/Codex.app/Contents/Resources/codex',
    ] : []),
  ];
  for (const candidate of candidates.filter(Boolean)) {
    try {
      // npm 的 Windows .cmd 包装器不经过 shell 执行，直接定位其官方 JS 入口。
      const path = await realpath(/\.cmd$/i.test(candidate) ? npmLauncher(dirname(candidate)) : candidate);
      const version = await command(path, ['--version'], { env });
      if (/codex.*\d+\.\d+/.test(version)) return resolve(path);
    } catch { /* Continue searching installed clients. */ }
  }
  throw new Error('Codex executable not found. Install Codex or pass --codex-bin with its executable or npm launcher path.');
}
