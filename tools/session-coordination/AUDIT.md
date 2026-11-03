# Bounded coordination audit — 2026-10-27

Source and native skill-discovery evidence only; not live plugin/UI acceptance.

## Queue/visibility regression

| Requirement | Artifact and checked outcome |
| --- | --- |
| Diagnose why peer guidance is parked | Previously verified queued guidance used passive `queue,resume:false`. Native queued/steer and execution scheduling are distinct. The latest bounded five-chat snapshot found four peer inboxes empty and one unattributed queue item here; it was not promoted or called peer-authored. |
| Correct reusable guidance | Canonical skill now includes exact prompt flags for actionable work/awaited replies, no-wake steering and passive notices, existing-ID PATCH activation, safe-boundary pending and no duplicate/no unknown-input promotion. Three source-contract tests pass; these do not prove model comprehension. |
| Confirm missing global visibility | Before deployment, native `GET /api/skill` at `/home/james/repos` and `/home/james/repos/tailscale` lacked coordination. This checkout advertised it. Active global config lacked `skills`; old global bundles lacked the new skill. |
| Deploy globally without collateral settings | `scripts/deploy-global-skills.py` preview/apply registered the absolute canonical source root in the discovered active global config. Backup is adjacent to config, mode0600. Exact semantic comparison confirmed only `skills` changed; models/permissions/plugins stayed identical. Repeat preview reports unchanged. No restart, copied runtime skill edits or optional plugin activation. |
| Verify actual discovered content | Native skill lists at all three exact locations return the complete canonical skill body (frontmatter correctly stripped). SHA256 `4a6f220215316f39fe8f92b52d1c70957a0675fcc97b740449c3f1019cdf8170`. This is discovery, not proof old turns reloaded instructions. |

## Test-quality findings and disposition

- The AJV test previously claimed every operation but its explicit list omitted
  the newly added `policy`. It now executes that operation and compares the
  exercised set with `OPERATIONS`; silent future omissions fail.
- The rate-limit test named cross-sender coverage but originally used one sender.
  It now uses a second native caller and a restarted service against real state.
- Delivery presenter now names passive queue versus steer and separately enabled
  idle wake. New assertions prevent an admitted passive input being presented as
  observed processing. This does not prove native runtime wake behavior.
- Seven deployment tests exercise real files: default no-write preview,
  unrelated-config preservation/backup/idempotence, the live missing-array case,
  symlink/hardlink/JSONC/invalid-source refusal, duplicate keys/byte bounds,
  externally changed config before replacement with cleanup, and incomplete or
  symlinked source refusal. Only the external edit seam is injected.
- Policy tests exercise default no-create/read-only tools, exact inheritance and
  restart, revision conflicts, native denial before protected effects, stale
  session scope, Off/inbox/steer/wake, allowlist rejection, passive notices,
  pinned uncertain replay and revocation, persistent rate budgets/clock rollback,
  and no legacy unknown-input upgrade. Native network/permission APIs are faked;
  actual JSON/files/atomic writes/flock run. No distinct test was deleted.

Latest verified checkpoints including the presenter assertions: 46 package
tests (4.21s), strict actual-SDK/library checking of15roots with zero diagnostics
(32.75s), and25 feature/portability/autonomy tests. Seven deployer tests and repeat
preview pass. An earlier final-check invocation was interrupted by the peer's
service restart and was not counted as success; no previous checker/test process
remained before the bounded rerun. Receipts are in approved scratch, not runtime
configuration. The staged binary patch and project config match the original
baseline; no index changes, commits or pushes were made by this work.

Remaining limits: same-UID authenticated API is not unforgeable human authority;
policy/session checks are not transactional with native admission; cooperative
locking/content comparison cannot eliminate every hostile config-editor race.
Live native plugin output, visible Ctrl+P, steer/no-idle-wake acceptance and
operating-procedure rollout remain separate unfinished work. Global skill
registration does not activate the inactive package. Historical screenshot,
media, PR2 and source-owner gates remain intact. The export-audit completion
notice is a peer report pending parent verification, not an automatic takeover.

