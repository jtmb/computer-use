# Private entry capability — readiness status

**Status: SOURCE PRESENT, NOT LIVE-ACCEPTED, NO READINESS CALLBACK SENT.**
This file records a cross-session dependency. It is not a readiness signal.

Historical phase-p8 observations are retained below. The 2026-10-29 source
follow-up corrects unsupported "never typed" wording and records bounded helper
I/O; it does not claim another live attempt. The earlier "helper absent" wording
is stale: the helper and staging CLI both exist in source.

## Scope limit — read before treating this as a solution

This capability is **manual user entry**, not hands-free transfer. The human must
read the value from wherever it was produced and re-enter it into our dialog. That
avoids model exposure; it does **not** avoid the manual copy step.

For a consumer whose requirement is "a key generated in a browser must reach a
local command with no human copying it", this capability **does not satisfy the
requirement**:

- **Browser source → consumer extraction is not implemented and is deliberately
  refused.** We do not read credential values out of a page: there is no
  `evaluate`-based value read, no CDP read, no clipboard read, no DOM value
  scraping. The only browser credential path runs the opposite direction
  (user entry → validated form fill).
- Therefore a generated-key workflow must still be completed by a human, or must
  avoid generating a key at all (see the interactive-login alternative below).

Any readiness message must state this limit; a manual-entry helper must never be
described as hands-free readiness.

## Consumer

Session `ses_e82032444ffeP7hG18Zqr3hsp3` (hardened Tailscale deployment) needs a
bounded, user-operated credential-entry capability so a one-use auth key can
reach a local command without its value entering model context, tool arguments,
tool results, transcripts, logs, argv or screenshots.

## Current factual state

| Item | State |
| --- | --- |
| `scripts/browser-auth-dialog.py` | **Present** — GTK4 `PasswordEntry`, writes one length-prefixed payload to inherited fd 3, refuses unless `GTK_A11Y=none`, status token only on stdout, `PR_SET_PDEATHSIG` on parent death. |
| `scripts/private-secret-stage.py` | **Present** — CLI that drives the dialog and stages the value into an absolute target with `O_EXCL|O_NOFOLLOW` at mode `0600`, status-only JSON output. |
| `tools/computer-use-runtime/src/secret-entry.ts` | **Present** — Node transport: `stdio[3]` pipe, length cap 4096, deadline, abort/timeout kills the child, spec file deleted in `finally`. |
| Browser credential fill | **Present** — privileged capability path only, pinned `ElementHandle`s, `ownerFrame`/document/origin and form-action origin checks, service workers blocked, non-secret status. |
| Deployment | Not applicable. These are repository scripts run in place; nothing is installed and no system change is required. |
| Successful human entry/staging | **Not observed.** Four real dialog attempts are recorded below, including human cancellation; whether text was typed before cancellation is unknown. |
| Readiness callback to the consumer | **Not sent.** |

Canonical paths, absolute, on this host:

```
/home/james/repos/computer-use/scripts/browser-auth-dialog.py
/home/james/repos/computer-use/scripts/private-secret-stage.py
```

## Transfer semantics — read this before relying on it

Canonical consolidation now retains the reviewed transport source in
`/home/james/repos/computer-use` on existing `main`. Source selection is not a
loaded-browser or human-entry observation; verify the exact reviewed source
before any separately authorized human probe. The old delivery tree remains a
read-only preservation input until the conditional removal checks finish.

This is **user-entry → private file-descriptor transfer**, not a "no-copy
anywhere" pipeline:

1. The human types into the GTK dialog. The value lives in GTK's password buffer
   and in the helper's memory.
2. It crosses to the waiting process over **fd 3** as one length-prefixed frame.
   It never enters argv, environment, tool arguments, tool results, the
   transcript, or worker logs.
3. Then one of two things happens:
   - **Stage mode**: written to a `0600` file at a caller-named absolute path. It
     persists until the caller deletes it.
   - **Browser mode**: filled into a validated same-origin form element. It then
     exists in the page and, on submission, at the site.

So: no model-visible copy, no argv/env copy, no log copy — but the consumer
receives a real copy, and stage mode leaves a file the caller must remove. There
is no zeroization guarantee, and a same-UID process with input-device or
screenshot access is outside this capability's threat model.

Two related scope notes, so the guard is not over-claimed:

- The sign-in guard is enforced on the **OpenCode tool surface**. The GNOME Shell
  extension exports its D-Bus object directly and does not consult that guard, so a
  same-UID process that talks to the bridge without going through OpenCode is in the
  same excluded threat-model bucket as a process that reads the screen itself.
- The browser backend does call `evaluate` internally, with fixed functions, to build
  snapshots and to redact password-input values. No caller-supplied script reaches it:
  the model-facing tools have no evaluate, run-code or raw-CDP surface.

