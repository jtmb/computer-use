# Onboarding verification — 2026-11-04

Scope: canonical onboarding source and a disposable OpenCode **2.1.1** service.
No production-profile deployment or shared-service restart was performed for this
goal. Initial verification covered server loading; the CLI follow-up below adds
real goal TUI startup. Physical audio, model behavior and authenticated account
acceptance remain separate.

## Corrections

- Render both server and CLI paths for the actual checkout, including skills,
  MCP wrappers and the sibling/explicit goal-plugin directory. Fixed two stale
  `/home/shak` wrapper paths in the template. Preview renders in memory.
- Required plugin paths, runtime package entries and a compatible browser are
  checked before apply publishes configuration. ESM-only client exports are not
  mistaken for absent packages. Missing components produce actionable errors.
- Added explicit target and dependency provisioning options. Browser/backend and
  self-learning installs use lockfiles; optional GitHub provisioning retains the
  existing checksum/version guard. No sign-in is automated.
- Model selection precedes one deployment, avoiding a second same-second backup.
- Both Playwright launchers support PATH Node in a fresh home. Detection uses the
  actual installed binary or this pinned Playwright version's cached build,
  rather than accepting an unrelated cached revision.

## Accepted isolated run

Command:

```sh
node scripts/verify-onboarding.mjs --opencode /home/james/.local/opt/opencode-v2/opencode --with-github
```

Receipt: `/tmp/opencode/onboarding-isolated-7Fr87q/receipt.json`, started at
`2026-11-04T22:39:21.691Z`. Scratch is disposable; the following results are
retained here so correctness does not depend on keeping it forever.

- HOME, config, data, cache, state and database all resolved inside that scratch
  root. The project was empty and outside this checkout; only private config
  sources were loaded. A raw executable was used, not the installed pilot shim.
- Seven server plugins were individually present once and active: goal mode,
  personality, desktop/browser, goal-docs, memory, self-learning and ChatGPT direct.
- All 34 repository skills and key commands (`goal`, `pause_goal`, `resume_goal`,
  `checkout`, `deploy`, `document-code`, `handoff_resume`, `promote-skills`) loaded.
- A read-only test observer inspected the real host registry, including
  `get_goal`, `create_goal`, `update_goal_plan`, `memory`, `personality`,
  `self_learning`, `desktop_apps`, `web_navigate` and `cua_js`. It registered no
  substitute tools. This is registration, not model dispatch or permission proof.
- Playwright MCP connected. A real tool call navigated a local HTTP page and
  returned the title **Isolated onboarding probe**, using installed Chrome with
  a private profile and headless mode because the test had no display.
- The pinned GitHub runtime installed and passed its existing runtime verifier.
  Its authenticated wrapper was disabled **only in the test profile**; GitHub
  account/tool execution was deliberately not tested.
- The owned service stopped, and `service status` confirmed `stopped`.

## Negative checks and dependency installation

Current deployment/onboarding/launcher tests were also run against the old
scripts in a scratch tree: six expected failures expose path portability,
missing-component acceptance, duplicate deployment and private-Node assumptions.
The browser-selector tests expose four further old-source failures, including
accepting a Firefox cache from the wrong revision. These are regressions, not
claims of model behavior.

Separate empty dependency directories successfully installed the pinned browser
MCP, production browser backend and self-learning client closure. Cold imports
of `OpenCode.make` and `chromium.launch` succeeded. The self-learning lockfile is
derived from that actual install, not guessed.

The final focused run passed 78 tests across deployment, onboarding, preflight,
launchers/selection, isolated-verifier controls, documentation, feature inventory,
GitHub permission policy and capture acquisition. Shell syntax and
`git diff --check` passed. The final `node scripts/ci-offline.mjs` run passed
all 17 required groups, with zero failures or unavailable steps. The following
`./scripts/health-check.sh` also reported **PASSED**. The earlier broad run failed
on the two stale tests described below; that failed run is retained separately.

## Test boundary corrections and limits

An early private-HOME run unexpectedly connected GitHub. HOME/XDG isolation does
not prove keyring isolation for the same OS user; that run is **not accepted as
credential-free**. No token was printed or added to source. The final verifier
uses `--no-auth-check` and disables the GitHub wrapper in its private fixture;
regressions protect both precautions. This is service/filesystem isolation, not
an OS-account sandbox.

The broad CI run also exposed two pre-existing source-test problems: a frozen
three-plugin expectation predating global tool registration, and a test reading
a deleted `.acceptance-fixtures` consumer. The former now checks the exact current
plugin list without changing permission/lockdown assertions. The latter uses a
maintained capture transport and real pre-read/cleanup assertions. The deleted
generated capture was not recovered or reclassified as successful; its history
and the existing 2 MiB / 120-second acquisition limits remain unchanged.

