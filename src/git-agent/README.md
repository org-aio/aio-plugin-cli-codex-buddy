# Git specialist

`profile.mjs` defines a model-neutral Git role. `../agents/install.mjs` installs its personal agent TOML and removes only unchanged managed files. `../agents/discovery.mjs` prefers existing project/personal Git roles, then the installed fallback, and excludes roles whose fixed model cannot meet the requested capability tier. Actual tool availability remains authoritative when spawning.

Fast Git keyword detection identifies a specialist, not permission to execute. `UserPromptSubmit` recommends delegating the actual Git portion with an eligible model. Conflict work stays advanced; the specialist never recursively delegates the same task to another Git agent.
