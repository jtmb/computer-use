# Acceptance checklist

Manual parent audit, not an automatic export. Unverified means not achieved.
See [implementation-audit.md](implementation-audit.md) for source identities,
preservation records and individual verification checkpoints.

## Required deliverables

| Requirement | Artifact or check | Evidence and remaining gate |
|---|---|---|
| 1. Request-specific screenshot ownership | `screenshot.ts`; concurrent and staggered capture tests | Blocked by the user's explicit capture deferral. Inventory differences are not ownership proof. No unsafe capture test permitted. |
| 2. Permissions before protected desktop effects | `desktop.ts`, `index.ts`, `contract.test.ts` | Independent allow/ask/deny tests and exact live Plan/architect/Build policies with fake backend; denied calls reached backend zero times. Permission errors propagate. |
| 3. Truthful screenshot cleanup | `screenshot.ts`; removal-failure fixtures | Deferred; no completion claim. |
| 4. Complete PNG validation | `screenshot.ts`; genuine and corrupt image fixtures | Deferred; legacy short header fixtures do not prove full validation. |
| 5. Bounded screenshot reading | `screenshot.ts`; oversize/growing-file fixtures | Deferred; no completion claim. |
| 6. Capture failure/cancellation lifecycle | `screenshot.ts`; trigger, timeout and cancellation fixtures | Deferred; no completion claim. |
| 7. Tree schema matches implementation | `desktop.ts`, `contract.test.ts` | Unsupported matchers removed from tree schema and rejected by adapter; independently inspected and tested. |
| 8. Candidate diagnostics survive failure | `desktop.ts`, `contract.test.ts` | Both stdout candidates and stderr retained under byte cap. Independent emoji repro now passes across eight alignments. Full suite: 26 passing tests. |
| 9. Source-aware handoff recovery | handoff skill; `global/commands/handoff_resume.md`; companion | Corrected guidance independently accepted: contradictory records stop; source session and workers must be explicitly inactive with complete coverage before overlap, otherwise ask. Legacy producer source archived verbatim; pilot legacy commands retired under separate approval. Fresh guidance trials and replacement integration/acceptance remain pending. |
| Human-readable planning skill | planning bundle and skill catalog | Metadata/links/examples verified; small documentation and architecture trials loaded the skill, stayed read-only and required explicit implementation approval. |
| Portable goal records | `docs/goals/<goal-id>/{plan.md,HANDOFF.md,work-history.md,snapshot.json}` and index | Automatic-export phase accepted at plan revision 43: actual current/archive packages verified with hashes, substantive sections, portable identity/scope and UTC times; manual files preserved. Writer bounds, safe ownership, revision checks, partial-bundle handling and cross-process recovery independently verified. Full handoff remains separate. |
| Automatic exports without context cost | companion observer and regression tests | Parent inspected observer and server entry point: no generation or per-prompt injection hook. Real-writer lifecycle fixture proves meaningful changes, no usage-only writes, retained cleared/replaced docs and zero prompt/session-create calls. Permission/disk failures preserve source bytes and allow retry. Actual automatic revision-42 export and its new kernel guard verified separately; source exporter phase accepted. |
| Working `/handoff` | one authoritative registration and transfer implementation | Approved pilot wiring is installed. The first attempt stopped after export; a separately approved retry produced exactly one independent same-worktree target, full 156,899-byte pending seed and real local tab focus/open acknowledgement. API/manifest fingerprints, preserved agent/model/restrictions, zero model activity and absent destination goal binding verified. Native pending text was blank; a related read-only preview correction was verified in that same target, without another producer invocation. See `docs/handoff-live-acceptance.json`. Explicit continuation remains unverified. |
| Explicit `/handoff_resume` | global command, handoff skill and destination acceptance | Command name and staged rename preserved. Canonical command deployed to the pilot only with explicit approval, byte-identical and visible in server inventory. Seed gates remain explicit and source-qualified; active/paused/closed fixtures pass. Invocation/model behavior acceptance was not included in deployment approval and remains pending. |
| PR #3 local reconciliation | pinned candidate and bounded carry-back | Local carry-back independently accepted at `11cbb763328f27ae97c03b8e57f832f0fe9fb78b`: five scoped paths, 23 protected source hashes and original HEAD/index/staged patch unchanged; 25 skills and health check pass. Final combined review remains. No commit or remote merge authorized. |
| PR #2 inspection and reconciliation | permitted GitHub changed-file read | User requested updated PR review/integration. Head is now `96fa9e747809245958dcb8fd24b0e9b4300f0e1e`, title includes Playwright re-enable. Fresh allowed changed-file read is still denied by lockdown. Need permitted source or user-supplied patch; no unread integration or protected MCP change. |

## Preservation and final verification

