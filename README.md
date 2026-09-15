# codex-model-sync

**One command for dynamic model discovery, catalog sync, and desktop Auto Router.**

```sh
npx -y codex-model-sync
```

This command works in PowerShell, Git Bash, and macOS/Linux terminals. It downloads
the ready-to-run bundle from npm and requires no source build.

Already configured Codex with a custom `base_url` and API key? That is all you need. This CLI reads your existing configuration, calls the provider's `/v1/models`, validates a Codex catalog, configures `model_catalog_json`, and installs a background sync every five minutes, and enables Auto Router on macOS. Use `--no-router` for catalog sync only. No URL or API key needs to be copied into this tool.

## Uninstall and restore Codex

If Codex stops responding after setup, fully quit Codex and stop any foreground
`watch` command with Ctrl+C, then run:

```sh
npx -y codex-model-sync@latest uninstall
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
npm uninstall -g codex-model-sync
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

```sh
npx -y codex-model-sync
npx -y codex-model-sync sync
npx -y codex-model-sync status --json
npx -y codex-model-sync watch
npx -y codex-model-sync uninstall
```

Or install globally:

```sh
npm install -g codex-model-sync
codex-model-sync
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

## Auto Router

`npx -y codex-model-sync` installs model synchronization and Auto Router together on macOS.
The router reads **all model IDs from Codex's configured provider `/v1/models`** on every turn.
There is no GPT-family allowlist. GLM, DeepSeek, Kimi, Gemma, private models and future additions all enter the same inventory.

```sh
npx -y codex-model-sync router models --json
npx -y codex-model-sync router preview "提交代码"
npx -y codex-model-sync router status
npx -y codex-model-sync router disable
npx -y codex-model-sync router enable
npx -y codex-model-sync router uninstall
```

An available assessment model is selected from catalog capability descriptions and reused after successful assessments. It evaluates model capabilities and relative economy from the complete inventory. This assessment is cached for 24 hours and refreshed when models or descriptions change. It is an extra provider API call and can incur usage. Invalid, incomplete or unavailable assessment retains previous valid profiles, shows new models as uncertain name/description estimates, and retries after one minute. Uncertain new models do not execute tasks. `assessment: "heuristic"` disables this extra API call.

**Estimated economy is not a price quote, and estimated tool support is not a compatibility test.** Specialized/non-tool models remain visible but cannot be chosen for agent execution. Unknown models are shown with uncertain profiles and wait for assessment or an explicit user override before executing tasks. If no eligible model remains, the original request is preserved with a notice. `model-router/policy.json` supports explicit per-ID overrides through `models: { "provider/model": { "capability": 90, "economy": 60, "tools": true, "purpose": "general" } }`.

Unambiguous Git operations select a model using 70% economy + 30% capability; development, attachments, conflicts and uncertain tasks prioritize capability. Successful model discovery is required; failures preserve the original requested model and show a notice. Auto overrides the desktop model choice while enabled; disable Auto to keep manual control. No in-flight interruption or task replay occurs when a merge develops conflicts; the next turn reassesses.

The proxy sends a native notification with the accepted model, effort, reason and dynamic candidate count. This identifies what App Server accepted, not an unverifiable upstream alias mapping. Model/profile/health updates take effect per turn without restarting the router. The desktop picker itself may still cache its catalog.

macOS setup uses `CODEX_CLI_PATH`, verified in the current desktop bundle. **Quit and reopen the desktop app once after installation.** No signed application files are replaced. This desktop environment override is version-dependent and needs rechecking after app updates. Other platforms retain catalog sync; their desktop routing is not auto-installed.

## Optional sub2api request-health evidence

A dedicated read-only metrics key can improve routing using real per-model request success counts. It is separate from the inference key and restricted to one server-side group.

```sh
npx -y codex-model-sync router health --health-key-file /absolute/private/metrics.key --health-group-id 6
```

The router requests `/api/v1/router/models/health` on the **same origin** as the configured provider. The binding also fingerprints the current provider credential; after changing it, re-run `router health` for the correct group. The key is read from the private file, never included in logs, status, the model-assessment request or npm. Configure this optional endpoint on sub2api first.

The endpoint returns a 90-minute window, `data_through`, group scope, success/failure counts and average TTFT. Stats older than five minutes, wrong-group stats and fewer than ten samples do not penalize models. Ranking uses `base_score × (1 − 0.75 × failure_rate × n/(n+20))`; no-data models remain neutral. Request success measures gateway reliability, not task correctness. The implementation exposes latency for inspection but currently ranks health using success rate only.

Sub2api requires `ROUTER_METRICS_KEY_SHA256` (SHA-256 of the dedicated key) and `ROUTER_METRICS_GROUP_ID`; missing configuration disables access. The metrics key grants no admin or inference permissions.
