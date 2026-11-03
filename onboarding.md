# LLM-assisted onboarding

Use this guide when an assistant has this repository checked out and terminal
access. It describes the user-visible conversation and the real workflow in
[`scripts/onboard.sh`](scripts/onboard.sh),
[`scripts/deploy-global-config.sh`](scripts/deploy-global-config.sh),
[`scripts/setup-model.sh`](scripts/setup-model.sh), and the optional
[`scripts/setup-chatgpt.py`](scripts/setup-chatgpt.py). It is a workflow guide, not
a claim that setup has run on a particular machine. The assistant must inspect
the current checkout and report observed results rather than inventing them.

For prerequisites, detailed setup notes, and troubleshooting, see
[`setup.md`](setup.md). Follow [`AGENTS.md`](AGENTS.md) and preserve local work.

## What the assistant says first

Start with a short explanation like this, adapted to the request:

> I’ll inspect this checkout’s setup instructions, scripts, and target paths,
> then run a read-only preview first. I’ll show what would change before any
> write or install. I won’t sign you in or ask you to paste passwords, API keys,
> or tokens; you handle account authentication locally. The browser dependency
> and the other optional integrations stay off unless they are implemented and
> you select them.

This is a wording example, not a transcript or a promise that a check passed.

## Interactive mode: one compact questionnaire

Ask only for preferences or essential paths that are genuinely unknown. Put the
unresolved items in one compact message; do not repeat the questionnaire at
every phase or turn. These are examples for an **interactive** conversation,
not mandatory prompts for every setup.

