# computer-use plugin

OpenCode v2 plugin that exposes this repository's desktop and browser surfaces as
typed tools. It is the only place where a tool boundary is defined; the
implementations live in `scripts/` and `tools/`.

## Surfaces

| Namespace | Tools | Implementation |
| --- | --- | --- |
| `desktop` | `capture`, `input`, `release`, `launch`, `apps`, `tree`, `find`, `act`, `windows`, `window_act`, `layout` | `scripts/desktop-control.py`, `scripts/desktop-windows.py` |
| `web` | `open`, `tabs`, `navigate`, `snapshot`, `act`, `screenshot`, `signin`, `close` | `tools/computer-use-browser` |
| `cua` | `js`, `reset` | persistent Code Mode runtime over the two surfaces |

`web` is deliberately **not** named `browser`: that namespace belongs to
OpenCode's own desktop browser surface, and a plugin registration under it is
partially discarded.

## Persistent `cua` runtime

**Follow-up acceptance, 2026-11-01:** initial fake-backend checks missed actual
browser contracts and late-work isolation. Browser generation/navigation and
parser repairs now have production-registration tests. Parent adversarial review
also reproduced late text/image/call attribution and post-await CPU-loop defects.
Execution now uses a terminable worker with parent-owned backend calls. Parent
CPU/late-work/production-entry checks pass, including an escaped idle-loop case.
Actual registered tools started the worker and remembered a binding across calls.
The actual local-page workflow now verifies fill/click, a fresh snapshot and
screenshot, navigation, cross-cell remembered handles and successful cleanup.
Bounded compositor and process-bound app acceptance also pass, as described below.

`cua.js` is the Codex-parity surface: one JavaScript cell with top-level await
and bindings that survive between cells. It does not add a backend. The runtime
captures each **serialized** `desktop.*` / `web.*` execution and calls it, so a
cell inherits the same validation, permission assertions, sign-in blocking,
per-session queue, preview tokens and redaction as a direct tool call.

`cua.getState()` lists AT-SPI applications (with a 1-based `index`) and
compositor windows. `cua.getApp(name|index)`, `cua.getWindow(idOrTitle)` and
`cua.browser()` return handles; handles expose `tree/find/act/click/type/focus`,
`capture/focus`, and `open/snapshot/act/screenshot/close` respectively.
`app.click`/`type`/`focus` preview and apply inside one cell while still
asserting permission and consuming the single-use token.

`desktop.apps` includes a point-in-time `index` and a process-incarnation `appId`.
An index is not stable: it can change when another application closes. The CUA
handle binds the immutable `appId`, which includes transport and process-start
identity, and refuses if identity cannot be verified. `desktop.tree/find/act`
accept exactly one of `appId`, `appIndex`, or `app`. Preview fingerprints also
include target-process identity. A slow permission prompt can refresh an expired
preview only when the exact target fingerprint still matches.

`app.act` is preview-only unless explicit apply/token arguments are supplied.
The click/type/focus helpers preview then apply without removing native gates.
Click requires a name. `tab.snapshot()` remembers the generation; `tab.act()`
uses it (or an explicit valid generation) and refreshes only after real success.
`tab.goto(url)` sends URL navigation only. Unsupported selector options refuse
instead of silently changing targets.

Limits: 25 000 output characters, 30 s default / 120 s maximum per cell,
eight sessions in an LRU, `cua.reset` to discard. Reset/eviction/unload discard
work; tool-registry replay preserves ordinary live bindings. A timeout, cancellation,
worker failure or failed post-cell idle check clears bindings: rebind apps/tabs.
Already-dispatched actions may have completed; observe
before retrying. `vm` is not a security boundary. The tokenizer-assisted transform
is not a complete JavaScript parser; top-level import/export/class are refused.
The main-thread watchdog also stops loops before/after await. A one-second idle
yield check catches CPU work left after normal cell completion. The worker has
heap/stack guardrails; these are not a hard process-memory or security guarantee.
Backend calls/results and attachments have bounded queues and message sizes.
A non-cooperative backend may retain a pending handler until its promise settles.

