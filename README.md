# Codex Buddy

Codex 的模型同步、按任务难度选模、强模型规划与经济模型执行，以及常用语工具直达助手。

## 安装与随包技能

```sh
# 原有同步入口和所有子命令参数保持一致
npx -y codex-buddy
# 从 AIO 市场安装，同时把随包技能安装到 ~/.agents/skills/codex-buddy
aio tool install codex-buddy --version 0.7.1
```

自动分发技能需要支持随包技能的 AIO CLI（2026.9.18+）。技能来源为 npm 包中的 `skills/codex-buddy/SKILL.md`；AIO 记录文件归属，卸载时仅清理未修改的文件。直接 `npm install` / `npx` 不会通过 npm 安装钩子写入个人技能目录。

### 从旧名称迁移

项目原名 `codex-model-sync`，现使用 `codex-buddy`。如果安装过旧的全局 npm 包，执行 `npm uninstall -g codex-model-sync` 后安装 `npm install -g codex-buddy`。仅移除 npm 包即可；不要为改名运行旧 CLI 的 `uninstall` 子命令，它会恢复 Codex 配置。旧的 `npx -y codex-model-sync` 仍指向旧包，后续新版本使用新名称。

新命令沿用已有 `model-sync`、`model-router` 数据目录和后台任务身份，保留目录备份、模型偏好与 hook 状态，不因改名创建第二个同步服务。执行 `codex-buddy router setup` 后重启桌面端，即可加载新版桥接。

**One command for dynamic model discovery and catalog sync. Optional desktop Auto Router.**

```sh
npx -y codex-buddy
```

This command works in PowerShell, Git Bash, and macOS/Linux terminals. It downloads
the ready-to-run bundle from npm and requires no source build.

Already configured Codex with a custom `base_url` and API key? That is all you need. This CLI reads your existing configuration, calls the provider's `/v1/models`, validates a Codex catalog, configures `model_catalog_json`, and installs a background sync every five minutes. The default command retains the original sync-only behavior. Auto Router is enabled separately with `router setup` on macOS. No URL or API key needs to be copied into this tool.

## Uninstall and restore Codex

If Codex stops responding after setup, fully quit Codex and stop any foreground
`watch` command with Ctrl+C, then run:

```sh
npx -y codex-buddy@latest uninstall
```

Reopen Codex after the command finishes. If you selected a provider-only model
since installing this tool, select your previously working model again.

