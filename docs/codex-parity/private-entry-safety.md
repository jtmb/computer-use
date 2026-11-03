## Canonical checkout interpretation — 2026-10-29

This is a retained lane report from `/home/james/repos/computer-use-delivery`.
The canonical checkout is now `/home/james/repos/computer-use` on `main`.
Keep the dated source/test counts and delivery-environment observations below
as historical evidence, not current runtime statements. The current parent
checkpoint records **42/42 runtime tests** and strict/library checking for the
runtime layer; this is source evidence, not human private-entry acceptance.

The canonical feature inventory records separate, newer pilot observations,
including ChatGPT image generation and resource-monitor activation. They do not
prove that a person entered a real value through this private-entry transport,
and this report's delivery-scoped “no account” wording does not deny those
unrelated observations. The current source boundary remains described by
[`secret-entry.ts`](../../tools/computer-use-runtime/src/secret-entry.ts) and the
[runtime guide](../../tools/computer-use-runtime/README.md); do not infer human,
credential, or browser-fill acceptance from source or synthetic tests.

# Private-entry source safety — synthetic evidence only

**State: SOURCE TESTS PASS; NOT HUMAN ACCEPTANCE; NO READINESS CALLBACK.**

This is lane 11's bounded source/test report. It does not change
[`private-entry-status.md`](private-entry-status.md), which remains the existing
cross-session status record. All new test values are throwaway synthetic markers;
tests use fake helper processes and scratch under `/tmp/opencode`. They do not
open GTK, operate a browser, sign in, access an account, or send a callback.

## Scope and tested properties

**Parent preservation review — 2026-10-31:** two new synthetic regressions
currently reproduce five failures: regular-file replacement, in-place edit,
creation or removal during the dialog, and replacement after temporary-file
fsync before publication. With `--allow-overwrite`, the old stager returned
success and overwrote/recreated the changed destination. Permission to replace
the inspected file must not silently include a later file. The returned correction
binds no-follow metadata/absence before the dialog and rechecks publication.
Parent then reproduces three additional failures: direct callers bypassed the
binding, a new target replaced while writing reported false success, and a zero
write was accepted as progress. Corrections bind direct callers at entry, verify
the written inode before publication/after directory sync and refuse invalid
write progress. All35synthetic owning cases now pass; no file content is read by
the metadata guards and concurrent replacements survive. This remains sampled
metadata protection, not atomic CAS, crash-proof rollback or hostile-writer proof.
No real dialog, protected field, credential, callback or deployment was used.
The late Python-reference read before this review's initial source inspection is
a parent procedure failure; references were loaded before test edits/execution.

The capability is **manual human entry to a local private transport**. It is not
browser-generated key extraction, clipboard/DOM/CDP reading, hands-free transfer,
or proof that any real credential works. A human would still have to re-enter a
value from its source. No human-entry acceptance was attempted by this lane.

The synthetic regressions cover:

- A four-byte big-endian frame with an inclusive **4,096-byte** UTF-8 payload
  limit; exact-cap success and over-cap, truncated, trailing, invalid-UTF-8 and
  out-of-range length refusal.
- fd 3 as the only non-standard inherited transport descriptor in each fake
  child (FIFO for the Python launcher; pipe/socket transport for Node), and the
  private spec file/directory and staged-file modes (`0600` / `0700`). The Python
  launcher also proves it restores an unrelated pre-existing fd 3 with either
  `FD_CLOEXEC` state intact.
- Status-only behavior: fake stdout/stderr containing the synthetic marker do
  not reach stager output or runtime failure results. The stager now multiplexes
  fd 3 and bounded status reads; stderr is discarded before acquisition. An
  oversized writer is refused without blocking on a full pipe.
- Cancellation and target safety: existing/final symlinks, symlinked or
  world-writable parents, a final-component symlink introduced while the fake
  helper runs, a parent path replaced during the dialog, and two concurrent
  exclusive writers. A parent-path change is rejected before publication;
  exclusive creation yields at most one complete staged file.
- Runtime deadline escalation (including a fake child that ignores `SIGTERM`),
  abort, already-aborted input, cancellation, malformed frames and normal spec
  cleanup. Parent-death signaling is exercised with a fake `gi` import that
  blocks before any GTK import or window construction.

## Reproduction

