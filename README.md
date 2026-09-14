# codex-model-sync

**One command to populate Codex's model picker from your own provider, and keep its catalog synchronized.**

```sh
npx -y codex-model-sync
```

This command works in PowerShell, Git Bash, and macOS/Linux terminals. It downloads
the ready-to-run bundle from npm and requires no source build.

Already configured Codex with a custom `base_url` and API key? That is all you need. This CLI reads your existing configuration, calls the provider's `/v1/models`, validates a Codex catalog, configures `model_catalog_json`, and installs a background sync every five minutes. No URL or API key needs to be copied into this tool.

## Uninstall and restore Codex

If Codex stops responding after setup, fully quit Codex and stop any foreground
`watch` command with Ctrl+C, then run:

```sh
npx -y codex-model-sync@latest uninstall
```

Reopen Codex after the command finishes. If you selected a provider-only model
since installing this tool, select your previously working model again.

Uninstall stops and removes the background task, restores the original
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

Options: `--home PATH`, `--codex-bin PATH`, `--interval SECONDS` (default 300, multiples of 60), `--no-service`, `--json`.

## How configuration is discovered

The directory is `--home`, then `CODEX_HOME`, then `~/.codex`. The CLI reads the root `config.toml`, selects its `model_provider`, and reads that provider's `base_url`. A URL with no path gets `/v1/models`; an existing API path such as `/v1` or `/api/openai` gets `/models` appended. Provider query parameters and HTTP headers are respected. Project and named-profile overrides are not merged in this release.

Authentication supports configured `Authorization` headers, `env_key`, command-based `provider.auth`, `experimental_bearer_token`, `OPENAI_API_KEY`, and `auth.json`'s `OPENAI_API_KEY`. An explicit missing `env_key` fails rather than falling back to another account. ChatGPT OAuth access tokens are not treated as provider API keys. Requests use the configured host and reject redirects.

Each refresh reads the configuration and credentials again. Keys are not copied into the package, generated catalog, scheduler task, or status file. Environment-based credentials must also be available to the background service; file-based or command-based credentials avoid depending on an interactive shell's environment. Node and Codex executable paths are saved, so rerun setup after moving or removing those executables.

## Model behavior and refresh limits

The visible catalog follows the model IDs returned by the endpoint, including removals. Model order is stable. Native Codex definitions retain their tool and reasoning metadata; existing custom models retain their settings. If a server offers `models?client_version=...`, its metadata supplies new custom entries. Otherwise new models receive conservative text-only defaults, no configurable reasoning, and a 32,000-token context budget. These defaults are assumptions, not verified capabilities. Existing hidden internal models are retained.

**Listing a model does not prove that it supports the Responses API, tools, or coding-agent use.** Image, moderation, and other specialized endpoints may appear if your provider includes them in its model list.

**Automatic catalog synchronization is not live UI refresh.** Codex 0.153.4 caches the catalog inside a running app-server. Restart running Codex clients to reload the picker after the catalog changes. Newly started clients read the current catalog. This tool never restarts active conversations automatically. See the [official catalog setting](https://learn.chatgpt.com/docs/config-file/config-reference#model_catalog_json).

## Local files and recovery

Files live under `<codex-home>/model-sync/`. The background task uses a copied, self-contained `runtime.mjs`, so clearing the npx cache does not break it. No network package install occurs during background synchronization.

- `catalog.json`: generated model catalog.
- `status.json`: last successful or failed refresh, without credentials.
- `initial-catalog-setting.json`: the original catalog setting, without copying credential-bearing config fields.
- `previous-catalog.json`: the prior generated catalog, when available.
- `state.json`: task metadata and the original catalog setting for uninstall.

Empty, duplicate, malformed, or failed model responses do not replace the catalog. Candidates must pass the installed Codex parser before replacement. Config comments and unrelated settings are preserved. If you manually change `model_catalog_json`, subsequent background runs stop overwriting that choice; run setup again to opt back in. Uninstall restores only the managed setting and leaves backups in place.

## Development

```sh
npm ci
npm test
npm run build
npm pack --dry-run
```

Source modules separate configuration, catalog construction, synchronization, and OS scheduling. The npm package contains one bundled executable with its TOML parser and license notices; it has no install lifecycle scripts or runtime npm dependencies.