- Initial preservation was independently reconstructed with all 17 original
  changed-file hashes matching. Its temporary bundle is no longer available
  after the reported restart; this is historical verification, not a presently
  reproducible backup. The original staged-patch hash still matches. A fresh
  durable post-restart checkpoint is at
  `/home/james/Documents/computer-use-checkpoint-20261027T051951448952Z`.
  The staged command rename must remain separate from unstaged content changes;
  any new carry-back needs its own preservation guard.
- `opencode.json` still equals HEAD, including upstream goal-plugin pin and
  GitHub/Playwright MCP configuration. Desktop registration remains native with
  `codemode: false`; standard coding tools must remain available.
- The screenshot module still matches its initial preserved SHA-256
  `a0a26eddd2386e254e54b4ef510b1d083f4377f27ca8cdb389d52dcf773212ed`.
  It was not invoked. This proves deferral preservation, not screenshot safety.
- Final combined checks still required: all plugin suites, health check,
  syntax/whitespace, actual skill count and links, unchanged index/config,
  independent companion review, and permitted live session-transfer acceptance.
- Latest parent source run: **139 tests passed**, including 86 goal-docs tests
  and the concurrently expanded desktop/window-control and health suites,
  with clean staged/unstaged whitespace checks and health-check shell
  syntax. Final actual health recheck and Node syntax checks for changed
  TypeScript source/tests passed. All 21 companion source/test files also pass
  strict TypeScript 6.0.3 against real V2.1.1 SDK declarations, including library
  checking; see [typecheck-evidence.json](typecheck-evidence.json). This does not
  cover the whole repository or replace real-client acceptance.
  Test counts are not proof of the blocked live acceptance rows.
- After the reported restart, the two changed TUI source/test hashes, original
  staged patch, project config and deferred screenshot hash still matched.
  The interrupted type-check evidence refresh was finished, not assumed passed:
  all 21 files again checked with zero diagnostics at `2026-10-27T08:12:45.386Z`.
  Service discovery responded and both MCPs were connected. Completed tests and
  the home-client probe were not repeated solely because of the restart.
- Handoff identity checks now reject a goal outside the exported set, a different
  source, a non-independent target, unrelated target provenance and mismatched
  open acknowledgements. Server acknowledgement checks bind the source session
  before and under lock. All five regressions failed before correction and now
  pass; strict SDK type-check evidence has been refreshed with current hashes.
- The writer now uses a persistent, empty kernel-lock inode plus conservative
  owner-file recovery. A reproduced stale-recovery deletion race is corrected;
  real filesystem/cross-process tests verify crash recovery and failure release.
  `/usr/bin/flock` is required; unavailable support fails closed. The guard must
  not be deleted/replaced while writers run, and old/new writer versions must
  not run concurrently during cutover. Only local coordination files are ignored
  by Git; snapshots and the ownership manifest remain portable artifacts.
- Approved fresh-session screenshot interpretation remains blocked by capture
  deferral. Do not substitute a fake image test for that acceptance gate.
- Screenshot source documentation now distinguishes inventory candidates from
  owned captures, deletion attempts from verified cleanup, header checks from
  complete validation and post-read attachment checks from bounded acquisition.
  Unsupported "only copy" guarantees and inventory-based read/delete examples
  were removed. This reconciles prose only: the deferred backend, its output and
  implementation comments remain unchanged and are not safety evidence. No new
  capture route, invocation, deployment or permission change was approved.
- One exact pilot command deployment was separately approved and completed; see
  `docs/handoff-pilot-cutover-receipt.json`. It did not authorize invocation,
  model execution, screenshots, restart, other deployment or global companion
  rollout. Commit, push, publication, remote merge, permission grants and
  security changes remain unauthorized; commit/push approvals stay separate.
- A later explicit **Wiring + transfer test** approval authorized the exact
  one-file CLI manifest and one non-executing producer attempt. Wiring is applied
  and its backup verified; `docs/handoff-pilot-cli-receipt.json` records both
  stages accurately. No handoff destination was observed, no source restriction
  changed and the owned acceptance client was closed. Another invocation needs
  approval at that checkpoint; that initial attempt was not successful. The original approval-pinned
  type-check evidence is archived byte-identically, while the current evidence
  covers the related cache-invalidation source correction.
- A separately approved **one retry** subsequently passed the producer stages:
  exactly one source-qualified destination, cryptographically bound full seed,
  preserved independent session configuration, actual target focus and no
  execution/goal binding. The pending seed's read-only preview was verified after
  a client visibility correction on that retained target, without a third
  invocation. The second approval's source evidence is also archived unchanged;
  current type-check evidence covers the pending-view correction. Full explicit
  continuation/model acceptance is still not approved or achieved.

The overall goal cannot be complete while any required blocked or unverified
row remains. Continue independent unblocked work before considering an impasse.
