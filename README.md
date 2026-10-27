# computer-use

OpenCode project configuration with the computer-use skill bundles, the goal
plugin, and repo-local GitHub and Playwright MCP launchers.

Full setup, model selection, web search, verification, and rollback are in
[setup.md](setup.md). Run the guided onboarding with:

```sh
./scripts/onboard.sh --apply
```

Install the Playwright MCP dependency with:

```sh
npm --prefix tools/browser install
```

GitHub authentication comes from the existing `gh` login. No token is stored
in this repository.

## Global config

`global/` tracks the active OpenCode config directory reported by
`opencode debug paths`:

```text
global/opencode.jsonc
global/cli.json
global/commands/
global/agents/
```

Credentials and generated runtime files are never tracked. The global
`skills/` directory is managed separately and is not deployed by this script.

Preview a deployment (the default) or apply it:

```sh
./scripts/deploy-global-config.sh
./scripts/deploy-global-config.sh --apply
```

The script validates the tracked JSON, refuses symlinked paths, backs up any
replaced files to `<target>/backup-YYYYMMDD-HHMMSS/`, and verifies the copy.
The target defaults to `$OPENCODE_GLOBAL_CONFIG_DIR`, then
`$OPENCODE_V2_CONFIG_DIR`, then `$OPENCODE_V2_PILOT_DIR/config`, then the
`config` path reported by `opencode debug paths`, then
`~/.opencode-v2-pilot/config`; `--config-dir DIR` overrides all of them.

Use `--only opencode.jsonc` (or a comma-separated list of entries) to deploy a
single tracked file without replacing `cli.json`, `commands/`, or `agents/`.

After applying, restart OpenCode from the TUI: press `Ctrl+P`, type
`service.restart`, and press `Enter`. The same flow is available as the
`/deploy-global` command.

## Session handoff

- The cluster handoff and CVE/backup plan live with the audit evidence at
  `/home/shak/audits/k8s-cve-20261026T225036Z/`.
- The global `handoff` skill in `.opencode/skills/handoff/` refreshes the
  `HANDOFF.md` in whichever directory the work lives, without committing or
  pushing.
- Run this repository's read-only check with `./scripts/health-check.sh`.
