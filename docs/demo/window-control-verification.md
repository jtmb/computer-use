# Window tools and demo acceptance

## Passive bridge refresh — 2026-10-27

The consolidated-goal parent performed a new read-only check, not a new capture
or window action. The current local Wayland session is active and unlocked;
`gnome-extensions info opencode-window-control@computer-use.local` reports
**Version 2 / Enabled: Yes / State: ACTIVE**. All three installed canonical files
are byte-identical to source, with SHA-256 values:

| File | Installed and source SHA-256 |
| --- | --- |
| `metadata.json` | `1e79d1af9d9f1d3524a11ba34540ae9feb8f7c7871eb6582d27268454f7f4862` |
| `extension.js` | `8f3e1b4ef7f845d84a8119916fcc75af36408f7a180440104c1c32a39ee8142c` |
| `policy.mjs` | `e405613b0b87f412a98bcd2aac5e524cb7074a0e3e5f361f9c5b7a8e07831eb1` |

The actual typed `desktop_windows` tool returned available/ok, unlocked and no
blocked reason, with one monitor and two current-workspace user windows. Its
`version: 1` is the wire schema version (also hardcoded in canonical v2 source),
not evidence that extension version 1 is loaded. Maximized windows report
`canResize: true`, consistent with the v2 capability fix; no restore/place/layout
was attempted. No disposable verification windows are present, so unrelated
user windows were not substituted. Registry/source parity and capability
readback do not establish maximized-restore or visual acceptance.

Current combined tests include 167 Node plugin/bridge and 51 script Python
cases. No extension setting, enablement, deployment, logout/restart, screenshot,
native recording or window mutation was performed. Native freshness/visual
acceptance, loaded-v2 restore actions and the genuine approved action preview
remain unfinished. The records below are historical checkpoints, not current
desktop state or fresh capture authority.

## Latest preparation checkpoint: privacy hold

The desktop locked during recorder preparation. Read-only session metadata showed
session 16 locked, and the extension registry showed the bridge INACTIVE. The new
recorder's preflight refused the absent bus name **before capture or directory
creation**. No unlock, lock-screen screenshot, credential observation, task prompt,
or real action recording was performed. Wait for the user to unlock and confirm
completion before inspecting the GUI again; refresh enable-epoch IDs afterward.

Offline preparation completed without observing the locked desktop:

- `docs/demo/native_capture.py`: explicit dry-run/apply, exact selected-frame
  region checks, bounded recorder lifetime and owned stop control, caller-bound
  live-frame freshness, quarantined context/abnormal stops, archive-only `--final`,
  and bounded dense export with original PTS and source/frame hashes.
- `docs/demo/motion_edit.py`: chronological single-source editing, eased camera
  crops, aspect-preserving scaling, readable holds, shared palette, whole-frame
  fades, versioned/no-overwrite outputs, decoded timing/loop checks and per-frame
  source/crop evidence. It never auto-accepts or routes a main demo.
- 14 recorder/extractor/export tests and 6 motion tests pass. Tests include mocked
  bus ownership/lifecycle and clearly synthetic moving media; they are not public
  task execution evidence. `git diff --check` and scoped document links pass.
- Offline integration copied only the previously verified owned idle clip,
  preserving its original. SHA-256:
  `ac60e57cea0f7c0db879b852c4be258eb1a18137a3ded8279db2f70306d98860`.
  Archive extraction found its genuine last frame at 2.0893s, 2002x1332 pixels;
  dense export retained 17 real frames and timestamps.
- A six-second **MOTION TOOLING PREFLIGHT - NO TASK ACTIONS** GIF was encoded from
  that idle source, not an invented conversation or app result. It is 1200x840,
  67 encoded frames after merging, 3,659,725 bytes, loop0. Every frame decodes,
  durations sum to6000ms, and first/last loop-seam pixels match. Six representative
  decoded camera positions were inspected; full live playback/README review was
  not performed. It is not the requested real action/motion approval preview.

