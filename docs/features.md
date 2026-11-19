# What is in this repository?

computer-use is the source of one OpenCode v2 plugin, the `desktop`, `web` and
`cua` tools, plus the backends it imports.
This inventory describes the **current working tree** after the 2026-11-19 split. A source file or config entry is
**not proof of deployment**, runtime discovery or live acceptance.

The pre-split inventory, with its dated runtime checkpoints and evidence, is kept
unchanged in [history/features-2026-11-19-pre-split.md](history/features-2026-11-19-pre-split.md).
Start with the [setup guide](../setup.md) and the [plugin reference](../.opencode/plugins/computer-use/README.md).

## What this repository adds beyond base OpenCode v2

| Area | Base OpenCode v2 already provides | This repository adds |
| --- | --- | --- |
| Extensibility and instructions | Configurable MCP servers, skill discovery/loading, commands, and plugin loading ([plugins](https://opencode.ai/v2/docs/plugins/), [skills](https://opencode.ai/v2/docs/skills/)). | One plugin package and a curated set of local skill bundles ([skill catalog](../.opencode/skills/README.md)). They use OpenCode's native loaders, not new loader mechanisms. |
| Desktop and windows | The plugin API can add tools ([plugin guide](https://opencode.ai/v2/docs/build/plugins/)); it does not ship this GNOME adapter. | Typed GNOME AT-SPI inspection/actions in the [computer-use plugin](../.opencode/plugins/computer-use/) and [Python bridge](../scripts/desktop-control.py), plus the optional [GNOME Shell window bridge](../tools/gnome-window-control/). These are OS-specific integrations, not a claim that no other OpenCode extension can do computer use. |
| Browser | OpenCode has its own browser surface and can connect browser MCP servers ([MCP](https://opencode.ai/v2/docs/mcp-servers/)). | A session-isolated Playwright backend exposed as this plugin's `web` tools, not as an MCP server. |

The absence of a capability from a docs page is not proof that no upstream or
third-party implementation exists.

## Reading the status labels

- **Source present**: the file is in this checkout.
- **Configured in source**: a tracked config declares it, not that OpenCode loaded it.
- **Unverified**: no current live acceptance is established here.
- **Held / blocked**: a deferral or missing prerequisite prevents treating it as usable.

## The plugin

[`.opencode/plugins/computer-use/`](../.opencode/plugins/computer-use/) ([guide](../.opencode/plugins/computer-use/README.md))
registers three namespaces. OpenCode loads it automatically for sessions in this checkout.

| Namespace | Tools |
| --- | --- |
| `desktop` | `desktop_apps`, `desktop_tree`, `desktop_find`, `desktop_act`, `desktop_screenshot`, `desktop_windows`, `desktop_window_act`, `desktop_layout`, plus capture, input, release and launch |
| `web` | open, tabs, navigate, snapshot, act, screenshot, signin, close |
| `cua` | `js` (persistent JavaScript cell over `desktop`/`web`) and `reset` |

Mutations are preview-first and need a fresh token. A worker thread or `vm`
context is not a security sandbox. Live desktop and browser acceptance is
machine-specific and **Unverified** on any other machine; the dated checkpoints are in the history file.

## Backend packages

| Package | Role |
| --- | --- |
| [Browser backend](../tools/computer-use-browser/) ([README](../tools/computer-use-browser/README.md)) | One supervised Playwright worker per session, `0700` profiles, generation-bound refs, sandbox and TLS validation kept on. Needs `npm --prefix tools/computer-use-browser ci --omit=dev --ignore-scripts`. |
| [Shared runtime contract](../tools/computer-use-runtime/) ([README](../tools/computer-use-runtime/README.md)) | Dependency-free TypeScript contracts shared by the desktop and browser surfaces. |

## GNOME window-control bridge

Optional Shell extension for GNOME Shell 50. It is **not installed or enabled**
because these files exist; see [setup](../setup.md#optional-gnome-window-control-bridge).

| File | Purpose |
| --- | --- |
| [`README.md`](../tools/gnome-window-control/README.md) | Guide: supported GNOME Shell 50, protocol and limits. |
| [`RESTORE.md`](../tools/gnome-window-control/RESTORE.md) | Installed-byte restore procedure. |
| [`acceptance-preflight.mjs`](../tools/gnome-window-control/acceptance-preflight.mjs) | Preflight for live bridge acceptance. |
| [`acceptance-preflight.test.mjs`](../tools/gnome-window-control/acceptance-preflight.test.mjs) | Tests the acceptance preflight. |
| [`bridge-protocol-acceptance.py`](../tools/gnome-window-control/bridge-protocol-acceptance.py) | Live: chunked capture transport acceptance. |
| [`capture-gjs-acceptance.mjs`](../tools/gnome-window-control/capture-gjs-acceptance.mjs) | Live: capture under real GJS with a fake Shell. |
| [`capture.mjs`](../tools/gnome-window-control/capture.mjs) | Chunked screen and window capture. |
| [`capture.test.mjs`](../tools/gnome-window-control/capture.test.mjs) | Capture tests. |
| [`desktop-workflow-acceptance.py`](../tools/gnome-window-control/desktop-workflow-acceptance.py) | Live, consequential: visible desktop workflow acceptance. |
| [`extension.js`](../tools/gnome-window-control/extension.js) | Shell extension entry: window listing, focus and layout. |
| [`fresh-shell-acceptance.sh`](../tools/gnome-window-control/fresh-shell-acceptance.sh) | Live: fresh-Shell desktop acceptance. |
| [`fresh-shell-acceptance.test.mjs`](../tools/gnome-window-control/fresh-shell-acceptance.test.mjs) | Contracts for the fresh-Shell acceptance script. |
| [`input-launch-gjs-smoke.mjs`](../tools/gnome-window-control/input-launch-gjs-smoke.mjs) | Live: constructs input and launch controllers under GJS. |
| [`input-zero-duration.test.mjs`](../tools/gnome-window-control/input-zero-duration.test.mjs) | Zero-duration click dispatch tests with fake devices. |
| [`input.mjs`](../tools/gnome-window-control/input.mjs) | Virtual pointer and keyboard input. |
| [`input.test.mjs`](../tools/gnome-window-control/input.test.mjs) | Input tests. |
| [`keymap-fixture.mjs`](../tools/gnome-window-control/keymap-fixture.mjs) | Exercises the real Shell key adapter in tests. |
| [`keymap.test.mjs`](../tools/gnome-window-control/keymap.test.mjs) | Keymap tests. |
| [`launch.mjs`](../tools/gnome-window-control/launch.mjs) | Application launch with a valid activation timestamp. |
| [`launch.test.mjs`](../tools/gnome-window-control/launch.test.mjs) | Launch tests. |
| [`live-capture-check.py`](../tools/gnome-window-control/live-capture-check.py) | Live: read-only capture path check. |
| [`metadata.json`](../tools/gnome-window-control/metadata.json) | Extension metadata (UUID `opencode-window-control@computer-use.local`). |
| [`owned-process.py`](../tools/gnome-window-control/owned-process.py) | Supervises one forked child through a pidfd. |
| [`policy.mjs`](../tools/gnome-window-control/policy.mjs) | Single-use token and request policy. |
| [`private-bus-fixture.py`](../tools/gnome-window-control/private-bus-fixture.py) | Private test bus exposing one harmless method. |
| [`rollback-acceptance.sh`](../tools/gnome-window-control/rollback-acceptance.sh) | Rehearses deployment rollback in a throwaway target. |
| [`runtime-contract.mjs`](../tools/gnome-window-control/runtime-contract.mjs) | Shim to the shared contract in `tools/computer-use-runtime`. |
| [`test_desktop_workflow_acceptance.py`](../tools/gnome-window-control/test_desktop_workflow_acceptance.py) | Tests launch-target selection and workflow cleanup. |
| [`test_owned_process.py`](../tools/gnome-window-control/test_owned_process.py) | Tests owned-process supervision with disposable children. |

## Configuration and commands

- [Project config](../opencode.json) sets instructions and the skill path. It
  registers no MCP servers and no extra plugins.
- [`global/`](../global/) is a personal config template awaiting its own cleanup
  pass (**Held / blocked**): [opencode.jsonc](../global/opencode.jsonc) still names
  plugins and launchers that moved out, so do not invoke or deploy it as-is.
  [cli.json](../global/cli.json) keeps tool approvals at `prompt`.
- Command templates: [`/checkout`](../global/commands/checkout.md), [`/document-code`](../global/commands/document-code.md), [`/handoff_resume`](../global/commands/handoff_resume.md), [`/promote-skills`](../global/commands/promote-skills.md),
  and the project command [`/document-code`](../.opencode/commands/document-code.md).

## All 34 shared skills

The skills stay here for now; each guide lists its own prerequisites.

| Skill | Purpose |
| --- | --- |
| [`agent-orchestration`](../.opencode/skills/agent-orchestration/README.md) | Coordinate authorized background subagents and successor handoffs while preserving parent ownership, independent verification, and separate commit and push approvals. |
| [`agents-authoring`](../.opencode/skills/agents-authoring/README.md) | Design, review and maintain concise AGENTS.md instruction architecture, policy ownership and selective context routing. |
| [`app-setup`](../.opencode/skills/app-setup/README.md) | Install, configure, update, verify, and safely remove desktop or CLI applications on Ubuntu. |
| [`blender`](../.opencode/skills/blender/README.md) | Operate the installed Blender version for safe scene inspection, scripted edits, versioned saves, rendering, and import or export verification. |
| [`browser-assistant`](../.opencode/skills/browser-assistant/README.md) | Interact with a user's visible browser through an authorized, supported browser integration. |
| [`browser-headless`](../.opencode/skills/browser-headless/README.md) | Run isolated browser tasks without a visible window using an explicitly requested, available headless browser runtime. |
| [`chatgpt-images`](../.opencode/skills/chatgpt-images/README.md) | Generate images through an available ChatGPT connector, return the actual image in the conversation, inspect the result, and use the generated asset. |
| [`cross-session-coordination`](../.opencode/skills/cross-session-coordination/README.md) | Coordinate existing OpenCode chats, inspect remaining goals, switch selected sessions to a user-requested model, and resume authorized work while preserving the requesting chat. |
| [`desktop-control`](../.opencode/skills/desktop-control/README.md) | Inspect and operate desktop applications through an authorized accessibility integration, using visual verification when safely available. |
| [`desktop-vision`](../.opencode/skills/desktop-vision/README.md) | Inspect desktop appearance through a supported, authorized visual-capture integration. |
| [`development-conventions`](../.opencode/skills/development-conventions/README.md) | Apply action-oriented conventions for source code, tests, documentation, APIs, Next.js, Python, Go/Rust, regex, Mermaid, gitignore, web/UI, and OpenCode v2 operations. |
| [`email-operations`](../.opencode/skills/email-operations/README.md) | Draft, review and (only after explicit approval) send Gmail messages through the user's visible Chrome profile, including inline visuals and zip attachments. |
| [`fanduel-parlay-research`](../.opencode/skills/fanduel-parlay-research/README.md) | Research FanDuel NHL and NBA game lines and player props, compare them with injuries, goalies, and team stats, and build a payout-versus-probability parlay with prices verified in the betslip when the user's eligible session permits. |
| [`files-and-documents`](../.opencode/skills/files-and-documents/README.md) | Find, inspect, organize, rename, summarize, and export local files and documents while preserving originals. |
| [`game-playtest`](../.opencode/skills/game-playtest/README.md) | Playtest browser games with accessibility-first inspection, bounded input, mandatory canvas or WebGL screenshots, representative state coverage, console review, responsive checks, and severity-ordered findings. |
| [`github-operations`](../.opencode/skills/github-operations/README.md) | Inspect GitHub repositories, code, issues, pull requests, checks, and releases, and perform explicitly approved remote changes. |
| [`goal-usage`](../.opencode/skills/goal-usage/README.md) | Use OpenCode goals correctly, including when a token budget, duration limit or auto-continue cap may be set. |
| [`handoff`](../.opencode/skills/handoff/README.md) | Immediately transfer current work to a user-named OpenCode chat, or refresh a source-qualified HANDOFF.md for later continuation. |
| [`opencode-db-maintenance`](../.opencode/skills/opencode-db-maintenance/README.md) | Diagnose and reclaim opencode.db SQLite disk usage when the database fills the disk (event-table bloat, freelist pages, VACUUM, prune); back up chats to opencode-backups and manage the weekly maintenance cron job. |
| [`personality`](../.opencode/skills/personality/README.md) | Check, choose, or save the assistant's response style. |
| [`personality-plain-english`](../.opencode/skills/personality-plain-english/README.md) | Explain in plain English as if the reader knows nothing about technology. |
| [`planning`](../.opencode/skills/planning/README.md) | Create clear, evidence-based plans for tasks, feature work, and architecture changes. |
| [`readme-gif`](../.opencode/skills/readme-gif/README.md) | Create and verify animated GIF demos for READMEs using real application workflows, isolated sample data, evidence-backed captions, and readable encoding. |
| [`readme-maintenance`](../.opencode/skills/readme-maintenance/README.md) | Maintain a project's README against verified source and project conventions while preserving its established identity. |
| [`repo-onboarding`](../.opencode/skills/repo-onboarding/README.md) | Onboard a consumer repository to OpenCode v2 by inspecting its actual configuration, available integrations, permissions, and supported deployment workflow. |
| [`routine-automation`](../.opencode/skills/routine-automation/README.md) | Turn a confirmed recurring computer task into an idempotent script and optional schedule with logs, locking, dry-run behavior, verification, and rollback. |
| [`self-learning`](../.opencode/skills/self-learning/README.md) | Review recurring project-session evidence and propose safe, evidence-backed improvements to reusable skills. |
| [`session-context`](../.opencode/skills/session-context/README.md) | Retrieve bounded, read-only context from other OpenCode sessions in the current project. |
| [`skill-maintenance`](../.opencode/skills/skill-maintenance/README.md) | Create, update, audit, catalog, deploy, rename, or retire OpenCode skills in a consumer project. |
| [`system-troubleshooting`](../.opencode/skills/system-troubleshooting/README.md) | Diagnose Ubuntu desktop problems such as slowness, crashes, failed services, audio, networking, storage, permissions, and application launch failures. |
| [`task-memory`](../.opencode/skills/task-memory/README.md) | Save and retrieve concise Markdown memories in the active repository, or explicitly scoped global OpenCode memory, using targeted metadata-aware retrieval. |
| [`vscode-management`](../.opencode/skills/vscode-management/README.md) | Install, update, configure, operate, test with the integrated browser, and troubleshoot Microsoft Visual Studio Code using the target platform's supported workflow. |
| [`web-3d-asset-pipeline`](../.opencode/skills/web-3d-asset-pipeline/README.md) | Prepare and verify runtime-ready 3D assets for browser projects, including pivots, units, transforms, hierarchy, naming, materials, textures, GLB export, clean reimport, optional approved compression, and browser load checks. |
| [`websearch`](../.opencode/skills/websearch/README.md) | Configure, verify, and troubleshoot the web-search providers available to the active OpenCode runtime, and use exposed search/fetch tools for current-information research. |

## Script inventory

| Script | Purpose |
| --- | --- |
| [`accessibility_bus.py`](../scripts/accessibility_bus.py) | Binds one helper process to the authenticated same-user AT-SPI bus address. |
| [`assistant-memory.py`](../scripts/assistant-memory.py) | Legacy JSON memory CLI; needs an explicit repository path. |
| [`autonomy-contract.test.mjs`](../scripts/autonomy-contract.test.mjs) | Source contract for Build-auto no-question guidance. |
| [`browser-auth-dialog.py`](../scripts/browser-auth-dialog.py) | Masked GTK dialog that returns one secret over fd 3 for `web.signin`. |
| [`checkout-command.test.mjs`](../scripts/checkout-command.test.mjs) | Contract for the `/checkout` command prompt. |
| [`checkout-preflight.mjs`](../scripts/checkout-preflight.mjs) | Read-only Git preflight used by `/checkout`. |
| [`checkout-preflight.test.mjs`](../scripts/checkout-preflight.test.mjs) | Isolated-Git tests for the checkout preflight. |
| [`ci-offline.mjs`](../scripts/ci-offline.mjs) | Credential-free offline check runner that CI uses. |
| [`ci-offline.test.mjs`](../scripts/ci-offline.test.mjs) | Keeps required offline CI steps from being dropped. |
| [`codeowners-contract.test.mjs`](../scripts/codeowners-contract.test.mjs) | Checks CODEOWNERS routing for protected paths. |
| [`credential-hygiene.test.mjs`](../scripts/credential-hygiene.test.mjs) | Audits this repository's scripts and config for credential material. |
| [`decision-memory-contract.test.mjs`](../scripts/decision-memory-contract.test.mjs) | Source contract for durable decision notes. |
| [`delivery-preservation.py`](../scripts/delivery-preservation.py) | Read-only Git preservation and archive audits. |
| [`delivery-preservation.test.py`](../scripts/delivery-preservation.test.py) | Disposable-Git tests for delivery preservation. |
| [`demo-preflight-test.py`](../scripts/demo-preflight-test.py) | Tests for demo preflight without opening apps. |
| [`demo-preflight.py`](../scripts/demo-preflight.py) | Validates demo staging inputs before a capture. |
| [`deploy-window-control.py`](../scripts/deploy-window-control.py) | Previews or copies the GNOME bridge bundle; never enables or restarts it. |
| [`desktop-control.py`](../scripts/desktop-control.py) | AT-SPI inspection and control behind the `desktop` tools. |
| [`desktop-windows.py`](../scripts/desktop-windows.py) | Client for the separately enabled GNOME window bridge. |
| [`document-metadata-contract.test.mjs`](../scripts/document-metadata-contract.test.mjs) | Protects the dated document-metadata record. |
| [`document-security-contract.test.mjs`](../scripts/document-security-contract.test.mjs) | Protects the dated document-security observation. |
| [`document_authoring_preflight.py`](../scripts/document_authoring_preflight.py) | Read-only preflight for the document-authoring Python stack. |
| [`document_metadata.py`](../scripts/document_metadata.py) | Bounded exact-version PyPI metadata reader. |
| [`document_sandbox_probe.py`](../scripts/document_sandbox_probe.py) | Fixed document-isolation controls. |
| [`documentation-portability.test.mjs`](../scripts/documentation-portability.test.mjs) | Keeps shared skill guidance generic. |
| [`features-contract.test.mjs`](../scripts/features-contract.test.mjs) | Keeps this inventory complete and its links valid. |
| [`github-permissions.test.mjs`](../scripts/github-permissions.test.mjs) | Checks reviewed GitHub tool permissions in `global/`. |
| [`goal-workflow.test.mjs`](../scripts/goal-workflow.test.mjs) | Source contract for goal-workflow guidance. |
| [`handoff-resume-contract.test.mjs`](../scripts/handoff-resume-contract.test.mjs) | Source contract for `/handoff_resume`. |
| [`health-check.sh`](../scripts/health-check.sh) | Live check of the OpenCode service, active plugin, skills and source tests. |
| [`health-check.test.mjs`](../scripts/health-check.test.mjs) | Fake-command regressions for the health check. |
| [`instruction-architecture.test.mjs`](../scripts/instruction-architecture.test.mjs) | Source contract for the AGENTS instruction layout. |
| [`local-artifact-guidance.test.mjs`](../scripts/local-artifact-guidance.test.mjs) | Source contract for local artifact and image guidance. |
| [`local-doc-viewer.py`](../scripts/local-doc-viewer.py) | Short-lived loopback view of selected local documents. |
| [`office_package.py`](../scripts/office_package.py) | Bounded Office ZIP metadata inspection. |
| [`opencode-chat-backup.py`](../scripts/opencode-chat-backup.py) | Exports OpenCode chats to JSON. |
| [`opencode-db-maintain.py`](../scripts/opencode-db-maintain.py) | Safe maintenance for OpenCode's SQLite store. |
| [`opencode-maintenance-cron.sh`](../scripts/opencode-maintenance-cron.sh) | Weekly backup-then-maintenance wrapper. |
| [`orchestration-methods.test.mjs`](../scripts/orchestration-methods.test.mjs) | Source contract for orchestration guidance. |
| [`personality-skills-contract.test.mjs`](../scripts/personality-skills-contract.test.mjs) | Checks the personality skills and their AGENTS routing. |
| [`planning-contract.test.mjs`](../scripts/planning-contract.test.mjs) | Source contract for planning guidance. |
| [`private-secret-stage.py`](../scripts/private-secret-stage.py) | Stages one user-entered secret in a private file. |
| [`repo-memory.test.mjs`](../scripts/repo-memory.test.mjs) | Source contract for repository memory notes. |
| [`restore-window-control.py`](../scripts/restore-window-control.py) | Previews an installed-byte restore of the GNOME bridge. |
| [`run-plugin-suites.mjs`](../scripts/run-plugin-suites.mjs) | Runs the plugin, browser, runtime and bridge test suites. |
| [`self-learning-skill-contract.test.mjs`](../scripts/self-learning-skill-contract.test.mjs) | Checks the self-learning skill's approval rules. |
| [`shared-skill-portability.test.mjs`](../scripts/shared-skill-portability.test.mjs) | Checks skill bundle links and catalog metadata. |
| [`test_accessibility_bus.py`](../scripts/test_accessibility_bus.py) | Tests the accessibility bus binding offline. |
| [`test_deploy_window_control.py`](../scripts/test_deploy_window_control.py) | Tests bridge deployment in scratch directories. |
| [`test_desktop_control_identity.py`](../scripts/test_desktop_control_identity.py) | Tests AT-SPI process identity offline. |
| [`test_desktop_windows.py`](../scripts/test_desktop_windows.py) | Tests the window-bridge client boundary offline. |
| [`test_document_authoring_preflight.py`](../scripts/test_document_authoring_preflight.py) | Tests the document dependency preflight. |
| [`test_document_metadata.py`](../scripts/test_document_metadata.py) | Offline tests for PyPI metadata acquisition. |
| [`test_document_sandbox_probe.py`](../scripts/test_document_sandbox_probe.py) | Tests document-isolation receipts. |
| [`test_local_doc_viewer.py`](../scripts/test_local_doc_viewer.py) | Tests the loopback document viewer. |
| [`test_memory_retirement.py`](../scripts/test_memory_retirement.py) | Tests the legacy memory CLI's storage boundaries. |
| [`test_office_package.py`](../scripts/test_office_package.py) | Tests Office ZIP inspection. |
| [`test_private_secret_stage.py`](../scripts/test_private_secret_stage.py) | Tests the private secret staging flow. |
| [`test_restore_window_control.py`](../scripts/test_restore_window_control.py) | Tests the GNOME bridge restore. |
| [`verification-receipt.mjs`](../scripts/verification-receipt.mjs) | Emits a dated verification receipt for the checkout. |
| [`verification-receipt.test.mjs`](../scripts/verification-receipt.test.mjs) | Tests the verification receipt. |
| [`window_control_lock.py`](../scripts/window_control_lock.py) | Cooperative kernel lock for one extension target. |

## Demo tooling

Recording and editing helpers for the README demo, documented in the
[demo guide](demo/README.md): `demo/encode-showcase.py`, `demo/motion_edit.py`, `demo/native_capture.py`, `demo/record.py`, `demo/test_motion_edit.py`, `demo/test_native_capture.py`, `demo/test_record.py`, `demo/test_showcase.py`.

## Moved out on 2026-11-19

| What | Now |
| --- | --- |
| goal-docs, copy-session-id, personality, self-learning, chatgpt, provider-fallback, resource-monitor, tailscale (with `/tailscale-web`) | Own repositories under `~/repos/plugins/` |
| memory tool | Archived, `~/repos/plugins/archive/memory`; do not install |
| GitHub and Playwright MCP launchers | `~/repos/veyra-monorepo/mcp-servers/` |
| Deploy/onboarding scripts, voice-assistant submodule, OpenCode source patches, retired inbox, request-coverage audit | Removed; Git tag `pre-split` |

Nothing was installed or registered by the move.

## Keeping this inventory accurate

Update this file when a script, tool file, skill or command is added or removed;
[the features contract](../scripts/features-contract.test.mjs) fails otherwise.
Record live observations with a date, and keep source presence separate from
runtime acceptance.
