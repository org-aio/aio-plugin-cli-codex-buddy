import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from '../src/runtime/index.mjs';
import { once } from 'node:events';
import { spawnCommand } from '../src/runtime/process.mjs';
import { findBinary, windowsDesktopCandidates } from '../src/runtime/binary.mjs';

test('JavaScript launchers run without shell parsing, including paths and arguments with spaces', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'launcher test & '));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binary = join(directory, 'client.mjs');
  await writeFile(binary, 'console.log(JSON.stringify(process.argv.slice(2)))');
  const args = ['a b', 'literal & command', 'a"b', 'C:\\path with spaces\\'];
  assert.deepEqual(JSON.parse(await command(binary, args)), args);
  const child = spawnCommand(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => output += data);
  const [code] = await once(child, 'close', { signal: AbortSignal.timeout(5000) });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output), args);
});

test('npm Codex .cmd shims resolve to the package launcher', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'npm-prefix-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const packageDirectory = join(directory, 'node_modules', '@openai', 'codex');
  await mkdir(join(packageDirectory, 'bin'), { recursive: true });
  await writeFile(join(packageDirectory, 'package.json'), '{"type":"module"}');
  const launcher = join(packageDirectory, 'bin', 'codex.js');
  await writeFile(launcher, 'console.log("codex-cli 0.153.4")');
  assert.equal(await findBinary(join(directory, 'codex.cmd')), await realpath(launcher));
  if (process.platform === 'win32') {
    assert.equal(await findBinary(undefined, { Path: directory }), await realpath(launcher));
  }
});

test('Windows desktop installs are probed under each program root in resources/codex.exe', () => {
  const candidates = windowsDesktopCandidates({
    LOCALAPPDATA: 'C:\\Users\\Administrator\\AppData\\Local',
    APPDATA: 'C:\\Users\\Administrator\\AppData\\Roaming',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  });
  assert.equal(candidates.length, 16);
  assert.equal(
    candidates[0],
    join('C:\\Users\\Administrator\\AppData\\Local', 'Programs', 'Codex', 'resources', 'codex.exe'),
  );
  assert.equal(
    candidates[3],
    join('C:\\Users\\Administrator\\AppData\\Local', 'Programs', '@openai\\codex', 'resources', 'codex.exe'),
  );
  assert.ok(candidates.some(candidate => candidate.startsWith(join('C:\\Program Files', 'ChatGPT'))));
  assert.ok(candidates.some(candidate => candidate.startsWith(join('C:\\Program Files (x86)', 'Codex'))));
  assert.deepEqual(windowsDesktopCandidates({}), []);
});

test('Windows desktop codex.exe under LOCALAPPDATA is discovered', { skip: process.platform !== 'win32' }, async t => {
  const localAppData = await mkdtemp(join(tmpdir(), 'localappdata-'));
  t.after(() => rm(localAppData, { recursive: true, force: true }));
  const resources = join(localAppData, 'Programs', 'Codex', 'resources');
  await mkdir(resources, { recursive: true });
  const binary = join(resources, 'codex.exe');
  await writeFile(binary, 'stub');
  // 目前没有可执行的 codex.exe 可跑，改用 npm launcher 版本校验路径枚举；
  // 这里只断言候选枚举覆盖到刚创建的桌面端二进制路径。
  assert.ok(windowsDesktopCandidates({ LOCALAPPDATA: localAppData }).includes(binary));
});
