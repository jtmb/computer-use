# Codex-parity integration — acceptance status

Living acceptance record for the standalone computer-use and browser-use
integration. It maps each objective requirement to concrete evidence and states
plainly what is **not** yet proven. Source-level passes are never presented as
live acceptance.

**Current checkpoint: 2026-10-28.** Parent source review completed; the old p8
review and observations below are historical, not an active reviewer assignment.
The dedicated reviewer ceremony was removed by the user. Ordinary independent
verification remains. See [current coverage](../request-coverage.md) and
[fresh test-quality evidence](../test-quality-audit.md#consolidated-sourcefindings-boundary--2026-10-28).
Source fixes are **undeployed**; post-fix real-seat typing is not accepted.

## Requirement → evidence

| # | Requirement | Artifact | Verified evidence | State |
| --- | --- | --- | --- | --- |
| 1 | Standalone on stock OpenCode v2, no fork, no Codex runtime | plugins under `.opencode/plugins/computer-use/`, packages under `tools/` | Code Mode catalog shows `desktop` (12 tools) and `web` (7) in the running session; no Codex imports or paths in source | Source verified |
| 2 | Request-owned in-memory capture with complete PNG validation and bounded transport | `tools/gnome-window-control/capture.mjs`, `scripts/desktop-windows.py`, `extension.js` | Source/transport cases retained; dated real post-login2466×1664 PNG capture passed, separately from the legacy screenshot hold | Source and dated live capture verified; no new capture in this checkpoint |
| 3 | Session-isolated browser, stable tab IDs, sandbox + TLS, no arbitrary JS or CDP | `tools/computer-use-browser/`, `browser-tools.ts` | 45 backend tests + tool tests; six-variable child env plus display/bus addresses; no model-facing run-code, evaluate or raw-CDP tool exists on the `web` surface (the backend's internal `evaluate` calls are fixed functions used for snapshotting and value redaction, never a caller-supplied script). Live, through the production registration path (`live-acceptance.mjs` **16/16**): distinct tab ids and `0700` profiles across two sessions, `FOREIGN_TAB` refusal, `CAPACITY_EXCEEDED` at a third worker, `TAB_LIMIT` at 8 tabs, mid-flight cancellation with the slot freed afterwards, and a consumed snapshot generation refused while the current one is accepted | **Verified live** |
| 4 | Compositor-native foreground input, release on failure, no ydotool | `tools/gnome-window-control/input.mjs`, `launch.mjs`, `extension.js` |30input/launch source tests plus8source GJS checks pass; installed GI separates microsecond input from uint32-millisecond activation; failed releases remain tracked/retryable | Corrected source undeployed; dated typing returned INPUT_FAILED, no visible change |
| 5 | Private sign-in keeps credentials out of model context | `scripts/browser-auth-dialog.py`, `scripts/private-secret-stage.py`, `secret-entry.ts`, `browser-tools.ts`, `ops.ts` | 13 python, 6 runtime transport, 14 tool tests incl. sign-in; descriptor transport; status-only replies. **Entry point**: `web.signin`. Live tool-level run (`signin-acceptance.mjs` **8/8**): dialog used once, result `{"status":"filled"}`, value absent from result, page confirmed the exact length, snapshot `[redacted]`, guard back to idle, consumed generation refused. Earlier: a clear-text snapshot leak was found this way and fixed | Wired, tested and **tool-level accepted**; **no real human dialog run yet** |
| 6 | Credential and environment hygiene | `scripts/credential-hygiene.test.mjs`, launchers | 8/8 tests; five real leaks fixed; no Codex credential reads; `~/.opencode/bin/node` is mode 0777 by installer default | Source verified |
| 7 | Code Mode default **and** direct-tool rollback; nested image delivery proven live | `codemode.ts`, `index.ts`, plugin README | Dated model PNG delivery/default catalog observed; production entry with fake context flips all19tools to directTools:true, separately from actual model dispatch | Entry exposure rollback verified; real bounded live rollback still missing |
| 8 | Independent review with measured efficiency | this record, [efficiency](efficiency.md) | Historical reviews/fixes and fresh parent source checks recorded; entry timings/bytes observed, actual model tokens/turns/dispatch/recovery comparison missing | Partial evidence only; efficiency outcome blocked |
| 9 | Deployment and live acceptance under separate approval | `scripts/deploy-window-control.py` | Read-only preview now finds2/7changed files: input.mjs and extension.js; the later login passed capture/launch but typing failed | Reviewed source delta only; no deployment/activation/restart; live input and rollback pending |

## Current source/deployment boundary — 2026-10-28

**Dated read-only byte refresh, 2026-10-29:** the exact selected installed target
retained verified ownership; only `extension.js`/`input.mjs` drifted while five
managed files matched. Node preflight and Python deployer preview agreed without
apply, seat query, input, capture or activation. Source fingerprint was
`e469929418f6e72d1355af39336b99a4213d8a92e9a755f11a63e873c2650814`,
managed-target fingerprint
`66e9a741704eea9a43d98770e0b798d391e5c02c7017ffbbfece9b016b4c1a26`.
This is retained installed-byte history, not current loaded Shell identity. Later
[canonical consolidation](main-consolidation.md) retains source and fresh offline
checks; it performs no deployment and does not promote them to real-seat evidence.

Fresh scoped health passes with stock v2.1.1, required plugins, both MCPs and29skills.
The selected source batch passes334combined goal-docs/desktop/bridge/browser cases;
scripts107, runtime35, memory20, efficiency4 and helper14are distinct scopes, not
an invented full-suite or live total. Browser/runtime configured typechecks and
29-root strict/noEmit goal-docs checking pass; the latter uses skipLibCheck:true.
Human sign-in, separate file staging/readiness callback, actual model efficiency,
automatic handoff settings/OFF and full native coordination remain unverified.

Read-only deployer preview against
`/home/james/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local`
reports exactly `extension.js` and `input.mjs` changed, five other file hashes
matching and no enablement/restart. Marker digest at this checkpoint:
`beb1d158304687ca2f09e183d86c3fda1c0fb017fd9d85484940ed8e232c2da4`.

| File | Canonical source SHA-256 | Installed bytes SHA-256 |
| --- | --- | --- |
| input.mjs | e5d76e87fb355d4427b82ba0ee14f149472330144372fee9b7caff34aff53bd9 | f7da42d1fedd0e171ff438e93ff20d2ad0580c6b94d60a6808fa72ca885e05f9 |
| extension.js |91b4751a173920c18675044d1552482b7642895a318c97f8676dc2c7e53fc070 | a0d128443572b5ae80dc444a9592af12413f14451f958e8e028ed0836a7a83ca |
| handoff_resume.md |1bfac81721cbad20c8fbd4a33cecb5c77fcf276ad856213dde28778fb5731089 |12b407c7543019eb8a6d63026492d629c0051f8a31007378cecb7a7660c4cf9d |

The command comparison is specifically the retained pilot file
`/home/james/.opencode-v2-pilot/config/commands/handoff_resume.md`, not proof of
active-profile command discovery. No deployed file was changed. Recheck hashes,
exact selected profile/target, ownership marker and worker overlap before any
separately approved apply. Preserve the deployer's original-byte backup/marker
snapshot; verify7/7intended bytes after apply, then separately authorized loaded
Shell/tool discovery. A copied file is not a newly loaded module.

Rollback preparation is not a live rollback: identify the exact deployer-owned
backup and restore contract, review its before/after hashes/marker, obtain exact
restore/activation authority, then verify restored bytes and actual loaded behavior.
Do not invoke the throwaway rollback acceptance script on a live target, bypass
ownership guards, or infer logout/security authority from source approval.
Historical0/7drift and “pending logout” statements below describe their dated
checkpoints; they are not today's blocker. Successful post-fix input remains open.

## Evidence that the chain is wired (pre-deployment)

Historically, Tool → Python client → live D-Bus was exercised against the
then-installed extension:

```
capture → bridge-rejected: UnknownMethod "Begin"
input   → bridge-rejected: UnknownMethod "InputBegin"
release → bridge-rejected: UnknownMethod "InputReleaseAll"
launch  → bridge-rejected: UnknownMethod "Launch"
confirm → bridge-rejected: UnknownMethod "ConfirmLaunch"
```

This was the expected pre-deployment state. It proves the argv contract, the D-Bus
transport, sender plumbing and fail-closed error shape; it does **not** prove any
capture or input behaviour.

## Known runtime defects found and fixed during integration

1. Browser worker spawned `process.execPath`, which is the bundled OpenCode binary
   rather than Node → every `web` call failed. Now resolves a real Node binary.
2. Browser profiles required `OPENCODE_DATA_DIR`, which the server does not set →
   now falls back through XDG to `~/.local/share/opencode`.
3. Registering the browser surface under `browser` silently lost three tools
   because OpenCode reserves that namespace → renamed to `web`.
4. Startup failures surfaced as an opaque "operation failed" → the bounded cause
   is now included for `WORKER_START_FAILED` only.

## Independent review findings (p8) and disposition

| Sev | Finding | Disposition |
| --- | --- | --- |
| P1 | Capture observations could never be used by input: each tool call spawned a new Python/D-Bus process, so the sender never matched | **Fixed**: `desktop-windows.py serve` keeps one cached session-bus connection and the plugin reuses one daemon (HOME/PATH/LANG only, restart after timeout/exit/protocol corruption). Live evidence: two `list` requests in one daemon returned ids 1 and 2, both ok, same epoch, 5 real windows |
| P1 | Launch confirmation could be forged or replayed because the caller supplied its own baseline | **Fixed**: `Launch` now returns a one-use, sender-bound `launchToken` with a 30 s TTL; `ConfirmLaunch` consumes it and ignores client-supplied baselines; forgery, foreign sender and replay are refused and covered by tests |
| P1 | `extension.js` referenced `Clutter` without importing it, so input controller construction would throw | **Fixed**: `import Clutter from 'gi://Clutter'` |
| P1 | Profile validation accepted `0750`, weaker than the documented `0700` boundary | **Fixed**: any group or other permission bit is refused; regression case added for `0750` |
| P2 | Browser cancellation was not propagated; a cancelled click could still run | **Fixed in source**: `context.signal` threaded through tool → manager → worker, with abandoned responses ignored and an explicit "already-dispatched action may still complete" statement |
| P2 | A missing auth guard was treated as `idle` (fail-open) | **Fixed**: the plugin now creates one guard per load and injects it, so absence cannot mean idle |
| P2 | The legacy ydotool screenshot tool remained registered in source | **Fixed**: removed from `registerDesktopTools`; its permission test was retired with it |

The reviewer also corrected several documentation claims (runtime package
"unwired", browser "not a tool", stale test counts); those are reconciled.

Both remaining P2 items are now addressed in source and tests. The runtime
package's bounded owner queue is wired to both tool surfaces by
`.opencode/plugins/computer-use/serialization.ts`: one queue per plugin load, owner
key `surface:sessionID`, ordered mutations, independent sessions, cancellation of a
queued call, and a deadline that releases a stuck operation's slot. The reviewer's
warning that an operation ignoring its abort signal could hold a slot is bounded
the same way: the caller is rejected with an explicit "abandoned, state may still
change" error, and the next call proceeds. The same module now validates caller attribution at the tool boundary: it maps the
tool context onto the runtime's `{sessionID, agent, messageID, callID}` shape and
rejects `INVALID_CONTEXT` before a permission check, queue entry or browser/desktop
action happens, so `validateCallerAttribution` is no longer test-only. Twelve cases
in `serialization.test.ts` cover the queue, deadline and attribution behaviour; the
plugin suite is 91/91. What is
still unproven is live behaviour under a real hung Shell or browser call, so this is
recorded as closed in source rather than demonstrated in a session.

The persistent daemon does not by itself prove cross-process observation binding
worked end to end at that checkpoint, because the then-installed extension lacked `Begin`/`InputBegin`.
What it does prove is that one daemon holds one connection and answers sequential
requests against the live Shell.

## Live-probe findings (private entry)

The human probe has not completed yet, but running it repeatedly already paid for
itself. Three defects were found by execution that no synthetic test had caught:

| Finding | Consequence | Disposition |
| --- | --- | --- |
| `GtkPasswordEntry` has no bound `set_placeholder_text` in PyGObject | The dialog crashed during construction, so every invocation failed with a bare exit code | Fixed: call through `Gtk.Editable` with a cosmetic-only guard |
| My first diagnostic fix forwarded helper stderr into the caller's error text | A helper that echoed the typed value would have pushed it into tool output; the existing leak test failed on `marker-secret` | Reverted: stderr stays discarded; the helper publishes explicit `failed:display|internal|spec` categories on stdout, mapped to fixed sentences |
| `/tmp/opencode` is mode 775 | The stager refused the destination before showing any dialog | Working as designed; the probe now uses a `0700` parent |
| A fourth probe run ended in a human **cancel** | The dialog stayed open about five minutes, then reported `cancelled` with exit 2, wrote no target file and removed its private spec file | Cancellation fails closed; this is not staging acceptance |

Private-entry suite is 13/13, including a case asserting a reported category never
carries the marker.

Manual paste note: a human may paste the value into the dialog themselves. That is
ordinary text entry by the user; the agent never reads or writes the clipboard.
It does not change the scope limit — the value still has to be copied by a person.

## Live browser acceptance (tool level, 2026-10-27)

The `web` tool registrations were loaded in a **fresh Node process** (so the module
cached by the nine-hour-old service cannot mask a failure) and driven against real
Chrome, real profiles and real pages. Nothing was faked except the permission
callback.

Single-session run (`https://example.com/`):

| Step | Observed |
| --- | --- |
| worker startup | `browser-worker-ready: channel=chrome` |
| `open` | opaque tab id `cu1.…tab-target.…`, title `Example Domain` |
| `snapshot` | 1,283 bytes, 8 `[ref=…]` entries |
| `screenshot` | one inline `data:image/png;base64` file part, 175,274 bytes, valid PNG signature, 2036×1366 |
| `close` | worker cancelled, tabs discarded, isolated profile retained |

Two-session isolation run:

| Check | Observed |
| --- | --- |
| distinct tabs | two different `cu1.…` tab ids |
| own-session snapshots | both sessions snapshotted their own tab (1,283 bytes each) |
| cross-session tab id | refused: `FOREIGN_TAB — That tab does not belong to this session's browser worker.` |
| third concurrent worker | refused: `CAPACITY_EXCEEDED — The browser worker limit has been reached.` |
| profile separation | two directories under `browser-profiles/<projectKey>/ses_isolation…`, both mode `0700` |
| screenshot beside another live worker | 175,274-byte PNG |

That tool-level checkpoint did **not** cover discovery inside a running OpenCode
session or nested model image delivery. The later in-session checks below cover
those observations; this historical gap is not a new service-restart request.

The same checks are reproducible without any scratch file:

```bash
node --experimental-strip-types tools/computer-use-browser/live-acceptance.mjs
```

That script drives the real `web` registrations, prints PASS/FAIL per check, cleans
up its own profiles and exits non-zero on failure.

### In-session checks (observed 2026-10-27, after the second restart)

Run from this agent session, on the live service (PID 253390, healthy at 16:42:22),
through Code Mode:

| Step | Observed |
| --- | --- |
| `web.open` | `{"tabId":"cu1.SnS8rSVtbImm-Jll.tab-target.…","url":"https://example.com/","title":"Example Domain"}` — tool discovery in a running session works, not just module load |
| `web.snapshot` | 1,283 bytes, `generation:1`, 8 `[ref=…]` entries |
| `web.screenshot` | the PNG was **delivered to the model**: the rendered example.com page is visible in this conversation, so nested image delivery through Code Mode is proven, not inferred from JSON |
| `web.close` | `{"cancelled":true,"discarded":["browser worker","tabs"],"retained":["isolated profile data"]}` |

The later login and INPUT_FAILED result supersede the old pending-login blocker;
see the current source/deployment boundary above.

## Rollback defect found and fixed

Driving the real entry point with a fake context exposed a partial rollback:
`capture` and `input`/`release`/`launch` declare `codemode: true` themselves, so a
transform that only "skipped flipping" left **four desktop tools in Code Mode** even
with `directTools: true`. The documented rollback was therefore not a rollback.

`codemode.ts` now treats the option as authoritative in both directions: default
switches every owned tool to Code Mode, `directTools: true` switches every owned tool
back to direct, and tools from other namespaces (memory, github, …) are never touched
either way. Entry-point evidence: default 11 desktop + 7 web all Code Mode; rollback 0
of 19; the same 19 tools registered either way.

## Password inputs only for private sign-in

The privileged fill path accepts `text`, `email` and `password` fields, because a
sign-in form may need a username. A private *password* entry is narrower: `web.signin`
now demands `input[type=password]` and refuses otherwise with
`CREDENTIAL_TARGET_INVALID`. Without that check a model could point the flow at a search
box or username field, putting a password on screen in clear text and possibly
submitting it to the wrong destination.

The requirement is opt-in at the backend (`requirePasswordField`) so an ordinary
credential fill is unchanged. Two cases cover it: a `text` field is refused with the
field untouched, and an `email` field still fills when the requirement is not set.
Browser suite 40/40; the live sign-in acceptance still passes 8/8 on a real password
field.

## Independent review (post-p8 surface)

A reviewer that did not write this code reproduced the suites and produced seven findings;
each was checked here rather than accepted on report.

| # | Finding | Verified? | Disposition |
| --- | --- | --- | --- |
| 1 | A queued desktop call could dispatch after private sign-in began (guard checked only on entry) | **Yes** — reproduced with a held permission, then released | Fixed: the guard is re-checked when queued work starts. The first attempt threw inside the queue and leaked an unhandled rejection; the working version returns a tagged `blocked` result and rejects outside the queue, like the deadline. Test flips the guard while a call is queued and asserts nothing dispatches |
| 2 | Password fields beyond the 40th were left in clear text (probe cap), contradicting the README's "every password-typed input" | **Yes** — reproduced with a 41st field | Fixed: 200-probe bound, restricted to fillable-field lines; test with 45 password fields redacts all 45 |
| 3 | A screenshot after sign-in can capture a password the page renders in clear text | Partly — source-level and page-dependent | **Mitigated**: a tab that had a credential filled refuses `screenshot` until it navigates or closes, so the realistic "form still showing the value" case cannot be photographed. Residual: a page that renders the value on a *different* tab or after navigation is not covered, and image redaction remains impossible |
| 4 | Only the latest eight credential values were scrubbed | **Yes** — reproduced with nine fills | Fixed: values retained to a 64 KB budget; test fills twelve and asserts the first is still scrubbed |
| 5 | `tabs.new` / `tabs.close` returned every tab's URL and title under `browser_open` / `browser_close` | **Yes** — reproduced with a second user-owned tab | Fixed: both return only the affected tab; test asserts another tab's private URL never appears while `list` still shows it |
| 6 | `tabs` was classified as an interleavable read although it creates and closes tabs | **Yes** (source) | Fixed: treated as a mutation; test asserts two `tabs` calls never overlap |
| 7 | Code Mode ownership inferred from namespace, so another plugin's `web`/`desktop` tool could be rewritten | Conditional (depends on transform scope) | Fixed: the transform is scoped to the exact ids this plugin registered |

Documentation drift reported by the reviewer was also real and is corrected: browser suite
29 → 42, tool count 18 → 19, `signin` documented, the stale "guard not injected" claim
removed, and the child environment described as six base variables plus up to four
display/bus addresses.

After the fixes: plugin **112/112**, browser **42/42**, scripts **82/82**, deployer **6/6**,
browser live acceptance **16/16**, sign-in acceptance **8/8**.

## Second review round: the fixes were not good enough

A second independent pass reviewed only the fixes made after the first review. It found
two High and two smaller defects in the fixes themselves, all of which held up:

| Finding | Verified? | Disposition |
| --- | --- | --- |
| `desktop.capture` bypassed the filled-tab screenshot refusal — only `web.screenshot` was guarded, and the compositor photographs the same window | Yes — traced through registration and cleanup | Fixed: one `credential-safety` instance per plugin load, shared by both surfaces. Any filled tab now refuses compositor capture for that session |
| The password-field probe still capped at 200, so the 201st field leaked | Yes — reproduced with a 201-field probe | Fixed properly: one `document.querySelectorAll('input[type=password]')` query replaces per-line probing, so the bound no longer exists and echoed values are scrubbed anywhere in the snapshot |
| Retention eviction silently removed protection, and the budget counted characters rather than UTF-8 bytes | Yes — reproduced after 251 fills | Fixed: byte-accurate accounting with a 1 MiB budget, and the README states that past the budget the oldest value is dropped |
| Closing a browser session left stale tab flags | Yes (source) | Fixed: `clearSession` on close, with a test proving session A's flags do not clear session B's |
| History navigation (`back`/`forward`/`reload`) cleared the flag although form state can be restored from cache | Unverified risk | Tightened: only a URL navigation clears it |

A third risk was mine, not the reviewer's: a flag that never clears would block compositor
capture for a session whose worker died before `web.close`. Filled-tab flags now expire
after 30 minutes, with a test that moves the clock forward and shows capture resuming.

The lesson from both rounds is the same and is worth stating plainly: **my first fix for a
finding is not evidence that the finding is closed.** Both rounds found the initial fix
incomplete — a per-line bound replaced a per-line bound, and a guard on one surface left
the other surface open.

## Cross-surface guard: the desktop surface was reachable during sign-in

The guard exposed per-operation predicates (`isCaptureBlocked`, `isObservationBlocked`,
`isControlBlocked`, `isScreenshotBlocked`, `isConsoleNetworkBlocked`) and **nothing in
the tools called any of them** — they appeared only in their own tests. The browser
surface used a blunt `state !== "idle"` check, and the desktop surface consulted no
guard at all.

That mattered: while a human typed a credential into the browser, `desktop.capture`
could have photographed that window and `desktop.input` could have typed into it — the
exact capability the private-entry design refuses. The browser-side window is the same
window the compositor sees, so a browser-only guard is not enough.

Fix: the shared tool wrapper now refuses **every tool of a surface** while the guard is
not idle, with an explicit safety allowlist. Desktop allows only `release`, because
blocking it during sign-in could leave a held key or button stuck. A guard that throws
while reporting its state is treated as blocking, never as idle. Evidence:
`serialization.test.ts` covers capture/input/launch refused, `release` still working,
recovery after cancel, and the throwing-guard case; plugin suite **98/98**.

## Credential leak found live, then fixed

Driving the real credential fill against a local test page (synthetic value, no real
secret, nothing leaves `127.0.0.1`) exposed a genuine leak that the fake-boundary
tests could not see. After a fill, the next accessibility snapshot returned the field
value in clear text:

```
- textbox "Password" [active] [ref=e5]: synthetic-probe-value-123
```

That is precisely the exposure the private sign-in path exists to prevent: the value
survives in the field after a cancel or submit, so any later `snapshot` would hand a
real password to the model and into the transcript.

Fix in `tools/computer-use-browser/src/ops.ts`: every value that passes through
`fillCredential` is remembered and scrubbed from text that leaves the worker —
snapshot text, tab titles and tab URLs. Long values are replaced wherever they occur;
short values are matched as whole tokens so redaction cannot shred unrelated page
text. Re-running the same live probe:

```
- textbox "Password" [active] [ref=e5]: [redacted]
- paragraph [ref=e8]: len=25
```

The `len=25` marker is the page's own attestation that the 25-character synthetic
value really reached the field, while the value itself never appears. Two
fake-boundary cases cover the behaviour (`a filled credential never appears in a
later snapshot`, `a short filled credential is redacted as a whole token only`); the
browser suite is 36/36.

Redaction has two layers, because either alone leaves a hole:

1. **Value-based** — every value that passed through `fillCredential` is scrubbed
   wherever it appears in snapshot text, titles and URLs. This catches the value being
   reflected into another element, but only for values this worker typed.
2. **Structural** — every snapshot line whose ref resolves to a password-typed input
   has its rendered value replaced regardless of what the value is or who typed it.

Live evidence for layer 2, on a page whose password field is pre-filled by the page
itself and never touches the credential path:

```
- textbox "Password" [ref=e5]: [redacted]
- textbox "Search" [ref=e8]: visible query
```

The password value is gone and an ordinary text field keeps its value, so redaction is
targeted rather than blanket. Residual limit, stated plainly: a page that *transforms*
the value into another element (hashing it, reversing it) still surfaces a derivative,
because the worker cannot know it is derived. Nothing here reads page JavaScript or
DOM values to hunt for that.

## Deployment safety, verified in a sandbox

The deployer was exercised against a throwaway target in `/tmp` (mode 700, real UUID
name), never against the live extension. It is defensive in ways the acceptance
contract needs:

| Attempt | Result |
| --- | --- |
| target dir not named `opencode-window-control@computer-use.local` | refused: "must be named …" |
| target dir with pre-existing unmanaged files | refused: "Refusing to take ownership of existing unmanaged extension files" |
| apply to an empty managed target | writes 5 files + marker, `verified: true`, `enablement: not performed`, `restart: not performed` |
| file edited outside deployment, then re-apply | refused: "Managed target files changed outside deployment; preserve and review them" |
| managed file restored, then re-apply | accepted, `changes: []` — idempotent, nothing rewritten |

All five deployed files in the live extension directory parse: `node --check` on
`extension.js`, `capture.mjs`, `policy.mjs`, `runtime-contract.mjs`, and a JSON parse
of `metadata.json`. That matters before a logout, because a syntax error would break
the Shell extension the next time it loads.

**Rollback material exists and is intact.** The live extension directory holds
timestamped snapshots with the pre-deployment originals
(`.backups/20261027T082011…`, `.backups/20261027T201745…`). The procedure — copy the
snapshot back over the target, then re-run the deployer — was rehearsed in the
sandbox (restore → accepted, `changes: []`). It has **not** been executed against the
live extension, because that would modify deployed files without the approval that
governs them; so rollback is *prepared and rehearsed*, not demonstrated live.

## Verifier review, round 2 (2026-10-27, late)

An independent reviewer audited the acceptance tooling itself (nine scripts) after the first
round. Eight findings were real and are fixed; the important ones:

| Finding | Why it mattered | Fix |
| --- | --- | --- |
| `--debug` copied the instrumented extension through the data-home symlink into the **live** extension directory | A debug run could overwrite the deployed artifact — the exact thing the harness exists to avoid | Debug mode now builds its own real data home under scratch, with a `realpath` guard; verified afterwards that the deployed `extension.js` hash and the 7/7 drift were unchanged |
| `live-desktop-acceptance.mjs` returned early on failure, skipping the exit code and daemon cleanup | A failed tool run could exit 0 | One `try/finally` sets the code and stops the daemon on every path |
| Rollback compared the deployer's **desired-source manifest**, not the target files | "Every hash restored" could pass with the target still wrong | The rehearsal hashes the actual files in the target before and after, and re-apply failure is now reported |
| The workflow's `--tolerate-missing-seat` exited 0 before the pixel comparison | "Visible outcome" could look accepted with no change | It now exits **3** and the harness prints `INCOMPLETE workflow …` instead of a pass |
| Isolation used a constant `OCWC_FRESH_SHELL_INNER=1` | A caller could skip the private bus | Per-invocation nonce, single-use, removed when the inner run starts |
| Image generation piped to `tee` without its status | Multi-chunk ordering could be skipped silently | Generation failure now fails the run |
| `resilience-acceptance` stopped the newest matching process globally | It could freeze another session's daemon and leave it stopped | It now matches the daemon whose parent is this harness and always resumes on exit |
| Profile-lock and TLS checks matched substrings and unscoped processes | A stale lock or a foreign Chrome could satisfy them | Exact JSON/error parsing, a guaranteed-dead pid, and Chrome processes filtered to this run's profile directory |

Also fixed: `--debug` read a `launch.json` that no longer exists (so the documented debug run
could not pass), `live-capture-check.py` ignored subprocess exit status, and the browser
acceptances used fixed session ids that a recursive cleanup could delete. Session ids are now
per-run.

## Measured latency (live, warm service)

Two runs of `web.open` → `web.snapshot` → `web.screenshot` → `web.close` from this
session, through Code Mode, on `https://example.com/`:

| Step | Run 1 | Run 2 |
| --- | --- | --- |
| `open` (cold: starts worker + Chrome) | 2,387 ms | — |
| `snapshot` (1,283 bytes, 8 refs) | 351 ms | — |
| `screenshot` (inline PNG) | 1,051 ms | — |
| `close` (worker shutdown) | 1,579 ms | — |
| whole cycle | 5,368 ms | — |

`open` is dominated by worker and browser start; per-observation cost is sub-second
once warm.

Desktop tool level, measured in a private Shell with a warm daemon (two runs):

| Call | ms | Result payload |
| --- | --- | --- |
| `desktop.windows` | 213 / 247 (warm) | inventory JSON |
| `desktop.capture` (750×570) | 284 / 296 | 12.7 KB inline PNG + ~200 B metadata |
| `desktop.release` | 6 / 8 | short status |
| `desktop.input` (refused, no seat) | 4 / 5 | bounded error text |
| `desktop.launch` (refused, no seat) | 5 / 7 | bounded error text |

Payload sizes matter more than milliseconds for token cost, and these are measured rather
than estimated: a desktop capture costs one ~13 KB image per observation, a browser
snapshot costs ~1.3 KB of text with 8 refs, and a browser screenshot costs a ~175 KB PNG.
No per-call token counter is instrumented, so token cost is inferred from payload bytes,
not measured directly.

Queue behaviour and recovery cost, measured live through the production wrapper
(two sessions, `https://example.com/`, warm worker):

| Measurement | Value | Meaning |
| --- | --- | --- |
| single `screenshot` (warm, fastest of 6) | 214 ms | baseline |
| two `screenshot` calls in **one** session | 530 ms (2.48×) | serialized, as designed |
| two `screenshot` calls in **two** sessions | 344 ms (1.6×) | overlapping — separate workers |
| refused `snapshot` (foreign tab id) | 5 ms | fails fast, no queue delay |
| next normal call after the refusal | 328 ms | no lingering slot or penalty |

So the per-session queue really does serialize, the surfaces really are independent
across sessions, and a refusal costs nothing afterwards. Those timings were taken by an
operator script, not asserted as a test, because the thresholds depend on the machine.

Private-sign-in blocking, measured on the real tool surface with a real guard:
entering the sign-in state refuses `snapshot`, `screenshot` **and** `tabs` in ~0 ms
(the tool layer is deliberately stricter than the backend, which classifies tab
listing as status), and after `cancel` the surface is usable again in 344 ms with a
warm worker. So blocking is free and recovery is sub-second. Token and turn counts are visible in the session, but no instrumentation
records recovery cost after a failure, so that part of the efficiency criterion stays
open rather than assumed.

## Blockers requiring explicit approval

**A. Browser in-session acceptance: closed.**
The earlier "the service caches a pre-fix module" explanation was **wrong**. The real
cause was child stdio: `spawnWorker` used `stdio: ["pipe","pipe","inherit"]`, so the
worker and Chrome wrote into the service's own stderr, which in the daemonized service
is a socket whose reader can be gone. The worker's first diagnostic line then failed
the write and killed the process just after it reported ready, which surfaced as an
unexplained `WORKER_CRASHED`. Evidence, same worker/profile/session:

| Parent stderr | Worker stdio | Result |
| --- | --- | --- |
| dead pipe (simulates the daemon) | `inherit` (old) | `Browser error (WORKER_CRASHED)` — reproduced the live symptom |
| dead pipe (same condition) | dedicated pipe drained by the parent (new) | real tab opened |

Fixed in `tools/computer-use-browser/src/manager.ts`: the worker now owns a stderr
pipe, the parent keeps a 2 KiB ring buffer, and crash errors carry a 300-character
excerpt. Two tests cover the excerpt and its cap; the browser suite is 31/31. An audit
of the other child processes found this was the only inherited stdio: the desktop
bridge daemon uses `ignore` and the private-entry helper a dedicated fd-3 pipe.

After the restart the in-session run above passed, including real image delivery.
Correction, recorded because the earlier note in this file was wrong: the service
**does** re-run `setup` when a plugin file changes. A temporary reference to an
undefined helper made the transform fail, the log reported
`disabled plugin after transform failure ... ReferenceError: authGuardRef is not
defined`, the `desktop`/`web` namespaces disappeared from the live catalog, and they
came back once the file was fixed — which is only possible if `setup` re-ran. The
practical consequence is the opposite of what was written before: edit plugin files
only after the entry-point harness passes, because a broken save is visible to the
running session within seconds. Restarting matters for the *service's own* module
graph, not for plugin re-registration.

**B. Chromium sandbox (informational: no change required here).**
The bundled Playwright Chromium cannot sandbox on this machine
(`chrome_sandbox` is `-rwxr-xr-x james james`,
`kernel.apparmor_restrict_unprivileged_userns = 1`), so the worker selects the
installed Google Chrome, whose helper is `rwsr-xr-x root root`. That fallback is
working, so **no system change is needed**. The setuid commands below are recorded
only for a host that has neither unprivileged namespaces nor a setuid helper for
any installed browser, and they need separate approval there:

```bash
sudo chown root:root ~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome_sandbox
sudo chmod 4755 ~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome_sandbox
```

Dropping the sandbox is explicitly rejected as a fallback.

### Engine-level evidence that does not need the reload

Two harnesses now run the **deployed** controllers inside the real GJS runtime, so the
reload only has to prove the Shell plumbing:

| Harness | Result | What it covers |
| --- | --- | --- |
| `tools/gnome-window-control/capture-gjs-acceptance.mjs` | **8/8** | handle minting, geometry, base64 chunking byte-identical to the source image, wrong chunk index refused, foreign sender refused, buffer release |
| `tools/gnome-window-control/input-launch-gjs-smoke.mjs` | **8/8** | both modules load under GJS, controllers construct, invalid dependencies refused, `releaseAll` with nothing held, unknown application refused, clean disposal |

Neither substitutes for a reloaded Shell: capture's texture/stream plumbing and the real
seat/AppSystem adapters are only exercised there.

### Every in-session reload path is exhausted (proven, not assumed)

Before asking for another logout, all supported ways to reload a changed extension were
tried on this machine (GNOME Shell 50.1, Wayland):

| Attempt | Result |
| --- | --- |
| `gnome-extensions disable` + `enable` | extension restarts, but the old module is served — capture still failed with `bytes.get_data` |
| `org.gnome.Shell.Extensions.ReloadExtension(uuid)` | `UnknownMethod: Method ReloadExtension is not implemented` in this version (the method is declared, not implemented) |
| Editing the deployed file and re-importing | GJS caches modules by URL, so changed code is never re-read in a live process |

So a new Shell process is the only path, which means a logout/login (or a reboot). That is
recorded here so nobody spends another hour on the alternatives.

For a fresh session, [HANDOFF.md](HANDOFF.md) carries the paste-ready prompt, the verified
state, both blockers and the exact next commands. It is historical context: re-verify before
acting.

## Fresh-Shell acceptance: capture proven without a logout

The user's Shell cannot reload the changed extension, so acceptance was blocked on a
logout. A private headless Shell removes that block for everything except input and
launch: `tools/gnome-window-control/fresh-shell-acceptance.sh` re-executes itself under
`dbus-run-session`, so it can never inherit the operator's bus, then starts GNOME Shell
with `--headless --virtual-monitor` on its own D-Bus session and Wayland display, loads the
deployed extension there, and drives the bridge. Nothing touches the user's session.

Result on the deployed code (`2026-10-27 19:44`, repeated plain and `--debug`):

| Check | Observed |
| --- | --- |
| extension load | PASS — bridge on the bus in a fresh process |
| reviewed methods | PASS — all **16** present exactly once (`Abort`, `Apply`, `Begin`, `Chunk`, `ConfirmLaunch`, `End`, `GetState`, `InputBegin`, `InputClick`, `InputDrag`, `InputPressKey`, `InputReleaseAll`, `InputScroll`, `InputTypeText`, `Launch`, `Preview`) |
| inventory | PASS — the target window, matched by this run's unique scratch path (GNOME Text Editor restores earlier documents, so a fixed filename would match a stale window) |
| capture | **PASS** — 13–20 KB PNG, 750×570, valid signature, `observationId` present |
| capture over one daemon sender | PASS |
| observation-bound click | **NOTE** — refused `INPUT_FAILED`; stack localizes it to `seat.create_virtual_device()` throwing |
| release after the refused click | PASS — nothing stayed held |
| launch | **PASS** — `Launched org.gnome.Calculator.desktop; matching window(s) appeared: …` was the first launch; an earlier refusal was the uint32 timestamp bug, not the environment |
| unknown window id | **PASS** — refused `Error.STALE` (exact code asserted) |
| impossible byte bound | **PASS** — refused before any chunk is requested, "Capture exceeds the requested maxBytes limit"; the client also aborts the bridge capture |
| window closed before capture | **PASS (fail-closed)** — refused with a context error, **not** `STALE` |

Two corrections belong in the audit trail. First, an earlier version of this table called
the closed-window case `STALE`; the stricter harness showed the Shell refuses the *context*
instead (the desktop is mid-transition after the owning process dies), so the claim was
narrowed to what is actually observed: no capture of a closed window is produced. Second,
the earlier 8/8 method count was a line count; it is now a per-method presence check over
all 16 methods.

### Chunk ordering, replay, abort and release, live at the bridge

`tools/gnome-window-control/bridge-protocol-acceptance.py` drives `Begin`/`Chunk`/`End`/
`Abort` directly over one sender, so the transport rules are checked against the running
bridge rather than a controller double. Two runs are recorded:

| Rule | Single-chunk window | 25-chunk image (890,011 bytes) |
| --- | --- | --- |
| `Begin` returns a usable handle | PASS | PASS |
| a second `Begin` while active | `BUSY` | `BUSY` |
| chunk index past the end | `INVALID_CHUNK` | `INVALID_CHUNK` |
| **chunk 1 before chunk 0** | n/a (one chunk) | `INVALID_CHUNK` |
| `End` before the last chunk | `INVALID_CHUNK` | `INVALID_CHUNK` |
| the refused `End` keeps the capture alive | PASS | PASS (chunk 0 still delivered) |
| **replaying a delivered chunk** | `INVALID_CHUNK` | `INVALID_CHUNK` |
| `Abort`, then `Chunk`/`End` | `INVALID_HANDLE` | `INVALID_HANDLE` |
| a foreign handle | `INVALID_HANDLE` | `INVALID_HANDLE` |
| `Begin` again after abort and after completion | PASS | PASS |
| abandoned capture left past the 15 s deadline | PASS — `Chunk`/`End` then refuse `INVALID_HANDLE` and a fresh `Begin` succeeds (buffer released) | not repeated on the large image |
| full transfer digest and dimensions | PASS | PASS (690×500) |

The multi-chunk run is the one that matters for ordering: a 640×400 incompressible image
forces 25 chunks, so "chunk 1 before chunk 0" is a real refusal, not a skipped case. The
harness fails if the image produces fewer than three chunks, so this cannot silently degrade
back to a single-chunk pass.

So the `asBytes` fix is **proven correct** against the deployed extension in a fresh Shell:
capture returns a validated PNG with an observation id, the unknown-id and size-bound
refusals hold live with exact codes, and the chunk transport rejects out-of-order, replayed
and post-abort requests while releasing the buffer on every exit path. It is still not the
operator's live Shell: that needs the logout described below.

### Why input and launch cannot be accepted here

`--debug` loads a scratch copy of the sources with one log line in the error mapper (the
deployed artifact is never modified) and prints the real stacks behind each refusal:

```
[ocwc-debug] code=INPUT_FAILED
  InputError -> fail -> createDevice (input.mjs:212) -> getPointerDevice -> movePointer -> click
[ocwc-debug] code=REFUSED
  LaunchError -> fail -> launch (launch.mjs:115) -> LaunchAsync
```

**This paragraph was wrong about launch, and the correction matters.** The stack pointed at
`app.activate_full()`, and I recorded "the headless backend cannot activate applications".
Instrumenting the launch catch (scratch copy only) showed the real error:

```
[ocwc-launch] Error: Argument timestamp: value is out of range for uint32
  activate_full@…/extension.js:451:29
```

`launch.mjs` passed `Date.now()` — epoch **milliseconds** — where Clutter expects a uint32
event timestamp, so GJS rejected the call before the compositor ever saw it. The same bug
would have refused every launch on a real seat. Two fixes followed:

- **Wall clock vs event time are now separate dependencies.** `launch.mjs` and `input.mjs`
  take an `eventTimestamp` (the Shell supplies `global.get_current_time()`) for device and
  activation calls, while `now()` remains the wall clock for TTL and confirmation
  bookkeeping. Out-of-range values are refused instead of overflowed.
- **Confirmation became a real capability call.** The Python client still sent
  `ConfirmLaunch(beforeWindowIds, {desktopId, timeoutMs})` and polled, while the extension
  had moved to a single-use `launchToken`. It now sends `ConfirmLaunch(token, {timeoutMs})`
  once, and the **extension** waits up to the bounded timeout because the token is
  single-use — polling in the client consumed the capability on the first call.

Consequences, verified in a private Shell after the fixes: `desktop.launch` reports
`Launched org.gnome.Calculator.desktop; matching window(s) appeared: …`, the workflow
confirms a matching window, captures it (410×666) and only then stops at the keystroke.

- **Fail-closed is still demonstrated:** the click refused, nothing stayed held (`release`
  PASS).
- **Input alone now needs the operator's session.** The headless seat genuinely cannot
  create a virtual device (`seat.create_virtual_device()` throws), so no keystroke or button
  has been delivered; launch and confirmation no longer belong on that list.

### What an independent review of the verifier changed

A reviewer who did not write the harness found that it could pass while proving less than it
claimed. Fixed:

- It never invoked `dbus-run-session` itself, so a direct run would have inherited the
  operator's bus and could have driven the live Shell. It now re-executes itself under its
  own bus.
- Refusal checks accepted *any* failure. They now assert exact codes, which is what exposed
  the wrong `STALE` claim above.
- The daemon step printed `PASS` even when capture or release failed; a refused click was a
  non-failing note for any reason. Each now asserts its own result.
- `gnome-text-editor` restores previous documents and is single-instance, so a fixed
  filename matched a stale window and the launcher PID was not the window owner. The target
  is matched by a unique per-run path, editors get a private config home (so the operator's
  editor session is untouched), and closing uses the inventory PID.
- The scratch directory was a fixed path that was deleted at start-up; it is now
  `mktemp -d`, and cleanup always runs.

One trap worth recording, because it cost an hour: the agent runtime exports
`XDG_DATA_HOME=<pilot data dir>`, and a harness that honours it makes the private Shell
look for extensions in a directory where ours is not installed — the bridge then never
appears and the run looks like a product failure. The script now pins
`XDG_DATA_HOME`/`XDG_CONFIG_HOME` to the user's real homes.

**C. Desktop live acceptance: three real defects found, one reload still needed.**
The logout/login did happen (the bridge now exposes `Begin`/`Chunk`/`End`/`Abort`,
`InputBegin`/`InputClick`/`InputDrag`/`InputScroll`/`InputPressKey`/`InputTypeText`/
`InputReleaseAll`, `Launch`/`ConfirmLaunch`), so live desktop acceptance finally ran —
and it immediately found three defects that no test could see:

| Attempt | Result | Cause | Disposition |
| --- | --- | --- | --- |
| `launch org.gnome.Calculator.desktop` | `Failed to load launch.mjs: No such file or directory` | The deployer's managed set omitted `input.mjs` and `launch.mjs`, although `extension.js` imports them dynamically | Both added to `FILES`; a new deployer test asserts every dynamic import in `extension.js` is managed and fails when one is removed |
| `capture` a window | `CAPTURE_FAILED: bytes.get_data is not a function` | `extension.js` passed `get_data()`-style helpers to `capture.mjs`, which hands over a `Uint8Array` | Helpers now accept either shape via `asBytes`; deployed and hash-verified |
| disable/enable the extension | still the old code | GJS caches a module by URL, so re-importing the same file returns the cached module | Reloading the extension is not enough; the Shell process must restart |

All three fixes are in source, deployed and hash-verified; all seven deployed files now
match their sources. The checksum fix was also proved outside the Shell with the real GJS
runtime:

```
$ gjs -m /tmp/asbytes-test.js
digest: 4c4b6a3be13...        # GLib.compute_checksum_for_data(SHA256, Uint8Array)
base64: iVBORw0KGgo=          # GLib.base64_encode(Uint8Array)
asBytes passthrough: true
```

### Tool-level acceptance (the first time capture worked through the tool)

The bridge working and the *tool* working are different claims, and until now only the
bridge had live evidence. `.opencode/plugins/computer-use/live-desktop-acceptance.mjs`
drives the production definitions — registration, `withSerializedTools`, the exposure
policy, the shared credential guard — against a live bridge. Run inside a private headless
Shell (latest run `2026-10-27 20:40`), **17/17**:

| Check | Observed |
| --- | --- |
| registration | 11 desktop tools, all in the `desktop` namespace |
| exposure policy | 11/11 default to Code Mode (the plugin's second transform is applied) |
| inventory | `desktop.windows` reports the target window |
| content-only | `desktop.capture` declares no `output` schema |
| **image delivery** | inline `data:image/png;base64` file part, **12,718 bytes**, 750×570 |
| metadata | window id and observation id present; dimensions match the PNG IHDR |
| no filesystem path | `metadata.path` is undefined |
| permission ordering | `desktop/capture` permission requested before dispatch |
| release | `desktop.release` succeeds against the bridge |
| input refusal | a well-formed but unknown observation id is refused in bounded text |
| launch | **PASS** — `Launched org.gnome.Calculator.desktop; matching window(s) appeared: …` (after the uint32-timestamp fix) |
| no stack leakage | refusal text contains no `at … .ts:12` frames |
| attribution | a caller with an empty `sessionID` is refused before anything dispatches |
| child environment | the bridge daemon runs with **7** environment names (HOME, PATH, LANG, the bus/runtime/display addresses, and PWD) — no `*KEY*`, `*TOKEN*`, `*SECRET*`, `AWS*`, `OPENAI*` or `ANTHROPIC*` name is present |

This is the first evidence that `desktop.capture` produces an image part rather than JSON
or an error, i.e. the surface the model actually consumes. It still runs against a private
Shell: the operator's Shell needs the logout before the same harness can pass *there*.

The run also exposed a small reporting defect: the bridge's own `"Desktop input failed: …"`
was wrapped again, so the model read `"Desktop input failed: Desktop input failed: …"`.
Fixed in `bridge.ts` (`failureText` keeps a single prefix) with a regression test, and the
capture path now uses the same canonical prefix.

### Two live-state findings from the same evening

- **The live bridge went `INACTIVE` between 19:49 and 19:57 and came back at 20:16.** The
  extension now reports `Enabled: Yes, State: ACTIVE` and `list` works, while `capture` and
  `launch` still fail exactly as the pre-fix module does — so the Shell re-ran the cached
  module rather than the files on disk. Nothing was re-enabled by hand here; extension
  activation is a separately approved action. The login is what loads the fixed code.
- **Private Shells were writing the operator's session state.** They shared
  `XDG_DATA_HOME=$HOME/.local/share`, so `session-active-history.json`, `session.gvdb` and
  `application_state` were rewritten by test runs (mtimes 19:51 and 19:58). The harness now
  uses a private data home whose `gnome-shell/extensions` is a symlink to the real one:
  after the fix, a full run leaves those files untouched (mtime stayed 19:58:31) while the
  deployed extension still loads and capture still passes. Editor state is isolated the same
  way, so the private Shell never restores the operator's documents either.

### Profile locks fail closed, and stale locks are reclaimed

`tools/computer-use-browser/profile-lock-acceptance.mjs` writes the same `SingletonLock`
shape Chromium uses into a real session profile and drives the production `web` tools:

| Case | Observed |
| --- | --- |
| first open (creates the profile) | succeeds, `tabId` returned |
| profile locked by a **live** process (`<host>-<this pid>`) | refused: `Browser error (PROFILE_LOCKED): The isolated browser profile is already in use.` |
| lock left by a **dead** process (`<host>-999999`) | reclaimed, open succeeds |
| stale lock file afterwards | removed |

Both branches matter: refusing a live lock prevents two workers corrupting one profile, and
reclaiming a dead one prevents a crashed run from wedging a session forever. The profile is
removed afterwards.

### TLS and sandbox, checked live

`tools/computer-use-browser/tls-sandbox-acceptance.mjs` starts a local HTTPS server with a
self-signed certificate and drives the production `web` tools against it, then against a
normally trusted site, while inspecting the Chrome processes that are actually running:

| Check | Observed |
| --- | --- |
| untrusted certificate | **refused** — `Browser error (OPERATION_FAILED): … network failure: ERR_CERT_AUTHORITY_INVALID` |
| normally trusted site | opens (opaque tab id, title `Example Domain`) |
| sandbox | **no** Chrome process carries `--no-sandbox` / `--disable-setuid-sandbox` (30 processes checked) |
| setuid helper | `/opt/google/chrome/chrome-sandbox` present and setuid |

Finding on the way: every non-crash backend error was collapsed to the fixed phrase
"The browser operation failed." at the tool boundary, so a TLS refusal was indistinguishable
from any other failure. The backend now keeps the one safe detail it has — a Chromium
network failure name — and the tool surfaces it. The sanitizer only forwards `ERR_*` tokens,
so a URL, query string or page value still cannot reach the model through this path.

### Browser worker crash: fail closed, then recover

`crash-recovery-acceptance.mjs` kills the worker process behind a live tab:

| Step | Observed |
| --- | --- |
| the call after the kill | `Browser error (WORKER_CRASHED): … reopen the browser session` — reported, never silently replayed |
| an explicit `open` | a new worker starts, page loads |
| the next `snapshot` | generation returned |
| measured recovery (kill → working snapshot via reopen) | **2,583 ms** |
| afterwards | zero worker processes and zero Chrome processes for that session |

So the browser side is fail-closed by design (a dead worker is reported, not restarted
underneath the caller) and recovery is an explicit, measured reopen rather than an
assumption.

### Boundary resilience: a frozen bridge fails bounded and recovers

`resilience-acceptance.mjs` (run by the private-Shell harness) freezes the bridge daemon the
plugin spawned, calls again, then continues it — all in one process so the daemon and the
call cannot race:

| Step | Observed |
| --- | --- |
| normal capture through the tool layer | 231 ms, PNG file part |
| capture while the daemon is `SIGSTOP`ped | bounded error after **11,002 ms** (`timed out …`), no hang |
| capture after the daemon continues | 218 ms, PNG file part |

So the serialized surface releases its slot on a stalled child instead of wedging, and the
next call works without a restart. This is the first end-to-end evidence for the
cancellation/deadline contract, which until now existed only in unit tests.

### Rollback, demonstrated on the real deployer

`tools/gnome-window-control/rollback-acceptance.sh` rehearses the artifact half of rollback
against the reviewed deployer, in a throwaway target:

| Step | Observed |
| --- | --- |
| deploy the reviewed files into a temporary target | 7/7 managed files |
| restore a real snapshot (files **and** its ownership marker) | 2 files restored |
| dry run on the rolled-back tree | owned, and reports the pending forward change (`extension.js`) |
| re-apply the reviewed files | every hash matches the earlier state |
| live deployment | untouched throughout, still 7/7 against source |

Restoring the marker alongside the files is the part that matters: without it the deployer
correctly refuses the tree as an out-of-band edit, so a rollback that copies only the code
files leaves a state the next deployment will not touch.

The deployer's snapshots all postdate the capture fix, so the rehearsal above covers the
mechanism, not a historic file comparison. The **behavioural** comparison is available
anyway, because the operator's Shell re-enabled the extension at 20:16 while still holding
the module loaded at 18:04. Same bridge, same deployed files on disk, two code paths:

| Call | Live Shell (module loaded 18:04, pre-fix) | Private Shell (current deployed files) |
| --- | --- | --- |
| `capture` | `CAPTURE_FAILED: bytes.get_data is not a function` | validated 750×570 PNG |
| `launch` | `REFUSED` (the uint32 timestamp bug) | `Launched … matching window(s) appeared` |
| `list` | works | works |

So the old artifact fails exactly where it used to, the new artifact works in a fresh
process, and the only thing standing between them is a login that reloads the modules. The
exposure rollback (`directTools: true` → 0 Code Mode tools) remains the other demonstrated
rollback.

### Visible-outcome workflow (requires approval)

Once the extension is active, one command runs the whole GUI workflow:

```bash
python3 tools/gnome-window-control/desktop-workflow-acceptance.py --yes
```

It refuses without `--yes`, then: lists windows → launches `org.gnome.Calculator.desktop` →
confirms a new window appeared → captures it → types `1+1=` → captures again → requires the
pixels to have changed → releases held input → closes the calculator process it launched.
Everything runs over one `desktop-windows.py serve` connection because launch tokens and
observations are sender-bound.

What is exercised today: the approval gate, inventory, launch, confirmation of the new
window, and the capture before typing (410×666) — the run then stops at the keystroke with
`INPUT_FAILED` and exits **3**, which the harness reports as `INCOMPLETE workflow` rather
than a pass. What is **not** exercised: the visible change after typing, which needs a real
seat. It is deliberately opt-in because it launches an application and sends keystrokes.

### Completion audit (2026-10-27, late)

Requirement-by-requirement, with the strongest evidence actually obtained. "Accepted" means
observed on a live component; "source-only" means tests pass but no live process exercised it.

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Standalone stock OpenCode v2, no Codex runtime/credentials, no fork | **Accepted** | Live session registers 11 desktop + 8 web tools in stock v2.2; no `codex` reference or `CODEX_*`/`.codex` path in any computer-use surface (the repository's separate ChatGPT connector does mention Codex in its own docs, and is not part of this capability); the stock binary is `opencode v2.1.1`, dated before this work, with no file in its install directory modified during it (sha256 `0e81c77fcc27b263…`); the only browser dependency is `playwright-core`, using the system Chrome channel; a caller with empty attribution is refused before dispatch; the bridge daemon runs with 7 environment names and no secret-shaped ones; a frozen bridge daemon fails bounded in 11 s and the next call recovers in 218 ms |
| 2 | In-memory per-window capture, PNG validation, bounds, ordering, stale, late, release | **Accepted** (private Shell) | Capture returns a validated 750×570 PNG with an observation id at bridge *and* tool level; `Error.STALE` for an unknown window id and a **context refusal** (not `STALE`) when the target closed; the capture path performs no filesystem write, and the only module that ever touched `~/Pictures/Screenshots` is imported by a test alone — no production module registers it, and the live catalog has no screenshot tool; impossible bound refused before transfer; 25-chunk transport rejects out-of-order, replay, early `End`, post-`Abort` and foreign handles; digest verified; an abandoned capture is reclaimed at the 15 s deadline (`INVALID_HANDLE`, fresh `Begin` works); `Begin` succeeds again after every exit path |
| 3 | Browser isolation, stable ids, sandbox/TLS, no model-supplied JS or CDP | **Accepted** | Live 16/16 (isolation, `FOREIGN_TAB`, capacity, tab limit, cancellation, generation-bound refs); profile lock refuses when held and is reclaimed when stale; live TLS refusal with the certificate error named and 30 Chrome processes with no sandbox-disabling flag; setuid helper present; no run-code/evaluate tool on the model surface; 8 `web` tools only |
| 4 | Compositor input: exact target, serialization, release on failure, bounded, no ydotool | **Source-only for input** (launch split out and accepted) | 22 input tests + release-on-refusal observed live. The post-login real-session typing attempt was refused with `INPUT_FAILED`; no successful input or visible change is claimed. The Clutter calls exist in the installed mutter 18 typelib and the uint32 timestamp bug is fixed |
| 5 | Private sign-in keeps credentials out; only status returns; races fail safely | **Tool-level accepted, human run blocked** | 8/8 tool-level (value never in the result, `[redacted]` snapshot, length confirmed, replay refused); cancellation path observed with a real dialog; nobody has typed into it |
| 6 | No new vault, no Codex credential reads, minimal child environments | **Accepted** | 8/8 hygiene tests with marker secrets; launchers run under `env -i` allowlists; no vault introduced; the live bridge daemon was inspected in `/proc` and carries only its 7 allowed names |
| 7 | Code Mode default and direct rollback; nested image delivery; guards not bypassable **on the tool surface** | **Accepted** | Entry-level 19 tools, 19 Code Mode by default, 0 under `directTools: true`; browser PNG delivered to the model live; desktop PNG proven at tool level; the sign-in guard blocks snapshot/screenshot/tabs and desktop capture, and an uncertain fill now keeps the guard out of idle until the session's browser is closed. Scope: the guard is a tool-surface control — the Shell extension's D-Bus object does not consult it, and a same-UID process calling that object directly is outside the threat model (see `private-entry-status.md`) |
| 8 | Independent review reproduces evidence; efficiency measured | **Accepted, with a gap** | Three independent review rounds (7 + 5 + 6 findings, all triaged); measured latency: browser open 2387 ms / snapshot 351 ms / screenshot 1051 ms / close 1579 ms; desktop tool level `windows` 247 ms, `capture` 296 ms, `release` 8 ms, refused `input` 5 ms, refused `launch` 7 ms. Token counts are not instrumented |
| 9 | Fresh session loads the bridge, workflows pass visibly, rollback demonstrated | **Partially accepted** | Post-login refresh (~23:40 EDT, 2026-10-27): Shell PID 184812 started 22:38:35; extension `ACTIVE`; read-only deployer preview 0/7 drift. Live capture check passed with a validated 2466×1664 PNG. Calculator launch, new-window confirmation and pre-input capture (820×1332) passed in the real session; input was refused with `INPUT_FAILED`, so no visible-change comparison was obtained. Sandbox rollback and exposure rollback are demonstrated; live rollback is not |
| 10 | Preservation | **Held, with a precise claim** | Everything this work wrote lives under `tools/computer-use-*`, `tools/gnome-window-control`, `.opencode/plugins/computer-use`, `docs/codex-parity`, `docs/features.md`, `docs/test-quality-audit.md`, and the named `scripts/` files; 107 other dirty paths are not touched by it. Their content does change during the session — `tailscale/compose.yaml` at 18:20 and `tailscale/ROADMAP.md` at 18:27, while this session was running acceptance tests — because a peer session is active there. The staged rename `resume.md` → `handoff_resume.md` predates this work and was left alone. Nothing from this capability is staged, committed or pushed |

### Historical post-logout check (before the later login)

`tools/gnome-window-control/live-capture-check.py` answers the only question that matters
against the real Shell — does a capture work now? It is read-only (no input, no launch, no
file written):

| Exit | Meaning |
| --- | --- |
| 0 | capture works: validated PNG with an observation id |
| 4 | the extension is disabled or `INACTIVE` — a login restores it, and no re-enable can load the fixed module |
| 3 | the running Shell still holds the pre-fix module — log out and back in |
| 1 | capture failed for another reason (the exact detail is printed) |
| 2 | no bridge, or no NORMAL window to capture |

Observed states: **exit 4** at 20:05 (`Enabled=True, State=INACTIVE`, bridge name gone) and
**exit 3** at 20:16 (`State=ACTIVE`, bridge answering, cached pre-fix module). Both point at
the same remedy — a login — and both are distinguished from a healthy exit 0.

Both paths have been exercised: against the operator's current Shell it exits **3** with
`CAPTURE_FAILED: bytes.get_data is not a function`, and against a fresh private Shell with a
text-editor window it exits **0** with `PASS live capture: 104263 bytes, 750x570`.

At the time of this historical entry, the running Shell still held the pre-fix module:
`extension.js` was deployed at **18:22:35** and that Shell started at **18:04:16**. A
later login loaded a fresh Shell and the live capture check now passes; see the current
post-login update below. The original steps remain useful for diagnosing input, but a
second logout/login is not indicated by the latest evidence.

1. `python3 scripts/desktop-windows.py list`
2. `python3 scripts/desktop-windows.py capture --request '{"windowId":"<id>"}'` → validated PNG
3. `python3 scripts/desktop-windows.py launch --request '{"desktopId":"org.gnome.Calculator.desktop"}'`
4. observation-bound `input` click, then a fresh capture to show the visible change
5. `python3 scripts/desktop-windows.py release`

## Deployment drift check (2026-10-27 21:06)

A routine drift check at wrap-up caught one stale deployed file: `capture.mjs` was still the
20:10 copy, so the deployed artifact did **not** contain the async stale-target
re-verification added later. Re-deployed with the reviewed deployer (only `capture.mjs`
changed; backup `20261028T010636…`), and the dry run now reports **0 of 7** drifted.

The lesson for a future session: editing a controller after a deployment leaves the deployed
artifact behind, so run the deployer dry run **before** trusting "the deployed files are the
reviewed files", and again before asking for a login.

## Post-edit live smoke (2026-10-27 21:00)

After the sign-in guard and exposure changes, the running service was exercised through the
same Code Mode surface the model uses:

| Call | Result |
| --- | --- |
| `web.open https://example.com/` | tab `cu1.…` created, title `Example Domain` |
| `web.snapshot` with that tab | generation 1, refs returned |
| `web.close` | `cancelled: true`, worker and tabs discarded, profile retained |
| `desktop.windows` | inventory returned (`available: true`, epoch present) |

Two things this also confirms: the plugin reloaded cleanly with the new guard code, and a
malformed call (`snapshot` without `tabId`) is rejected by schema validation with a clear
message rather than reaching the backend.

## Historical verification run (2026-10-27 20:41)

Earlier sections of this file quote the suite counts that were true when each entry was
written; this table preserves that historical snapshot. Fresh source counts are
in the current boundary and linked test-quality audit, not this older table.

| Suite | Result |
| --- | --- |
| plugin (`node --experimental-strip-types --test .opencode/plugins/computer-use/*.test.ts`) | **117/117** |
| browser (`npm test` in `tools/computer-use-browser`) + `tsc --noEmit` | **45/45**, typecheck clean |
| runtime (`npm test` in `tools/computer-use-runtime`) | **35/35** |
| scripts (`node --test scripts/*.test.mjs`) | **82/82** |
| desktop client (`python3 -m unittest scripts/test_desktop_windows.py`) | **21/21** |
| gnome modules (`node --test tools/gnome-window-control/*.test.mjs`) | **38/38** |
| deployer (`python3 -m unittest scripts/test_deploy_window_control.py`) | **6/6** |
| `capture-gjs-acceptance.mjs` / `input-launch-gjs-smoke.mjs` (real GJS) | **8/8** and **8/8** |
| `fresh-shell-acceptance.sh` | **67 PASS**, exit 0, workflow `INCOMPLETE` (no seat for the keystroke) |
| `fresh-shell-acceptance.sh --debug` | scratch copy only; deployed `extension.js` hash and 0/7 drift unchanged afterwards |
| `live-acceptance.mjs` / `tls-sandbox-acceptance.mjs` / `profile-lock-acceptance.mjs` | **16/16** / **5/5** / **6/6** |
| `rollback-acceptance.sh` | target-file hashes restored; live deployment untouched (7/7) |

## Not claimed (refreshed after the later login)

- A successful real-seat keystroke, drag or scroll. The latest live Calculator workflow
  launched and captured the app but input was refused with `INPUT_FAILED: The operation
  failed`; no post-input image or visible change was obtained. Drag and scroll were not
  attempted.
- A completed visible-outcome desktop workflow. Live capture and desktop-ID launch plus
  matching-window confirmation now pass in the logged-in Shell, but the pixel comparison
  after input has not run.
- Any real credential entry. Only the cancellation path is verified; nobody has typed into
  the real GTK dialog, so "the value never reaches the model" is proven at tool level but
  not by a human run.
- Isolation against a hostile same-UID process.
- Commits, pushes, publication or security-setting changes.

## Post-login live recheck (~23:40 EDT, 2026-10-27)

The earlier login blocker is cleared for capture and launch. The operator's Shell
(PID 184812, started 22:38:35 EDT) reported the extension enabled and `ACTIVE`, with
the bridge D-Bus name owned. A read-only deployer preview found 0/7 drift; it did not
deploy, enable, or restart the extension. `live-capture-check.py` passed on an exact
current window (validated 2466×1664 PNG, observation id present).

The real-seat Calculator workflow passed inventory, launch, matching-window
confirmation, and an 820×1332 pre-input capture. Its input call was refused by the
bridge with `INPUT_FAILED: The operation failed`; no after-image or visible-change
assertion was obtained. The launched process was closed and absent on readback. Do not
repeat the input blindly; diagnose the refusal before another attempt. The one-shot
autostart entry is absent and the earlier no-window report remains historical.

Still open: actual input/visible change, a human-operated private sign-in run, live
rollback, measured token/turn use, and an observed Code Mode versus direct-tools
efficiency comparison. Existing latency and browser/bridge recovery measurements remain
as listed above; they do not substitute for those missing measurements.
