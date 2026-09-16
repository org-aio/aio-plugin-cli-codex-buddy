# Codex Buddy / Codex 智能助手

Codex 的模型同步、按任务难度选模、强模型规划与经济模型执行，以及常用语工具直达助手。

Model synchronization for Codex, difficulty-based model selection, strong-planner/economic-executor turns, and a common-phrase tool shortcut assistant.

## 安装与随包技能 / Installation & Bundled Skill

```sh
# 原有同步入口和所有子命令参数保持一致
# The original sync entry point and all subcommand arguments stay unchanged
npx -y codex-buddy
# 从 AIO 市场安装，同时把随包技能安装到 ~/.agents/skills/codex-buddy
# Install from the AIO marketplace; the bundled skill is installed to ~/.agents/skills/codex-buddy
aio tool install codex-buddy --version 0.7.1
```

自动分发技能需要支持随包技能的 AIO CLI（2026.9.18+）。技能来源为 npm 包中的 `skills/codex-buddy/SKILL.md`；AIO 记录文件归属，卸载时仅清理未修改的文件。直接 `npm install` / `npx` 不会通过 npm 安装钩子写入个人技能目录。

Auto-distributing the skill requires an AIO CLI that supports bundled skills (2026.9.18+). The skill source is `skills/codex-buddy/SKILL.md` inside the npm package; AIO records file ownership and only cleans unmodified files on uninstall. Plain `npm install` / `npx` never writes to your personal skill directory through npm install hooks.

### 从旧名称迁移 / Migrating from the Old Name

项目原名 `codex-model-sync`，现使用 `codex-buddy`。如果安装过旧的全局 npm 包，执行 `npm uninstall -g codex-model-sync` 后安装 `npm install -g codex-buddy`。仅移除 npm 包即可；不要为改名运行旧 CLI 的 `uninstall` 子命令，它会恢复 Codex 配置。旧的 `npx -y codex-model-sync` 仍指向旧包，后续新版本使用新名称。

The project was formerly `codex-model-sync` and is now `codex-buddy`. If you installed the old global npm package, run `npm uninstall -g codex-model-sync` then `npm install -g codex-buddy`. Removing the npm package alone is enough; do not run the old CLI's `uninstall` subcommand for the rename — it would restore Codex configuration. Old `npx -y codex-model-sync` invocations still point to the old package; future versions use the new name.

新命令沿用已有 `model-sync`、`model-router` 数据目录和后台任务身份，保留目录备份、模型偏好与 hook 状态，不因改名创建第二个同步服务。执行 `codex-buddy router setup` 后重启桌面端，即可加载新版桥接。

The new command reuses the existing `model-sync` and `model-router` data directories and background task identity, keeping directory backups, model preferences and hook state — the rename never creates a second sync service. Run `codex-buddy router setup` and restart the desktop app to load the new bridge.

**一条命令完成动态模型发现与目录同步；可选的桌面自动路由（Auto Router）。**

**One command for dynamic model discovery and catalog sync. Optional desktop Auto Router.**

```sh
npx -y codex-buddy
```

This command works in PowerShell, Git Bash, and macOS/Linux terminals. It downloads the ready-to-run bundle from npm and requires no source build.

该命令兼容 PowerShell、Git Bash 与 macOS/Linux 终端。它从 npm 下载即用 bundle，无需源码构建。

Already configured Codex with a custom `base_url` and API key? That is all you need. This CLI reads your existing configuration, calls the provider's `/v1/models`, validates a Codex catalog, configures `model_catalog_json`, and installs a background sync every five minutes. The default command retains the original sync-only behavior. Auto Router is enabled separately with `router setup` on macOS. No URL or API key needs to be copied into this tool.

已经用自定义 `base_url` 和 API Key 配置好 Codex？那就足够了。本 CLI 读取你的现有配置，调用服务商的 `/v1/models`，校验 Codex 目录，写入 `model_catalog_json`，并安装每五分钟一次的同步任务。默认命令保留原有的纯同步行为；macOS 上通过 `router setup` 单独启用 Auto Router。无需把 URL 或 API Key 复制进本工具。

## 卸载并恢复 Codex / Uninstall & Restore Codex

If Codex stops responding after setup, fully quit Codex and stop any foreground `watch` command with Ctrl+C, then run:

如果安装后 Codex 不再响应，请完全退出 Codex，并用 Ctrl+C 停止任何前台 `watch` 命令，然后执行：

```sh
npx -y codex-buddy@latest uninstall
```

Reopen Codex after the command finishes. If you selected a provider-only model since installing this tool, select your previously working model again.

命令结束后重新打开 Codex。如果安装本工具后你选择了仅服务商可见的模型，请重新选择之前可用的模型。