## Synthetic acceptance (marker-only; no real credential used)

| Check | Result |
| --- | --- |
| `python3 scripts/test_private_secret_stage.py` | 12 passed, 1 skipped (display-dependent) |
| Runtime transport tests (`secret-entry`) | Passing as part of 35 runtime tests: success, cancel, timeout kill, abort kill, overlong refusal, spec cleanup, no marker in errors |
| Browser privileged-fill tests | Passing as part of 29 browser tests: stale/detached handle, cross-origin form action, guard state, no value returned |
| `Gtk.init_check()` on the live Wayland session | **True** — the earlier skip is environmental, not a broken toolkit |
| Marker scan of captured stdout/stderr/errors | No marker appears in any asserted surface |

These are source-level and synthetic. They do **not** prove a real dialog
interaction, a real descriptor round trip driven by a human, or any browser fill.

## Source-only transport follow-up — 2026-10-29

**Later source-only preservation checkpoint — 2026-10-31:** parent reproduces
five concurrent-overwrite scenarios, then accepts the bounded metadata-binding
correction only after finding/correcting three further direct-call/publication/
write-progress failures. All35synthetic Python cases pass. These metadata checks
read no target contents, preserve concurrent replacements and verify status
against the written inode; they are sampled, not atomic CAS. No new real dialog,
human entry/staging or callback occurred. Earlier27case counts below remain dated.

The Python launcher caps status at 1,024 bytes, discards stderr at the descriptor
and multiplexes status/fd 3 under one 300-second monotonic deadline. Cleanup kills
its own helper process group, including inherited-pipe holders. All 27 synthetic
Python tests pass; four boundary regressions failed before correction, and the
additional EOF-before-exit case also passes. No GTK or human entry was used.

The Node consumer's four reproduced descendant failures (timeout, abort, overflow,
success) now pass. Canonical parent independently reran all **42/42** runtime
cases and authentic strict/library checking with explicit `--skipLibCheck false`;
the package's existing config default remains unchanged. POSIX helpers have a
dedicated process group; Windows descendant cleanup is unverified. These are
source/fake-helper results, not human staging, browser fill or callback readiness.

## Alternatives that avoid a generated key entirely

- **Interactive login (recommended).** `tailscale login`, or the documented
  interactive `tailscale up` flow, prints an authorisation URL; the user completes
  it in their own browser session. No key value exists to copy, no secret enters
  argv, environment, model context or logs, and no protected field is read or
  typed by the agent. Requires the user's own browser interaction and separately
  authorised registration; it is not something this capability performs.
- **Manual entry + staging (this capability).** Works today for any consumer that
  accepts a file, but requires the human to re-enter the value.
- **Browser-source extraction.** Not offered. Implementing it would mean reading a
  credential value out of page state, which contradicts the browser surface's own
  rule that credentials never enter model-visible or agent-readable channels.

## Gate still open

One acceptance step remains: a human types a throwaway value into the real
dialog and the file/stage result is verified.

**Attempt log (2026-10-27, evening):** a real dialog was launched four times. Two
runs exposed a construction crash (`GtkPasswordEntry` has no bound
`set_placeholder_text`), which is now fixed. A third run was interrupted by the
operator clearing duplicate dialogs. The fourth run stayed open for about five
minutes and ended with the human **cancelling** it: the stager printed `cancelled`,
returned exit code 2, wrote no target file and removed its private spec file. That
verifies the dialog opens and that cancellation fails closed; it is **not**
acceptance, because no value was ever staged.

Suggested probe, only for a separately authorized human test from the selected
reviewed checkout. Use a fresh private directory; the group-writable
`/tmp/opencode` itself is not a valid staging parent:

```bash
probe_dir="$(mktemp -d /tmp/opencode/private-entry-probe.XXXXXX)"
python3 scripts/private-secret-stage.py --target "$probe_dir/value" --forbid-existing
```

After that, and only after it, the owner session sends the consumer exactly one
message with `delivery=queue`, `resume=true`.
This is the historical conditional callback procedure, not authority to send or
resume a session now. During any real entry the agent must not inspect display
or input; later checks are nonsecret status, mode and length only. Exact-scope
staged-file cleanup remains the caller's responsibility. No successful entry or
callback is added by this source follow-up.

## Callback durability

No scheduler, cron entry or persisted subscription exists. Delivery is
best-effort while the owning goal is active in a running session. If that session
closes first, this file is authoritative and the consumer should re-request.

## Rollback

This source follow-up deployed nothing and created no credential store, keyring
entry or system service. Preserve existing source/tests and staged files; do not
delete shared capability files as an automatic rollback. Later removal or cleanup
requires its applicable exact scope; an actually staged file remains the caller's
responsibility for authorized use and deletion.
