#!/usr/bin/env node
import { spawnCommand } from './runtime/process.mjs';
import { homePath } from './config/index.mjs';
import { findBinary } from './runtime/binary.mjs';
import { bridge } from './bridge/index.mjs';
import { routerCommand } from './routing/commands.mjs';
import { executeRecipe } from './dispatch/execute.mjs';

const args = process.argv.slice(2);
function option(name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  if (!args[i + 1]) throw new Error(`${name} requires a value.`);
  return args.splice(i, 2)[1];
}
try {
  if (args[0] === '--router-run' || args[0] === '--router-worker') {
    const worker = args.shift() === '--router-worker';
    const parentPid = worker ? Number(args.shift()) : undefined;
    if (worker && (!Number.isSafeInteger(parentPid) || parentPid <= 1)) throw new Error('Invalid recipe supervisor parent.');
    const cwd = args.shift();
    process.exitCode = await executeRecipe(cwd, args, process.argv[1], parentPid);
  } else {
    const home = homePath(option('--router-home'));
    const explicit = option('--router-binary');
    const appServer = args.indexOf('app-server');
    const commands = ['setup', 'status', 'uninstall', 'preview', 'models', 'enable', 'disable'];
    if (commands.includes(args[0])) {
      const action = args.shift();
      console.log(JSON.stringify(await routerCommand(action, home, { codexBin: explicit, prompt: args.join(' '), entry: process.argv[1] }), null, 2));
    } else if (!args.length || (args[0] === '--help' && !explicit)) {
      console.log('codex-model-router setup|status|uninstall|preview [prompt]\n--router-home PATH  Codex directory\n--router-binary PATH  Real Codex executable\nOther arguments are forwarded to Codex. app-server stdio is routed.\nDesktop setup takes effect after quitting and reopening the app.');
    } else {
      const binary = await findBinary(explicit);
      const isStdio = appServer >= 0 && !args.slice(appServer + 1).some(arg => ['daemon', 'proxy', 'generate-ts', 'generate-json-schema', '--help', '-h'].includes(arg))
        && !args.some((arg, i) => (arg === '--listen' && args[i + 1] !== 'stdio://') || (arg.startsWith('--listen=') && arg !== '--listen=stdio://'));
      if (isStdio) process.exitCode = await bridge({ binary, args, home });
      else {
        const child = spawnCommand(binary, args, { stdio: 'inherit' });
        process.exitCode = await new Promise(resolve => {
          child.once('exit', code => resolve(code ?? 1));
          child.once('error', () => resolve(1));
        });
      }
    }
  }
} catch (error) {
  console.error(`codex-model-router: ${error.message}`);
  process.exitCode = 1;
}
