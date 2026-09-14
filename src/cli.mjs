#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { homePath } from './config/index.mjs';
import { syncModels } from './sync/index.mjs';
import { installService, uninstall } from './service/index.mjs';
import { readJson } from './runtime/index.mjs';

const help = `codex-model-sync [setup|sync|watch|status|uninstall] [options]

setup       Sync models, configure Codex, and install a background task (default)
sync        Sync once; read the current provider and API key again
watch       Sync repeatedly in the foreground
status      Show the last synchronization result
uninstall   Remove the background task and restore the prior catalog setting

--home PATH       Codex directory (default: CODEX_HOME or ~/.codex)
--codex-bin PATH  Codex executable; detected automatically when omitted
--interval N      Background interval in seconds (default: 300; multiples of 60)
--no-service      Configure and sync without installing a background task
--json            Print machine-readable results
--help            Show this help
--version         Show the CLI version

Models are synchronized automatically. Running Codex clients may need a restart
to reload their model picker. API keys are read locally and never saved by this tool.
`;

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    home: { type: 'string' }, 'codex-bin': { type: 'string' }, interval: { type: 'string', default: '300' },
    'no-service': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
  } });
  const action = positionals[0] || 'setup';
  if (values.version) console.log(typeof PACKAGE_VERSION === 'undefined' ? 'development' : PACKAGE_VERSION);
  else if (values.help) console.log(help);
  else {
    if (positionals.length > 1 || !['setup', 'sync', 'watch', 'status', 'uninstall'].includes(action)) throw new Error('Unknown command. Use --help.');
    const interval = Number(values.interval);
    if (!Number.isInteger(interval) || interval < 60 || interval > 86400 || interval % 60) throw new Error('--interval must be a multiple of 60, from 60 to 86400 seconds.');
    const home = homePath(values.home);
    const report = result => {
      if (values.json) console.log(JSON.stringify(result));
      else if (result.visibleCount !== undefined) console.log(`${result.changed ? 'Updated' : 'Up to date'}: ${result.visibleCount} models. ${result.catalogPath}`);
      else console.log(JSON.stringify(result, null, 2));
    };
    if (action === 'status') report({ ...await readJson(join(home, 'model-sync', 'status.json'), { ok: false, error: 'Not configured yet.' }), service: (await readJson(join(home, 'model-sync', 'state.json'), {})).service || null });
    else if (action === 'uninstall') {
      const result = await uninstall(home);
      if (values.json) report(result);
      else {
        console.log(`Automatic sync disabled. Codex config: ${result.config}.`);
        console.log(`Background task ${result.serviceRemoved ? 'removed' : 'could not be fully removed'}. Backups: ${result.backups}`);
        for (const warning of result.warnings) console.error(`Warning: ${warning}`);
        console.log('Restart Codex to reload its original model catalog.');
      }
      if (!result.ok) process.exitCode = 1;
    }
    else if (action === 'watch') {
      const controller = new AbortController();
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => controller.abort());
      while (!controller.signal.aborted) {
        try { report(await syncModels(home, { codexBin: values['codex-bin'] })); }
        catch (error) { console.error(error.message); }
        try { await setTimeout(interval * 1000, null, { signal: controller.signal }); } catch { break; }
      }
    } else {
      const result = await syncModels(home, { codexBin: values['codex-bin'], setup: action === 'setup' });
      if (action === 'setup' && !values['no-service']) result.service = await installService(home, interval);
      report(result);
      if (action === 'setup' && !values.json) {
        if (result.service) console.log(`Automatic sync installed: every ${interval / 60} minutes.`);
        console.log('Restart running Codex clients to reload the model picker.');
      }
    }
  }
} catch (error) {
  console.error(`codex-model-sync: ${error.message}`);
  process.exitCode = 1;
}
