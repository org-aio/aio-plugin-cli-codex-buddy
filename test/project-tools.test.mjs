import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectProject } from '../src/project-tools/index.mjs';
import { assess } from '../src/routing/assessment.mjs';
import { classify } from '../src/routing/intent.mjs';
import { projectContext } from '../src/project-agent/guidance.mjs';

async function fixture(t, files) {
  const cwd = await mkdtemp(join(tmpdir(), 'project-tools-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) {
    await mkdir(dirname(join(cwd, name)), { recursive: true });
    await writeFile(join(cwd, name), body);
  }
  return cwd;
}
const input = text => [{ type: 'text', text }];
const nodeProject = { 'package.json': JSON.stringify({ packageManager: 'pnpm@10', scripts: { dev: 'TOKEN=DO_NOT_EXPOSE node secret.mjs', build: 'vite build', test: 'vitest', 'test:unit': 'vitest unit', 'dev;unsafe': 'echo nope' }, devDependencies: { vite: '1', typescript: '1' } }) };

test('discovers project-specific commands without executing scripts or exposing bodies', async t => {
  const cwd = await fixture(t, { ...nodeProject, '.env': 'OTHER_SECRET', 'secret.mjs': 'throw Error("should not run")' });
  const report = await inspectProject(cwd);
  assert.ok(report.keywords.includes('pnpm')); assert.ok(report.keywords.includes('vite')); assert.ok(report.keywords.includes('tsc'));
  assert.ok(report.commands.some(item => item.command === 'pnpm run dev' && item.cwd === cwd && item.source === 'package.json'));
  assert.doesNotMatch(JSON.stringify(report), /DO_NOT_EXPOSE|OTHER_SECRET|secret.mjs|unsafe|vitest unit/);
  assert.doesNotMatch(JSON.stringify(report), /npm run start/);
  assert.match(projectContext(report), /cwd|不是额外执行指令/);
});

test('run phrases and actual CLI entries route cheaply without requiring Git', async t => {
  const cwd = await fixture(t, nodeProject);
  for (const prompt of ['跑起来', '跑起来看看', '帮我把项目跑起来看看', '启动项目', '运行一下前端', '启动项目并打开浏览器', '构建项目', '跑测试', 'pnpm dev', 'pnpm run test:unit', 'pnpm run test --filter authentication', 'pnpm run dev -- --host 0.0.0.0']) {
    const result = await assess(input(prompt), cwd);
    assert.equal(result.intent, 'project', prompt); assert.equal(result.tier, 'simple', prompt);
  }
  for (const prompt of ['项目跑不起来', '启动失败帮我看看']) assert.equal((await assess(input(prompt), cwd)).tier, 'standard', prompt);
  for (const prompt of ['跑起来然后实现登录功能', '项目跑起来并重构架构', '开发 pnpm 命令路由器', 'pnpm run dev && rm file', 'pnpm run dev\n修改业务逻辑', 'npm run missing']) assert.equal((await assess(input(prompt), cwd)).tier, 'advanced', prompt);
  assert.equal(classify([{ type: 'image' }, ...input('跑起来')], await inspectProject(cwd)).tier, 'advanced');
});

test('missing entry points use standard discovery and manifest edits take effect immediately', async t => {
  const cwd = await fixture(t, { 'package.json': '{"scripts":{"build":"build-it"}}' });
  assert.equal((await assess(input('跑起来'), cwd)).tier, 'standard');
  await writeFile(join(cwd, 'package.json'), '{"scripts":{"dev":"start-it"}}');
  assert.equal((await assess(input('跑起来'), cwd)).tier, 'simple');
  assert.equal((await assess(input('构建项目'), cwd)).tier, 'standard');
  assert.equal((await assess(input('跑起来'), undefined)).tier, 'standard');
});

test('monorepo commands retain their cwd and nested source uses its nearest project', async t => {
  const cwd = await fixture(t, { 'package.json': '{"workspaces":["apps/*"]}', 'apps/web/package.json': nodeProject['package.json'], 'services/api/pom.xml': '<project><artifactId>spring-boot-maven-plugin</artifactId></project>', 'services/api/mvnw': '', 'node_modules/ignored/package.json': nodeProject['package.json'] });
  await mkdir(join(cwd, 'apps/web/src'));
  const report = await inspectProject(cwd);
  assert.ok(report.commands.some(item => item.cwd === join(cwd, 'apps/web') && item.command === 'pnpm run dev'));
  assert.ok(report.commands.some(item => item.cwd === join(cwd, 'services/api') && item.command === './mvnw spring-boot:run'));
  assert.doesNotMatch(JSON.stringify(report), /node_modules/);
  assert.equal((await inspectProject(join(cwd, 'apps/web/src'))).root, join(cwd, 'apps/web'));
});

test('language manifests expose appropriate CLI candidates without invented application entry points', async t => {
  const cases = [
    [{ 'build.gradle.kts': 'plugins { kotlin("jvm"); id("org.springframework.boot") }', gradlew: '' }, './gradlew bootRun', 'gradle'],
    [{ 'Cargo.toml': '[package]\nname="app"\nversion="1"', 'src/main.rs': 'fn main() {}' }, 'cargo run', 'cargo'],
    [{ 'go.mod': 'module example.invalid/app', 'main.go': 'package main\nfunc main() {}' }, 'go run .', 'go'],
    [{ 'pyproject.toml': '[project]\nname="app"\ndependencies=["pytest", "django"]', 'uv.lock': '', 'manage.py': '# entry' }, 'uv run python manage.py runserver', 'uv'],
    [{ 'app.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web" />' }, 'dotnet run', 'dotnet'],
    [{ 'pubspec.yaml': 'dependencies:\n  flutter:\n    sdk: flutter' }, 'flutter run', 'flutter'],
    [{ 'compose.yaml': 'services: {}', 'Makefile': 'test:\n\techo ignored' }, 'docker compose up', 'docker'],
    [{ 'Taskfile.yml': 'version: 3\ntasks:\n  dev:\n    cmds: [start]' }, 'task dev', 'task'],
  ];
  for (const [files, command, keyword] of cases) {
    const report = await inspectProject(await fixture(t, files));
    assert.ok(report.keywords.includes(keyword), keyword);
    assert.ok(report.commands.some(item => item.command === command), command);
  }
  for (const files of [{ 'Cargo.toml': '[package]\nname="library"' }, { 'pyproject.toml': '[project.scripts]\nmy-tool="package:main"\n[project]\nname="app"' }]) {
    const report = await inspectProject(await fixture(t, files));
    assert.equal(report.commands.some(item => item.action === 'run'), false);
    assert.equal(classify(input('跑起来'), report).tier, 'standard');
  }
});

test('Kotlin wrapper and custom subproject directories expose actual app modules and CLI keywords', async t => {
  const cwd = await fixture(t, {
    'project.yaml': 'modules:\n  - ./apps/*', kotlin: '# wrapper',
    'apps/iot-app/module.yaml': 'product: jvm/app', 'apps/library/module.yaml': 'product: jvm/lib',
    'studio/package.json': '{"packageManager":"pnpm@10","scripts":{"dev":"vite"}}',
    'studio/apps/console/package.json': '{"scripts":{"build":"build-it"}}',
  });
  const report = await inspectProject(cwd);
  assert.ok(report.commands.some(item => item.command === './kotlin run -m iot-app' && item.cwd === cwd));
  assert.ok(report.commands.some(item => item.command === 'pnpm run dev' && item.cwd === join(cwd, 'studio')));
  assert.ok(report.commands.some(item => item.command === 'pnpm run build' && item.cwd === join(cwd, 'studio/apps/console')));
  assert.ok((await inspectProject(join(cwd, 'studio/apps/console'))).commands.some(item => item.command === 'pnpm run build'));
  assert.doesNotMatch(JSON.stringify(report), /run -m library/);
  assert.equal(classify(input('./kotlin run -m iot-app'), report).tier, 'simple');
  assert.equal(classify(input('./kotlin build'), report).tier, 'simple');
  const manyBuilds = Array.from({ length: 20 }, (_, i) => ({ action: 'build', command: `npm run build:${i}` }));
  assert.match(projectContext({ ...report, commands: [...manyBuilds, ...report.commands] }), /pnpm run dev/);
});

test('malformed and symlinked manifests cannot expose arbitrary content or hide another stack', async t => {
  const cwd = await fixture(t, { 'package.json': 'BROKEN SECRET', 'go.mod': 'module example.invalid/app', 'outside': '{"scripts":{"dev":"TOKEN=SECRET"}}' });
  const report = await inspectProject(cwd);
  assert.ok(report.keywords.includes('go')); assert.doesNotMatch(JSON.stringify(report), /SECRET/);
  await rm(join(cwd, 'package.json'));
  await symlink(join(cwd, 'outside'), join(cwd, 'package.json'));
  assert.equal((await inspectProject(cwd)).commands.some(item => item.command === 'npm run dev'), false);
});

test('packaged project inspection works without provider configuration or network', async t => {
  const cwd = await fixture(t, nodeProject);
  const cli = spawnSync(process.execPath, [resolve('dist/cli.mjs'), 'router', 'project', '--json', '--home', join(cwd, 'no-config')], { cwd, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(JSON.parse(cli.stdout).keywords.includes('pnpm'));
  assert.equal(await readFile(join(cwd, 'package.json'), 'utf8'), nodeProject['package.json']);
});
