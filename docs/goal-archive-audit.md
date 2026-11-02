# Goal archive audit — 2026-10-28

## Host wiring review — renewed continuation, 2026-10-31

Parent inspects the pinned2.1.1 Promise RPC/permission declarations and the actual
adapter. RPC call context contains `signal`/declared-error construction, not a
trusted human, initiating client or agent identity. Permission assertion accepts
one input and runs it through the host; there is no request-options signal or
forced-human prompt parameter in this inspected surface. Current V2 RPC/server
documentation agrees that RPC is callable from clients/other plugins and policy
assertion prompts conditionally. These are source/API findings, not a loaded-host
or genuine human-approval observation.

Therefore an ordinary RPC plus caller `confirmed` metadata cannot safely become
the separate exact recovery approval. No recovery registration, authorizer,
permission request, archive preview/apply/rollback or generated-file edit follows.
The earlier historical483f mismatch/provenance and exact operation/backup/host
gates remain. The adjacent ordinary RPC cancellation forwarding and edit-assertion
boundary corrections are explicitly **untested** and documented in the
[companion guide](../.opencode/plugins/goal-docs/README.md#rpc-caller-cancellation--untested-source-correction);
they do not repair or authorize an archive.

## Selected active-goal export observation — 2026-10-31

A later read-only parent observation finds the active goal's bundle **present**
and consistent at sampled revision139: goal`21e84866-7bc3-4c1e-99a6-c679287fccc2`,
session`ses_e78fdcc9affeNOlKMRek7Yobo3`, status`active`, source kind`current`,
canonical worktree`/home/james/repos/computer-use`, exportedAt
`2026-10-31T22:28:12.562Z`. The snapshot's canonical semantic fingerprint, manifest
index/content/plan fingerprints, all four bundle file hashes and the README's
**managed block** hash match the writer semantics. The read set remains stable;
318,216B acquired in22ms under1MiB aggregate/256KiB-file/5s bounds.

This corrects any inference that the active replacement goal still has no bundle.
It is a selected, point-in-time consistency/freshness observation—not a manual
export invocation, source-authorship proof, full-archive pass or delivery-complete
result. Later goal revisions do not retroactively change what was observed at139.
The historical`483f…/plan.md` mismatch and its unknown provenance remain untouched;
no apply, rollback, export, generated-file edit, test or model call ran. Facts are
`Documents/direct-blockers-parent-tz3RSN/current-export-observation.json`, SHA
`a097a65933c47493fd40c327b3151a615a07d2802a33e67bc163e75adece9f2f`.

## Recovery cancellation source acceptance — 2026-10-31

Parent's six new cancellation regressions were genuinely red before entry,
authorization and lock-boundary checks. A reused DeepSeek worker then found a
preparation-time gap: an abort during backup inspection still created an empty
unjournaled transaction. The additional pre-preparation check closes that gap.
It does **not** guarantee that later cancellation leaves no incomplete backup:
the new post-mkdir regression deliberately retains that evidence, verifies the
synthetic original targets unchanged and requires preview/rollback refusal rather
than invented provenance or automatic deletion.

Independent final checks pass **30 recovery +4 process-lock =34/34**, zero
skips/cancellations,6.909s; the full companion batch passes207/207,10.134s.
Four parent **scratch-only** negative controls fail their intended assertions
(7,1,1,2 failures), with canonical source unchanged. Exact in-memory reconstruction
matches the pre-unit production digest and all19 original tests/helpers byte for
byte;11 additive cases cover cancellation, denial, preview identity and retained
incomplete backups. Raw parent evidence is in Documents
`archive-cancel-parent-fSGyL2`; scratch-controls factsSHA
`26fd9143d97adbf62584ca5776161cda9bd0d61148d0fd2881276acbb62fc9f3`.

The child's earlier canonical-source mutation scripts are preserved as a scope
failure and are not executed by the parent. Its overbroad cancellation guarantee
and attribution of concurrent export writes were retracted; observing writes
does not establish their issuer/cause. No actual archive apply, rollback, export,
host prompt, permission assertion, deployment or current strict typecheck ran in
this unit. The old strict result below is historical, not validation of these
edits. Exact operation approval, durable backup destination, genuine host wiring,
provenance and lifecycle freshness remain separate outstanding gates. The real
`483f…/plan.md` mismatch is not repaired or relabeled by these source tests.

## Shared acquisition correction — 2026-10-31

Parent review finds a real guard defect in the later auditor: its16,000,000-byte
aggregate comparison happened **after** a whole file read; rejected partial reads
were not charged, and its2,000,001-byte allocation could acquire a growing tail
past the declared2,000,000-byte per-file ceiling. Six owning regressions plus the
missing-CI-registration check initially fail. A separate executable-prerequisite
check also fails before`mkfifo`is declared for the required repository suite.

The reader now requires each held-size file to fit before payload allocation/read,
sizes every request by held-size/shared remaining allowance, and retains actual
short-read costs. Rejected requests conservatively charge their requested length
as unknown possible acquisition; report`observedBytes`and`failedReadChargeBytes`
are deliberately distinct. There are no refunds, replacement budgets between
delivery/lineage roots, extra EOF tail probes, raised caps or CLI limit overrides.
The in-process`maxTotalBytes`option may only reduce the fixed16MB ceiling. Existing
path/inode/metadata/read-set checks and all32old failure/positive cases remain;
new controls cover pre-read refusal, cumulative costs, failed reads, growth, exact
file limits, invalid reductions and cross-root sharing. These are API-delivered
byte bounds, not a kernel-I/O deadline, read-ahead/RSS limit or atomic snapshot.

The actual corrected canonical CLI observes5,680,599bytes under the unchanged
16MB aggregate/2MB file limits, with zero input,75-ID/crosswalk or reviewed-byte
errors. It still exits **1**, solely for the retained`483f…/plan.md`hash mismatch
across42bundles; lifecycle freshness is unverified without a supported checkpoint.
The1034-byte raw result is hash-readback preserved in Documents
`coverage-budget-parent-3nNubj/actual-audit.json`,SHA
`c31d73c7882c2ddc28685fba51a3ff17d2d5ad94660395d67171e61e725d7501`.
No generated archive, manifest, raw goal state or historical mismatch is changed.
This auditor covers the historical75-ID source register, **not** all additional
delivery lanes, actual outcomes or the eight active-goal completion criteria.
Its initial integrated CI has193/193repository cases passing but one unrelated
composition-clock test failure; the raw failed run remains retained. The test
correction isolates two deliberate clocks without changing any production helper
or resource limit; final combined acceptance is recorded separately below.
Final registered offline CI passes11/11required steps:193repository contracts
(including all39auditor cases),57checkout cases and248title-stage cases, with
zero skips/cancellations in those suites. Full health then passes. The109396-byte
raw JSON report is preserved as`ci-after-clock-control.json`in the same Documents
directory,SHA`9f4fbccf…aeeb5`. Neither green source integration nor the fixture
CLI's incomplete exit3 changes the real archive failure or establishes live
goal/export freshness.
The subsequent requirement-lineage review adds a40thowning case: O16must retain
its original row/local-preservation scope and explicitly link`D-no-pr`. The old
PR-first requirement is superseded by the later direct correction, not a failed
fetch to retry. Its new regression initially fails; after the additive crosswalk/
required-link correction, all63owning/adjacent cases pass, zero skips. The raw
6379-byte focused result`source-after-pr-lineage.txt`SHA`fbccca26…618be`is preserved
beside the actual audit. The full11-step run above preceded this small lineage
addition; unrelated checkout/title/archive/model attempts were not rerun merely
to refresh it. Final combined acceptance remains separate.

## Parent-verified recovery readiness — 2026-10-31

The later D4 investigation returned read-only. Parent independently read the
complete canonical `recovery.ts`/CLI contract and ran its actual preview against
the exact canonical483f bundle, using the existing empty scratch backup directory.
The preview succeeds, checks all169other owned entries, and performs no apply or
backup creation. An independent in-memory header-only transform also hashes to
`96ef0de60816e811f1fbc81ebc8c893658013d8115552deb3789246d67dd9891`.
The13721-byte actual file remains `ee9de7…9808`, inode5899384, with unchanged
mtime. The only transformed line is export time `03:59:00.586Z` to the frozen
snapshot's `03:58:34.686Z` on2026-10-28. Complete snapshot renderer compatibility
is checked by preview; this is not a manifest rehash or attribution finding.

The existing reviewed `restore-frozen-snapshot-header` contract supplies a narrow
reversible byte-restoration route, not permission to execute it. Explicit exact
archive-apply authority, a durable approved backup destination, and host-bound
authorization wiring remain missing. Apply requires the exact in-process preview,
re-CAS under the existing persistent process lock, verified original bundle/README/
manifest copies, and a durable journal before replacing only `plan.md`. Rollback
is separately authorized. No caller boolean/no-op callback substitutes for that
approval, and no archive/manifest/generated document was edited in this review.
The manifest is moving with other exports, so any eventual approval/apply needs a
fresh preview and current CAS; this observation is not an apply receipt.

D4's assertion that the auditor always needs `--lineage-root` is not accepted:
the actual canonical CLI defaults lineage to this same canonical root. That flag
is required only when deliberately selecting a different reference checkout.
The present mismatch remains a real failure; byte restoration would not prove
current lifecycle/export freshness. Causation cannot be established from inspected
files, rather than a proven universal impossibility of future attribution.
D4 also disclosed reading one bounded historical Documents receipt outside its
enumerated scope; retain that scope deviation separately from the useful result.

### Pinned host authorization distinction — 2026-10-31

Independent read-only review narrows, but does not remove, the host-wiring gap.
Pinned`packages/plugin/src/promise/permission.ts:23–32`exposes`permission.assert`
and explains that existing rules/saved approvals may allow it without prompting.
`packages/plugin/src/permission.ts:5–13`has no force-human/force-ask input field;
the result is`Promise<void>`, not a receipt proving a fresh human decision.
The [official V2 server permission contract](https://opencode.ai/v2/docs/build/plugins/server#permissions)
agrees. The recovery seam itself rejects booleans but deliberately trusts the
host callback; it cannot authenticate an arbitrary caller's non-boolean return.

Future integration needs genuine exact-preview/backup/operation approval **and**
the applicable native policy assertion, bound to a trusted invocation/session.
Do not implement a no-op/native-looking callback, infer approval from automatic
allow, invent forced prompting, self-reply to a permission or change policy to
make recovery run. This remains a missing host integration/authority boundary,
not an inherent impossibility. The CLI remains preview-only and index/RPC remain
unchanged; no actual assertion, permission reply, apply, backup, rollback, export
or generated archive write occurred in this review.

## Observed baseline and correction

All 13 existing goal bundles have the four mandatory files (52 files); the
manifest tracks those plus the README managed block. No bundle was deleted,
rewritten, manually rehashed or regenerated during this audit. Original selected
bytes and index/patch baseline were retained under the approved task scratch root.

The prior audit compared every manifest entry with a whole-file SHA-256 and
reported two mismatches. **One was an audit error, not a writer defect.**
`writer.ts` owns only the README block from `goal-docs:managed:start` through
`goal-docs:managed:end`, inclusive. Its actual block hash is
`9b5ef6cd6bfef923db6dbee88d46fb14aa26819d54c1307e02465b8b77dad179`,
matching the manifest. Text outside the block is intentionally not owned.

The actual mismatching `483f6755-70a7-4912-aee3-816fbe0b7546/plan.md` has:

- Expected owned hash: `96ef0de60816e811f1fbc81ebc8c893658013d8115552deb3789246d67dd9891`.
- Actual hash: `ee9de7a6fec9d148bdee2c938b7e396afd18aba4a21b05296533196f26239808`.
- Plan export: 2026-10-28T03:59:00.586Z; snapshot/HANDOFF: 03:58:34.686Z.
- Saved bundle status/revision: active/5. Before replacement live goal was
  active/13; it was then atomically cancelled/archived by user-authorized
  replacement with `50e7f33e-103e-4385-855e-ebb56845b277`. The new goal is active;
  old exports are not current lifecycle state and do not establish new repo export.

## Reproduction and safe disposition

Parent read writer/preflight/reuse and observer tests. Three additional isolated
tests exercise the actual writer with only filesystem boundaries substituted:

1. README block checksum succeeds despite manual text outside it; full-file
   checksum intentionally differs, and re-export preserves manual text.
2. Publish one changed goal file, fail the following manifest rename, then
   retry with a different export-time generation. The existing writer returns
   `manual_edit`, preserving the mixed bytes rather than overwriting them.
3. A status-only change with unchanged plan revision refreshes snapshot/index
   status; lifecycle freshness must not rely on plan revision alone.

`node --experimental-strip-types --test .opencode/plugins/goal-docs/goal-docs.test.ts`
passed **56/56**, including these cases and existing manual-edit/concurrency/
partial-bundle/lifecycle/unchanged-export/source-identity tests. These are source
tests, not runtime observer acceptance or attribution of the real incident.

The fixture demonstrates a **possible mechanism**, not proof the real mismatch
was caused by interruption. A genuine manual edit and that partial publication
cannot be distinguished from these files alone. Therefore no automatic recovery
is authorized by inference. Recovery/current retained-goal repo export stays
**blocked on authoritative provenance or a reviewed reversible recovery contract**.
No weakened writer guard, direct generated-file edit, persistent-lock deletion,
manifest replacement or goal-state write is a repair.

The new read-only `node scripts/request-coverage-audit.mjs` independently checked
the combined68-row/7finding mapping with zero structural errors, and all13saved
bundles. It exits1 on the **one real plan.md mismatch**, not a waived failure.
Manifest integrity includes `transfers` in the writer's exact payload order;
omitting it initially produced a verifier false positive, corrected with a
nonempty-transfer digest regression. README managed-block ownership still matches.
No supported-tool checkpoint was supplied to that CLI run, so native lifecycle
freshness is explicitly unverified. Eleven isolated audit-function/reader tests include
same-revision status drift, absent successor, missing history, corrupt bytes,
wrong identity, omitted requirement/decision/deliverable and false live claims.

Later, an explicit audit-function invocation supplied the supported goal-tool
checkpoint for replacement50e7f33e at **active/revision12**, exact parent session
and this worktree. It reports both the preserved483fplan.md hash mismatch and
**missing selected replacement archive**, across the same13bundles. This is a
comparison to that sourced checkpoint, not raw state access, a live-query feature
or a successful export. The CLI's earlier no-checkpoint limitation was **fixed on
2026-11-02**: `node scripts/request-coverage-audit.mjs --checkpoint <file>` accepts
one or more supported-tool checkpoints (id, status, planRevision, sessionID,
directory) and reports freshness as "compared with supplied supported-tool
checkpoint, not a live query". A real run with this goal's live checkpoint reported
three errors: the preserved 483f header mismatch, the live bundle's snapshot
mismatch, and `stale/missing selected archive` for the active goal because its
archived revision lags the live one. Duplicate or relative flags are still
refused, and a CLI test covers the new path.
Final preservation checks still match the original index/staged patch/entries
and four selected archive files byte-for-byte; focused source/link/audit checks
pass23/23. No source history or manifest was modified to manufacture acceptance.

## Decision trail and recurrence prevention

The replacement goal preserves predecessor revision-13 plan/history in the goal
backend; [instruction adoption](agent-instructions.md) records why it replaced
the stale objective. Repo-local backend-history export and full history retention
are separate checks; this audit does not claim they have succeeded.

Use the writer's real ownership semantics and verify identity/freshness separately.
At selected decision/phase/transfer boundaries, retain original objective, criteria,
reasons, actions, checks, pending owners/blockers and successor links. Unknown or
bounded history remains a coverage gap. Repo files are not committed/backed up
Git history until separately approved. Never overwrite an uncertain decision to
make an audit green; preserve it and continue independent authorized work.

## Canonical consolidation and discrepant delivery history — 2026-10-29

The old delivery archive was a distinct two-bundle snapshot, not a replacement
for canonical history. Its initial real CLI aborted on absent lineage input. The
bounded auditor now reports missing inputs without hiding independent mapping,
crosswalk and reviewed-byte checks, and accepts only an explicitly selected
canonical `--lineage-root`, never an implicit fallback. Historical delivery runs
retained 20 missing lineage files/five required bundles; canonical bundle counts
of 22 then 23 described their respective samples, not a lifecycle guarantee.

The delivery `752bcef4-29b6-4147-a97b-03725d4b8e39/HANDOFF.md` also mismatched:
expected SHA-256 `3afcb218e378b7d93efd1a13675d32781c687b20a5ba1375c0583dbddccdedeb`,
observed 62,173 bytes / SHA-256
`fcfbaa5b8db20aedf064c0c955e648990bffc6c48f1848849e5bdc796d9d1482`.
Two sampled reads agreed. Its displayed `2026-10-28T21:03:01.508Z` timestamp differs
from the frozen revision-33 `2026-10-28T20:58:07.049Z`; replacing only that header
in memory hashes to `384abafbef978031377f83573bba7af58ca12eb7cadc05707f2d54fb0bca556b`,
not the expected hash. Authorship/cause remain unknown.

Read-only reconstruction round-tripped the frozen goal and reproduced its complete
snapshot and generated hashes. Canonical rendering was 62,089 bytes; both handoffs
had 456 lines. After header normalization, bounded comparison found four removed
canonical lifecycle/checkpoint lines and four added observed lines. Replacing the
observed file could lose history absent from the snapshot. The header-only
`plan.md` recovery API is not a supported repair for this different discrepancy.

Both versions and all delivery manifests/locks/history are preserved verbatim in
the fully restored/hash-verified backup at
`/home/james/Documents/computer-use-delivery-preservation-20261029/`.
No generated file was manually merged, rehashed or overwritten; no historical goal
was resumed or relabeled. The supported current exporter may produce a newer
canonical bundle without authenticating the old delivery discrepancy.

Fresh canonical CLI now verifies 68 requirements, seven findings, 75 crosswalk IDs
and all reviewed source bytes with zero missing lineage inputs. It checks 24
bundles and exits **1** for the unchanged real `483f…/plan.md` mismatch; freshness
is unverified. The 28 auditor fixtures plus adjacent inventory/readiness/
credential/onboarding tests pass **55/55**. Their synthetic CLI inputs cover
missing/reference roots, no-write/no-fill behavior, incomplete exit 3, identity,
unowned/malformed bytes and invalid paths; they neither repair historical data
nor establish live goal/archive freshness, authorship or whole-goal acceptance.