The maintained layout loads canonical source in place. Keep `cua-worker.ts`
beside `cua.ts`; compiled deployments require the matching `.js`/`.mjs` pair and
rewritten module imports. A copied single-file or virtual-module bundle has not
been accepted. No deployment or shared service restart was needed for the
observed source-loader worker test.

## Exposure and rollback

Code Mode is the default: every `desktop_*` tool is re-exposed with
`codemode: true` by a post-registration transform, and the `web` tools declare it
directly.

To roll back to per-tool exposure without editing definitions, set the plugin
option:

```jsonc
{
  "plugins": [
    { "package": "./.opencode/plugins/computer-use", "options": { "directTools": true } },
  ],
}
```

The option is authoritative in both directions: the default switches **every** tool
this plugin registers (`desktop_*` and `web_*`) to Code Mode, and `directTools: true`
switches every one of them back to direct exposure. Tools from other plugins are
never touched. This matters because `capture` and `input`/`release`/`launch` declare
Code Mode in their own definitions; a "skip the transform" rollback would have left
them in Code Mode and made the rollback partial.

## Before saving a change to this plugin

The running service watches source. A broken source save can remove tools from a
live session until fixed. Use the owning checks rather than creating/deleting a
repository-wide dependency directory or assuming an old scratch harness exists:

```bash
node --test .opencode/plugins/computer-use/cua*.test.ts
node --test .opencode/plugins/computer-use/*.test.ts
python3 -B scripts/test_desktop_control_identity.py
```

`cua-entry.test.ts` executes the real entrypoint with only the SDK identity wrapper
stubbed; it checks registration replay and unload without touching a desktop or
browser. Contract tests use real validators/serialization with worker I/O faked.
Neither is loaded-service, actual-permission, model or GUI acceptance.

`browser-entry.test.ts` also checks actual-entry tool-registry replay with only
browser I/O faked. Browser definitions are created once per plugin load: replay
does not discard managers, snapshot generations or sign-in ownership. Unload
closes owned browser workers and refuses captured browser executors.