Uninstall disables Auto Router and restores its desktop environment override, stops and removes the background sync task, and restores the original
`model_catalog_json` setting (or removes this tool's setting if none existed),
and disables further synchronization. API keys, provider settings, selected model,
conversations, and unrelated config remain intact. Backups stay in `model-sync`.
It does not need a working provider API, valid credentials, or a working Codex CLI.
Use the same `--home PATH` if you installed into a custom Codex directory.

Version 0.1.3 can uninstall earlier releases. It restores config even if scheduler
cleanup fails, retries while an active sync finishes, handles an already removed
task, and uses the initial setting backup after a partial installation. Warnings
and a nonzero exit code indicate incomplete cleanup; the output separately states
whether config was restored. Running uninstall again is safe. Only explicit
`setup` enables synchronization again.

If you also installed the CLI globally, remove that package **after** rollback:

```sh
npm uninstall -g codex-buddy
```

Removing the npm package alone does not undo Codex setup or its background task.

## Requirements

- Node.js 20+ and an installed Codex CLI with `codex debug models` support.
- A configured OpenAI-compatible provider with a working model-list endpoint and API key.
- macOS LaunchAgents, Linux user systemd, or Windows Task Scheduler for automatic background runs. Use `watch` or `--no-service` elsewhere.

The CLI is tested locally on macOS with Codex 0.153.4. CI covers Linux and Windows,
including installation of the packed CLI through Git Bash on Windows and Windows
task registration/removal. The Linux systemd scheduler and interactive Windows
background execution are not exercised by those tests. On Windows, both a native
`codex.exe` and the usual `npm install -g @openai/codex` installation are discovered
automatically. `--codex-bin` also accepts the npm `codex.cmd` launcher.

## Commands

The original commands and options remain supported: no arguments or `setup` installs model sync; `sync` refreshes once, `watch` runs foreground refreshes, `status` reports state, and `uninstall` restores the previous setup. Default/setup/sync/watch do not install, enable, disable or update a separately configured router. `--no-router` remains accepted for existing scripts, although setup is already sync-only. Release 0.4.0 also installed the router by default; 0.4.1 restores the original behavior. An already installed router stays in its chosen state; use `router disable` to stop routing while keeping model sync.

```sh
npx -y codex-buddy
npx -y codex-buddy sync
npx -y codex-buddy status --json
npx -y codex-buddy watch
npx -y codex-buddy uninstall
```

Or install globally:

```sh
npm install -g codex-buddy
codex-buddy
```

Options: `--home PATH`, `--codex-bin PATH`, `--interval SECONDS` (default 300, multiples of 60), `--no-service` (no background sync or router), `--no-router`, `--json`.

## How configuration is discovered

The directory is `--home`, then `CODEX_HOME`, then `~/.codex`. The CLI reads the root `config.toml`, selects its `model_provider`, and reads that provider's `base_url`. A URL with no path gets `/v1/models`; an existing API path such as `/v1` or `/api/openai` gets `/models` appended. Provider query parameters and HTTP headers are respected. Project and named-profile overrides are not merged in this release.

Authentication supports configured `Authorization` headers, `env_key`, command-based `provider.auth`, `experimental_bearer_token`, `OPENAI_API_KEY`, and `auth.json`'s `OPENAI_API_KEY`. An explicit missing `env_key` fails rather than falling back to another account. ChatGPT OAuth access tokens are not treated as provider API keys. Requests use the configured host and reject redirects.

Each refresh reads the configuration and credentials again. Keys are not copied into the package, generated catalog, scheduler task, or status file. Environment-based credentials must also be available to the background service; file-based or command-based credentials avoid depending on an interactive shell's environment. Node and Codex executable paths are saved, so rerun setup after moving or removing those executables.

## Model behavior and refresh limits

The generated catalog contains exactly the IDs returned by `/v1/models`, in the same order, with each ID used as its display name. Previously configured, bundled, hidden, and manifest-only models are excluded unless their IDs appear in that response. Deleted API models disappear on the next successful sync. Native Codex definitions retain their tool and reasoning metadata; existing custom models retain their settings. If a server offers `models?client_version=...`, its metadata supplies new custom entries. Otherwise new models receive conservative text-only defaults, no configurable reasoning, and a 32,000-token context budget. These defaults are assumptions, not verified capabilities.

**Listing a model does not prove that it supports the Responses API, tools, or coding-agent use.** Image, moderation, and other specialized endpoints may appear if your provider includes them in its model list.

**Automatic catalog synchronization is not live UI refresh.** Codex 0.153.4 caches the catalog inside a running app-server. Restart running Codex clients to reload the picker after the catalog changes. Newly started clients read the current catalog. This tool never restarts active conversations automatically. See the [official catalog setting](https://learn.chatgpt.com/docs/config-file/config-reference#model_catalog_json).

## Local files and recovery

Files live under `<codex-home>/model-sync/`. The background task uses a copied, self-contained `runtime.mjs`, so clearing the npx cache does not break it. No network package install occurs during background synchronization.

- `catalog.json`: generated model catalog.
- `status.json`: last successful or failed refresh, without credentials.
- `initial-catalog-setting.json`: the original catalog setting, without copying credential-bearing config fields.
- `previous-catalog.json`: the prior generated catalog, when available.
- `state.json`: task metadata and the original catalog setting for uninstall.

Empty, duplicate, malformed, or failed model responses do not replace the catalog. Candidates must pass the installed Codex parser before replacement. Config comments and unrelated settings are preserved. If you manually change `model_catalog_json`, subsequent background runs stop overwriting that choice; run setup again to opt back in. Uninstall restores only the managed setting and leaves backups in place. It restores the pre-install catalog, so old models can return after uninstall; use `setup` or `sync` to follow the API list instead.

## Development

```sh
npm ci
npm test
npm run build
npm pack --dry-run
```

Source modules separate configuration, catalog construction, synchronization, and OS scheduling. The npm package contains the CLI and a self-contained App Server proxy with its TOML parser and license notices; it has no install lifecycle scripts or runtime npm dependencies.

## Publishing and npm authentication

This section is for maintainers publishing new versions. Running `npx -y codex-buddy` as a user does not require an npm publishing token. npm credentials are separate from the Codex provider API key and the optional sub2api metrics key.

### Why npm asks for verification on every publish

An interactive login credential can still require a fresh 2FA challenge for each `npm publish`. Having an `_authToken` entry in `.npmrc`, or having created another token on the account, does not prove the current publish uses an eligible automation token. `--auth-type=web` selects the interactive authentication method; changing it is not a substitute for publishing permissions.

To diagnose repeated prompts, check the effective npm configuration and token metadata locally:

- Which credential is actually used: project/user npm configuration and any environment substitution. An exported `NPM_TOKEN` alone is not automatically connected to registry authentication.
- Whether that token is unexpired, covers this package, has **Read and write (publish and stage)** permission, and has **Bypass 2FA** enabled. Stage-only tokens require a separate approval before a version becomes public.
- Whether the package's **Publishing access** setting permits granular tokens. **Require two-factor authentication and disallow tokens** blocks traditional tokens even when their bypass option is enabled.

`npm profile get` and `npm token list` can help inspect account/token metadata; do not paste credentials or unredacted configuration into issues or logs. Full token values are only shown when created, so an existing token's name cannot be used to recover its secret. See [npm publishing authentication](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/) and [creating and viewing tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens/).

### Recommended: GitHub Actions trusted publishing (OIDC)

OIDC lets an authorized GitHub Actions workflow publish without a stored, long-lived npm token. Configure the package's **Trusted Publisher** on npmjs.com with:

| Field | Value for this repository |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `zjarlin` |
| Repository | `codex-buddy` |
| Workflow filename | `aio-cli.yml` (in `.github/workflows/`) |
| Environment | Match the workflow's environment exactly, or leave unset if unused |
| Allowed actions | Enable direct **`npm publish`** for unattended releases |

The workflow must use a GitHub-hosted runner, grant `contents: read` and `id-token: write`, and use npm **11.5.1+** with Node **22.14.0+**. It should install dependencies, run `npm test`, and then run `npm publish --access public`; keep `package.json`'s repository URL aligned with this repository. No `NPM_TOKEN` publishing secret is needed for OIDC. Trigger releases deliberately, for example with a version tag after updating `package.json` and `package-lock.json`.

New trusted publishers allow staging by default. If only **`npm stage publish`** is allowed, a maintainer must still approve each staged version with 2FA; explicitly allow direct publishing to avoid that per-release step. Initial trust configuration may itself require account verification. See the [official OIDC setup and workflow example](https://docs.npmjs.com/trusted-publishers/).

**Repository status:** `.github/workflows/aio-cli.yml` is configured with npm Trusted Publishing. Default-branch pushes run Linux/Windows tests, publish a source-bound development version to npm `next`, and update the AIO plugin market. A matching `vX.Y.Z` tag publishes the stable version to npm `latest`. `.github/workflows/check.yml` provides additional package validation. The AIO release workflow uses `@zjarlin/aio@2026.9.17`; no per-release interactive login is needed while its npm trust binding remains valid.

### Alternative: a granular publishing token

For a token-based workflow, create a package-scoped token with the permissions described above, store its full value in a GitHub Actions secret, and expose it to the publishing step as `NODE_AUTH_TOKEN` when using `actions/setup-node` with `registry-url: https://registry.npmjs.org`. Rotate it before its configured expiry.

For local publishing, provide the token through the environment and reference it in a private npm user configuration rather than placing the literal secret in the repository:

```ini
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

Then run `npm publish --access public`. Preserve other npm configuration entries; do not overwrite the entire user configuration or print the token. This only avoids the publish challenge when the token and package settings allow it.

As documented by npm in September 2026, direct publishing of new versions with granular access tokens is scheduled to be removed in **January 2027**. Prefer OIDC for new unattended release workflows; stage-only tokens retain an explicit human approval step. See [npm's token publishing transition](https://docs.npmjs.com/about-access-tokens/#direct-publishing-is-being-deprecated).

## Auto Router

Model synchronization and routing have separate entry points. Keep using the original command for synchronization:

```sh
npx -y codex-buddy
```

Opt into Auto Router once on macOS:

```sh
npx -y codex-buddy router setup
```

Fully quit and reopen the desktop app once after setup; review the four Auto Router hooks in Codex `/hooks`. No special prompt prefix, slash command or model-picker item is required. Sending a new message in a project starts a turn: the bridge first tries deterministic command dispatch. An eligible exact match executes through the native shell without model discovery or inference. Otherwise it assesses the task and project manifests, fetches the configured provider's models, selects a sufficient capability tier, ranks within it, and forwards the selected model to App Server. A native notice reports the accepted model. `跑起来看看` with a discovered entry, ordinary Git operations, and complex development follow their respective tiers.

Routing runs before eligible `turn/start` requests through this installed stdio bridge. Tool output, steering an already active turn and normal terminal `codex` sessions do not trigger a main-model switch. Hooks supply CLI context and specialist guidance; they cannot switch an already running model. This implementation uses local task rules and estimated model profiles, not a trained RouterLLM classifier.

`router enable` / `router disable` change an installed router's policy for subsequent turns; `enable` alone does not install the desktop bridge. While routing is enabled it chooses the turn model automatically, overriding the picker selection. Disable it for manual model choice; synchronization continues independently. `router preview` is a dry run of model selection, not task execution, and reads models from the provider.
For turns requiring a model, the router reads **all model IDs from Codex's configured provider `/v1/models`**. Rule-only shell turns skip the provider entirely.
There is no GPT-family allowlist. GLM, DeepSeek, Kimi, Gemma, private models and future additions all enter the same inventory.

```sh
npx -y codex-buddy router models --json
npx -y codex-buddy router preview "提交代码"
npx -y codex-buddy router status
npx -y codex-buddy router disable
npx -y codex-buddy router enable
npx -y codex-buddy router uninstall
```

### 常用语工具分发：确定性意图路由 / LLM bypass

这层叫 **确定性意图路由（deterministic intent routing）**，由规则引擎和命令分发器实现。命中后跳过大模型，通常称 **LLM bypass / fast path**。它不使用向量检索、语义分类模型或训练过的 RouterLLM 分类器。

默认顺序是：**完整短句匹配 → 项目上下文和前置条件 → 工具直接执行 → 真实结果**；未命中、有歧义或执行环境不兼容，进入现有模型路由。复杂工作仍默认由强模型规划、经济模型执行明确子任务。

| 输入 | 规则行为 |
| --- | --- |
| `当前分支` / `git branch --show-current` | Git 查询，无模型 |
| `git状态` / `git status` | 工作区状态，无模型 |
| `提交记录` / `git log` | 最近 10 条提交，无模型 |
| `查看代码改动` / `git diff` | 工作区差异，无模型；禁用外部 diff/textconv |
| `跑起来` / `跑起来看看` / `启动项目` | 项目启动入口唯一时直接执行 |
| `构建项目` / `跑测试` / `npm run test` | 从本地清单解析实际命令；唯一匹配才执行 |
| `不要推送` / `跑起来并修复报错` / 带额外参数的命令 | 交回模型理解，不按局部关键词执行 |
| `提交代码` / `推送代码` / `合并分支` / `解决冲突` | 继续交给现有 Git 专用流程，检查范围、目标和状态 |

在项目目录预览规则，无需配置供应商，也不会执行命令：

```sh
npx -y codex-buddy router match "跑起来看看" --json
npx -y codex-buddy router match "当前分支" --json
npx -y codex-buddy router dispatch status
npx -y codex-buddy router dispatch off
npx -y codex-buddy router dispatch on
```

`match` 返回 `route: "tool"` 和结构化 `recipe`（`argv`、`cwd`、来源、动作），或 `clarify` / `llm` 及原因。多入口时返回候选，不猜测要启动哪个前后端；可进入具体子项目后重试。项目命令调用的是仓库脚本，并不保证依赖已安装或脚本内部没有副作用。扩展规则时新增“完整短句 → 已知动作”，工具保持结构化参数；不要把任意关键词后的文本拼成 shell 命令。实现入口见 [dispatch 模块](src/dispatch/README.md)。

已安装 Auto Router 的用户升级后执行 `router setup`，退出并重启桌面端。规则层默认启用，位于 `/v1/models` 获取之前；命中显示 **“Auto 规则直达；模型：无”**。普通 `npx -y codex-buddy` 保留原有同步行为。`router disable` 会同时关闭规则旁路和模型自动选择，`router dispatch off` 只关闭规则旁路。

桌面适配使用原生 `thread/shellCommand`，原始短句保存在命令注释里；命令输出、退出码和会话记录由 App Server 产生，不伪造助手成功消息。该原生方法固定使用完整访问，因此这里只接受服务器已经确认的 **本地完整访问 + 无需审批** 会话，且必须非规划模式、无活动轮次、无附件/额外上下文或不兼容的环境/权限覆盖。条件不满足时保留正常模型和权限路径，绝不为旁路提升权限。Windows 暂不启用此 POSIX 执行适配，但 `match` 和原模型路由仍可用。原生协议验证基于 Codex Desktop `0.154.0-alpha.6.2`；旧服务器若拒绝此方法，会报告原生错误而不会重放任务，可用 `router dispatch off` 恢复原模型路径。

启动类命令保持前台运行，可正常中断；POSIX 监督进程负责在结束、中断或超时时清理本次命令的进程组（主动另建会话脱离进程组的后台服务不在此范围）。默认上限一小时，可用 `policy.json` 的 `dispatch.timeoutMs` 调整到 1000–3600000 毫秒。进程启动不等于 HTTP/浏览器就绪；需要修复或浏览器验证的复合请求仍交回模型。非零退出、超时和中断保留真实失败结果，不自动重试有副作用的命令。原生中断会把历史结果记为中断，已流式显示的部分 stdout 不保证保留。

这层对命中的用户轮次不发模型目录或推理请求；独立后台模型同步仍按原计划运行。节省比例取决于实际命中率，没有宣称固定百分比。

### Strong planner, economical executor

Complex tasks now default to a **strong planner → bounded execution tasks → centralized review** strategy. The main turn still requires an advanced model for planning, unresolved design decisions and final acceptance. After planning, the parent reassesses each small task independently and chooses an economical execution model instead of giving every child the whole project's advanced difficulty and full conversation history. Routine Git/project operations keep their direct route.

Use exact IDs returned by your own `router models` command. For example, when these two IDs are available:

```sh
npx -y codex-buddy router planning --planner-model gpt-6 --executor-model deepseek-v4.1-flash
npx -y codex-buddy router preview "重构模块并实现新的接口"
npx -y codex-buddy router planning status
# Return both roles to automatic selection, or disable only this division of work:
npx -y codex-buddy router planning auto
npx -y codex-buddy router planning off
```

The names above are examples, not bundled model defaults. Explicit preferences are validated before saving. Each eligible turn rechecks the live directory; an unavailable/disabled/ineligible preference gets a clearly reported replacement. `preview` and `status` show `planning.planner`, `planning.executor`, up to five same-tier `executorCandidates` and `executorStatus: "recommended"`. The parent intersects those live candidates with its spawn tool's supported IDs, trying the configured preference first. If both primary roles resolve to the same model, the notice says the combination does not provide a model split.

The executor's default task tier is `standard`, suitable for bounded implementation; `--executor-tier simple` is available for more mechanical work. Within the sufficient tier, executor ranking uses 90% estimated economy + 10% capability, weighted by valid health evidence, and requests `executorEffort: "low"` only when the catalog supports it. Planner selection retains advanced capability requirements. Prices are not measured by these estimates, and retries/context transfer also cost tokens; this is a cost-reduction strategy, not a claim of globally minimum spend.

The `plan-executor` role receives a compact packet containing the goal, working directory/files, necessary context, settled interfaces/steps, change boundaries and verifiable acceptance criteria. Guidance prefers minimal-history handoff (such as `fork_turns: "none"` where supported), avoids duplicate planner tool work, and asks the executor to return evidence after at most two implementation attempts by default. `planning.maxAttempts` may be 1–3; it is a guidance budget, not a runtime hard limit. Unresolved architecture/security/business decisions and repeated implementation failures return to the planner. Permission/network errors are not automatic reasons to upgrade models.

**This division uses parent-agent orchestration and hooks.** The bridge selects the main planner; hooks do not create children or force a running agent to switch. The parent must be permitted to delegate and its spawn tool must support the selected model and handoff options. A provider ID appearing in `/v1/models` does not guarantee that a particular desktop spawn tool accepts it. Unsupported combinations must be reported, never described as cheap execution while silently inheriting the strong model. `SubagentStart` reports the actual child model; the main-turn notice labels the executor only as a candidate. See [Codex subagent model configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents).

Existing router installations need `router setup` again after upgrading to install the new bundle and role, then a desktop restart and review of changed hooks in `/hooks`. Policy/model preference changes after that take effect on subsequent turns without another restart. Ordinary `npx -y codex-buddy` remains synchronization only.

### Lifecycle guidance and specialist roles

Setup also installs `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, and `PostToolUse` guidance hooks, preserving any existing hooks (including `Stop`). Review the Auto Router definitions in Codex `/hooks` before they execute. Changed hook code gets a new content-addressed script path so Codex requests trust again. The installer never grants trust or bypasses review.

`UserPromptSubmit` also detects project operations such as `跑起来`, `跑起来看看`, `启动项目`, builds, tests and known CLI invocations. It supplies local stack keywords and candidate commands before the first tool call, and prefers an existing suitable project operations agent before the model-neutral `~/.codex/agents/project-operations.toml` fallback. Ordinary development prompts also receive the project command context. The App Server bridge uses the same assessment before choosing the turn model; hooks alone cannot change an active model.

Project inspection reads bounded manifests from the nearest project, immediate subprojects and common monorepo containers. It recognizes package scripts (npm/pnpm/yarn/bun, including inherited workspace managers), Gradle/Maven, Kotlin Toolchain wrappers and application modules, Cargo, Go, Python, .NET, Dart/Flutter, Compose and task runners. It emits the source and working directory for each candidate, prioritizes commands relevant to the task, and distinguishes declared entries from conventions requiring verification. It does not execute project scripts, inspect `.env` files or include script bodies. Unrecognized layouts and missing entry points stay explicit; the agent checks the README and actual environment instead of inventing a command.

```sh
# Run in the project: local inspection, no model/provider call required.
npx -y codex-buddy router project --json
npx -y codex-buddy router preview "跑起来看看"
```

Confirmed routine entry points use `simple`; finding an entry or initial environment diagnosis uses `standard`. Mixed development, architecture and complex code failures retain `advanced`. Results must be verified through real process readiness, exit status, test output and browser checks where requested. Launching a command is not proof the application is running. This is rule-based routing; no traffic reduction percentage has been measured.

`UserPromptSubmit` detects Git intent before tool execution using keywords such as `git`, `commit`, `push`, `merge`, `提交`, `推送`, `代码冲突`, and `合并`. It looks for existing Git agents in project/personal agent directories, then uses the installed `~/.codex/agents/git-operations.toml` fallback. A role whose fixed model is below the required capability tier is excluded. The bundled role leaves its model unset so the parent can select it dynamically. Keywords identify a specialist, not task difficulty or authorization: conflict resolution remains advanced, and mixed requests delegate only the actual Git work. Already assigned Git agents do not delegate the same work recursively. Role files follow the [Codex custom-agent format](https://learn.chatgpt.com/docs/agent-configuration/subagents); the runtime's available tools determine how a role/model can be selected.

`SubagentStart` announces the actual model and asks the child to hand back results, verification and blockers. `PostToolUse` offers simple/standard/advanced model suggestions once per turn, with one extra reminder for a structured tool error; it preserves the original result. `SubagentStop` requests one summary if the child ends with no final message, respecting `stop_hook_active` to prevent loops. A non-zero exit is a signal to investigate, not proof of model failure (for example, search exit 1 can simply mean no matches).

The tested desktop binary can send **only stdout** to a Bash hook, omitting the exit code. In that case guidance explicitly asks the agent to inspect its original tool result; the hook does not infer success from empty output or interpret JSON printed by a command as an error flag.

These hooks **guide** model selection; they cannot change the model of an already running agent. A parent may choose a suggested model when creating an independently useful child task only if existing instructions permit delegation and the tool supports the relevant model/fork parameters. No hook creates agents, grants permission, replays operations, or claims a switch happened. Hook suggestions reuse the turn router's five-minute provider-bound snapshot, including fresh sub2api health weighting, and make no additional API calls. Missing/stale advice falls back to the current model. Only bounded hashed turn bookkeeping is stored, without prompts or tool output.

```bash
npx -y codex-buddy router hooks setup
npx -y codex-buddy router hooks status
npx -y codex-buddy router hooks uninstall
```

`router disable` also silences guidance; `policy.json` can independently disable it with `"hooks": { "enabled": false }`. The unified uninstall removes this package's hook commands and its unmodified Git/project operations and plan-executor profiles; user edits to those profiles are preserved. Hook installation currently requires a POSIX shell. See the [Codex hook contracts](https://learn.chatgpt.com/docs/hooks) for event behavior and trust requirements.

An available assessment model is selected from catalog capability descriptions and reused after successful assessments. It evaluates model capabilities and relative economy from the complete inventory. This assessment is cached for 24 hours and refreshed when models or descriptions change. It is an extra provider API call and can incur usage. Invalid, incomplete or unavailable assessment retains previous valid profiles, shows new models as uncertain name/description estimates, and retries after one minute. Uncertain new models do not execute tasks. `assessment: "heuristic"` disables this extra API call.

**Estimated economy is not a price quote, and estimated tool support is not a compatibility test.** Specialized/non-tool models remain visible but cannot be chosen for agent execution. Unknown models are shown with uncertain profiles and wait for assessment or an explicit user override before executing tasks. `model-router/policy.json` supports per-ID overrides through `models: { "provider/model": { "capability": 90, "economy": 60, "tools": true, "purpose": "general", "modelTier": "advanced" } }`; `modelTier` is optional.

Routing order is **task difficulty → capability tier → within-tier cost/reliability ranking**. The classifier uses local rules (not a trained RouterLLM classifier); uncertain development tasks stay advanced, while bounded project entry discovery uses standard. Model capability tiers derive from estimated capability scores, with configurable thresholds and explicit per-model overrides.

| Task tier | Examples | Default capability band |
| --- | --- | --- |
| `simple` | Explicit Git status/commit/push/merge without in-progress Git work; project run/build/test with discovered entry points | 0–69 |
| `standard` | Project entry discovery, initial environment diagnosis; bounded button, label, README or CSS changes | 70–89 |
| `advanced` | Conflicts, architecture, refactoring, broad or uncertain work | 90–100 |

The first available band at or above the task's requirement is selected; fallback is upward only. **A weak model with 100% request success cannot replace an advanced model.** If discovery succeeds but no model meets the required band, the router rejects the turn before forwarding it. Within a band, simple tasks use 70% economy + 30% capability, standard tasks 40% economy + 60% capability, and advanced tasks use capability; success statistics then weight these scores. Thresholds live under `capabilityThresholds: { "simple": 0, "standard": 70, "advanced": 90 }` in policy, and effort is configurable with `simpleEffort`, `standardEffort`, and `advancedEffort`.

Model discovery/configuration failures preserve the original requested model and show a notice. Auto overrides the desktop model choice while enabled; disable Auto to keep manual control. No in-flight interruption or task replay occurs when a merge develops conflicts; the next turn reassesses. Git merge, rebase, cherry-pick and revert state also raise otherwise simple requests to advanced.

The proxy sends a native notification with the accepted model, effort, reason and dynamic candidate count. This identifies what App Server accepted, not an unverifiable upstream alias mapping. Model/profile/health updates take effect per turn without restarting the router. The desktop picker itself may still cache its catalog.

macOS setup uses `CODEX_CLI_PATH`, verified in the current desktop bundle. **Quit and reopen the desktop app once after installation.** No signed application files are replaced. This desktop environment override is version-dependent and needs rechecking after app updates. Other platforms retain catalog sync; their desktop routing is not auto-installed.

## Optional sub2api request-health evidence

A dedicated read-only metrics key can improve routing using real per-model request success counts. It is separate from the inference key and restricted to one server-side group.

```sh
npx -y codex-buddy router health --health-key-file /absolute/private/metrics.key --health-group-id 6
```

The router requests `/api/v1/router/models/health` on the **same origin** as the configured provider. The binding also fingerprints the current provider credential; after changing it, re-run `router health` for the correct group. The key is read from the private file, never included in logs, status, the model-assessment request or npm. Configure this optional endpoint on sub2api first.

The endpoint returns a 90-minute window, `data_through`, group scope, success/failure counts and average TTFT. Stats older than five minutes, wrong-group stats and fewer than ten samples do not penalize models. Ranking **inside the selected capability tier** uses `base_score × (1 − 0.75 × failure_rate × n/(n+20))`; no-data models remain neutral. Request success measures gateway reliability, not task correctness or capability. The implementation exposes latency for inspection but currently ranks health using success rate only.

Sub2api requires `ROUTER_METRICS_KEY_SHA256` (SHA-256 of the dedicated key) and `ROUTER_METRICS_GROUP_ID`; missing configuration disables access. The metrics key grants no admin or inference permissions.

## AIO marketplace delivery

This CLI is connected through `aio plugin init --kind cli --adopt`. After one-time npm Trusted Publisher setup, default-branch pushes run tests, publish an immutable `next` development version, and update the existing AIO marketplace entry and README. Matching version tags publish `latest` stable releases. The existing model-sync command and explicit `router setup` behavior are unchanged. See [AIO delivery](AIO.md) for setup and version rules.
