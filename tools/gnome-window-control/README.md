# Bounded GNOME window control

Optional compositor support for OpenCode's multi-window desktop workflows. This
source targets **GNOME Shell 50** (checked against installed Mutter 18 / Shell
50.1), not X11, WSL, or arbitrary older Shell versions. It is not installed or
enabled merely because these files exist.

## What it provides

- `desktop_windows`: current-workspace windows with stable compositor IDs,
  application ID, PID, focused window, global frame rectangles, and monitor work
  areas. Coordinates are **logical desktop units**, not screenshot pixels or
  unreliable toolkit-local AT-SPI extents.
- `desktop_window_act`: preview or apply focus, explicit placement, and tiling of
  one exact window ID. Left/right, four corners, and full-work-area maximize are
  supported. It does not close windows, type, click, execute commands, evaluate
  code, exit fullscreen, or move unrelated windows.
- Version 2 inventories `canResize` as capability after restoring a maximized
  window, preserving intrinsic resize and client fixed-size restrictions. Mutter's
  interactive `allows_resize()` alone is false while maximized; version 1 can
  therefore refuse such a placement before restoration. Source tests cover the
  correction; verify the installed version and live behavior separately.
- `desktop_layout`: preview or apply two to four distinct, non-overlapping window
  placements, optionally focusing one of the placed windows last.

Use ordinary language: "Place the demo OpenCode window on the left and YouTube on
the right, then verify which window is focused." The assistant inventories actual
IDs, previews the exact layout, applies only that fresh preview, checks readback,
and takes a fresh screenshot. Do not substitute a hotkey sequence for a failed
window-control operation.

Geometry verification does not prove stacking/visibility. Placement does not
necessarily raise an unfocused target above unrelated windows. For a requested
visible composition, focus the exact selected IDs individually with fresh
preview/apply tokens, finish on the requested focus, and visually verify both.
Do not accept an occluded layout merely because its rectangles match.

## Safety and approval boundary

The extension exports `GetState`, `Preview`, and `Apply` on the **local user
session bus**, at `org.gnome.Shell.Extensions.OpenCodeWindowControl`. Enabling it
grants processes on that session bus a bounded window-management capability; the
OpenCode permission gates govern OpenCode calls, not every other local process.
This is why installation and activation need explicit user approval.

Inventory reads titles/metadata, not application contents or password fields.
Never inspect or operate during credential/payment entry. The bridge refuses
mutation while locked, in the overview, with a Shell modal active, or with a
dialog focused. Known authentication windows are protected. These metadata
guards cannot identify every password/payment form embedded in a normal browser
window; the agent's privacy and confirmation gates still apply.

Previews are compositor-issued opaque tokens, expire after 30 seconds, are bound
to the exact request and observed target/focus/workspace/monitor state, and can be
used once only. The plugin separately asserts `read`, `desktop_mutate`, and
`edit` permissions before applying, preserving Plan/read-only restrictions.

After apply, actual focus and frame geometry are polled for at most two seconds.
Compositor size constraints can make a requested layout impossible. A dispatch or
an accepted move request is **not** success. Layouts are not atomic: a failure
may leave some selected windows moved. The result reports attempted targets and
verification/partial failure; inspect fresh state before a new preview. No blind
retry, automatic rollback, or token replay is performed.

## Source and deployment

The deployer manages seven files: `metadata.json`, `extension.js`, `policy.mjs`,
`capture.mjs`, `input.mjs`, `launch.mjs`, and `runtime-contract.mjs`. The first
six are canonical in this directory; `runtime-contract.mjs` has one canonical
source outside it, `tools/computer-use-runtime/src/runtime-contract.mjs`, copied
under that name because `capture.mjs` imports it; a same-named copy in this
directory is not read. An extension deployed without
`capture.mjs`, `input.mjs`, or `launch.mjs` fails those calls at runtime.
`scripts/desktop-windows.py` is the fixed-method D-Bus client;
`.opencode/plugins/computer-use/windows.ts` registers the typed OpenCode tools.
The existing AT-SPI backend remains separate and unchanged.

The following are representative commands, **not blanket approval to run them**.
From the checkout, preview the exact manifest without writing:

