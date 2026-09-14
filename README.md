# codex-model-sync

**One command to populate Codex's model picker from your own provider, and keep its catalog synchronized.**

The npm release is not published yet. Install from source for now:

```sh
git clone https://github.com/zjarlin/codex-model-sync.git
cd codex-model-sync
npm ci
npm run build
node dist/cli.mjs
```

Once the package is published to npm, setup will be:

```sh
npx -y codex-model-sync
```

Already configured Codex with a custom `base_url` and API key? That is all you need. This CLI reads your existing configuration, calls the provider's `/v1/models`, validates a Codex catalog, configures `model_catalog_json`, and installs a background sync every five minutes. No URL or API key needs to be copied into this tool.

## Requirements

- Node.js 20+ and an installed Codex CLI with `codex debug models` support.
- A configured OpenAI-compatible provider with a working model-list endpoint and API key.
- macOS LaunchAgents, Linux user systemd, or Windows Task Scheduler for automatic background runs. Use `watch` or `--no-service` elsewhere.

The current release is tested on macOS with Codex 0.153.4. Linux and Windows task definitions have automated tests; their actual OS schedulers have not been exercised in this release. On Windows, pass `--codex-bin` if the native `codex.exe` is not on PATH.

## Commands

The following examples use the npm package name. For a source checkout, replace
`npx -y codex-model-sync` with `node dist/cli.mjs`.

```sh
npx -y codex-model-sync                  # Set up and enable automatic synchronization
npx -y codex-model-sync sync             # Refresh once now
npx -y codex-model-sync status --json    # Inspect the last result and task configuration
npx -y codex-model-sync watch            # Keep refreshing in the foreground
npx -y codex-model-sync uninstall        # Remove the task and restore the prior catalog setting
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