From the checkout root:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/test_private_secret_stage.py
```

From `tools/computer-use-runtime`:

```bash
node --experimental-strip-types --test test/secret-entry.test.ts
```

The lane's original Python run completed **22 tests, 22 passed, 0 skipped**. The
Python follow-up passed **27 Python tests** and **9 Node transport tests**,
with no skips; the later Node follow-up below adds descendant coverage. Python bytecode is disabled; all
temporary targets/specs and fake executables are in test-owned `/tmp/opencode`
scratch and removed by teardown. These counts are source-level synthetic checks,
not installation, loaded-runtime, visible UI, model, or account evidence.
The older status row's **12 passed / 1 display-dependent skip** and the previous
runtime transport tests were likewise not human-entry acceptance; this lane
replaced the display-dependent test with the fake-import parent-death check.

## Parent bounded-launcher correction — 2026-10-29

Parent found that the bounded fd-3 reader still used unbounded `communicate()`
for stdout/stderr and an unbounded reader join. Four new real-helper regressions
failed against that source: oversized stdout was accepted by `launch_dialog`,
raw stderr was returned internally, and an unresponsive helper or an exited
helper's inherited-pipe holder exceeded the outer four-second test watchdog.

The corrected Python launcher retains at most 1,024 status bytes and 4,100 framed
payload bytes, reads at most one extra detection byte per stream, directs stderr
to `/dev/null`, and enforces one 300-second monotonic acquisition/exit deadline.
It starts a dedicated helper process group and kills that group on cleanup,
including descendants retaining streams after the direct child exits. Direct
child reaping has a separate one-second bound. Normal cancellation and fixed
failure-category diagnostics remain intact. Tests additionally check exact status
cap acceptance, that fd 2 really is `/dev/null`, and deadline coverage after both
pipes close before process exit. The last case was added after correction; it is
not reported as a fifth observed pre-fix failure. Deadline tests shorten only the
test module's constant and use a test-only subreaper to verify/reap descendants.
No production dialog was launched and no helper/browser/account was activated.

### Node consumer follow-up — 2026-10-29

The previous nine direct-child transport tests did not cover inherited pipes.
Four new fake-helper regressions failed before correction: timeout, abort and
overflow exceeded the independent four-second watchdog after the direct helper
exited, and a success case left a descendant running. The Node transport now
starts a dedicated POSIX process group and signals it through escalation and
final cleanup, even after the direct child exits. The focused subset passes
**13/13**, and the complete runtime package passes **42/42**, with authentic
strict/no-emit/library checking through an explicit `--skipLibCheck false` CLI
override. The existing config still defaults that option to true. Local exact
provisioning leaves all three public SHA-512 lock entries unchanged; no runtime
profile or installed integration was modified. Python's earlier 27/27 remains
accepted without another unchanged rerun.

The POSIX tests use Linux-only fake helpers, an outer watchdog and a test-only
subreaper. They do not prove Windows descendant cleanup (which still targets
only the direct child), atomic process identity, crash-proof cleanup, full browser
sign-in or human entry. No GTK, real value, account request or callback occurred.

## Parent-death and cleanup limits

The fake-import test proves only that the dialog helper receives its configured
parent-death `SIGTERM` and exits when its direct parent dies before the GTK import.
Normal success, cancellation, abort and deadline paths assert private-spec cleanup.
An abruptly terminated Node parent cannot run JavaScript `finally`; therefore a
hard parent death may leave its non-secret `0600` spec in the private `0700`
temporary directory. No test claims crash-proof scratch reclamation. Payload
zeroization is also not guaranteed; same-UID processes with access to the user's
input/display remain outside the stated threat model.

## Existing status wording

The original status table said human entry was **“Never”**, while its dated log
records four real dialog launches, including human cancellation. Parent corrected
the current table without altering that attempt log. The log establishes a human-operated
dialog attempt ended in cancellation without staging a value; it does not say
whether text had been typed before cancellation. Thus “Never” cannot mean that no
live dialog attempt occurred; no successful value-entry/staging acceptance is
recorded. This lane did not launch a real dialog. The status file still says no
readiness callback was sent and the human acceptance gate remains open.

Passing these tests does not close that gate, establish a real fd round-trip
entered by a human, demonstrate browser fill, authorize a key workflow, or make
the manual-entry transport suitable for a no-copy browser-generated-key need.