GNOME activation, voice models/audio devices, the separately built goal checkout,
provider sign-in and the optional ChatGPT MCP companion keep their documented
prerequisites. No secret, account, security rule or native resource guard was
changed to make this test pass.

## CLI deployment follow-up

The completion audit correctly identified that the original server-only receipt
did not prove `global/cli.json` plugins. This follow-up closes that deployment
gap rather than reclassifying the original receipt.

- Voice is now absent from the default CLI template. `--with-voice` explicitly
  adds it only after its installed JavaScript/Python/platform prerequisites and
  real sandboxed, device-free Sherpa recognition/synthesis check pass. These are
  separate voice setup prerequisites, not implied by `--with-tools`. Failure
  stops before config publication. Preview never loads models; no live profile
  was changed. Regression tests cover default-off, opt-in forwarding, missing
  scope, prerequisite failure, exact model-check arguments and rejecting an
  inherited `OPENCODE_VOICE_OFFLINE` sandbox marker.
- `verify-onboarding.mjs` now starts a real native TUI in an owned pseudo-terminal,
  against its private service and a blank session without a prompt. A read-only
  TUI observer sees actual `goal.show`, `goal.engine.settings` and
  `goal.yolo.settings` registrations; it adds no replacement commands. The TUI
  and service are stopped after observation. Voice stays off, so no recording or
  speaker playback is triggered.
- Cold dependency check: goal-plugin source/build files were copied **without
  node_modules** to `/tmp/opencode/onboarding-goal-fresh`; production npm install
  added 32 packages there. npm emitted OpenTUI Node engine warnings because the
  installer runs on Node 22; the actual native OpenCode TUI is Bun-hosted. No
  engine/security guard or plugin binary was patched to hide those warnings.
- With `OPENCODE_GOAL_PLUGIN_DIR` pointing to that fresh closure, the real
  server/browser/TUI verifier passed. Receipt:
  `/tmp/opencode/onboarding-isolated-Byo6sA/receipt.json`. It reports OpenCode 2.1.1,
  all three goal TUI commands, 21,639 terminal output bytes, handled exit code 130,
  no forced kill, and the owned service stopped. This is actual TUI setup, not a
  fake-context renderer test or a physical audio acceptance claim.
- The PTY runner's separate offline tests pass success/cleanup, missing-observer
  refusal, error-exit/forced-kill refusal and pre-read output-budget refusal.
  Existing server/browser results and their limitations remain intact.
- Final follow-up receipt:
  `/tmp/opencode/onboarding-isolated-ePG8Qj/receipt.json`. It again passed against
  the cold goal dependency closure, and measured the actual TUI host as
  **Bun 1.4.2** (not the Node 22 package installer). Output was 21,387 bytes,
  exit code 130, no forced kill, with the private service confirmed stopped.
- The real voice prerequisite check also passed in its network sandbox without
  devices: `production_worker_pcm_pipeline_passed`, `external_network_blocked`
  and `passed` all reported true. Its initial attempt correctly failed because
  Sherpa requires an explicit model directory; the helper now resolves that
  directory from the pinned `audio.models.STREAMING_NAME`. No voice TUI was
  enabled in the private test or live profile.
- After the CLI follow-up, full offline CI again passed all 17 required groups
  and full health reported **PASSED**. The current focused CLI tests passed;
  all four PTY lifecycle/bounds checks, Ruff lint/format checks and
  `git diff --check` passed. No voice-submodule or native-toolchain source was
  changed, and the Git index remains unstaged.

## Completion checklist

| Requested outcome | Evidence |
| --- | --- |
| Map actual onboarding artifacts | `setup.md`, `onboarding.md`, the four-entry deployer and both global templates distinguish copied files from source-linked skills/plugins and optional runtimes. |
| Repair deployment defects | Portable rendering, dependency/browser/CLI preflight, explicit pinned installs, single deployment and fresh-home launchers have regression coverage, including old-source failures. Voice is a guarded opt-in, not an enabled missing dependency. |
| Fresh valid global setup | Real private `onboard.sh --apply` runs publish valid server and CLI config with source paths resolved, seven server plugins, 34 skills and expected commands. |
| Isolated OpenCode runtime proof | Private service/browser receipt plus real PTY TUI receipts, including freshly installed goal dependencies; goal palette registrations, model-free local navigation and owned cleanup observed. |
| Preservation and truthful limits | Target/link/unmanaged-file guards and resource limits retained; full CI/health pass. No live profile overwrite, shared restart or source modification in voice/native repositories. Authenticated accounts, physical audio, visual layout and GNOME activation remain separate. |

At the verification checkpoint, the implementation was local and uncommitted.
Commit/push and deployment over the operator's live configuration were not part
of that goal's acceptance; publication was subsequently requested separately.