```sh
python3 scripts/deploy-window-control.py --extension-dir "$HOME/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local"
```

After separate explicit approval, deploy to the explicitly selected destination:

```sh
python3 scripts/deploy-window-control.py --extension-dir "$HOME/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local" --apply
```

The deployer rejects symlinks, unexpected ownership, and manual edits; copies
only the seven managed files above plus its ownership marker; preserves
unrelated files; backs up changed owned files under the extension's `.backups/`;
and verifies source/deployed hashes. It is idempotent. Writes are atomic per file,
not per bundle. A failed deployment must be inspected before retrying. It never
enables the extension, restarts OpenCode, restarts Shell, logs out, or deletes
data.

Enabling also needs approval immediately beforehand:

```sh
gnome-extensions enable opencode-window-control@computer-use.local
```

A newly copied extension may not be recognized by the current Shell session.
Stop and report that condition; do not use unsafe evaluation or restart the
desktop. Any logout or required service restart needs separate approval.

The destination is required even for preview. Determine GNOME's actual user data
directory rather than inheriting OpenCode's overridden `XDG_DATA_HOME`. On the
checked host, GNOME uses `~/.local/share` while the agent service has a different
XDG directory. GNOME 50's `ReloadExtension` D-Bus method is explicitly deprecated
and returns NOT_SUPPORTED; `EnableExtension` returns false for an unregistered
UUID. A fresh desktop login may therefore be needed after installing this new
bridge. Do not log out or restart the session automatically; let the user save
work and approve or perform that step themselves.

Probe the backend read-only after activation:

```sh
python3 scripts/desktop-windows.py list
```

An unavailable bridge returns a structured `bridge-unavailable` diagnostic and
never falls back to forbidden Shell APIs, X11 tools, or keyboard tiling. If new
OpenCode tools are not discovered live, request approval before a service restart.

## Verification