Uninstall disables Auto Router and restores its desktop environment override, stops and removes the background sync task, and restores the original `model_catalog_json` setting (or removes this tool's setting if none existed), and disables further synchronization. API keys, provider settings, selected model, conversations, and unrelated config remain intact. Backups stay in `model-sync`. It does not need a working provider API, valid credentials, or a working Codex CLI. Use the same `--home PATH` if you installed into a custom Codex directory.

卸载会停用 Auto Router 并恢复其桌面环境覆盖，停止并移除后台同步任务，恢复原有 `model_catalog_json` 设置（若无原设置则移除本工具设置），并禁止后续同步。API Key、服务商设置、已选模型、对话与无关配置保持原样；备份保留在 `model-sync`。卸载不需要可用的服务商 API、有效凭据或可运行的 Codex CLI。如果安装到了自定义 Codex 目录，请使用相同的 `--home PATH`。

Version 0.1.3 can uninstall earlier releases. It restores config even if scheduler cleanup fails, retries while an active sync finishes, handles an already removed task, and uses the initial setting backup after a partial installation. Warnings and a nonzero exit code indicate incomplete cleanup; the output separately states whether config was restored. Running uninstall again is safe. Only explicit `setup` enables synchronization again.

0.1.3 版本可卸载更早的版本。即使调度器清理失败也会恢复配置；会等待进行中的同步结束后重试；可处理已被移除的任务；部分安装后使用初始设置备份。警告与非零退出码表示清理不完整；输出会单独说明配置是否已恢复。重复运行卸载是安全的；只有显式 `setup` 才会重新启用同步。

If you also installed the CLI globally, remove that package **after** rollback:

如果你还全局安装了 CLI，请在回滚**之后**移除该包：

```sh
npm uninstall -g codex-buddy
```

Removing the npm package alone does not undo Codex setup or its background task.

仅移除 npm 包不会撤销 Codex 配置或其后台任务。

## 要求 / Requirements

- Node.js 20+ and an installed Codex CLI with `codex debug models` support.
- A configured OpenAI-compatible provider with a working model-list endpoint and API key.
- macOS LaunchAgents, Linux user systemd, or Windows Task Scheduler for automatic background runs. Use `watch` or `--no-service` elsewhere.

- Node.js 20+，并安装支持 `codex debug models` 的 Codex CLI。
- 已配置 OpenAI 兼容服务商，且模型列表端点与 API Key 可用。
- 自动后台运行需要 macOS LaunchAgents、Linux 用户 systemd 或 Windows 任务计划程序；其他环境使用 `watch` 或 `--no-service`。

The CLI is tested locally on macOS with Codex 0.153.4. CI covers Linux and Windows, including installation of the packed CLI through Git Bash on Windows and Windows task registration/removal. The Linux systemd scheduler and interactive Windows background execution are not exercised by those tests. On Windows, both a native `codex.exe` and the usual `npm install -g @openai/codex` installation are discovered automatically. `--codex-bin` also accepts the npm `codex.cmd` launcher.

CLI 在 macOS 上以 Codex 0.153.4 本地测试。CI 覆盖 Linux 与 Windows，包括在 Windows 上通过 Git Bash 安装打包后的 CLI，以及 Windows 任务的注册/移除。Linux systemd 调度器与 Windows 交互式后台执行不在此类测试范围内。Windows 上会自动发现原生 `codex.exe` 与常规 `npm install -g @openai/codex` 安装；`--codex-bin` 也接受 npm 的 `codex.cmd` 启动器。

## 命令 / Commands

The original commands and options remain supported: no arguments or `setup` installs model sync; `sync` refreshes once, `watch` runs foreground refreshes, `status` reports state, and `uninstall` restores the previous setup. Default/setup/sync/watch do not install, enable, disable or update a separately configured router. `--no-router` remains accepted for existing scripts, although setup is already sync-only. Release 0.4.0 also installed the router by default; 0.4.1 restores the original behavior. An already installed router stays in its chosen state; use `router disable` to stop routing while keeping model sync.

原有命令与选项保持不变：无参数或 `setup` 安装模型同步；`sync` 刷新一次；`watch` 前台持续刷新；`status` 报告状态；`uninstall` 恢复之前的状态。default/setup/sync/watch 不会安装、启用、停用或更新单独配置的路由器。`--no-router` 对现有脚本仍被接受（setup 本来就是纯同步）。0.4.0 曾默认安装路由器；0.4.1 恢复了原有行为。已安装的路由器保持其既有状态；使用 `router disable` 可在保留模型同步的同时停止路由。

```sh
npx -y codex-buddy
npx -y codex-buddy sync
npx -y codex-buddy status --json
npx -y codex-buddy watch
npx -y codex-buddy uninstall
```

Or install globally:

或全局安装：

```sh
npm install -g codex-buddy
codex-buddy
```

Options: `--home PATH`, `--codex-bin PATH`, `--interval SECONDS` (default 300, multiples of 60), `--no-service` (no background sync or router), `--no-router`, `--json`.

选项：`--home PATH`、`--codex-bin PATH`、`--interval SECONDS`（默认 300，60 的倍数）、`--no-service`（不启用后台同步或路由器）、`--no-router`、`--json`。

## 配置发现方式 / How Configuration Is Discovered

The directory is `--home`, then `CODEX_HOME`, then `~/.codex`. The CLI reads the root `config.toml`, selects its `model_provider`, and reads that provider's `base_url`. A URL with no path gets `/v1/models`; an existing API path such as `/v1` or `/api/openai` gets `/models` appended. Provider query parameters and HTTP headers are respected. Project and named-profile overrides are not merged in this release.

目录依次取 `--home`、`CODEX_HOME`、`~/.codex`。CLI 读取根 `config.toml`，选择其中的 `model_provider`，并读取该服务商的 `base_url`。无路径的 URL 追加 `/v1/models`；已有 API 路径（如 `/v1` 或 `/api/openai`）则追加 `/models`。服务商查询参数与 HTTP 头会被保留。本版本不合并项目级与命名 profile 的覆盖。

Authentication supports configured `Authorization` headers, `env_key`, command-based `provider.auth`, `experimental_bearer_token`, `OPENAI_API_KEY`, and `auth.json`'s `OPENAI_API_KEY`. An explicit missing `env_key` fails rather than falling back to another account. ChatGPT OAuth access tokens are not treated as provider API keys. Requests use the configured host and reject redirects.

认证支持配置的 `Authorization` 头、`env_key`、基于命令的 `provider.auth`、`experimental_bearer_token`、`OPENAI_API_KEY` 以及 `auth.json` 中的 `OPENAI_API_KEY`。显式缺失的 `env_key` 会直接失败，不会回退到其他账号。ChatGPT OAuth 访问令牌不作为服务商 API Key。请求使用配置的主机并拒绝重定向。

Each refresh reads the configuration and credentials again. Keys are not copied into the package, generated catalog, scheduler task, or status file. Environment-based credentials must also be available to the background service; file-based or command-based credentials avoid depending on an interactive shell's environment. Node and Codex executable paths are saved, so rerun setup after moving or removing those executables.

每次刷新都会重新读取配置与凭据。密钥不会复制进包、生成的目录、调度任务或状态文件。基于环境的凭据必须对后台服务同样可用；基于文件或命令的凭据可避免依赖交互 shell 的环境。Node 与 Codex 可执行文件路径会被保存，因此移动或删除这些可执行文件后需要重新运行 setup。

## 模型行为与刷新限制 / Model Behavior & Refresh Limits

The generated catalog contains exactly the IDs returned by `/v1/models`, in the same order, with each ID used as its display name. Previously configured, bundled, hidden, and manifest-only models are excluded unless their IDs appear in that response. Deleted API models disappear on the next successful sync. Native Codex definitions retain their tool and reasoning metadata; existing custom models retain their settings. If a server offers `models?client_version=...`, its metadata supplies new custom entries. Otherwise new models receive conservative text-only defaults, no configurable reasoning, and a 32,000-token context budget. These defaults are assumptions, not verified capabilities.

生成的目录严格包含 `/v1/models` 返回的 ID，顺序一致，并以各 ID 作为显示名。此前配置过、内置、隐藏和仅清单存在的模型都会被排除，除非其 ID 出现在该响应中。被删除的 API 模型会在下一次成功同步后消失。原生 Codex 定义保留其工具与推理元数据；已有自定义模型保留其设置。如果服务端提供 `models?client_version=...`，其元数据会提供新的自定义条目；否则新模型获得保守的纯文本默认值：无推理配置、32,000 token 上下文预算。这些默认值是假设，不是已验证的能力。

**Listing a model does not prove that it supports the Responses API, tools, or coding-agent use.** Image, moderation, and other specialized endpoints may appear if your provider includes them in its model list.

**列出某个模型并不证明它支持 Responses API、工具或编码智能体用法。** 如果服务商在其模型列表中包含图像、内容审核等专用端点，它们也可能出现。

**Automatic catalog synchronization is not live UI refresh.** Codex 0.153.4 caches the catalog inside a running app-server. Restart running Codex clients to reload the picker after the catalog changes. Newly started clients read the current catalog. This tool never restarts active conversations automatically. See the [official catalog setting](https://learn.chatgpt.com/docs/config-file/config-reference#model_catalog_json).

**自动目录同步不是 UI 的实时刷新。** Codex 0.153.4 会在运行中的 app-server 内缓存目录。目录变化后需重启运行中的 Codex 客户端以重新加载选择器；新启动的客户端读取当前目录。本工具从不会自动重启进行中的对话。参见[官方 catalog 设置](https://learn.chatgpt.com/docs/config-file/config-reference#model_catalog_json)。

## 本地文件与恢复 / Local Files & Recovery

Files live under `<codex-home>/model-sync/`. The background task uses a copied, self-contained `runtime.mjs`, so clearing the npx cache does not break it. No network package install occurs during background synchronization.

文件位于 `<codex-home>/model-sync/`。后台任务使用一份复制的、自包含的 `runtime.mjs`，因此清空 npx 缓存不会破坏它；后台同步期间不会发生网络包安装。

- `catalog.json`: generated model catalog.
- `status.json`: last successful or failed refresh, without credentials.
- `initial-catalog-setting.json`: the original catalog setting, without copying credential-bearing config fields.
- `previous-catalog.json`: the prior generated catalog, when available.
- `state.json`: task metadata and the original catalog setting for uninstall.

- `catalog.json`：生成的模型目录。
- `status.json`：最近一次成功或失败的刷新（不含凭据）。
- `initial-catalog-setting.json`：原始 catalog 设置（不复制含凭据的配置字段）。
- `previous-catalog.json`：上一份生成的目录（如存在）。
- `state.json`：任务元数据与供卸载使用的原始 catalog 设置。

Empty, duplicate, malformed, or failed model responses do not replace the catalog. Candidates must pass the installed Codex parser before replacement. Config comments and unrelated settings are preserved. If you manually change `model_catalog_json`, subsequent background runs stop overwriting that choice; run setup again to opt back in. Uninstall restores only the managed setting and leaves backups in place. It restores the pre-install catalog, so old models can return after uninstall; use `setup` or `sync` to follow the API list instead.

空、重复、畸形或失败的模型响应不会替换目录。候选必须通过已安装的 Codex 解析器才会被替换。配置注释与无关设置会保留。如果你手动修改 `model_catalog_json`，后续后台运行将不再覆盖该选择；再次运行 setup 以重新纳入管理。卸载只恢复受管理的设置并保留备份。它会恢复安装前的目录，因此旧模型可能在卸载后回归；改用 `setup` 或 `sync` 跟随 API 列表。

## 开发 / Development

```sh
npm ci
npm test
npm run build
npm pack --dry-run
```

Source modules separate configuration, catalog construction, synchronization, and OS scheduling. The npm package contains the CLI and a self-contained App Server proxy with its TOML parser and license notices; it has no install lifecycle scripts or runtime npm dependencies.

源码模块将配置、目录构建、同步与操作系统调度分开。npm 包包含 CLI 与一个自包含的 App Server 代理（含其 TOML 解析器与许可证声明）；它没有安装生命周期脚本，也没有运行时 npm 依赖。

## 发布与 npm 认证 / Publishing & npm Authentication

This section is for maintainers publishing new versions. Running `npx -y codex-buddy` as a user does not require an npm publishing token. npm credentials are separate from the Codex provider API key and the optional sub2api metrics key.

本节面向发布新版本的维护者。用户运行 `npx -y codex-buddy` 不需要 npm 发布令牌。npm 凭据与 Codex 服务商 API Key 以及可选的 sub2api 指标密钥相互独立。

### 为什么每次发布 npm 都要验证 / Why npm Asks for Verification on Every Publish

An interactive login credential can still require a fresh 2FA challenge for each `npm publish`. Having an `_authToken` entry in `.npmrc`, or having created another token on the account, does not prove the current publish uses an eligible automation token. `--auth-type=web` selects the interactive authentication method; changing it is not a substitute for publishing permissions.

交互式登录凭据每次 `npm publish` 仍可能要求新的 2FA 挑战。`.npmrc` 中有 `_authToken` 条目，或账号上创建过其他令牌，都不能证明本次发布使用了合格的自动化令牌。`--auth-type=web` 选择交互式认证方式；修改它不能替代发布权限。

To diagnose repeated prompts, check the effective npm configuration and token metadata locally:

要排查反复提示，请在本机核对生效的 npm 配置与令牌元数据：

- Which credential is actually used: project/user npm configuration and any environment substitution. An exported `NPM_TOKEN` alone is not automatically connected to registry authentication.
- Whether that token is unexpired, covers this package, has **Read and write (publish and stage)** permission, and has **Bypass 2FA** enabled. Stage-only tokens require a separate approval before a version becomes public.
- Whether the package's **Publishing access** setting permits granular tokens. **Require two-factor authentication and disallow tokens** blocks traditional tokens even when their bypass option is enabled.

- 实际使用哪份凭据：项目/用户 npm 配置以及任何环境变量替换。单独导出 `NPM_TOKEN` 并不会自动接入 registry 认证。
- 该令牌是否未过期、是否覆盖本包、是否具有**读写（发布与暂存）**权限、是否启用了**绕过 2FA**。仅暂存令牌在版本公开前需要单独审批。
- 包的**发布访问**设置是否允许细粒度令牌。**要求双因素认证并禁止令牌**即使启用了绕过选项也会拦截传统令牌。

`npm profile get` and `npm token list` can help inspect account/token metadata; do not paste credentials or unredacted configuration into issues or logs. Full token values are only shown when created, so an existing token's name cannot be used to recover its secret. See [npm publishing authentication](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/) and [creating and viewing tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens/).

`npm profile get` 与 `npm token list` 可帮助检查账号/令牌元数据；不要把凭据或未脱敏的配置粘贴进 issue 或日志。令牌完整值只在创建时显示，因此已有令牌的名称无法用于找回其密钥。参见 [npm 发布认证](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/) 与 [创建和查看令牌](https://docs.npmjs.com/creating-and-viewing-access-tokens/)。

### 推荐：GitHub Actions 可信发布（OIDC）/ Recommended: GitHub Actions Trusted Publishing (OIDC)

OIDC lets an authorized GitHub Actions workflow publish without a stored, long-lived npm token. Configure the package's **Trusted Publisher** on npmjs.com with:

OIDC 允许已授权的 GitHub Actions 工作流发布，而无需存储长期 npm 令牌。请在 npmjs.com 上配置包的**可信发布者**：

| 字段 / Field | 本仓库取值 / Value for this repository |
| --- | --- |
| Provider / 提供方 | GitHub Actions |
| Organization or user / 组织或用户 | `zjarlin` |
| Repository / 仓库 | `codex-buddy` |
| Workflow filename / 工作流文件 | `aio-cli.yml`（位于 `.github/workflows/`） |
| Environment / 环境 | 与工作流的环境完全一致；未使用则留空 / Match the workflow's environment exactly, or leave unset if unused |
| Allowed actions / 允许的操作 | 为无人值守发布启用直接的 **`npm publish`** / Enable direct **`npm publish`** for unattended releases |

The workflow must use a GitHub-hosted runner, grant `contents: read` and `id-token: write`, and use npm **11.5.1+** with Node **22.14.0+**. It should install dependencies, run `npm test`, and then run `npm publish --access public`; keep `package.json`'s repository URL aligned with this repository. No `NPM_TOKEN` publishing secret is needed for OIDC. Trigger releases deliberately, for example with a version tag after updating `package.json` and `package-lock.json`.

工作流必须使用 GitHub 托管的 runner，授予 `contents: read` 与 `id-token: write`，并使用 npm **11.5.1+** 与 Node **22.14.0+**。它应安装依赖、运行 `npm test`，然后执行 `npm publish --access public`；保持 `package.json` 的仓库 URL 与本仓库一致。OIDC 不需要 `NPM_TOKEN` 发布密钥。请有意触发发布，例如在更新 `package.json` 与 `package-lock.json` 后打版本标签。

New trusted publishers allow staging by default. If only **`npm stage publish`** is allowed, a maintainer must still approve each staged version with 2FA; explicitly allow direct publishing to avoid that per-release step. Initial trust configuration may itself require account verification. See the [official OIDC setup and workflow example](https://docs.npmjs.com/trusted-publishers/).

新的可信发布者默认允许暂存。如果只允许 **`npm stage publish`**，维护者仍需以 2FA 审批每个暂存版本；请显式允许直接发布以避免每次发布的步骤。初始信任配置本身可能需要账号验证。参见[官方 OIDC 配置与工作流示例](https://docs.npmjs.com/trusted-publishers/)。

**Repository status:** `.github/workflows/aio-cli.yml` is configured with npm Trusted Publishing. Default-branch pushes run Linux/Windows tests, publish a source-bound development version to npm `next`, and update the AIO plugin market. A matching `vX.Y.Z` tag publishes the stable version to npm `latest`. `.github/workflows/check.yml` provides additional package validation. The AIO release workflow uses `@zjarlin/aio@2026.9.17`; no per-release interactive login is needed while its npm trust binding remains valid.

**仓库状态：** `.github/workflows/aio-cli.yml` 已配置 npm 可信发布。默认分支推送会运行 Linux/Windows 测试、把源码绑定的开发版本发布到 npm `next`，并更新 AIO 插件市场；匹配的 `vX.Y.Z` 标签会把稳定版本发布到 npm `latest`。`.github/workflows/check.yml` 提供额外的包校验。AIO 发布工作流使用 `@zjarlin/aio@2026.9.17`；在其 npm 信任绑定有效期间，每次发布无需交互式登录。

### 备选：细粒度发布令牌 / Alternative: A Granular Publishing Token

For a token-based workflow, create a package-scoped token with the permissions described above, store its full value in a GitHub Actions secret, and expose it to the publishing step as `NODE_AUTH_TOKEN` when using `actions/setup-node` with `registry-url: https://registry.npmjs.org`. Rotate it before its configured expiry.

对于基于令牌的工作流，请创建具有上述权限的包级令牌，把完整值存入 GitHub Actions 密钥，并在使用带 `registry-url: https://registry.npmjs.org` 的 `actions/setup-node` 时，以 `NODE_AUTH_TOKEN` 暴露给发布步骤。在其配置的过期时间前轮换。

For local publishing, provide the token through the environment and reference it in a private npm user configuration rather than placing the literal secret in the repository:

本地发布时，请通过环境提供令牌，并在私有 npm 用户配置中引用它，而不是把字面密钥放进仓库：

```ini
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

Then run `npm publish --access public`. Preserve other npm configuration entries; do not overwrite the entire user configuration or print the token. This only avoids the publish challenge when the token and package settings allow it.

然后执行 `npm publish --access public`。保留其他 npm 配置项；不要覆盖整个用户配置，也不要打印令牌。只有令牌与包设置允许时，这才能避免发布验证。

As documented by npm in September 2026, direct publishing of new versions with granular access tokens is scheduled to be removed in **January 2027**. Prefer OIDC for new unattended release workflows; stage-only tokens retain an explicit human approval step. See [npm's token publishing transition](https://docs.npmjs.com/about-access-tokens/#direct-publishing-is-being-deprecated).

按 npm 在 2026 年 9 月的说明，使用细粒度访问令牌直接发布新版本的计划将于 **2027 年 1 月** 移除。新的无人值守发布工作流请优先使用 OIDC；仅暂存令牌保留显式人工审批步骤。参见 [npm 令牌发布过渡](https://docs.npmjs.com/about-access-tokens/#direct-publishing-is-being-deprecated)。

## 自动路由 / Auto Router

Model synchronization and routing have separate entry points. Keep using the original command for synchronization:

模型同步与路由是相互独立的入口。同步请继续使用原命令：

```sh
npx -y codex-buddy
```

Opt into Auto Router once on macOS:

在 macOS 上一次性启用 Auto Router：

```sh
npx -y codex-buddy router setup
```

Fully quit and reopen the desktop app once after setup; review the four Auto Router hooks in Codex `/hooks`. No special prompt prefix, slash command or model-picker item is required. Sending a new message in a project starts a turn: the bridge first tries deterministic command dispatch. An eligible exact match executes through the native shell without model discovery or inference. Otherwise it assesses the task and project manifests, fetches the configured provider's models, selects a sufficient capability tier, ranks within it, and forwards the selected model to App Server. A native notice reports the accepted model. `跑起来看看` with a discovered entry, ordinary Git operations, and complex development follow their respective tiers.

setup 后请完全退出并重新打开桌面端一次；并在 Codex `/hooks` 中检查四个 Auto Router 钩子。无需特殊提示前缀、斜杠命令或模型选择器条目。在项目中发送新消息即开始一个轮次：桥接器先尝试确定性命令分发。符合条件的精确匹配通过原生 shell 执行，不做模型发现或推理；否则它会评估任务与项目清单、获取所配置服务商的模型、选择足够的能力档位、在档位内排序，并把选中的模型转发给 App Server。原生通知报告被接受的模型。`跑起来看看`（配合已发现的入口）、普通 Git 操作与复杂开发各自走对应档位。

Routing runs before eligible `turn/start` requests through this installed stdio bridge. Tool output, steering an already active turn and normal terminal `codex` sessions do not trigger a main-model switch. Hooks supply CLI context and specialist guidance; they cannot switch an already running model. This implementation uses local task rules and estimated model profiles, not a trained RouterLLM classifier.

路由通过已安装的 stdio 桥，在符合条件的 `turn/start` 请求之前运行。工具输出、已在进行轮次的引导以及普通终端 `codex` 会话不会触发主模型切换。钩子提供 CLI 上下文与专家引导；它们无法切换已在运行的模型。本实现使用本地任务规则与估算的模型画像，而非训练过的 RouterLLM 分类器。

`router enable` / `router disable` change an installed router's policy for subsequent turns; `enable` alone does not install the desktop bridge. While routing is enabled it chooses the turn model automatically, overriding the picker selection. Disable it for manual model choice; synchronization continues independently. `router preview` is a dry run of model selection, not task execution, and reads models from the provider.
For turns requiring a model, the router reads **all model IDs from Codex's configured provider `/v1/models`**. Rule-only shell turns skip the provider entirely.
There is no GPT-family allowlist. GLM, DeepSeek, Kimi, Gemma, private models and future additions all enter the same inventory.

`router enable` / `router disable` 改变已安装路由器在后续轮次的策略；仅 `enable` 不会安装桌面桥。路由启用时自动选择轮次模型，覆盖选择器所选；停用后可手动选模，同步独立运行。`router preview` 是模型选择的试运行，不执行任务，并从服务商读取模型。
需要模型的轮次，路由器会读取 **Codex 所配置服务商 `/v1/models` 的全部模型 ID**；仅规则型 shell 轮次完全跳过服务商。
没有 GPT 家族白名单。GLM、DeepSeek、Kimi、Gemma、私有模型以及未来新增模型都进入同一清单。

```sh
npx -y codex-buddy router models --json
npx -y codex-buddy router preview "提交代码"
npx -y codex-buddy router status
npx -y codex-buddy router disable
npx -y codex-buddy router enable
npx -y codex-buddy router uninstall
```

### 常用语工具分发：确定性意图路由 / LLM bypass / Common-Phrase Tool Dispatch: Deterministic Intent Routing / LLM Bypass

这层叫 **确定性意图路由（deterministic intent routing）**，由规则引擎和命令分发器实现。命中后跳过大模型，通常称 **LLM bypass / fast path**。它不使用向量检索、语义分类模型或训练过的 RouterLLM 分类器。

This layer is called **deterministic intent routing**, implemented by a rule engine and a command dispatcher. When it hits, the large model is skipped — commonly the **LLM bypass / fast path**. It uses no vector retrieval, semantic classification model, or trained RouterLLM classifier.

默认顺序是：**完整短句匹配 → 项目上下文和前置条件 → 工具直接执行 → 真实结果**；未命中、有歧义或执行环境不兼容，进入现有模型路由。复杂工作仍默认由强模型规划、经济模型执行明确子任务。

The default order is: **full short-phrase match → project context and preconditions → direct tool execution → real result**; misses, ambiguities or incompatible execution environments fall back to the existing model routing. Complex work still defaults to strong-model planning with an economical model executing well-scoped subtasks.

| 输入 / Input | 规则行为 / Rule behavior |
| --- | --- |
| `当前分支` / `git branch --show-current` | Git 查询，无模型 / Git query, no model |
| `git状态` / `git status` | 工作区状态，无模型 / Workspace status, no model |
| `提交记录` / `git log` | 最近 10 条提交，无模型 / Last 10 commits, no model |
| `查看代码改动` / `git diff` | 工作区差异，无模型；禁用外部 diff/textconv / Workspace diff, no model; external diff/textconv disabled |
| `跑起来` / `跑起来看看` / `启动项目` | 项目启动入口唯一时直接执行 / Direct execution when the project has a single start entry |
| `构建项目` / `跑测试` / `npm run test` | 从本地清单解析实际命令；唯一匹配才执行 / Resolve the real command from local manifests; execute only on a unique match |
| `不要推送` / `跑起来并修复报错` / 带额外参数的命令 | 交回模型理解，不按局部关键词执行 / Hand back to the model; never act on partial keywords |
| `提交代码` / `推送代码` / `合并分支` / `解决冲突` | 继续交给现有 Git 专用流程，检查范围、目标和状态 / Keep delegating to the existing Git-specialist flow, checking scope, target and state |

在项目目录预览规则，无需配置供应商，也不会执行命令：

Preview the rules in a project directory without configuring a provider and without executing commands:

```sh
npx -y codex-buddy router match "跑起来看看" --json
npx -y codex-buddy router match "当前分支" --json
npx -y codex-buddy router dispatch status
npx -y codex-buddy router dispatch off
npx -y codex-buddy router dispatch on
```

`match` 返回 `route: "tool"` 和结构化 `recipe`（`argv`、`cwd`、来源、动作），或 `clarify` / `llm` 及原因。多入口时返回候选，不猜测要启动哪个前后端；可进入具体子项目后重试。项目命令调用的是仓库脚本，并不保证依赖已安装或脚本内部没有副作用。扩展规则时新增“完整短句 → 已知动作”，工具保持结构化参数；不要把任意关键词后的文本拼成 shell 命令。实现入口见 [dispatch 模块](src/dispatch/README.md)。

`match` returns `route: "tool"` with a structured `recipe` (`argv`, `cwd`, source, action), or `clarify` / `llm` with a reason. With multiple entries it returns candidates rather than guessing which frontend/backend to start; retry inside a specific subproject. Project commands call repository scripts, which does not guarantee installed dependencies or side-effect-free scripts. When extending rules, add “full short-phrase → known action”; tools keep structured parameters — never splice text after arbitrary keywords into a shell command. Implementation entry: the [dispatch 模块](src/dispatch/README.md) (dispatch module).

已安装 Auto Router 的用户升级后执行 `router setup`，退出并重启桌面端。规则层默认启用，位于 `/v1/models` 获取之前；命中显示 **“Auto 规则直达；模型：无”**。普通 `npx -y codex-buddy` 保留原有同步行为。`router disable` 会同时关闭规则旁路和模型自动选择，`router dispatch off` 只关闭规则旁路。

Users with Auto Router installed should run `router setup` after upgrading, then quit and restart the desktop app. The rule layer is enabled by default, ahead of the `/v1/models` fetch; on a hit it shows **“Auto 规则直达；模型：无”** (Auto rule fast-path; model: none). Plain `npx -y codex-buddy` keeps its original sync behavior. `router disable` turns off both the rule bypass and automatic model selection; `router dispatch off` turns off only the rule bypass.

桌面适配使用原生 `thread/shellCommand`，原始短句保存在命令注释里；命令输出、退出码和会话记录由 App Server 产生，不伪造助手成功消息。该原生方法固定使用完整访问，因此这里只接受服务器已经确认的 **本地完整访问 + 无需审批** 会话，且必须非规划模式、无活动轮次、无附件/额外上下文或不兼容的环境/权限覆盖。条件不满足时保留正常模型和权限路径，绝不为旁路提升权限。Windows 暂不启用此 POSIX 执行适配，但 `match` 和原模型路由仍可用。原生协议验证基于 Codex Desktop `0.154.0-alpha.6.2`；旧服务器若拒绝此方法，会报告原生错误而不会重放任务，可用 `router dispatch off` 恢复原模型路径。

The desktop adapter uses the native `thread/shellCommand`, keeping the raw phrase in the command comment; command output, exit codes and conversation records come from App Server — no fake assistant success messages. That native method is fixed to full access, so this accepts only sessions the server has already confirmed as **local full access + no approval**, and the turn must be non-planning, with no active turn, no attachments/extra context and no incompatible environment/permission overrides. When conditions are not met, the normal model and permission path stays; privileges are never elevated for the bypass. Windows does not yet enable this POSIX execution adapter, but `match` and the original model routing still work. Native protocol validation is based on Codex Desktop `0.154.0-alpha.6.2`; if an older server rejects the method, it reports a native error without replaying the task, and `router dispatch off` restores the original model path.

启动类命令保持前台运行，可正常中断；POSIX 监督进程负责在结束、中断或超时时清理本次命令的进程组（主动另建会话脱离进程组的后台服务不在此范围）。默认上限一小时，可用 `policy.json` 的 `dispatch.timeoutMs` 调整到 1000–3600000 毫秒。进程启动不等于 HTTP/浏览器就绪；需要修复或浏览器验证的复合请求仍交回模型。非零退出、超时和中断保留真实失败结果，不自动重试有副作用的命令。原生中断会把历史结果记为中断，已流式显示的部分 stdout 不保证保留。

Launch-type commands stay in the foreground and can be interrupted normally; a POSIX supervisor cleans up the command's process group on exit, interrupt or timeout (background services that deliberately create a new session and leave the group are out of scope). The default cap is one hour; `policy.json`'s `dispatch.timeoutMs` adjusts it between 1000 and 3600000 ms. Process start is not HTTP/browser readiness; compound requests needing fixes or browser verification return to the model. Nonzero exits, timeouts and interrupts keep the real failure result, and side-effecting commands are never auto-retried. A native interrupt records the outcome as interrupted; partially streamed stdout is not guaranteed to be preserved.

这层对命中的用户轮次不发模型目录或推理请求；独立后台模型同步仍按原计划运行。节省比例取决于实际命中率，没有宣称固定百分比。

This layer sends no model-catalog or inference requests for hit user turns; the independent background model sync keeps running as scheduled. Savings depend on the actual hit rate; no fixed percentage is claimed.

### 强模型规划、经济模型执行 / Strong Planner, Economical Executor

Complex tasks now default to a **strong planner → bounded execution tasks → centralized review** strategy. The main turn still requires an advanced model for planning, unresolved design decisions and final acceptance. After planning, the parent reassesses each small task independently and chooses an economical execution model instead of giving every child the whole project's advanced difficulty and full conversation history. Routine Git/project operations keep their direct route.

复杂任务现在默认采用 **强模型规划 → 有界执行任务 → 集中复核** 的策略。主轮次仍需高级模型负责规划、未决设计决策与最终验收。规划完成后，父级独立重估每个小任务，并选择经济型执行模型，而不是把整个项目的高级难度与完整对话历史交给每个子任务。常规 Git/项目操作保持直达路径。

Use exact IDs returned by your own `router models` command. For example, when these two IDs are available:

请使用你自己 `router models` 命令返回的确切 ID。例如当以下两个 ID 可用时：

```sh
npx -y codex-buddy router planning --planner-model gpt-6 --executor-model deepseek-v4.1-flash
npx -y codex-buddy router preview "重构模块并实现新的接口"
npx -y codex-buddy router planning status
# Return both roles to automatic selection, or disable only this division of work:
# 让两个角色都回到自动选择，或仅停用这一分工：
npx -y codex-buddy router planning auto
npx -y codex-buddy router planning off
```

The names above are examples, not bundled model defaults. Explicit preferences are validated before saving. Each eligible turn rechecks the live directory; an unavailable/disabled/ineligible preference gets a clearly reported replacement. `preview` and `status` show `planning.planner`, `planning.executor`, up to five same-tier `executorCandidates` and `executorStatus: "recommended"`. The parent intersects those live candidates with its spawn tool's supported IDs, trying the configured preference first. If both primary roles resolve to the same model, the notice says the combination does not provide a model split.

上面这些名称是示例，不是内置模型默认值。显式偏好会在保存前校验。每个符合条件的轮次都会重新检查实时目录；不可用/已停用/不合规的偏好会得到明确说明的替代。`preview` 与 `status` 显示 `planning.planner`、`planning.executor`、最多五个同档 `executorCandidates` 与 `executorStatus: "recommended"`。父级把这些实时候选与其 spawn 工具支持的 ID 求交，优先尝试配置的偏好。如果两个主角色解析到同一模型，通知会说明该组合不构成模型分工。

The executor's default task tier is `standard`, suitable for bounded implementation; `--executor-tier simple` is available for more mechanical work. Within the sufficient tier, executor ranking uses 90% estimated economy + 10% capability, weighted by valid health evidence, and requests `executorEffort: "low"` only when the catalog supports it. Planner selection retains advanced capability requirements. Prices are not measured by these estimates, and retries/context transfer also cost tokens; this is a cost-reduction strategy, not a claim of globally minimum spend.

执行器的默认任务档位是 `standard`，适合有界实现；更机械的工作可用 `--executor-tier simple`。在足够档位内，执行器排序使用 90% 估算经济性 + 10% 能力，并按有效健康证据加权；仅当目录支持时才请求 `executorEffort: "low"`。规划器选择保留高级能力要求。这些估算不测量价格，重试/上下文迁移同样消耗 token；这是成本优化策略，而非全局最低花费的声明。

The `plan-executor` role receives a compact packet containing the goal, working directory/files, necessary context, settled interfaces/steps, change boundaries and verifiable acceptance criteria. Guidance prefers minimal-history handoff (such as `fork_turns: "none"` where supported), avoids duplicate planner tool work, and asks the executor to return evidence after at most two implementation attempts by default. `planning.maxAttempts` may be 1–3; it is a guidance budget, not a runtime hard limit. Unresolved architecture/security/business decisions and repeated implementation failures return to the planner. Permission/network errors are not automatic reasons to upgrade models.

`plan-executor` 角色收到紧凑数据包，包含目标、工作目录/文件、必要上下文、已定接口/步骤、变更边界与可验证的验收标准。引导偏好最小历史交接（如支持处使用 `fork_turns: "none"`）、避免重复规划器工具工作，并要求执行器默认最多两次实现尝试后返回证据。`planning.maxAttempts` 可取 1–3；它是引导预算，不是运行时硬限制。未决的架构/安全/业务决策与反复实现失败会回到规划器。权限/网络错误不是升级模型的自动理由。

**This division uses parent-agent orchestration and hooks.** The bridge selects the main planner; hooks do not create children or force a running agent to switch. The parent must be permitted to delegate and its spawn tool must support the selected model and handoff options. A provider ID appearing in `/v1/models` does not guarantee that a particular desktop spawn tool accepts it. Unsupported combinations must be reported, never described as cheap execution while silently inheriting the strong model. `SubagentStart` reports the actual child model; the main-turn notice labels the executor only as a candidate. See [Codex subagent model configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents).

**这一分工使用父级智能体编排与钩子。** 桥接器选择主规划器；钩子不会创建子智能体，也不会强制运行中的智能体切换。父级必须被允许委派，且其 spawn 工具必须支持所选模型与交接选项。出现在 `/v1/models` 中的服务商 ID 并不保证某个桌面 spawn 工具接受它。不支持的组合必须被如实报告，绝不能被描述为“经济执行”却静默继承强模型。`SubagentStart` 报告实际子模型；主轮次通知只把执行器标注为候选。参见 [Codex 子智能体模型配置](https://learn.chatgpt.com/docs/agent-configuration/subagents)。

Existing router installations need `router setup` again after upgrading to install the new bundle and role, then a desktop restart and review of changed hooks in `/hooks`. Policy/model preference changes after that take effect on subsequent turns without another restart. Ordinary `npx -y codex-buddy` remains synchronization only.

已有路由器安装升级后需再次运行 `router setup` 以安装新 bundle 与角色，然后重启桌面端并检查 `/hooks` 中变更的钩子。此后的策略/模型偏好变更在后续轮次生效，无需再次重启。普通 `npx -y codex-buddy` 仍是纯同步。

### 生命周期引导与专家角色 / Lifecycle Guidance & Specialist Roles

Setup also installs `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, and `PostToolUse` guidance hooks, preserving any existing hooks (including `Stop`). Review the Auto Router definitions in Codex `/hooks` before they execute. Changed hook code gets a new content-addressed script path so Codex requests trust again. The installer never grants trust or bypasses review.

setup 还会安装 `UserPromptSubmit`、`SubagentStart`、`SubagentStop` 与 `PostToolUse` 引导钩子，并保留任何已有钩子（包括 `Stop`）。在这些钩子执行前，请先检查 Codex `/hooks` 中的 Auto Router 定义。变更过的钩子代码会获得新的内容寻址脚本路径，使 Codex 重新请求信任。安装器从不授予信任或绕过审查。

`UserPromptSubmit` also detects project operations such as `跑起来`, `跑起来看看`, `启动项目`, builds, tests and known CLI invocations. It supplies local stack keywords and candidate commands before the first tool call, and prefers an existing suitable project operations agent before the model-neutral `~/.codex/agents/project-operations.toml` fallback. Ordinary development prompts also receive the project command context. The App Server bridge uses the same assessment before choosing the turn model; hooks alone cannot change an active model.

`UserPromptSubmit` 还会识别项目操作，如 `跑起来`、`跑起来看看`、`启动项目`、构建、测试与已知 CLI 调用。它在首次工具调用前提供本地技术栈关键词与候选命令，并优先使用已有的合适项目操作智能体，其次才是模型中立的 `~/.codex/agents/project-operations.toml` 回退。普通开发提示同样获得项目命令上下文。App Server 桥在选择轮次模型前使用同一评估；仅凭钩子无法改变进行中的模型。

Project inspection reads bounded manifests from the nearest project, immediate subprojects and common monorepo containers. It recognizes package scripts (npm/pnpm/yarn/bun, including inherited workspace managers), Gradle/Maven, Kotlin Toolchain wrappers and application modules, Cargo, Go, Python, .NET, Dart/Flutter, Compose and task runners. It emits the source and working directory for each candidate, prioritizes commands relevant to the task, and distinguishes declared entries from conventions requiring verification. It does not execute project scripts, inspect `.env` files or include script bodies. Unrecognized layouts and missing entry points stay explicit; the agent checks the README and actual environment instead of inventing a command.

项目检查读取最近项目、直接子项目与常见 monorepo 容器中的有界清单。它识别 package 脚本（npm/pnpm/yarn/bun，含继承的工作区管理器）、Gradle/Maven、Kotlin Toolchain wrapper 与应用模块、Cargo、Go、Python、.NET、Dart/Flutter、Compose 与任务运行器。它为每个候选输出来源与工作目录，优先与任务相关的命令，并区分已声明入口与需要验证的约定。它不执行项目脚本、不读取 `.env` 文件、不包含脚本正文。无法识别的布局与缺失入口会保持明确；智能体会查看 README 与实际环境，而不是凭空编造命令。

```sh
# Run in the project: local inspection, no model/provider call required.
# 在项目中运行：本地检查，无需模型/服务商调用。
npx -y codex-buddy router project --json
npx -y codex-buddy router preview "跑起来看看"
```

Confirmed routine entry points use `simple`; finding an entry or initial environment diagnosis uses `standard`. Mixed development, architecture and complex code failures retain `advanced`. Results must be verified through real process readiness, exit status, test output and browser checks where requested. Launching a command is not proof the application is running. This is rule-based routing; no traffic reduction percentage has been measured.

已确认的常规入口使用 `simple`；寻找入口或初步环境诊断使用 `standard`。混合开发、架构与复杂代码失败保留 `advanced`。结果必须通过真实进程就绪、退出状态、测试输出以及按需的浏览器检查来验证。启动命令不等于应用已在运行。这是基于规则的路由；未测量流量降低百分比。

`UserPromptSubmit` detects Git intent before tool execution using keywords such as `git`, `commit`, `push`, `merge`, `提交`, `推送`, `代码冲突`, and `合并`. It looks for existing Git agents in project/personal agent directories, then uses the installed `~/.codex/agents/git-operations.toml` fallback. A role whose fixed model is below the required capability tier is excluded. The bundled role leaves its model unset so the parent can select it dynamically. Keywords identify a specialist, not task difficulty or authorization: conflict resolution remains advanced, and mixed requests delegate only the actual Git work. Already assigned Git agents do not delegate the same work recursively. Role files follow the [Codex custom-agent format](https://learn.chatgpt.com/docs/agent-configuration/subagents); the runtime's available tools determine how a role/model can be selected.

`UserPromptSubmit` 会在工具执行前用 `git`、`commit`、`push`、`merge`、`提交`、`推送`、`代码冲突`、`合并` 等关键词识别 Git 意图。它先查找项目/个人智能体目录中的现有 Git 智能体，再使用已安装的 `~/.codex/agents/git-operations.toml` 回退。固定模型低于所需能力档位的角色会被排除。随包角色不设置模型，由父级动态选择。关键词识别的是专家，而不是任务难度或授权：冲突解决仍是 advanced，混合请求只委派真正的 Git 工作。已分配的 Git 智能体不会递归委派相同工作。角色文件遵循 [Codex 自定义智能体格式](https://learn.chatgpt.com/docs/agent-configuration/subagents)；运行时可用的工具决定角色/模型如何被选择。

`SubagentStart` announces the actual model and asks the child to hand back results, verification and blockers. `PostToolUse` offers simple/standard/advanced model suggestions once per turn, with one extra reminder for a structured tool error; it preserves the original result. `SubagentStop` requests one summary if the child ends with no final message, respecting `stop_hook_active` to prevent loops. A non-zero exit is a signal to investigate, not proof of model failure (for example, search exit 1 can simply mean no matches).

`SubagentStart` 宣告实际模型，并要求子智能体交回结果、验证与阻碍。`PostToolUse` 每轮提供一次 simple/standard/advanced 模型建议，遇到结构化工具错误会额外提醒一次；它保留原始结果。`SubagentStop` 在子智能体无最终消息结束时请求一次总结，并尊重 `stop_hook_active` 防止循环。非零退出是调查信号，而非模型失败的证明（例如搜索退出码 1 可能只是没有匹配）。

The tested desktop binary can send **only stdout** to a Bash hook, omitting the exit code. In that case guidance explicitly asks the agent to inspect its original tool result; the hook does not infer success from empty output or interpret JSON printed by a command as an error flag.

被测的桌面二进制向 Bash 钩子只能发送 **stdout**，省略退出码。此时引导会明确要求智能体检查其原始工具结果；钩子不会从空输出推断成功，也不会把命令打印的 JSON 解读为错误标志。

These hooks **guide** model selection; they cannot change the model of an already running agent. A parent may choose a suggested model when creating an independently useful child task only if existing instructions permit delegation and the tool supports the relevant model/fork parameters. No hook creates agents, grants permission, replays operations, or claims a switch happened. Hook suggestions reuse the turn router's five-minute provider-bound snapshot, including fresh sub2api health weighting, and make no additional API calls. Missing/stale advice falls back to the current model. Only bounded hashed turn bookkeeping is stored, without prompts or tool output.

这些钩子**引导**模型选择；它们无法改变已在运行的智能体的模型。只有当现有指令允许委派且工具支持相关模型/fork 参数时，父级才可在创建独立有用的子任务时选择建议的模型。任何钩子都不会创建智能体、授予权限、重放操作或声称切换已发生。钩子建议复用轮次路由器的五分钟服务商快照（含最新 sub2api 健康加权），不产生额外 API 调用。缺失/过期的建议回退到当前模型。仅保存有界哈希的轮次记账，不含提示或工具输出。

```bash
npx -y codex-buddy router hooks setup
npx -y codex-buddy router hooks status
npx -y codex-buddy router hooks uninstall
```

`router disable` also silences guidance; `policy.json` can independently disable it with `"hooks": { "enabled": false }`. The unified uninstall removes this package's hook commands and its unmodified Git/project operations and plan-executor profiles; user edits to those profiles are preserved. Hook installation currently requires a POSIX shell. See the [Codex hook contracts](https://learn.chatgpt.com/docs/hooks) for event behavior and trust requirements.

`router disable` 也会静默引导；`policy.json` 可用 `"hooks": { "enabled": false }` 独立停用它。统一卸载会移除本包的钩子命令及其未修改的 Git/项目操作与 plan-executor 配置文件；用户对这些文件的编辑会被保留。钩子安装目前需要 POSIX shell。事件行为与信任要求参见 [Codex 钩子契约](https://learn.chatgpt.com/docs/hooks)。

An available assessment model is selected from catalog capability descriptions and reused after successful assessments. It evaluates model capabilities and relative economy from the complete inventory. This assessment is cached for 24 hours and refreshed when models or descriptions change. It is an extra provider API call and can incur usage. Invalid, incomplete or unavailable assessment retains previous valid profiles, shows new models as uncertain name/description estimates, and retries after one minute. Uncertain new models do not execute tasks. `assessment: "heuristic"` disables this extra API call.

可用的评估模型会从目录能力描述中选出，并在评估成功后复用。它根据完整清单评估模型能力与相对经济性。该评估缓存 24 小时，并在模型或描述变化时刷新。这是一次额外的服务商 API 调用，可能产生费用。无效、不完整或不可用的评估会保留此前有效的画像，把新模型显示为不确定的名称/描述估算，并在 1 分钟后重试。不确定的新模型不执行任务。`assessment: "heuristic"` 可停用这次额外 API 调用。

**Estimated economy is not a price quote, and estimated tool support is not a compatibility test.** Specialized/non-tool models remain visible but cannot be chosen for agent execution. Unknown models are shown with uncertain profiles and wait for assessment or an explicit user override before executing tasks. `model-router/policy.json` supports per-ID overrides through `models: { "provider/model": { "capability": 90, "economy": 60, "tools": true, "purpose": "general", "modelTier": "advanced" } }`; `modelTier` is optional.

**估算的经济性不是报价，估算的工具支持也不是兼容性测试。** 专用/非工具模型仍然可见，但不能被选为智能体执行。未知模型以不确定画像显示，并在执行任务前等待评估或显式用户覆盖。`model-router/policy.json` 支持通过 `models: { "provider/model": { "capability": 90, "economy": 60, "tools": true, "purpose": "general", "modelTier": "advanced" } }` 按 ID 覆盖；`modelTier` 可选。

Routing order is **task difficulty → capability tier → within-tier cost/reliability ranking**. The classifier uses local rules (not a trained RouterLLM classifier); uncertain development tasks stay advanced, while bounded project entry discovery uses standard. Model capability tiers derive from estimated capability scores, with configurable thresholds and explicit per-model overrides.

路由顺序是 **任务难度 → 能力档位 → 档内成本/可靠性排序**。分类器使用本地规则（而非训练过的 RouterLLM 分类器）；不确定的开发任务保持 advanced，有界的项目入口发现使用 standard。模型能力档位由估算的能力分数得出，阈值可配置并支持按模型显式覆盖。

| Task tier / 任务档位 | Examples / 示例 | Default capability band / 默认能力区间 |
| --- | --- | --- |
| `simple` | Explicit Git status/commit/push/merge without in-progress Git work; project run/build/test with discovered entry points / 无进行中 Git 工作的显式 git status/commit/push/merge；配合已发现入口的项目 run/build/test | 0–69 |
| `standard` | Project entry discovery, initial environment diagnosis; bounded button, label, README or CSS changes / 项目入口发现、初步环境诊断；有界的按钮、标签、README 或 CSS 改动 | 70–89 |
| `advanced` | Conflicts, architecture, refactoring, broad or uncertain work / 冲突、架构、重构、宽泛或不确定的工作 | 90–100 |

The first available band at or above the task's requirement is selected; fallback is upward only. **A weak model with 100% request success cannot replace an advanced model.** If discovery succeeds but no model meets the required band, the router rejects the turn before forwarding it. Within a band, simple tasks use 70% economy + 30% capability, standard tasks 40% economy + 60% capability, and advanced tasks use capability; success statistics then weight these scores. Thresholds live under `capabilityThresholds: { "simple": 0, "standard": 70, "advanced": 90 }` in policy, and effort is configurable with `simpleEffort`, `standardEffort`, and `advancedEffort`.

选择任务要求之上第一个可用的档位；回退只能向上。**请求成功率 100% 的弱模型不能替代高级模型。** 如果发现成功但没有模型满足所需档位，路由器会在转发前拒绝该轮次。档位内，simple 任务使用 70% 经济性 + 30% 能力，standard 任务 40% 经济性 + 60% 能力，advanced 任务只看能力；随后用成功率统计对这些分数加权。阈值位于 policy 的 `capabilityThresholds: { "simple": 0, "standard": 70, "advanced": 90 }`，力度可用 `simpleEffort`、`standardEffort`、`advancedEffort` 配置。

Model discovery/configuration failures preserve the original requested model and show a notice. Auto overrides the desktop model choice while enabled; disable Auto to keep manual control. No in-flight interruption or task replay occurs when a merge develops conflicts; the next turn reassesses. Git merge, rebase, cherry-pick and revert state also raise otherwise simple requests to advanced.

模型发现/配置失败会保留原始请求的模型并显示通知。Auto 启用期间覆盖桌面模型选择；停用 Auto 以保留手动控制。合并出现冲突时不会中断进行中的任务或重放任务；下一轮重新评估。Git merge、rebase、cherry-pick 与 revert 状态也会把原本 simple 的请求提升为 advanced。

The proxy sends a native notification with the accepted model, effort, reason and dynamic candidate count. This identifies what App Server accepted, not an unverifiable upstream alias mapping. Model/profile/health updates take effect per turn without restarting the router. The desktop picker itself may still cache its catalog.

代理发送原生通知，包含被接受的模型、力度、原因与动态候选数量。这标识 App Server 实际接受的内容，而非不可验证的上游别名映射。模型/画像/健康更新逐轮生效，无需重启路由器。桌面选择器本身可能仍缓存其目录。

macOS setup uses `CODEX_CLI_PATH`, verified in the current desktop bundle. **Quit and reopen the desktop app once after installation.** No signed application files are replaced. This desktop environment override is version-dependent and needs rechecking after app updates. Other platforms retain catalog sync; their desktop routing is not auto-installed.

macOS setup 使用 `CODEX_CLI_PATH`，并在当前桌面 bundle 中校验。**安装后请退出并重新打开桌面端一次。** 不会替换已签名的应用文件。该桌面环境覆盖与版本相关，应用更新后需重新检查。其他平台保留目录同步；它们的桌面路由不会自动安装。

## 可选的 sub2api 请求健康证据 / Optional sub2api Request-Health Evidence

A dedicated read-only metrics key can improve routing using real per-model request success counts. It is separate from the inference key and restricted to one server-side group.

专用只读指标密钥可以用真实的按模型请求成功数改进路由。它与推理密钥分离，并限制在单个服务端分组内。

```sh
npx -y codex-buddy router health --health-key-file /absolute/private/metrics.key --health-group-id 6
```

The router requests `/api/v1/router/models/health` on the **same origin** as the configured provider. The binding also fingerprints the current provider credential; after changing it, re-run `router health` for the correct group. The key is read from the private file, never included in logs, status, the model-assessment request or npm. Configure this optional endpoint on sub2api first.

路由器在与所配置服务商**同源**上请求 `/api/v1/router/models/health`。该绑定还会对当前服务商凭据取指纹；变更凭据后请重新运行 `router health` 以获取正确分组。密钥从私有文件读取，绝不进入日志、状态、模型评估请求或 npm。请先在 sub2api 上配置这个可选端点。

The endpoint returns a 90-minute window, `data_through`, group scope, success/failure counts and average TTFT. Stats older than five minutes, wrong-group stats and fewer than ten samples do not penalize models. Ranking **inside the selected capability tier** uses `base_score × (1 − 0.75 × failure_rate × n/(n+20))`; no-data models remain neutral. Request success measures gateway reliability, not task correctness or capability. The implementation exposes latency for inspection but currently ranks health using success rate only.

端点返回 90 分钟窗口、`data_through`、分组范围、成功/失败计数与平均 TTFT。超过五分钟的统计、错误分组的统计以及少于十个样本不会惩罚模型。**所选能力档位内**的排序使用 `base_score × (1 − 0.75 × failure_rate × n/(n+20))`；无数据模型保持中性。请求成功度量的是网关可靠性，而非任务正确性或能力。实现会暴露延迟供检查，但目前只按成功率对健康度排序。

Sub2api requires `ROUTER_METRICS_KEY_SHA256` (SHA-256 of the dedicated key) and `ROUTER_METRICS_GROUP_ID`; missing configuration disables access. The metrics key grants no admin or inference permissions.

Sub2api 需要 `ROUTER_METRICS_KEY_SHA256`（专用密钥的 SHA-256）与 `ROUTER_METRICS_GROUP_ID`；配置缺失时禁用访问。指标密钥不授予任何管理或推理权限。

## AIO 市场交付 / AIO Marketplace Delivery

This CLI is connected through `aio plugin init --kind cli --adopt`. After one-time npm Trusted Publisher setup, default-branch pushes run tests, publish an immutable `next` development version, and update the existing AIO marketplace entry and README. Matching version tags publish `latest` stable releases. The existing model-sync command and explicit `router setup` behavior are unchanged. See [AIO delivery](AIO.md) for setup and version rules.

本 CLI 通过 `aio plugin init --kind cli --adopt` 接入。一次性完成 npm 可信发布者配置后，默认分支推送会运行测试、发布不可变的 `next` 开发版本，并更新现有 AIO 市场条目与 README；匹配的版本标签发布 `latest` 稳定版本。现有的 model-sync 命令与显式 `router setup` 行为保持不变。配置与版本规则参见 [AIO 交付](AIO.md)。
