import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readJson, atomicWrite } from '../runtime/index.mjs';
import { findBinary } from '../runtime/binary.mjs';
import { install, uninstallRouter } from '../desktop/index.mjs';
import { routeTurn } from './index.mjs';
import { readConnection } from '../config/index.mjs';
import { connectionBinding } from './health.mjs';
import { normalizePolicy } from './policy.mjs';

export async function routerCommand(action, home, { codexBin, prompt = '', entry, healthKeyFile, healthGroupId } = {}) {
  const directory = join(home, 'model-router');
  if (action === 'health') {
    if (!healthKeyFile || !Number.isSafeInteger(healthGroupId) || healthGroupId <= 0) throw new Error('Use router health --health-key-file PATH --health-group-id ID.');
    const policy = normalizePolicy(await readJson(join(directory, 'policy.json'), {}));
    await atomicWrite(join(directory, 'policy.json'), { ...policy, health: { keyFile: healthKeyFile, groupId: healthGroupId, providerBinding: connectionBinding(await readConnection(home)), maxAgeSeconds: 300, minSamples: 10 } });
    return { configured: true, groupId: healthGroupId, keyFile: healthKeyFile };
  }
  if (action === 'status') return {
    installation: await readJson(join(directory, 'install.json'), {}),
    policy: normalizePolicy(await readJson(join(directory, 'policy.json'), {})),
    lastTurn: await readJson(join(directory, 'status.json'), null),
  };
  if (action === 'disable' || action === 'enable') {
    const policy = normalizePolicy(await readJson(join(directory, 'policy.json'), {}));
    await atomicWrite(join(directory, 'policy.json'), { ...policy, enabled: action === 'enable' });
    return { enabled: action === 'enable', effective: 'next turn' };
  }
  if (action === 'uninstall') return uninstallRouter(home);
  if (action === 'models') return routeTurn(home, { inventoryOnly: true });
  if (action === 'preview') return routeTurn(home, { cwd: process.cwd(), input: [{ type: 'text', text: prompt }] });
  if (action === 'setup') {
    if (process.platform !== 'darwin') return { installed: false, reason: 'Desktop auto setup currently supports macOS; other platforms can use the stdio bridge.' };
    const desktop = ['/Applications/ChatGPT.app/Contents/Resources/codex', '/Applications/Codex.app/Contents/Resources/codex'].find(existsSync);
    const binary = await findBinary(codexBin || desktop);
    const bundled = entry || fileURLToPath(new URL('./router.mjs', import.meta.url));
    if (!existsSync(bundled)) throw new Error('Router bundle missing. Run npm run build.');
    const result = await install(home, binary, bundled);
    try {
      const models = await routeTurn(home, { inventoryOnly: true });
      result.modelCount = models?.total; result.assessmentWarning = models?.warning;
    } catch { result.assessmentWarning = 'Inventory refresh failed; requests will keep their original model until discovery recovers.'; }
    return result;
  }
  throw new Error('Unknown router command: use setup, status, models, preview, enable, disable, or uninstall.');
}