## Ctrl+P source integration follow-up

Seven additional tests run the actual palette controller against real scoped
service/store settings, with dialog/keymap/native metadata/permission I/O faked.
They verify saved policy/readback after restart, project versus chat/inherit
isolation, cancellation at every wizard boundary, missing selection/companion,
route change/unload, revision conflicts/moved server sessions, invalid allowlist
and native edit denial. The pure layer factory is evaluated twice; it contributes
one namespaced palette command and no Ctrl+P binding, settings-page or sidebar
replacement. No test calls a model prompt or writes global configuration.

The full source suite passes **53 tests** (6.08s) and strict SDK/library checking
passes **19 roots / zero diagnostics** (60.01s, bounded at75s). These supersede the
46test/15root source checkpoint, not the missing live acceptance. Test-only SDK
type imports are stripped at runtime, not declarations fabricated to pass. The
server registers/disposes the real typed RPC and rolls back its tool registration
if RPC setup fails; actual framework registration/rendering still needs the
separately authorized live gate. The user-visible sender error path is explicit
and never silently grants native permissions or retries a possibly saved update.

## Final source verification and escaped lifecycle regressions

The requirement-to-artifact matrix is [ACCEPTANCE.md](ACCEPTANCE.md), not a goal
export or full completion claim. The subsequent skill reconciliation added a
fourth source-contract test and verified its complete current body globally;
the earlier skill hash above is a preserved hotfix checkpoint, not the latest
body. Current body SHA256 is
`90f92d3441bd2d941a13e873036f497bbdc3605cc0e53e5194e284fa9937463b`.

Provenance audit added quoted/forged command-shaped bodies, mixed direct-user
text inside peer input and fresh move-after-post dispatch refusal. Concurrency
audit added barrier-controlled overlapping native delivery with concurrent ACK,
an actual conflicting-claim race, thrown/invalid mutation no-commit and retained
truncated-room refusal. The owned subprocess fixture now leaves partial staging
bytes before its controlled crash; committed room/claims and persistent lock
inode survive, and orphan bytes are retained rather than mistaken for history.
Native admission/idempotency remains a boundary fake; real files/processes run.

Three new watchdog tests **failed before correction** despite the older suite
passing: a terminal event during an in-flight register observation was dropped
(one call instead of two); progress updates started three concurrent observations
instead of one; and progress reenabled a timed-out uncooperative observer. The
correction preserves one entry and disabled state per assignment, coalesces one
follow-up behind the active request, rejects stale-generation results and
deduplicates all three terminal types. All11watchdog tests now pass, including
provider waits, out-of-order duplicates and explicit stop during pending work.
No worker interruption, duplicate assignment or ownership-transfer feature was
added. Observation errors still do not prove the underlying operation stopped.

Final source integration: **65 package tests pass**(5.27s), **strict19roots /
zero diagnostics** with actual SDK/library checking(44.02s,90s bound), **34**
focused catalog/link/portability/autonomy/goal tests and **7** deployment tests.
The verified local read-only health script passes(v2.1.1/service/required plugin
inventory/GitHub/Playwright/28skills/supporting desktop and goal-docs suites).
No tests were deleted, no compiler shims/skipLibCheck bypass added and no
unrelated process killed. Current staged patch/project config still match the
original baseline; only `skills` differs from the pre-deployment global backup.

Native plugin inventory has **no coordination registration**. Hence optional
activation, visible results/Ctrl+P and live delivery/no-idle-wake acceptance
remain unmet gates, not implied by this green source/integration audit. The
user's global-skill deployment authorization does not activate this package.

During the audit the Tailscale peer requested nonsecret guidance. One exact-ID
native reply was admitted with authorized steering; one metadata snapshot showed
the target running and that input no longer pending, not an explicit ACK. Advice
identified its missing native `.env` consumer and existing LAN-facing49374
bypass/HTTPS/app-auth gates from source/upstream docs. No secret, browser,
clipboard, key-entry, login, deployment, permission or peer-goal change occurred.
