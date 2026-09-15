import { build } from 'esbuild';
import { readFile, chmod } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
await build({
  entryPoints: ['src/cli.mjs'], bundle: true, platform: 'node', target: 'node20',
  format: 'esm', outfile: 'dist/cli.mjs',
  define: { __BUNDLED__: 'true', PACKAGE_VERSION: JSON.stringify(version) },
});
await chmod('dist/cli.mjs', 0o755);

await build({
  entryPoints: ['src/router-cli.mjs'], bundle: true, platform: 'node', target: 'node20',
  format: 'esm', outfile: 'dist/router.mjs',
});
await chmod('dist/router.mjs', 0o755);

await build({
  entryPoints: ['src/hook-cli.mjs'], bundle: true, platform: 'node', target: 'node20',
  format: 'esm', outfile: 'dist/hooks.mjs',
});