| Topic | Ask only if needed | Reversible default when unanswered |
| --- | --- | --- |
| Scope | “Do you want the tracked global config, only a subset, or just the repository-local setup?” | Preview the tracked global bundle without writing. `onboard.sh --apply` deploys the full bundle; a narrower global scope uses the deployer’s `--only` option. |
| Paths | “Should I use the current checkout and the active OpenCode v2 config directory shown in the preview?” | Use the verified checkout and the deployer’s resolved target. Do not assume a home-directory path; show the actual source and target first. |
| Model | “Keep the configured model, or select one from `opencode models`?” | Keep the tracked top-level model unchanged. Do not change nested agent models. |
| Browser dependency | “Should I install the optional Playwright MCP package?” | No install. `--with-browser` is opt-in and only installs when combined with `--apply`. |
| ChatGPT connector | “Enable the optional OAuth-backed ChatGPT connector, knowing prompts/queries leave this machine on use?” | No install or configuration change. `--with-chatgpt` previews it; only an approved `--apply` installs/configures it before deployment. Existing settings are not silently removed. |
| UI integrations | “Add the reviewed fallback status and CPU/RAM displays?” | Leave off unless selected. They require an additive configuration preview; the main onboarding script does not configure them. See [Remaining optional runtime work](#remaining-optional-runtime-work). |

If the user chooses a custom provider or needs sign-in, explain the local
OpenCode/provider flow (for example, `/connect` in the TUI or a provider's
locally configured environment) and let them perform it themselves. If they
want GitHub MCP, only they run `gh auth login` in their terminal. Never request
a credential in chat, a file, or a command-line argument.

## Build auto: continue without live questions

With **Build auto** or another no-question mode, do not present the questionnaire
or interrupt the work with agent-authored confirmation, preference, or
“continue?” prompts. Use the defaults above, check existing authority, and run
independent read-only checks. A user request to set up the repository is not
blanket permission to install packages, change security settings, or broaden the
scope. If a write or install lacks the required authority, leave it unapplied,
state the concrete blocker, and continue independent verification. Do not
change the selected permission mode or enable blanket autoaccept.

## Ordered workflow and user updates

### 1. Inspect the checkout and prerequisites

Read the repository instructions and the actual setup scripts/configuration
before choosing commands. The quick preflight is:

```sh
./scripts/onboard.sh
```

This is a dry run by default. It checks for OpenCode v2 and required source
layout, checks the service (an unhealthy service is reported as a warning), and
previews deployment. A working service is needed for model listing and live
search. The script also reports whether `gh` is installed/authenticated; it
doesn’t authenticate GitHub. Python 3 is used by the setup scripts. Node.js is
needed for the TypeScript-capable plugin tests and health check; npm is needed
if optional browser or ChatGPT dependencies are selected. Network access is needed
for the live search check.

**Update to the user:** report actual version, service state, missing
prerequisites, and warnings. Do not describe a warning as a successful check.

### 2. Preview source, target, and scope

The deployer prints the tracked source and resolved target, validates the
tracked files, and labels each selected entry `update` or `unchanged`. Without
`--apply`, it writes nothing. With the default `onboard.sh` scope, the entries
are `opencode.jsonc`, `cli.json`, `commands/`, and `agents/`. Review
[`global/opencode.jsonc`](global/opencode.jsonc) and
[`global/cli.json`](global/cli.json): these are personal configuration templates
and may include model/provider paths and permission policy, not universal
defaults.

When no explicit target option is passed, the deployer resolves the target in
this order: `OPENCODE_GLOBAL_CONFIG_DIR`, `OPENCODE_V2_CONFIG_DIR`,
`OPENCODE_V2_PILOT_DIR/config`, the `config` path from `opencode debug paths`,
then `$HOME/.opencode-v2-pilot/config`. `onboard.sh` calls the deployer without
arguments, so its preview is the source of truth for the resolved target. The
deployer also supports `--config-dir DIR` and `--only
opencode.jsonc,cli.json,commands,agents`; use the exact reviewed target and
selected entries for both preview and apply. `onboard.sh` itself has no
target-directory or scope flag.

If a model was selected, its preview identifies the config file and proposed
top-level model. `setup-model.sh` validates model IDs against `opencode models`
by default and changes only the top-level `model` key. A selected provider may
still need a sign-in that only the user performs. Before a model apply, inspect
the checkout status and `global/opencode.jsonc`: `setup-model.sh --apply` edits
that tracked source file and then deploys it. Preserve any existing local edits;
the dry run does not write the file.

**Update to the user:** summarize the observed source, target, selected entries,
model change (if any), and warnings. Clearly say that this is still a preview.

### 3. Respect the apply boundary

In interactive mode, show the preview and obtain the user’s explicit approval
before configuration writes or dependency installation. In particular, full
deployment replaces the target `commands/` and `agents/` directories with the
tracked versions after backing up existing selected entries. It also replaces
selected config files. The global templates include permission settings, so
review them rather than silently changing security behavior. Adding
`--with-browser` to an apply run invokes `npm --prefix tools/browser install`.

Applying the normal onboarding script also performs a live web-search query,
unless `--no-search` is supplied. Disclose that network check before applying;
use `--no-search` when it is not wanted. Neither onboarding nor deployment
signs into OpenCode, GitHub, or a provider, stores credentials, commits, or
pushes. Because selected config files include OpenCode permission policy,
review those files before applying; the scripts do not change account settings
or host security controls. Do not restart the service on the user’s behalf;
after review, the user can reload the TUI with **Ctrl+P → `service.restart`**.

**Update before apply:** state exactly which config entries, target, model, and
optional package/network check will be involved. Do not imply that approval of
one item approves another.

### 4. Apply only the reviewed scope

For the full tracked global bundle, the supported command is:

```sh
./scripts/onboard.sh --apply
```

Use only options the user selected, for example `--model provider/model`,
`--with-browser`, or `--no-search`. For a narrower target or subset, use
`deploy-global-config.sh` with the reviewed `--config-dir` and `--only` values;
that script’s preview is also the apply plan. Do not describe those narrower
options as `onboard.sh` flags. Model-only selection is also available with
`setup-model.sh --model provider/model`; its apply changes and deploys only the
top-level model file. That apply also edits the tracked
`global/opencode.jsonc` source, so inspect and preserve its existing work first.

For an explicitly selected ChatGPT connector, preview without installation or
runtime/account access:

```sh
./scripts/onboard.sh --with-chatgpt --no-search
```

The ChatGPT helper previews its source merge **before** global deployment. The
source target is the verified checkout's `global/opencode.jsonc`, not deployed
configuration. The package-directory `file:` URI resolves the companion plugin's
`./server` export; the MCP entry uses the actual checkout's absolute launcher
path. Unrelated plugins, MCPs, models and permissions are preserved by this merge;
conflicting existing ChatGPT entries are refused instead of overwritten.

After exact source/install/deployment approval, the corresponding command is:

```sh
./scripts/onboard.sh --with-chatgpt --apply --no-search
```

It runs package-local `npm ci --ignore-scripts --no-audit --no-fund`, then the
launcher's `--verify-only`. If the pinned runtime/dependencies are unavailable,
onboarding stops **before source-config writes or global deployment**. npm may
already have changed package-local dependencies; report that partial result.
Successful preflight backs up/atomically merges/readbacks the source config,
then the normal deployer backs up and deploys the global bundle. Neither check
authenticates, reads provider OAuth, sends ChatGPT requests or generates images.
An already canonical source merge is not rewritten; omitting the opt-in does not
remove an integration the user previously configured.

For a narrower source-only workflow, `python3 scripts/setup-chatgpt.py` previews;
its `--apply` applies after preflight, and `--install-dependencies` additionally
permits the package install (requires apply). Its optional `--config FILE` is
restricted to this checkout or `/tmp/opencode/testfixtures`, never a deployed
global config target. It accepts **strict JSON only** and refuses comments,
trailing commas, duplicates, unsafe paths and concurrent edits rather than
stripping or overwriting them. Main onboarding always uses the default source
target; do not invent a main-script config-target flag.

Before applying, the deployer creates a timestamped `backup-YYYYMMDD-HHMMSS/`
under the target and copies existing selected entries there. It then copies the
selected tracked source and verifies the result with a comparison. The backup
contains prior entries that existed; it is not a complete snapshot of unrelated
target files.

**Update after apply:** quote or summarize the real command result, backup path,
entries deployed, and any warnings. If a command fails partway through, report
that and inspect the target and backup before suggesting recovery.

### 5. Verify and report limits

`onboard.sh` reports whether deployment was applied, its warning count, and
whether the live search returned results (unless skipped). Then run the
read-only repository health check when its prerequisites are available:

```sh
./scripts/health-check.sh
```

It checks OpenCode v2, service status, repository-scoped plugin inventory,
connected `github` and `playwright` MCPs, the effective skill path, required
local files, and source test suites. For focused follow-up, the existing
commands include `opencode debug config`, `opencode models`,
`opencode api get /api/websearch/provider`, and `opencode service status`.
Report the actual result of each command; do not infer success from the source
existing or a unit test passing.

The health check and source tests do not prove that every skill works in a real
app, the TUI rendered every plugin, a desktop/browser action succeeded, or a
provider account is signed in. Live feature checks need their own prerequisites
and user authorization. This guide has not run setup on the reader’s machine.

**Update to the user:** list passed, failed, skipped, and blocked checks
separately; include the restart instruction and live-acceptance limits.

### 6. Roll back if needed

Use the exact backup path printed by the deployer. Restore only the selected
entries that existed before setup by copying their saved versions back to the
target, then restart OpenCode from the TUI. The scripts do not provide an
automatic rollback command. Newly created entries have no prior copy in the
backup; inspect them and the target before removing anything. If apply failed
partway, inspect the real target and backup first rather than assuming the
deployment was atomic.

The optional ChatGPT source merge prints its own adjacent
`opencode.jsonc.backup.<timestamp>.*` path. That protects the source separately
from the deployer's runtime backup. If opt-in deployment fails after source apply,
the source may already contain the new entries: inspect both backups and targets.
Restoring only runtime config leaves the source selection intact for a later
deploy. Do not delete dependency directories or change account authentication as
an inferred rollback step.

**Update to the user:** provide the observed backup path and the precise entries
it contains. Never report rollback as complete until the restored files have
been checked.

## Current command options

These are flags present in the inspected scripts, not a promise that every
combination is appropriate for a particular setup:

| Script | Supported options |
| --- | --- |
| [`onboard.sh`](scripts/onboard.sh) | `--apply`, `--model ID`, `--interactive`, `--with-browser`, `--with-chatgpt`, `--search`, `--no-search`, `--strict`, `--help` |
| [`deploy-global-config.sh`](scripts/deploy-global-config.sh) | `--apply`, `--config-dir DIR`, `--only NAME[,NAME]`, `--help` |
| [`setup-model.sh`](scripts/setup-model.sh) | `--model ID`, `--list`, `--apply`, `--config FILE`, `--no-deploy`, `--allow-unknown`, `--help` |
| [`setup-chatgpt.py`](scripts/setup-chatgpt.py) | `--config FILE`, `--apply`, `--install-dependencies`, `--help` |

## Remaining optional runtime work

The project config currently declares `github` and `playwright` MCP servers
([`opencode.json`](opencode.json)); ChatGPT is absent from the default source
configuration and selected only by the explicit workflow above. The broader
ChatGPT references in `mcp_runtime.py` alone are not a complete configured
integration. These packages have source; their default activation and live
acceptance **remain off/pending**:

- Optional ChatGPT MCP plus its directly accompanying skills from
  `jtmb/opencode-rig`: [connector guide](tools/chatgpt-connector/README.md).
  Source/typecheck/45 fixtures are accepted, including an in-memory handshake
  and abort/timeout regressions. No ChatGPT-specific skill exists at the inspected
  pin; the private agent is not imported as a skill. The launcher fails closed
  because the trusted profile-pinned Node runtime is unavailable; no real OAuth,
  service/plugin handshake, prompt/query send or image generation was tested.
- Provider-fallback status in the sidebar and CPU/RAM information at the bottom,
  while preserving the default sidebar behavior: [fallback](tools/opencode-plugins/provider-fallback/README.md)
  and [resource monitor](tools/opencode-plugins/resource-monitor/README.md).
  Corrected source/typechecks and 27+16 fixtures are accepted. They stay outside
  automatic discovery; no route, credential/quota lookup or UI loading/render
  acceptance is inferred. OpenTUI's engine prerequisites differ from the Node 22
  used for static checks; see the package guides.

Do not infer runtime availability from the install/config helper or fake
handshake. The current local ChatGPT preflight remains blocked by missing trusted
profile-owned Node; source tests do not authorize provisioning it or accepting an
unrelated runtime. Runtime deployment, account sign-in and actual message/query/
image requests require their separate authority and observed results.

The UI packages use different supported configuration surfaces: the resource
monitor is TUI-only and belongs in a selected `cli.json` `plugins` list; fallback
has server and TUI exports and belongs in the selected `opencode.json(c)`
`plugins` list. See the [official V2 plugin loading guide](https://opencode.ai/v2/docs/build/plugins/)
and [TUI loading guide](https://opencode.ai/v2/docs/build/plugins/cli/#publish-and-load).
An assistant must preview an additive merge with the actual absolute checkout
package path, preserve unrelated entries and the default sidebar, and keep
fallback `defaultChain: []`. Choosing status display does not authorize route
configuration or credential access. These are integration instructions, not a
claim this onboarding script currently configures the UI packages. Rollback
removes only the exact added entries after target/backup verification; it does
not delete packages or replace an entire user plugin list.

### Memory source checkpoint

A RAG memory tool with repository scope by default and explicit global scope
is [present in source](.opencode/plugins/memory/README.md), with 20 independently
passing fixtures and one observed current-session read-only repo list. Real-note
and global-store writes remain unverified; this is not universal runtime setup.
The existing `scripts/assistant-memory.py` is a separate explicit-path legacy
JSON utility, not this RAG tool. The [pruning policy](docs/memory/maintenance-plan.md)
is a plan, not an implemented archive operation or scheduled cleanup.

## What changed / what remains pending

The implemented path in this snapshot is preview-first global config deployment,
optional top-level model selection, optional browser dependency installation,
optional live search verification, and a read-only health check. Build auto uses
the same verified defaults without agent-authored questions; it does not grant
new write/install authority. ChatGPT has explicit default-off source setup and
isolated sequencing/merge tests; no live apply or account capability is asserted.
The two UI additions have bounded source acceptance but loading remains pending. Memory's limited
read-only checkpoint is described above. No live setup result is asserted here.