Artifacts: `~/Downloads/opencode-simultaneous-demo-yi5it0bt/native-helper-offline-check/`,
including the dense index, `motion-tooling-plan.json`, and
`motion-tooling-preflight/{preview.gif,still.png,evidence.json,decode-audit.json,decoded-contact.png}`.
The [capture/motion workflow](simultaneous-workflow.md) and
[actor brief template](public-demo-brief.md) document actual implemented commands
and the remaining live-verification gate. Live extraction from an active native
recording still needs acceptance after unlock, before the actor's real run.

The main README and asset routing remain unchanged at 98 physical lines. All real
task actions, the actual action/motion preview and its approval, final media/docs
acceptance, and loaded-version-2 restoration acceptance remain unfinished.

## Verified live checkpoint after login (before lock)

Recovery succeeded in the new active, unlocked Wayland session 16. GNOME reports
the installed bridge **Enabled: Yes / State: ACTIVE**, its error list is empty,
the bus name is owned, and the actual `desktop_windows` tool returns live IDs,
focus and logical-desktop geometry. Prior extension settings are unchanged.
No installation or enablement was repeated after the restart.

Live acceptance found a source issue: Mutter 50.1's `allows_resize()` deliberately
returns false for a maximized window, even when it supports resizing after
restoration. Version 1 therefore refuses its placement before the backend can
unmaximize it. The canonical version 2 fix uses the intrinsic `resizeable` flag
and client min/max size hints **only for maximized windows**. Intrinsically
fixed-size, fixed-hint and fullscreen windows still refuse. See the inspected
[Mutter 50.1 source](https://github.com/GNOME/mutter/blob/50.1/src/core/window.c),
`meta_window_allows_resize`, `PROP_RESIZEABLE`, and min/max size accessors.

All 47 plugin tests (including new restore/fixed-size regressions), 5 deployment
tests, extension syntax and whitespace checks pass. The user approved capture
and the reviewed update. Version 2 is now **installed and hash-verified**, with
the old metadata, extension code and marker backed up at
`~/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local/.backups/20261027T082011.500660Z-syo3scg1/`.
A second dry-run reports `changes: []`. The running Shell still uses the cached
version-1 code. No further logout or restart was performed; maximized restoration
needs separate live acceptance after the next login.

Approved, installed version 2 update at the same extension directory:

| Changed file | Proposed SHA-256 |
| --- | --- |
| `metadata.json` | `1e79d1af9d9f1d3524a11ba34540ae9feb8f7c7871eb6582d27268454f7f4862` |
| `extension.js` | `8f3e1b4ef7f845d84a8119916fcc75af36408f7a180440104c1c32a39ee8142c` |

`policy.mjs` is unchanged. Deployment backed up the two old managed
files and marker beside the target and verified new hashes. GNOME caches imported
extension code; the update requires a later fresh desktop login, not an unsafe
reload workaround. No further logout is authorized or performed at this checkpoint.

The current canonical desktop-vision skill separately flags unresolved ownership
and cleanup gaps in the screenshot backend. That other-session work is out of
scope: do not modify it or invoke the unsafe backend. The supported native
recording route is already used for demo footage; using bounded isolated-demo
recordings and extracted stills for live visual checks was explicitly approved
by the user. No window mutation is accepted without its required visual
verification. The disposable Calculator and standalone blank Text Editor are
running; unrelated user/other-session terminals have not been moved or edited.

### Live normal-window results

The actual typed tools and canonical client exercised the loaded version 1:

- Stable IDs across successive inventories; exact-ID focus to Calculator and
  Text Editor; explicit rectangle placement at `(63,32,600,800)`; single-window
  left tiling at `(63,32,616,832)`; two-window layout with right side
  `(679,32,617,832)`. Compositor context/focus/geometry readback passed.
- Single-use replay refused. Slow interactive round trips separately proved
  preview expiry; they were **not** counted as stale-state rejection.
- A bounded, immediate sequence through the existing fixed-method canonical
  client proved changed-focus stale-state refusal and replay refusal in 0.093s.
  The editor rectangle and unrelated terminal rectangle remained unchanged.
  No TTL, backend guard, or permission denial was bypassed.
- Visual checks used approved native `ScreencastArea` captures lasting 1-2s,
  keeping the caller alive until verified `StopScreencast`. Normal D-Bus service
  activation was needed when the recorder was idle; no security setting changed.
  Own recordings were decoded with GStreamer and complete PNGs checked with
  Pillow before inspection. The screenshot backend was not invoked.
- The first layout capture exposed an occluded Calculator despite correct
  geometry. It is **failed visual evidence**, not demo footage. Subsequent
  exact-ID focus raised only the selected apps; a fresh capture showed both.
  Geometry alone does not establish visibility or stacking order.
- A harmless desktop tooltip appears in some checks. These are verification
  artifacts, not clean public demo source. No existing recording was deleted.

Local evidence directories under `~/Downloads/`:

| Directory | Observed evidence |
| --- | --- |
| `window-acceptance-rkai2wp1` | Blank Text Editor capture route, MP4/PNG/metadata |
| `window-layout-check-dcz03edt` | Failed occlusion check; includes non-demo terminal, never publish/reuse |
| `window-focus-check-jjdm82sz` | Calculator exact-focus capture |
| `raised-layout-check-4e3gnvba` | Both selected normal windows visible after exact focus |
| `stale-window-check-qb75va6o` | Stale/replay results JSON and post-check recording/still |
| `explicit-placement-check-v1dv4pbq` | Explicit rectangle visual check |
| `single-tile-check-c4fyipxh` | Single-window tiling visual check and unrelated-geometry assertion |
| `window-modal-check-zdwdxl0b` | Live harmless-dialog refusal, results JSON and inspected owned-dialog still |

Live harmless-dialog refusal passed; the owned test windows were closed by their
fixture process. The first capture attempt was rejected as off-screen during
initial mapping; it is not accepted evidence. The passing run waited for a usable
on-screen parent rectangle before capture. Lock behavior remains source-tested;
no disruptive lock is authorized.

Still pending: loaded version-2 maximized-restore acceptance after login and
the genuine clean OpenCode/app action capture,
motion-preview approval and final media/README acceptance. Normal-window checks
are not proof that every app size constraint or stacking state is supported.

### Clean simultaneous demo staging

An actual new, empty OpenCode session was created through the inspected local v2
API, not imported or replayed: `ses_e837ba5b9ffe6MjOPg5aYbrFu6`. Staging and owned
capture evidence are under
`~/Downloads/opencode-simultaneous-demo-yi5it0bt/`. No task prompt has been
submitted and no action/motion preview has been captured yet.

The current composition is the standalone terminal `OpenCode Clean Public Demo`
(PID 39915, compositor ID suffix `:14`) beside the fresh signed-out Chrome
YouTube window (PID 38413, suffix `:13`). Exact-ID layout and focus readback
passed, and the decoded native idle check was visually inspected. The browser
process uses this staging directory's new profile and normal sandboxed launch.
Both windows are on the same real recording timeline; no panes were composited.

The first idle composition exposed persisted session tab titles and is rejected
for public use (`composition-check/`). The corrected process uses documented
per-process inline CLI settings: tabs off, sidebar hidden, permission mode prompt,
and release highlights off. No global CLI config, session/tab data or other
window was edited or deleted. The corrected `composition-clean-check/` still
shows no unrelated tabs and a signed-out YouTube homepage. This proves staging,
**not** completed computer-use actions, polished motion or user preview approval.

## Recovery update: startup activation approved

The user subsequently requested repair and a new goal, then explicitly selected
**Saved work—enable and logout**. Recovery goal:
`d1ff47da-5c16-409d-997c-4478cd6737ae`.

The exact three installed hashes below were reverified. Only
`opencode-window-control@computer-use.local` was appended to GNOME's
`enabled-extensions`; independent-process readback confirmed the existing
`ding@rastersoft.com`, `ubuntu-dock@ubuntu.com`, and
`tiling-assistant@ubuntu.com` entries are unchanged. `disabled-extensions` remains
empty and the global user-extension setting was not changed. No bridge code,
other extension, version validation, or security control was modified.

Activation is queued for discovery on the next desktop login, **not yet proven
live**. The approved next action is standard GNOME `SessionManager.Logout(0)`,
not forced logout, reboot, or OpenCode service restart. After the user signs in,
verify registry/error state and `desktop_windows` before any window manipulation
or recording. Rollback removes only this UUID from the enabled list, preserving
all other current entries. Earlier installation-only gates below describe the
previous checkpoint and are superseded only by this explicit recovery approval.

## Scope and current gate

This record covers only this conversation's compositor tools, README demo, and
related skills. Other sessions' handoff, goal-docs, orchestration, configuration,
and health-check source changes are not owned or accepted here. The user approved
installation only after reviewing the manifest; that deployment is verified below.
No commit, push, publication, extension enablement, or restart is authorized by
this record. Routine verification does not require repeated confirmation.

Source verification and approved installation are complete as listed below.
**Live desktop acceptance awaits GNOME discovery and activation authority.** The new demo is also
pending: app-only and CLI prototypes do not satisfy simultaneous OpenCode/app
footage or the required composition/motion preview.

## Source evidence

- `.opencode/plugins/computer-use/windows.ts` registers inventory, single-window
  focus/place/tile, and two-to-four-window layout tools. Mutation requires read,
  desktop-mutate, and edit permission gates before backend access.
- `tools/gnome-window-control/policy.mjs` validates exact IDs and bounded logical
  work-area placements; compositor-issued previews expire in 30 seconds and are
  single-use, request-bound, and invalidated by changed target/focus/workspace/
  monitor state. Locked, modal, protected, and unsupported placement states refuse.
- `extension.js` uses GNOME Shell 50 / Mutter 18 APIs. Installed typelib inspection
  verified `move_to_monitor`, `move_resize_frame`, `get_maximize_flags`,
  parameterless `maximize`/`unmaximize`, `get_stable_sequence`, and `can_maximize`.
  Actual focus/geometry is polled for up to two seconds. Layouts are non-atomic;
  partial failures include best-effort readback and never trigger token replay,
  blind input, rollback, or retries.
- Tests cover pure policy and permission contracts, plus canonical extension
  methods against mocked GJS/compositor boundaries (inventory, refusal, selected
  targets only, readback, replay, shutdown during verification). These are **not**
  live GNOME tests and cannot prove real window-manager constraints or visuals.
- `scripts/desktop-windows.py` uses only fixed D-Bus methods with no auto-start;
  malformed mutations and missing transport produce structured refusals.
- `scripts/deploy-window-control.py` requires an explicit destination, defaults
  to dry-run, hashes all three runtime files, preserves unmanaged/manual changes,
  refuses symlink paths, and never enables or restarts anything. Updates back up
  changed managed files and their ownership marker beside the target.

The source commands are in the [bridge guide](../../tools/gnome-window-control/README.md).
Use the installed Node 22.23.2 executable when the non-interactive PATH lacks Node.

Latest verification on 2026-10-27:

- All 45 computer-use plugin tests passed (including 3 mocked-extension tests).
- All 4 Python client tests and 5 isolated deployment tests passed.
- Extension JavaScript syntax, `git diff --check`, scoped Markdown relative links,
  and skill entry structure passed; root README is 98 physical lines.
- `./scripts/health-check.sh` passed with the normal PATH: OpenCode v2.1.1, running
  service, active repository plugins, connected GitHub/Playwright, skill path.
  An initial check with the FNM Node directory prepended selected its old OpenCode
  1.18.30 launcher and failed six runtime checks; rerunning without that PATH
  override passed. No configuration or service change was made. Invoke the Node
  executable directly rather than prepending its directory for unrelated checks.
- The actual `desktop_windows` tool returned `bridge-unavailable` as expected.
  No live focus/layout or screenshot acceptance has been performed.

## Approved installation manifest (applied and verified)

Target: `/home/james/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local`.
The pre-install dry-run found no existing managed files or ownership marker there.

| File | SHA-256 |
| --- | --- |
| `metadata.json` | `d5794f2b2693fcbc3d92b5e97fa5944b7a2a179230561080c24fbf3102d25ca1` |
| `extension.js` | `078c2aa54e0a22735f91365719ca715e474c649680e0d87b96d3bdb633cc91eb` |
| `policy.mjs` | `e405613b0b87f412a98bcd2aac5e524cb7074a0e3e5f361f9c5b7a8e07831eb1` |

The deployer created `.computer-use-managed.json` containing the UUID, manifest
version, and those hashes. Independent readback verified all three installed
files against canonical source and the marker. A second deployment dry-run has
`changes: []`. Exactly the three runtime files and marker are present; no existing
files needed backup. No enablement, service restart, or logout was performed.

`gnome-extensions info opencode-window-control@computer-use.local` still reports
that the extension does not exist in the running Shell's registry. The files are
installed correctly, but this GNOME session has not discovered them. A fresh
desktop login remains an external prerequisite; no reload workaround was used.

Enabling exposes bounded window inventory/focus/layout to processes on the local
user session bus. OpenCode's permissions do not govern other local bus callers.
Title/metadata guards cannot detect every password/payment form in a normal
browser window. Never use it during sensitive entry. GNOME 50 does not support
`ReloadExtension`; a fresh desktop login may be required. No automatic logout,
Shell restart, service restart, or security change is permitted.

Rollback after separate approval: disable this UUID to remove its bus endpoint
and invalidate previews. Do not delete the bundle/backups automatically. For a
managed update, review the exact backup files and marker before restoring them.
Disabling does not restore window positions; restoration needs its own fresh
preview against current state.

## Prompt-to-artifact checklist

| Requirement | Evidence / remaining gate |
| --- | --- |
| Stable exact compositor IDs and logical global geometry | Canonical policy, extension, and mock/contract tests; live proof pending |
| Verified activation, placement, tiling, multi-window layouts | Source readback tests; disposable-window acceptance and screenshot pending |
| Fresh one-use previews; stale/replay and permission denial | Policy/permission tests; live stale-state check pending |
| No unsafe evaluation, blind hotkeys, or security bypass | Fixed-method client and bridge; documented fail-closed route |
| Installation/activation and restart approval | Installation-only approval executed and hash-verified; activation/restart not authorized or performed |
| Useful real email, YouTube, Amazon workflows | Earlier app-only results preserved; clean simultaneous execution pending |
| Real OpenCode beside controlled app on one timeline | Mandatory in canonical GIF skill; recording pending |
| Cinematic zooms/transitions and readable pacing | Inspected official reference retained; encoded motion preview pending |
| Preview approval before main replacement | Not obtained; main asset/routing not replaced by this continuation |
| Final decoded GIF, loop, result/privacy review, still alternative | Pending final edit and acceptance; old draft is not proof |
| Canonical desktop/GIF skills and catalog | Updated source only; scoped link/structure checks passed |
| Branding and README below 170 physical lines | Root README remains 98 lines; final embed and rendered checks pending |
| Desktop/narrow, light/dark README review | Pending final asset and supported visible renderer |
| Preserve unrelated work, recordings, and rejected drafts | No cleanup, reset, stage, commit, push, or publication performed |

## Live acceptance after approval

1. Inventory disposable OpenCode/app windows twice; confirm stable IDs, PIDs,
   application identity, active workspace, monitor scale, and logical rectangles.
2. Record unrelated-window rectangles without operating on them. Preview/apply
   exact focus and verify focused ID plus a fresh screenshot.
3. Preview/apply side-by-side placement, explicit rectangle, and tiling. Compare
   compositor readback and visible geometry, including application size limits.
4. Verify two-window layout and optional focus. Do not claim full success from
   dispatch or a partially applied result. Compare unrelated-window state.
5. Attempt an already-consumed token and a deliberately stale disposable-target
   preview: both must refuse without a second mutation. Reinventory afterward.
6. Check modal refusal using a harmless disposable dialog, not authentication.
   Lock behavior has source coverage; do not lock or disrupt the user's session
   just to test it without approval.
7. Only then record the simultaneous public/sample demo. Produce a short encoded
   motion preview and wait for approval before replacing the main demo.
