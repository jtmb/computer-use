# HANDOFF — Codex-parity computer use (stock OpenCode v2)

**Current continuation owner, 2026-10-28:** parent goal
`50e7f33e-103e-4385-855e-ebb56845b277` in
`ses_goal_docs_e51bdf9cf361797e5ad2593e5b530dc9`. Source ec2a was externally
cancelled/cleared; predecessor483fwas cancelled/archived by user-authorized atomic
replacement, not completed. Execution remains in this existing chat. Read
[all68requirements/findings/decisions](../request-coverage.md), supported goal tools
and [current source/deployed boundary](acceptance.md#current-sourcedeployment-boundary--2026-10-28).
The actual mixed-plan archive remains blocked; no generated history was rewritten.

Source-only input/release and command fixes are verified, not deployed. Latest
read-only preview finds2/7extension files changed; pilot command bytes also differ.
Current tests/health/preservation are in [the source audit](../test-quality-audit.md#consolidated-sourcefindings-boundary--2026-10-28).
Successful real-seat input, live rollback, human sign-in/file staging/readiness
callback, actual model efficiency and native settings/OFF remain missing. No
deployment/restart/logout/security/credential/publication authority is inferred.
The following source identity and dated evidence are historical, not current
worker status, source lifecycle or present-day source/install parity.

Historical source identity: repository `computer-use`, worktree `.` (`/home/james/repos/computer-use`),
branch `main`, HEAD `c71b8cc`, 124 dirty/untracked paths, `git diff --check` clean,
`scripts/health-check.sh` PASSED. Goal `ec2a347f-8071-4358-bc93-a223a846247d` (plan revision
37 at the time of writing). One **pre-existing** staged rename is in the index
(`global/commands/resume.md` → `handoff_resume.md`) from before this work; nothing from this
capability is staged, committed or pushed.

Status recorded here is **historical**. Re-verify every live claim before acting on it.

## Current live delta (~23:40 EDT, 2026-10-27)

The later login cleared the old stale-module/no-window blocker for capture and launch:
Shell PID 184812 started at 22:38:35 EDT; the extension reports `ACTIVE`, the bridge
D-Bus name is owned, and a read-only deployer preview shows 0/7 drift. The repository's
`live-capture-check.py` passed (validated 2466×1664 PNG). A real Calculator run passed
launch, matching-window confirmation, and pre-input capture (820×1332), but the input
call was refused with `INPUT_FAILED: The operation failed`; no visible change was
verified. The script closed its launched process. The one-shot autostart entry is absent.

Do not log out again or retry input blindly. Diagnose the live input refusal first.
Human-operated `web.signin`, visible-change input acceptance, live rollback, token/turn
instrumentation, and a measured Code Mode versus direct-tools comparison remain open.
No deployment or activation was performed during this recheck.

## Paste-ready prompt

> Continue only the user-selected scope after reading current goal tools, the
> 68-row coverage/decision map and current acceptance/source-deployment boundary.
> Verify exact source/owner/worker overlap read-only; never resume or mutate the
> old cancelled goals or create a concurrent successor queue. The input/release
> diagnosis and source fix are already verified; no blind input retry or repeat
> logout is indicated. Deployment/activation/live targets and human entry retain
> their separate gates. Preserve dirty/index work and reserved report ownership;
> absent report acceptance is uncertainty, not a prerequisite for independent
> source review. Routine already-authorized work continues without another prompt.

## Objective (compressed)

Deliver computer-use and browser-use parity on stock OpenCode v2: bounded runtime contracts
with attribution/queues/cancellation; in-memory per-window GNOME capture with chunked
transport; session-isolated Playwright browser with sandbox and TLS; compositor input and
desktop-ID launch; private GTK sign-in that never exposes values; hygiene; Code Mode plus a
direct-tool rollback; independent review and measured efficiency; then approved deployment
and live acceptance.

## Verified state (as of 2026-10-27 20:25 local)

| Area | Evidence |
| --- | --- |
| Suites | plugin 117/117, browser 45/45 + tsc, runtime 35/35, scripts 82/82, client 21/21, gnome modules 38/38, GJS 8/8 and 8/8; live browser 16/16, TLS 5/5, profile lock 6/6 |
| Fresh-Shell harness | `tools/gnome-window-control/fresh-shell-acceptance.sh` → 67 PASS, exit 0, workflow reported `INCOMPLETE` (no seat) |
| Capture | validated 750×570 PNG + observation id at bridge **and** tool level; 16 methods exactly once; unknown/closed window `Error.STALE`; impossible size bound refused before transfer; 25-chunk incompressible image rejects out-of-order, replay, early `End`, post-`Abort`, foreign handles; abandoned capture reclaimed at the 15 s deadline; digest verified |
| Launch | `Launched org.gnome.Calculator.desktop; matching window(s) appeared: …`; workflow confirms the window, captures it (410×666), stops at the keystroke |
| Browser | isolation live 16/16; profile lock refuses when held and is reclaimed when stale; untrusted certificate refused with `ERR_CERT_AUTHORITY_INVALID`; 30 Chrome processes with no sandbox-disabling flag; setuid helper present |
| Resilience | frozen bridge daemon → bounded error in 11,002 ms; recovery 218 ms |
| Rollback | deployer rehearsal in a throwaway target (snapshot + ownership marker restore, pending forward change, re-apply restores every hash); live before/after (old module fails capture and launch, current files work); exposure rollback `directTools: true` → 0 Code Mode tools |
| Hygiene | 8/8 tests; live bridge daemon `/proc` environment has exactly 7 names, no secret-shaped ones |
| Attribution | a caller with empty `sessionID` is refused before dispatch (live, tool level) |
| Deployment | deployed extension 7/7 hash-matches source, drift 0; deployer backup `20261028T001009…` |

Measured: browser open 2,387 ms / snapshot 351 ms / screenshot 1,051 ms / close 1,579 ms;
desktop tool level `windows` 247 ms, `capture` 296 ms (12.7 KB PNG), `release` 8 ms, refused
`input` 5 ms, refused `launch` 7 ms. Token counts are not instrumented.

## Historical blockers (as recorded before the later login; see current live delta above)

1. **The running Shell holds the module loaded at 18:04.** `live-capture-check.py` exits 3
   (`CAPTURE_FAILED: bytes.get_data`), `launch` returns `REFUSED`. GNOME caches extension
   modules by URL, so `gnome-extensions disable/enable` cannot load the fixed code. A
   logout/login is required and is the only missing step for the operator's session.
2. **A keystroke or button on a real seat.** The headless backend throws from
   `seat.create_virtual_device()`, so input has never been delivered anywhere. Everything up
   to the keystroke is accepted.
3. **A human `web.signin` run.** Tool-level acceptance is 8/8 (value never in the result,
   `[redacted]` snapshot, length confirmed, replay refused), but nobody has typed into the
   real dialog.

Known limitation: token/turn instrumentation does not exist; payload sizes are measured
instead. The Shell's `INACTIVE → ACTIVE` episode between 19:49 and 20:16 has no journal
explanation; a login resolves it either way.

## Historical relogin automation (2026-10-27 22:30)

The logout cannot be fully self-service: it ends this agent's session, and GDM has no
automatic login, so a person must type the password at the login screen. The mechanical
parts are queued instead:

- `scripts/session-relogin.sh --check` reports readiness (session, extension state, whether
  the one-shot runner is armed, and whether another session is writing).
- `scripts/session-relogin.sh --now` arms the runner and logs out; it refuses while another
  session has written in the last 120 s unless `--force` is passed, because a logout kills
  every process in the account.
- `scripts/post-login-acceptance.sh` is installed once as
  `~/.config/autostart/opencode-post-login-acceptance.desktop`. At the next login it waits
  for the bridge, runs `live-capture-check.py`, and (only if that passes) the
  `desktop-workflow-acceptance.py --yes` workflow, appends both results plus a summary to
  `docs/codex-parity/acceptance-live-login.md`, and deletes its own autostart entry so it can
  never run twice. Verified by a live smoke run: it detected the stale module (exit 3),
  skipped the workflow, wrote the report, and removed the entry.

The only unattended alternative is enabling GDM automatic login, which is a security change
(anyone with physical access would get the session) and is not made by this work.

## Gated historical acceptance command examples

These are not automatic next steps or new authority. Recheck the current source
delta, selected target/privacy scope and separate operator gates before live work.
For read-only source checks use the current test-quality audit. The one-shot entry
was absent at the later recheck; do not infer it remains armed.

```bash
python3 tools/gnome-window-control/live-capture-check.py            # expect exit 0 after login
python3 tools/gnome-window-control/desktop-workflow-acceptance.py --yes   # launch→confirm→type
python3 tools/gnome-window-control/fresh-shell-acceptance.sh        # 67 PASS expected
node --experimental-strip-types tools/computer-use-browser/live-acceptance.mjs
node --experimental-strip-types tools/computer-use-browser/tls-sandbox-acceptance.mjs
node --experimental-strip-types tools/computer-use-browser/profile-lock-acceptance.mjs
```

`web.signin` needs A human: open a local form and type a throwaway value when the dialog
appears.

## Key paths

- `docs/codex-parity/acceptance.md` — requirement matrix, evidence tables, runbooks.
- `docs/codex-parity/private-entry-status.md` — sign-in staging status.
- `tools/gnome-window-control/` — extension, controllers, `fresh-shell-acceptance.sh`,
  `bridge-protocol-acceptance.py`, `live-capture-check.py`, `desktop-workflow-acceptance.py`,
  `rollback-acceptance.sh`.
- `tools/computer-use-browser/` — backend, `live-acceptance.mjs`,
  `tls-sandbox-acceptance.mjs`, `profile-lock-acceptance.mjs`.
- `.opencode/plugins/computer-use/` — tools, serialization, guard, Code Mode policy,
  `live-desktop-acceptance.mjs`, `resilience-acceptance.mjs`.
- `scripts/` — `desktop-windows.py` (bridge client), `deploy-window-control.py`,
  `browser-auth-dialog.py`, `private-secret-stage.py`.

## Approval limits and historical overlap record

Commit, push, publication, deployment and extension activation remain separately approved.
The following dated overlap report is not current liveness proof. Recheck exact
owners through supported reads before shared edits; no source/worker mutation is
authorized by this handoff. The historical worktree carried `.opencode/skills/` (68 paths),
`tailscale/`, `tools/chatgpt-connector/`, `tools/opencode-plugins/`,
`tools/session-coordination/`, and root docs — 107 dirty paths in total outside this
capability. Do not stage, revert or reformat them. They are **live**: `tailscale/compose.yaml`
and `tailscale/ROADMAP.md` changed at 18:20 and 18:27 during this session, so a peer is
active there. Nothing in this work edited them, and worker inactivity was not independently
verified; treat overlap as unconfirmed and re-check before any commit that spans them.