The actual local-page acceptance and three matched scripted timing pairs are
recorded in [the architecture notes](../../../docs/codex-parity/codex-runtime-architecture.md#matched-local-page-measurement--2026-11-01).
In those samples both paths used seven backend calls; median tool time was
10,230 ms for direct methods and 7,726 ms for CUA. This is not a model/token
benchmark or a general speed claim. `tab.act` returns combined action and fresh
snapshot text (two JSON lines), not one JSON object.

Read-only live preflight on 2026-11-01 found eight applications, all with valid
process IDs in the new `appId` format, and two compositor windows. The bridge now
responds (unlike the earlier `NameHasNoOwner` run), but state reports protocol
version 1 and the deployment preview finds a changed `policy.mjs`. No extension
deployment/enablement/restart, new window capture, or input acceptance followed.
The `version: 1` field is the inventory protocol, not evidence of an old loaded
extension: current `extension.js` emits it too. Exact loaded source remains unknown.

Later separately approved activation now verifies actual Calculator capture and
a pointer click, but discovers a real plus/uppercase/modifier resolver defect.
The tested fix is deployed; a fresh typing retry after an extension toggle still
fails, so loaded-new-code and full typing acceptance need a fresh user-controlled
desktop login. See the [activation record](../../../docs/deployments/2026-11-01-personality-cua-activation.md).
No shared restart/logout or unsafe alternate input followed.

After the user reboot, a further session change exposes a cached closed D-Bus
transport. The Python daemon now marks actual connection closure on failed
replies; the client returns that original failure and retires only its owned
child, without replaying a possibly dispatched action. A later fresh call uses
a new owned transport. Real private-bus replacement and no-replay/healthy-refusal
tests pass; full plugin coverage is218cases. Actual compositor typing, named click
modifiers, saved-byte readback and task cleanup now pass without shared restart.
The separate AT-SPI connection also recovers through installed libatspi's supported
per-process `AT_SPI_BUS_ADDRESS`. The new `scripts/accessibility_bus.py` verifies
the provider's UID/unique owner, full GUID and owned protected socket, preserves
explicit bindings and refuses autolaunch without session context. It changes only
the fresh helper's environment, not the parent service or native permissions.
Current coverage is220plugin cases plus7address/26desktop Python cases. Actual
CUA named7 click and editable7+5 are visually verified; the old process handle
refuses a same-name replacement before mutation, and a fresh handle closes it.
The user-unlocked desktop and a temporary requested idle inhibitor allow the final
test without changing saved lock/power settings. The inhibitor is removed after
testing; task windows close, input releases and `cua.reset` discards finished handles.
See the [final activation follow-up](../../../docs/deployments/2026-11-01-personality-cua-activation.md#supported-accessibility-recovery-and-app-acceptance--2026-11-01)
for exact evidence, retained failures and source/native/model/GUI limits.

## Private sign-in (`web.signin`)

`web.signin` takes a `tabId`, a `ref` and a `generation` from a fresh snapshot of the
form, then opens a local GTK dialog where the **human** types the password. The value
travels from the dialog over a dedicated descriptor into the worker, is filled into
that one field, and is zeroed afterwards. The tool returns only a status
(`filled`, `cancelled`, `failed`, or a failure code) — never the value, never page
text — and it never submits the form, so a human decides when the credential is used.

While the dialog is open the guard state is not `idle`, which blocks every tool of the
`web` and `desktop` surfaces for that session (only `desktop.release` stays available,
so held keys cannot get stuck). The tool's queue deadline is raised to 330 s because it
waits on a person; the dialog itself gives up at 300 s.

## Permissions

Every tool asserts a permission before any backend call:

| Action | Used by |
| --- | --- |
| `desktop/capture` | `desktop_capture` |
| `desktop/input` | `desktop_input`, `desktop_release` |
| `desktop_mutate` | mutating desktop actions |
| `desktop/launch` | `desktop_launch` |
| `browser_open`, `browser_read`, `browser_act`, `browser_close` | `web` tools |

Tokens are freshness guards, not authorization. `desktop_capture` returns a
single-use `observationId`; `desktop_input` refuses without a fresh one, and the
bridge consumes it.

## Prerequisites and honest limits

- Capture, input and launch need the **deployed, reviewed** GNOME Shell bridge.
  The latest accepted read-only preview matches all seven source files; actual
  capture/input is separately observed. Inventory protocol version is not a loaded
  source identity. Recheck current state before any future workflow.
- The user-only bridge is inactive while the screen is locked. Do not toggle it
  or operate the lock screen; inspect fresh state after the user unlocks it.
  Deployment, enabling, a required fresh login, or any shared restart still needs
  its applicable separate approval; none is performed automatically.
- The legacy `screenshot.ts` ydotool path is no longer registered. Do not
  reintroduce a screenshot-directory capture route.
- Browser tools are live-accepted at tool level (`live-acceptance.mjs` 16/16,
  `signin-acceptance.mjs` 8/8) and in-session through Code Mode, including image
  delivery. Downloads are unsupported; uploads exist only in the backend and no tool
  exposes them, so they would need a path allowlist before exposure. The
  private-sign-in guard **is** injected, and while sign-in is active every tool of
  both surfaces is refused except `desktop.release`.
- Only one browser worker per session and two sessions concurrently; a third is
  refused rather than evicting another session.

## Verification

```bash
node --test .opencode/plugins/computer-use/*.test.ts
node --test tools/gnome-window-control/*.test.mjs
python3 scripts/test_desktop_windows.py
python3 scripts/test_private_secret_stage.py
npm --prefix tools/computer-use-runtime run check
npm --prefix tools/computer-use-browser run check
```

These are source-level contracts. They do not prove GUI, browser or credential
behaviour on a live desktop.

For a live check, `live-desktop-acceptance.mjs` drives the real tool definitions
(registration, serialization, exposure policy, shared credential guard) against a running
Shell bridge and asserts that `desktop.capture` returns an inline PNG file part with
matching metadata and that refusals surface as bounded text:

```bash
# inside a private GNOME Shell session, with a window to capture
node --experimental-strip-types .opencode/plugins/computer-use/live-desktop-acceptance.mjs \
  --window-id <uuid:n>
```

`tools/gnome-window-control/fresh-shell-acceptance.sh` runs it automatically against a
private headless Shell, so it never touches the operator's session.
