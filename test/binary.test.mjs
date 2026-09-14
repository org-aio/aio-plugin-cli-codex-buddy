import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from '../src/runtime/index.mjs';
import { findBinary } from '../src/runtime/binary.mjs';

test('JavaScript launchers run without shell parsing, including paths and arguments with spaces', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'launcher test & '));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binary = join(directory, 'client.mjs');
  await writeFile(binary, 'console.log(JSON.stringify(process.argv.slice(2)))');
  const args = ['a b', 'literal & command', 'a"b', 'C:\\path with spaces\\'];
  assert.deepEqual(JSON.parse(await command(binary, args)), args);
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