**2026-11-01 latest approved acceptance:** actual Calculator capture/pointer7,
literal7+5→12, mixed-case/plus text, Shift-click selection and exact saved-file
bytes are visibly verified. The real key-resolver defect is fixed/deployed with
39focused cases using the production resolver; the user performed the required
reboot. Safe owned-transport retirement and supported per-helper accessibility
binding then recover both paths without shared restart or mutation replay.
Process-bound CUA handles refuse the same-name replacement, verified blank before
fresh-handle cleanup. Current93GNOME/220plugin cases and full health pass; seven
deployed files match source. The user-only bridge becomes inactive while locked
and resumes after user unlock; testing uses a requested temporary idle inhibitor,
not changed lock/power settings. See the [qualified activation record](../../docs/deployments/2026-11-01-personality-cua-activation.md#supported-accessibility-recovery-and-app-acceptance--2026-11-01).
No agent-performed Shell restart/logout or unsafe input fallback was used. Earlier
checkpoints below retain their original failures rather than implying current state.

**2026-11-01 UTC operational remediation:** the named bridge blocker is deployed
through the reviewed deployer after its exact preview. Only owned `input.mjs`
changes from`e5d76e87…53bd9` to`b324cf74…5518`; its original and old marker are
backed up under`.backups/20261101T000644.924463Z-b1sdk2xv`. Original apply stdout is
retained in`Documents/computer-use-native-host-20261029/direct-blockers-parent-tz3RSN/bridge-operational-deploy.stdout.json`.
Fresh preview now reports no changes across all seven files. The already-enabled
extension is disabled/re-enabled once; no Shell restart or logout occurs, and
its epoch changes from`5da15cfa…` to`d1319703…` with enabled/ACTIVE readback.

A task-created Calculator window launches and captures correctly (820x1332,
54,688B/SHA`3fbb132c…3a86`), but its single numeric-button pointer attempt still
refuses `POINTER_CONSTRAINED`; input release succeeds. No pointer retry, guard
relaxation or alternative pointer backend follows. Accessibility is used only to
close that disposable window, not to claim pointer success; compositor readback
confirms it is gone. Installed-byte drift is fixed, but loaded-new-module identity
and actual pointer/original-image acceptance are **not** established by a toggle
or matching files. Old failures remain historical; a fresh desktop session, if
needed for module loading, still requires its separate operator-controlled gate.

On2026-10-31, pointer readback gained a bounded convergence wait: up to six16ms
polls, a100ms monotonic deadline check and unchanged pointer tolerance. Input
dispatch waits for convergence and retains focus/geometry/protection checks.
Run-owned held-input cleanup and post-wait cancellation guards prevent cancelled
work from clicking or releasing a newer action's keys. Scheduler latency is not
a hard real-time guarantee, and the unreplicated offset anomaly is not fixed.
Parent independently reproduced three cancellation failures in the first return
before accepting the correction. Current35input/85GNOME/149plugin/21Python/
6deployer checks pass; two isolated stale-callback controls fail at their intended
assertions. These are fake-backed/source checks, not actual GLib/compositor input.
No deployment, extension refresh or live input retry was performed; current
capture still has a separate `NameHasNoOwner` blocker.

The opt-in `fresh-shell-acceptance.sh` harness is not routine offline verification
or blanket authority to start another Shell/activate an extension. Its source
boundary now always enters `dbus-run-session`; no inherited nonce/marker can skip
that entrypoint. It stages only the seven selected deployed files, uses private
HOME/XDG directories and updates only that new bus's activation environment before
private settings clients start (never the shared systemd user environment).
Artifacts remain under its printed job directory, including failures. Exit3 means
the seat-dependent workflow is incomplete, not a successful acceptance run.

`node --test tools/gnome-window-control/fresh-shell-acceptance.test.mjs` checks these
boundaries using real disposable files/Bash and fake bus/Shell/settings processes;
it does not start a compositor, activate an extension or touch the desktop.
The [owned-process supervisor](owned-process.py) now holds a Linux pidfd before
allowing each new managed child to exec. Cleanup requests target only those
retained handles, not PIDs reconstructed from a receipt or window inventory. A
target that cannot be bound to a still-managed child makes the closed-window test
incomplete (exit3); it is not signaled. The
[nine process controls](test_owned_process.py) use actual disposable Python
children, including a forged receipt PID, unrelated-child preservation, failed
pidfd acquisition, ignored SIGTERM, deadline and interruption. They run within
the ten-case Bash boundary suite required by offline CI, not as ten additional
independent process cases.

Linux Python with `pidfd_open`/`pidfd_send_signal` is required. Missing support or
the supervisor file refuses before private activation; there is no raw-PID or
process-group fallback. Readiness is bounded to5seconds, managed-child lifetime
to1800seconds, and owned stop escalation to1second SIGTERM plus2seconds SIGKILL.
Deadlines/interruption/failed cleanup are non-success, with receipts retained.
Only direct children are supervised: detached/D-Bus-activated descendants and a
supervisor lost to SIGKILL are not proven stopped. No descendant-quiescence,
crash-recovery or actual compositor acceptance follows from the source tests.
Staging/readback is sampled, not an atomic hostile-writer snapshot or OS sandbox.
No owning-host input/voice or loaded-new-input acceptance follows from these tests.

```sh
node --test .opencode/plugins/computer-use/*.test.ts
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_*windows.py' -v
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_deploy_window_control.py' -v
node --check tools/gnome-window-control/extension.js
git diff --check
```

Node must support TypeScript stripping (22.18+ or 24+); use the installed Node
executable if the non-interactive shell's PATH does not contain it. The client
uses `/usr/bin/python3` with the existing PyGObject/Gio installation. Policy,
permission, client, and deployment tests do not prove live compositor acceptance.
After approved activation, test exact identity, focus and placement on disposable
windows, stale-token rejection, locked/modal refusals, and preservation of
unrelated windows; verify the visible result with the desktop screenshot tool.

## Rollback

After approval, `gnome-extensions disable opencode-window-control@computer-use.local`
removes the bus endpoint and invalidates pending previews without moving windows
or altering other extensions. Restore backed-up owned files and their marker only
after reviewing the exact backup manifest; verify hashes before re-enabling.
Do not delete the extension or backups automatically. A deployment backup does
not restore window layout: use a fresh preview of the original selected-window
rectangles when restoration is requested and still appropriate.
