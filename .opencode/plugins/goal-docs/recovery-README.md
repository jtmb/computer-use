# Goal archive recovery

This module supports one narrow repair: restore a generated `plan.md` to the
bytes canonically rendered from that bundle's frozen `snapshot.json` when the
only difference is one valid `Exported at` header value. It does not resolve
source provenance, consult raw goal state, refresh lifecycle status, repair
other content, or register/activate a plugin.

## Read-only preview

The public API is `previewGoalDocRecovery(request, dependencies?, options?)` in
`recovery.ts`. It requires absolute `repositoryRoot`, exact `goalID` and
`sessionID`, and an existing safe `backupDirectory` outside `docs/goals`.
The repository and snapshot source must resolve to the same complete Git
repository/worktree identity recorded in the snapshot, and the frozen source
directory must exactly equal the selected repository root. A different clone
with the same portable Git identity is refused. All manifest-owned
files are checked; the `README.md` entry is compared only with its inclusive
`goal-docs:managed` block hash. Its whole-file hash is retained separately for
CAS and backup purposes.

Preview does not create/acquire locks, directories, backup files, journals, or
temporary files. It returns the exact target, snapshot/manifest identities,
and old/canonical plan hashes. Any body change, other owned-file mismatch,
invalid or stale manifest, unsafe path/link/file, incomplete recovery journal,
oversize input, or identity mismatch fails closed.

The CLI is preview-only and defaults to preview:

```sh
node --experimental-strip-types .opencode/plugins/goal-docs/recovery-cli.mjs \
  --root /absolute/worktree --goal GOAL_ID --session ses_SOURCE_ID \
  --backup-dir /absolute/existing/backup-directory
```

The backup directory must already exist. `--apply` and `rollback` are rejected
by the CLI rather than treating a command-line flag as permission.

## Host-authorized apply

`applyGoalDocRecovery(preview, { authorize, dependencies?, signal? })` accepts
only the exact in-process preview object returned by `previewGoalDocRecovery`.
It fails if `authorize` is absent. The host callback receives a frozen request
binding the repository/worktree, session/goal, snapshot and manifest, target
hashes, and action; it must invoke the host's real permission/approval system
for that exact request and resolve only when authorized. The callback seam is a
trust boundary, not cryptographic proof: a no-op callback supplied by an
untrusted caller is not authorization. Boolean callback results are rejected;
never substitute a caller boolean for the host permission assertion.

After authorization, apply uses the existing persistent Linux
`.goal-docs-process.lock` inode (it will not create one), rechecks every owned
file's bytes and file identity under that lock, and preserves the complete
original four-file bundle, full README, and manifest in a unique recovery
directory. It verifies all copies before writing a durable journal, checks the
CAS again, and atomically publishes only `plan.md`. The manifest is validated
with writer-compatible integrity and ownership semantics and remains byte-
unchanged because the canonical repair restores its already-recorded hash.
Recovery journals and originals are retained; no automatic cleanup is offered.
Document copies are bounded to 512 KiB each; the manifest has its own 2 MiB
bound. Reads are nonblocking and refuse a regular file replaced by a FIFO.
Cancellation before publication is checked even when an injected metadata
provider ignores its signal. Once complete originals are verified, a prepared
journal is published before the final cancellable compare-and-swap check.

Cancellation is fail-fast: a pre-aborted signal refuses a preview before any path
inspection, refuses apply before the preview is validated or the host callback is
invoked, and refuses rollback before the journal is read. If the signal becomes
aborted while the authorization callback is settling, apply and rollback surface
that abort after the callback resolves and before the existing process lock is
read or acquired, so no backup, journal, lock acquisition, or target change
occurs. Cancellation cannot recall a prompt the host has already shown,
interrupt a callback that ignores the signal, or undo filesystem reads already
in flight; the next explicit check is the boundary. A non-`Error` abort reason is
reported as `operation aborted` rather than being rethrown.

Only `committed` or `rolled_back` journals permit another preview. An
`prepared`/`publishing` journal or interrupted publication temp blocks new
recovery. `rollbackGoalDocRecovery(journalPath, { authorize, dependencies?,
signal? })` also requires a host authorization callback, rechecks the same
process lock, verifies all original copies, and restores only when every target
still matches the journal's expected pre/post state. It preserves the journal
and refuses changed targets or concurrent edits.
Rollback also reconstructs the canonical frozen snapshot and checks the original
plan's one allowed header difference. Rehashing a journal and a body-edited
backup cannot legitimize that body change. An interruption before all originals
and the first journal exist leaves an explicitly incomplete backup for inspection;
the API never guesses missing provenance or deletes those artifacts.

Frozen snapshot restoration and a later lifecycle refresh are separate
operations. A refresh must use the normal source-qualified exporter and its
existing writer guard; this recovery API never turns a frozen snapshot into a
claim about current goal state. Provenance of the observed header difference
remains unknown.

