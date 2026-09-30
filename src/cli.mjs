#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { homePath } from './config/index.mjs';
import { catalogSyncVerification, syncModels } from './sync/index.mjs';
import { installService, removeManagedService, uninstall } from './service/index.mjs';
import { readJson } from './runtime/index.mjs';
import { routerCommand } from './routing/commands.mjs';
import { probeModels } from './probe/index.mjs';

const help = `codex-buddy [setup|sync|probe|watch|status|uninstall|router] [options]

setup       Sync models once; install background sync only when requested
sync        Sync once; read the current provider and API key again
probe       Test live text models with Responses and a function call (may incur costs)
watch       Sync repeatedly in the foreground
status      Show synchronization and Auto Router status
router      setup|status|models|project|preview PROMPT|match PROMPT|dispatch|planning|enable|disable|health|hooks|uninstall
uninstall   Remove the background task and restore the prior catalog setting

--home PATH       Codex directory (default: CODEX_HOME or ~/.codex)
--codex-bin PATH  Codex executable; detected automatically when omitted
--service         Install or update the background sync task (also enabled by --interval)
--interval N      Service interval in seconds (default: 604800; watch default: 300)
--no-service      Legacy flag; setup already syncs without a background task
--no-router       Legacy flag; setup already leaves Auto Router unchanged
--model ID        Probe selected live model only (repeatable; default: all models)
--concurrency N   Maximum concurrent model probes (default: 4; range: 1-16)
--timeout-ms N    Timeout per probe request (default: 30000; range: 1000-120000)
--force           Probe again before the default seven-day cooldown expires
--planner-model ID   Preferred live model for complex-task planning/review
--executor-model ID  Preferred live model for bounded implementation
--executor-capabilities PATH  JSON snapshot of this client's spawn tool models (valid for 24h)
--executor-tier TIER simple|standard (default: standard); used by router planning
--json            Print machine-readable results
--help            Show this help
--version         Show the CLI version

Models are synchronized by setup or sync. Running Codex clients may need a restart
to reload their model picker. API keys are read locally and never saved by this tool.
Background sync is opt-in with setup --service.
Auto Router is opt-in: run router setup, then restart the desktop app once.
`;

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    home: { type: 'string' }, 'codex-bin': { type: 'string' }, interval: { type: 'string' },
    service: { type: 'boolean' }, 'no-service': { type: 'boolean' }, 'no-router': { type: 'boolean' }, 'health-key-file': { type: 'string' }, 'health-group-id': { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
    'planner-model': { type: 'string' }, 'executor-model': { type: 'string' }, 'executor-tier': { type: 'string' }, 'executor-capabilities': { type: 'string' },
    model: { type: 'string', multiple: true }, concurrency: { type: 'string', default: '4' }, 'timeout-ms': { type: 'string', default: '30000' },
    force: { type: 'boolean' },
  } });
  const action = positionals[0] || 'setup';
  if (values.version) console.log(typeof PACKAGE_VERSION === 'undefined' ? 'development' : PACKAGE_VERSION);
  else if (values.help) console.log(help);
  else {
    if ((action !== 'router' && positionals.length > 1) || !['setup', 'sync', 'probe', 'watch', 'status', 'uninstall', 'router'].includes(action)) throw new Error('Unknown command. Use --help.');
    const interval = Number(values.interval ?? (action === 'watch' ? 300 : 604800));
    if (!Number.isInteger(interval) || interval < 60 || interval > 604800 || interval % 60) throw new Error('--interval must be a multiple of 60, from 60 to 604800 seconds.');
    if (values['no-service'] && (values.service || values.interval !== undefined)) {
      throw new Error('--no-service cannot be used with --service or --interval.');
    }
    const home = homePath(values.home);
    const report = result => {
      if (values.json) console.log(JSON.stringify(result));
      else if (result.visibleCount !== undefined) console.log(`${result.changed ? 'Updated' : 'Up to date'}: ${result.visibleCount} catalog models (availability not probed by sync). ${result.catalogPath}`);
      else console.log(JSON.stringify(result, null, 2));
    };
    if (action === 'probe') {
      const result = await probeModels(home, {
        modelIds: values.model, concurrency: Number(values.concurrency), timeoutMs: Number(values['timeout-ms']), force: values.force,
        onProgress: values.json ? undefined : (model, done, total, progress) => console.error(
          `[${done}/${total}] ${model.id}: ${model.status}${progress.reused ? ' (reused; no inference)' : ''}${progress.nextProbeAt ? `; next probe ${progress.nextProbeAt}` : ''}`),
      });
      report(result);
      if (!result.ok) process.exitCode = 1;
    }
    else if (action === 'router') report(await routerCommand(positionals[1] || 'status', home, { codexBin: values['codex-bin'], prompt: positionals.slice(2).join(' '), healthKeyFile: values['health-key-file'], healthGroupId: Number(values['health-group-id']), plannerModel: values['planner-model'], executorModel: values['executor-model'], executorTier: values['executor-tier'], executorCapabilities: values['executor-capabilities'] }));
    else if (action === 'status') report({ router: await routerCommand('status', home), ...await readJson(join(home, 'model-sync', 'status.json'), { ok: false, error: 'Not configured yet.' }), verification: catalogSyncVerification, service: (await readJson(join(home, 'model-sync', 'state.json'), {})).service || null });
    else if (action === 'uninstall') {
      let router, routerError;
      try { router = await routerCommand('uninstall', home); } catch (error) { routerError = error.message; }
      const result = await uninstall(home);
      result.router = router;
      if (routerError) { result.ok = false; result.warnings.push(`Router cleanup: ${routerError}`); }
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
      const wantsService = action === 'setup' && (values.service || values.interval !== undefined);
      if (action === 'setup' && !wantsService) await removeManagedService(home);
      const result = await syncModels(home, { codexBin: values['codex-bin'], setup: action === 'setup' });
      if (action === 'setup') result.service = wantsService ? await installService(home, interval) : null;
      report(result);
      if (action === 'setup' && !values.json) {
        if (result.service) console.log(`Automatic sync installed: every ${interval / 60} minutes.`);
        else console.log('Background sync is not installed. Use --service to enable it.');
        console.log('Restart running Codex clients to reload the model picker.');
        console.log('Optional Auto Router: run codex-buddy router setup, then restart the desktop app and review its hooks in /hooks.');
      }
    }
  }
} catch (error) {
  console.error(`codex-buddy: ${error.message}`);
  process.exitCode = 1;
}
