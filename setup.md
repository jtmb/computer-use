# Setup

Guided onboarding for this repository's OpenCode v2 configuration, skills, and
web search.

For the full assistant-led conversation, interactive questionnaire, Build-auto
defaults and progress reports, read [onboarding.md](onboarding.md). It separates
implemented setup commands from optional integrations still awaiting acceptance.

See [docs/features.md](docs/features.md) for a human-readable inventory of source
capabilities, prerequisites, runtime checkpoints and unfinished work.

## Quick start

From the repository root:

```sh
./scripts/onboard.sh --apply
```

That deploys the tracked global configuration and, with `--apply`, verifies web
search with one live query. Add `--with-browser` to install the Playwright MCP
dependency as well. Omit `--apply` at any time for a dry run that writes
nothing; a dry run also skips the live search unless you add `--search`.
ChatGPT is separately opt-in with `--with-chatgpt`; it is not installed or added
to source configuration by default. See [the optional workflow](#optional-chatgpt-connector).

## What setup needs

- OpenCode v2 (`opencode --version`)
- TypeScript-capable Node.js (Node 22.18+ LTS or Node 24+ LTS) for the plugin
  tests and repository health check; npm for `--with-browser`
- `gh`, only for the GitHub MCP tools
- Network access for the live search verification

The script never writes credentials. It does not authenticate GitHub, connect a
search account, or store secrets; those remain interactive actions you own.

Optional native chat-bar development has its own
[pinned dependency inventory and bootstrap limits](tools/opencode-orchestration/README.md#bootstrap-dependency-inventory).
It needs Bun1.4.2 plus the exact native CLI workspace lockfile closure; the Node
artifact/renderer route additionally needs Node26.4.0. These are not default
consumer prerequisites, and the main onboarding script does not install them,
replace the client or restart sessions automatically.

## What onboarding does

1. Confirms the CLI is OpenCode v2 and the repository layout is complete.
2. Checks the background service.
3. Only with `--with-chatgpt`, previews its source merge; on apply, installs its
   pinned dependencies and requires launcher preflight before merging source.
   A failure stops before global deployment. No account or ChatGPT tool is used.
4. Deploys `global/opencode.jsonc`, `global/cli.json`, `global/commands/`, and
    `global/agents/` with `scripts/deploy-global-config.sh`. Selected files
    are copied only after a preservation preflight: unmanaged target entries
    and symlink/hardlinked/nonregular targets refuse before backup or writes.
    Local-only/stale agents or commands require separate reconciliation; a backup
    is not deletion authority. Existing directories and unselected entries are
    left in place; there is no whole-directory deletion. A late unmanaged arrival
    is preserved and makes final verification fail rather than being deleted.
5. Optionally sets the global model.
6. Reports GitHub CLI authentication.
7. Optionally installs `tools/browser` dependencies.
8. Verifies the websearch provider list and runs one live query on `--apply`.

Deployment backs up replaced files to
`<config-dir>/backup-YYYYMMDD-HHMMSS/` before writing. Use `--strict` when a
script needs a nonzero exit code for recorded warnings.
An existing backup path, including a same-second collision or symlink, refuses
before any selected config is published; earlier rollback snapshots are not reused.

The [deployer preservation tests](scripts/deploy-global-config.test.mjs) exercise
the real script only against synthetic temporary profiles. The preflight is a
point-in-time check, not an atomic deployment transaction; concurrent target edits
and partial multi-file publication remain limitations; no automatic rollback is
provided. Do not run broad `--apply` against a customized profile or
remove a refused entry merely to make the check pass. Exact source review, scope,
deployment/retirement authority and rollback remain separate gates.

## Optional ChatGPT connector

ChatGPT is **not installed, configured or loaded by default**. Preview the opt-in:

```sh
./scripts/onboard.sh --with-chatgpt --no-search
```

Only after separate source/install/deployment approval:

```sh
./scripts/onboard.sh --with-chatgpt --apply --no-search
```

This installs the package-local locked dependencies, runs
`scripts/chatgpt-mcp.sh --verify-only`, then backs up and merges the companion
plugin/MCP entries into source before normal global deployment. Missing trusted
profile-owned Node stops the flow before any config write/deployment; dependency
installation may already have occurred. The local preflight currently fails on
that missing runtime; no fallback or runtime provisioning is automatic.

`python3 scripts/setup-chatgpt.py` is the source-only preview alternative. Its
`--apply` is guarded by preflight and adjacent backup/readback;
`--install-dependencies` additionally permits npm (requires apply). It preserves
unrelated settings and refuses conflicting ChatGPT entries, unsafe paths,
duplicate keys, concurrent edits and JSONC comments/trailing commas rather than
stripping them. Its default source target is `global/opencode.jsonc`; it cannot
directly edit deployed global config. The main onboarding opt-in uses this
default target and never silently disables existing user configuration when the
flag is omitted.

No step signs in or sends a prompt, query or image request. Actual tool use
resolves an existing OAuth connection and sends data to undocumented ChatGPT
backend routes; see [the connector privacy/provenance guide](tools/chatgpt-connector/README.md).
There is no ChatGPT-specific accompanying skill at the inspected pin, and its
private agent was not imported. [Onboarding](onboarding.md) covers user-owned
credentials, source versus deployment backups, rollback and live-test limits.

## Guided model setup

List available models:

```sh
./scripts/setup-model.sh --list
```

Choose one interactively (dry run, then apply):

```sh
./scripts/setup-model.sh
./scripts/setup-model.sh --apply
```

Or set it directly:

```sh
./scripts/setup-model.sh --model deepseek/deepseek-flash --apply
```

The script validates the ID against `opencode models`, updates only the
top-level `model` field in `global/opencode.jsonc`, supports JSONC comments,
and refuses to touch nested agent models or non-string top-level values. It
then deploys only `opencode.jsonc`, so the rest of the active config is left
alone. Use `--no-deploy` to edit the tracked file only, or `--allow-unknown`
for a custom provider that `opencode models` does not list yet.

## Web search

OpenCode v2 supports five search providers: Exa, Firecrawl, Parallel, Tavily,
and TinyFish. The deployed configuration uses:

```jsonc
"websearch": {
  "provider": "random"
}
```

`random` reuses one available provider per session and switches to another when
a provider is rate limited. To pin one provider instead, set its ID
(`exa`, `firecrawl`, `parallel`, `tavily`, or `tinyfish`).

Connect an account in the TUI with `/connect`, or export the provider key before
starting OpenCode (for example `TAVILY_API_KEY`). The `websearch` skill
documents configuration, verification, and troubleshooting in detail.

Verify search without the TUI:

```sh
opencode api get /api/websearch/provider
opencode api post /api/websearch -d '{"query":"OpenCode v2 websearch"}'
```

## Computer-use tools

OpenCode auto-loads `.opencode/plugins/computer-use/`, which registers five tool
definitions for the native GNOME desktop:

| Tool | Purpose |
|---|---|
| `desktop_screenshot` | Capture the full desktop or active window and return the image |
| `desktop_apps` | List accessible AT-SPI applications |
| `desktop_tree` | Dump one application's accessible elements |
| `desktop_find` | Locate elements by accessible name and/or role |
| `desktop_act` | Preview or apply an action, focus move, or text replacement |

`desktop_act` is a preview unless `apply: true` and `expectToken` match a fresh
preview token. `desktop_screenshot` needs the user-owned `ydotool` service and
its socket; those tools only automate the native GNOME session, not WSL.

Verify the plugin's logic without touching the desktop:

```sh
node --test .opencode/plugins/computer-use/*.test.ts
```

## Verification

### Plugin-only enhanced goal deployment

For the reviewed local enhancement, use the narrow
`scripts/deploy-goal-plugin.py` workflow rather than replacing a customized profile
with the full global template. Select explicit canonical source and active target
files; preview is the default. Applying additionally requires `--apply` and the
exact `--expected-sha256` from that preview. All unrelated JSONC settings/plugins
are preserved, with adjacent transactional backup/readback and rollback receipt.
The local package must include its root server/TUI entry files for older V2 hosts.
See the [deployment record](docs/deployments/2026-10-29-goal-plugin.md) for actual
source/target identity, acceptance, rollback and held GNOME refresh limits.

```sh
./scripts/health-check.sh             # scoped plugins, MCPs, source suites, skills
node --test scripts/health-check.test.mjs # isolated health-check regressions
opencode debug config                 # confirm model and websearch block
opencode models                       # confirm the selected model is offered
opencode api get /api/websearch/provider
opencode service status
```

The health check reads plugin state at this checkout's exact location; an
inventory for the service's default directory is not sufficient. Missing,
duplicated, or inactive required plugins fail the check even if source unit
tests pass. When the goal-docs companion source is present, its server state
and test suite are included. This does not verify a rendered TUI, screenshot
safety, or a completed live handoff; those require their separate acceptance
checks and approvals. It does not deploy, reload, or invoke the handoff RPC.

The proposed goal-handoff replacement has a separate
[cutover and live-acceptance checklist](docs/handoff-cutover.md). Source command
migration does not retire a deployed legacy command or authorize deployment.

After applying configuration, reload the TUI with `Ctrl+P`, then
`service.restart`.

## Rollback

Each deployment creates a timestamped backup directory under the active config
directory containing only the entries it replaced. To roll back, copy those
backed-up `opencode.jsonc`, `cli.json`, `commands/`, or `agents/` entries over
the active ones, then restart the service.

## Troubleshooting

- **Wrong model after setup** — rerun `./scripts/setup-model.sh --model <id> --apply`.
- **Search returns no results** — check network, run `/connect`, and confirm the
  provider list with the API command above.
- **GitHub tools fail** — run `gh auth status`; if unauthenticated, run
  `gh auth login`.
- **Browser MCP fails to start** — run
  `./scripts/onboard.sh --apply --with-browser` or
  `npm --prefix tools/browser install`.
- **Config not picked up** — reload with `Ctrl+P` > `service.restart`.

## Safety

### Auto-approve and uninterrupted goals

With **Build auto**/auto-approve selected, authorized goal work must not stop for
agent-authored clarification, confirmation, delegation opt-in or "continue?"
questions, including routine Git. The agent chooses reversible defaults or
records a blocker and continues independent work without asking. Skill text must
not add another prompt layer. See [the autonomy contract](docs/autonomous-work.md).
This instruction does not change your selected CLI permission mode, server
denials or task scope, and it does not authorize unrelated publication.

Onboarding is dry-run by default. `--apply` writes only tracked configuration
and creates a backup first. It does not commit, push, delete data, or store
credentials.

The tracked `global/cli.json` keeps `session.permissions` at `prompt`, so tool
approvals still appear in the TUI. Setting it to `autoaccept` accepts every
request automatically, including actions configured as `ask`, such as
`repo_commit` and `repo_push`; change it only in your local `cli.json` if you
intentionally want that behavior.

`deploy-global-config.sh --only NAME[,NAME]` restricts a deployment to selected
entries (`opencode.jsonc`, `cli.json`, `commands`, `agents`). `setup-model.sh`
uses this to leave agents and commands untouched.