## Integration boundary

The module is intentionally not imported by `index.ts`, the exporter, RPC, or
the runtime loader. A future host integration must separately provide the
authorization callback, show the returned exact preview before approval, retain
the same preview object through apply, and expose rollback as a separately
authorized action. Source presence and passing isolated tests do not establish
runtime loading or host permission behavior.

### Native policy assertion is not the separate operation approval — 2026-10-31

The inspected pinned2.1.1 Promise plugin API exposes`ctx.permission.assert`.
Its declaration says it evaluates session rules/saved approvals, prompts when
required, resolves when allowed and propagates denial. The shared`AssertInput`
contains session/agent/action/resources/save/metadata/source, with no inspected
force-human or force-ask field. The
[V2 server contract](https://opencode.ai/v2/docs/build/plugins/server#permissions)
describes the same conditional prompting behavior. These are source/API findings,
not a live permission test or a claim about every future host version.

A future host must therefore retain **both** applicable boundaries: genuine
approval of the exact shown preview/backup/operation, and the native policy check
for its trusted invocation/session. A resolved`Promise<void>`does not say whether
a human just approved anything; broad automatic allow is not this repository's
separate archive-apply authority. Never fill`authorize`with a no-op or assume
method presence is approval. Do not invent an unsupported forced-prompt option,
grant a rule, reply to a pending permission yourself or add an apply CLI flag.
Keep the same in-process preview, existing CAS/backup/journal/lock checks and a
separate rollback approval. Exact operation authority and durable backup target
remain missing here; no runtime recovery action is registered or called.

The later pinned-source review also checks the actual Promise adapter, not only
the permission schema. `packages/plugin/src/promise/permission.ts` declares
`assert(input): Promise<void>`; `promise/adapter.ts` forwards that one input to the
Effect host. It exposes no per-call request-options/signal parameter. Supplying
an extra signal argument is not cancellation wiring. The companion's ordinary
edit-permission adapter now uses explicit pre/post-await abort checks instead;
that correction is untested and cannot cancel a native assertion already waiting.

Likewise `promise/rpc.ts` exposes only `signal` and the declared-error factory in
the call context. It supplies no trusted initiating human/client/agent identity.
RPC can be called from other plugins or authenticated HTTP clients; a supplied
session ID, confirmation flag, nonce or metadata field is not proof that the
operator approved the exact recovery. Do not build an apply endpoint that turns
such caller data into the trusted callback. A genuine trusted host approval path,
exact operation/backup authority and cancellation-aware native integration remain
required. Recovery stays unregistered; no authorizer or permission is fabricated.

Parent verification (2026-10-28): 19 recovery cases, including real FIFO/lock and
post-publication failure boundaries, pass; the complete companion batch passes
142 tests. Strict TypeScript 5.9.3 no-emit checking of recovery source/tests passes
with ESNext/Bundler module semantics and dependency-library checking enabled.
A read-only preview of the real incident reproduced the owned canonical hash;
no real archive application, rollback or host activation was performed.

The later delivery follow-up replaces mutable user-archive inputs in the recovery
tests with clearly synthetic frozen records; all 19 real-file recovery/lock/
cancellation/rollback cases remain. The body-mutation assertion checks that bytes
actually change. A historical in-memory removal of header-only validation made
that regression fail, without changing production recovery source. Canonical
consolidation retained these fixtures and passed the selected goal/memory batch
and full companion health check. None verifies, repairs or attributes the real
`483f…/plan.md` mismatch, which remains a failing read-only audit.

### Cancellation correction verification — 2026-10-31

A fresh scoped run passed 30 synthetic real-file recovery cases (19 original,
6 cancellation regressions, 2 authorization-denial cases, 1 same-process
preview case, 1 backup-inspection cancellation case, 1 post-directory-creation
incomplete-backup case) and the 4 `process-lock` cases. Mutation controls were
run earlier on the then-canonical source and every file was restored
byte-identically; this correction performed no canonical mutation. The abort
check before backup preparation prevents cancellation during post-authorization
inspection and target recheck from creating an empty, unjournaled transaction
directory. It does not protect the awaited directory creation itself: an abort
during or after that creation can still leave an incomplete, journal-less
backup, which is retained, blocks later previews, and receives neither invented
rollback provenance nor silent cleanup. Its regression pins that boundary with
unchanged original targets, the retained incomplete backup, and a refusing
subsequent preview and rollback. The two post-authorization layers (the check
after the callback settles and the check at existing-lock entry) are
individually redundant but jointly necessary: removing both fails the two
authorization-settled cancellation cases. The apply entry check is currently
redundant with the authorization-callback entry check, and the existing-lock
entry check cannot be isolated through the public API. No actual host authorization, real archive apply or
rollback, runtime registration, deployment, or TypeScript check was performed.
