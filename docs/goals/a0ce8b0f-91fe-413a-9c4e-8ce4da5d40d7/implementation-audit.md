# Implementation audit

This is a manually maintained implementation record, not an automatic goal
export and not evidence that the work below is complete.

## Scope and source

- Repository: `jtmb/computer-use`; working branch: `main`.
- Starting commit: `b47765e4a9f5c124c4716deb52962e17d7fb4a2a`.
- Source session: `ses_e85293a02ffe7Hlk5CfyoIgStT`.
- Goal: `a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7`.
- The saved goal plan includes the nine fixes, safe PR reconciliation, a
  planning skill, portable goal documentation and a working session handoff.
- The goal headline has not changed: the plugin requires an explicit
  `/goal edit` command. Do not bypass this by editing its state file.
- No commit, push, remote merge or runtime deployment is authorized by this
  record. Preserve upstream goal-plugin code/storage, MCPs and Code Mode settings.

## Preservation and baseline

Scratch recovery bundle:
`/tmp/opencode/computer-use-preservation-1793071308158934629/`.

It contains separate staged and unstaged binary patches, original status,
starting commit, a working-file archive and a SHA-256/mode manifest for 17
changed files. Reconstruction from the starting commit plus both patches was
checked in a separate scratch directory. All 17 hashes matched, the staged
`resume.md` to `handoff_resume.md` rename survived, and the original checkout
and index were not changed by this test. This is scratch protection, not a
permanent backup or a guarantee that later edits are covered.

The reconstructed baseline's `logic.test.ts` suite passed 15 tests. Those
tests do not cover the nine reported failure cases or prove live capture safety.

## Required regression evidence

| Finding | Required proof | Current state |
| --- | --- | --- |
| 1: screenshot ownership | Staggered user captures and concurrent requests cannot read/delete unrelated images | Investigated; changes deferred by user |
| 2: permissions | Denied operations never reach the backend; allow/ask/deny remain effective | Source and policy regressions verified; final review pending |
| 3: cleanup reporting | Failed removal is surfaced; no false deletion claim | Deferred by user |
| 4: complete PNG validation | Real PNG succeeds; truncated/corrupt data is refused | Deferred by user |
| 5: bounded reading | Oversize/growing input cannot trigger an unbounded read | Deferred by user |
| 6: capture lifecycle | Trigger failure, timeout and cancellation report possible retained files accurately | Deferred by user |
| 7: tree schema | Every advertised argument is implemented; unsupported filters are rejected | Source and regression tests verified |
| 8: ambiguity diagnostics | Candidate stdout and explanatory stderr both survive within the output cap | Source and regression tests verified |
| 9: source-aware recovery | Fresh sessions cannot substitute an unrelated goal | Guidance verified; companion/runtime integration pending |

## Active work and restart recovery

The server restarted after the first delegation batch. A bounded recovery
inspection found the planning-skill, desktop-contract and screenshot-design
children still running; they were not relaunched. The goal-docs child was
reported cancelled and had created no files. Only that child was resumed.

| Child session | Ownership |
| --- | --- |
| `ses_e849dd761ffeXa07VJd2AuG1Ew` | New planning skill and its skills-catalog entry |
| `ses_e849dd42cffetacy9UFJJ0R7z0` | Desktop `index.ts`, `desktop.ts`, new contract tests |
| `ses_e849dd461ffeYfKQSWk0CD1aG5` | Read-only screenshot-ownership investigation |
| `ses_e849dd3d5ffeQw4DM5WC6AHwFO` | New goal-docs companion directory only |

Child reports require independent inspection and verification. The parent
owns integration, documentation reconciliation and acceptance, not duplicate
implementation in a child's assigned files.

### Verified implementation checkpoint

The planning child completed. Parent inspection accepted its three-file bundle
and catalog delta after independently checking YAML metadata, all bundle-local
links, the actual 24-skill directory count and whitespace. Existing desktop
catalog changes remain present. OpenCode advertised the new `planning` skill
after the source update. This establishes source/discovery acceptance, not a
claim that representative model behavior or the entire goal is verified.

Additional bounded assignments:

- `ses_e8496ea44ffeV8ecLa1B5tYDSf`: PR #3 reconciliation only in a separate
  integration worktree, using the immutable preservation bundle rather than
  concurrently changing live files. No PR #2 access, commits or publication.
- `ses_e8495d3a1ffeDR1Y2I6a24UAR2`: source-aware handoff skill and resume
  guidance only; the live-transfer companion and original handoff command
  integration remain separate work.

## Pull requests

- [PR #2](https://github.com/jtmb/computer-use/pull/2), planned head
  `5ad1343820add607fd3c5381f4c1923b3c05ed69`: changed-file inspection was
  refused by MCP lockdown. It is not reviewed or safe to integrate. Do not
  bypass the restriction through another client.
- [Draft PR #3](https://github.com/jtmb/computer-use/pull/3), inspected head
  `11cbb763328f27ae97c03b8e57f832f0fe9fb78b`: the full text diff, metadata,
  reviews and checks were read. There were no submitted reviews and one
  successful GitGuardian check. This is not functional acceptance. Its README
  and skill-catalog changes overlap local edits; it also adds a README skill
  and a mascot asset. Preserve local desktop-tool documentation and maintainer
  context during reconciliation. Asset/render validation remains outstanding.

Neither PR has been applied to the original checkout. PR #3 has an isolated
baseline integration candidate; see the later checkpoint. Recheck head/base
revisions before final integration.
Use an isolated combined tree and explicit conflict decisions, not whole-file
ours/theirs replacement. Draft readiness and remote merge need separate approval.

## Screenshot decision

The ownership investigation is complete, not the screenshot fix. Parent checks
confirmed GNOME Shell 50.1, portal 1.21.1, GNOME backend 50.0 and live Screenshot
interface version 2 via the read-only D-Bus version property. The supported
request-correlated portal returns its own result URI, but automatic active-window
targeting is a version-3 feature. On this machine window selection needs a
visible picker; file retention must also be reported honestly rather than
assuming the returned path is exclusively owned and safe to unlink.

The user explicitly chose **Defer screenshot changes**. Leave the capture
backend unchanged, do not invoke its unsafe inventory/deletion path, and do not
make permission grants. Findings 1, 3, 4, 5 and 6 remain unresolved, and the
goal must not be closed as complete while they remain. Other work continues.

## PR #3 pin clarification

The integration child stopped after fetching because of a supplied-pin formatting
concern. Parent independently counted the recorded pin (40 characters), checked
the fetched ref and re-read permitted GitHub PR metadata: all matched
`11cbb763328f27ae97c03b8e57f832f0fe9fb78b`. At that checkpoint the worktree target
did not exist and no candidate had been created. The child was resumed with the
unambiguous full pin and instructed to reuse the completed fetch. This is not a
change of PR scope or a claim that integration passed.

## Initial independent acceptance findings

- Planning acceptance session `ses_e84917a15ffe3mqWuKH5hfD087` loaded the new
  skill and produced a source-linked, proportionate plan. Its tools performed
  inspection only. The closing wording incorrectly implied that switching to
  Build alone authorizes implementation, so the skill child is strengthening
  its counterexamples and approval rubric. Behavioral acceptance is not yet final.
- Desktop contract tests independently passed 21 cases, including the original
  logic suite. Tree matcher rejection and combined bounded stdout/stderr were
  confirmed by source inspection. Permission acceptance is **not** complete:
  using the live Plan-agent ordered policy in a stub evaluator allowed both
  `read` and the new `desktop_mutate` action, reaching the fake backend once.
  The existing Plan policy denies `edit`, not every custom mutation action.
  The child must honor that existing gate without changing user configuration
  and add representative policy regressions. No GUI mutation was attempted.
- Source-aware handoff guidance was inspected and its YAML, unchanged skill
  description, links and staged rename independently checked. A global command
  must not assume every consumer repo contains the skill source path; the
  handoff child is correcting this to load the available skill by ID and to
  report missing live-worker verification capability explicitly.

All three corrective follow-ups were recorded in the goal plan before the
children were resumed. Their output is not accepted solely because tests pass.

## Corrected implementation checkpoint

- Desktop corrections now pass 25 tests. Using the exact current Plan,
  architect and Build policy arrays with the registered executor and a fake
  backend independently confirmed the `read`, `desktop_mutate`, `edit` sequence:
  Plan and architect were denied before backend access (zero calls); Build
  reached the fake backend once. No real GUI mutation or screenshot occurred.
  The parent accepted this source change and launched a separate read-only
  reviewer, `ses_e848b5b26ffepSy5fbmQgzxA6U`.
- The health check now includes every desktop `*.test.ts`, including the new
  contract suite. Its actual run, Bash syntax and whitespace checks passed.
  Setup documents the TypeScript-capable Node prerequisite. A green check does
  not resolve the deliberately deferred screenshot defects.
- The global resume command now loads the available `session-context` skill
  by ID and asks before overlap when live worker status cannot be verified.
  Parent YAML, link, unchanged-description and staged-rename checks passed.
- The corrected planning bundle passed source checks. Trial session
  `ses_e848a1fe5ffeSZa5LDb16sSLQz` loaded it and returned a read-only plan with
  an explicit request to switch to Build **and say go** before applying changes.
  It still presented reference paths as code rather than clickable links;
  this trial is evidence for the approval distinction, not perfect compliance
  with every style criterion or architecture-plan acceptance.
- The isolated PR #3 candidate at
  `/home/james/repos/computer-use-pr-integration` is detached at the verified
  incoming commit. Parent verified all 15 non-overlap preservation hashes,
  unchanged incoming skill/asset bytes, PNG dimensions/chunk CRCs, the merge
  base, clean candidate index/whitespace, and 15 baseline tests. README retains
  branding, setup gates, desktop tools and maintainer context. It deliberately
  lacks later child changes; final reconciliation must include planning,
  corrected desktop/handoff files, Node prerequisite, skill counts and docs.
  No carry-back or remote merge has occurred.

An interrupted empty patch call did not modify this record. Restart recovery
confirmed the companion child and desktop reviewer still running; neither was
relaunched. The goal remains active at plan revision 15 with nine tasks carrying
completion evidence, not nine completed findings. Deferred and unverified work
must still be resolved before any overall completion claim.

## Independent desktop review follow-up

The read-only reviewer found one low-severity UTF-8 boundary issue and no other
introduced issue by inspection. Parent reproduced an unintended replacement
character using a long candidate stdout beginning with `xxx` followed by repeated
four-byte emoji, while stderr remained present and the byte cap held. Only
`candidate_errors` was reopened at plan revision 16 for complete-codepoint
truncation and non-ASCII regressions. Permission and tree-schema work remain
accepted; the original desktop child owns this narrow correction. The reviewer
did not run tests, and no live desktop input was used for the reproduction.

## Subsequent acceptance and contract checks

- The UTF-8 correction is accepted after independently reading its implementation
  and mixed-width boundary regression. All 26 tests passed; the parent's original
  emoji reproduction now passes across eight alignments with no unintended
  replacement character, stderr intact and output within the byte cap.
- Architecture-planning trial `ses_e84870540ffeekVT055WRjpY4S` loaded the skill,
  inspected only the three permitted files, produced clickable source links,
  a clearly proposed file tree, dependent phases, tradeoffs and tests, and
  required Build mode plus explicit implementation consent. It labelled storage
  and exporter assumptions as unverified. Together with the corrected small-doc
  trial this satisfies the representative planning behavior check.
- Before authorizing bounded local PR #3 carry-back, parent re-read GitHub
  metadata: draft head and base still match the pinned revisions. The original
  README still matched preservation; incoming asset and skill paths did not
  exist. The child owns only README, catalog, the two new skill files and asset;
  it must create a fresh preservation bundle and retain all later source deltas.
- Parent read the installed OpenAPI and official V2 server/TUI/RPC documentation.
  The installed prompt route explicitly describes `resume:false` as durable
  admission without scheduling execution; create accepts an explicit location.
  The supported TUI navigation is router navigation or tab focus, not a read
  receipt. Actual create/seed/focus acceptance remains pending implementation.
- Parent independently checked only selected service path variables, not
  credentials: service PID 320490 has the pilot XDG data root and no goal-state
  override. The pinned upstream resolver selects
  `/home/james/.opencode-v2-pilot/data/opencode-goal-plugin/goals.json`.
  A read-only selected-record check confirmed schema version 3 and the exact
  active source session/goal at plan revision 17. No storage or upstream edits.
- The manual [acceptance checklist](acceptance-checklist.md) maps required
  deliverables and final gates. Rechecking the screenshot's preserved hash,
  unchanged project config and staged rename passed. The goal plan is now
  revision 18; its 32-decision limit refused another append, so new contract
  progress is stored in the owning task's evidence without discarding decisions.

## Live non-executing prompt admission

Parent created the labelled acceptance fixture session
`ses_e8481162effeepNgSD8K3NkAoU` with Plan agent at the exact source worktree.
The installed `session.prompt` admitted fixture message
`msg_17b7eec2a001xmFXEjYbYgDyBG` with `resume:false`. Both its admission response
and an independent `session.inbox.list` read preserved the exact text, including
Plan and Historical documentation sections. The session was absent from the
active-session map; a read-only state check found no goal binding or archive.
No visible navigation, goal mutation or autonomous execution was requested.
This proves the installed create/seed contract, not the still-pending actual
handoff exporter/command or visible focus. The test session is retained rather
than deleted without approval. Evidence is saved at goal-plan revision 19.

## PR carry-back and companion review

PR #3 local carry-back changed only README, skill catalog, the two new
readme-maintenance skill files and the mascot asset. Parent independently read
the reconciled documents and checked 23 protected source hashes, original HEAD,
index bytes and staged binary patch against the fresh preservation bundle at
`/tmp/opencode/computer-use-pr3-carryback-preservation-20261027T035307Z-326034`.
The three incoming files equal the pinned commit exactly. Actual skill count and
catalog are 25; health and staged/unstaged whitespace checks passed. The carry-back
is accepted, not committed or remotely merged. Final combined review is separate.

Parent independently reran the initial companion's 21 fake tests and inspected
the server, RPC, session, state, observer, renderer and transfer sources. Green
tests do not establish acceptance:

- The actual source session response has no `permissions` field. The initial
  implementation requires it, so real handoff creation would fail. A direct
  model-adapter probe also confirmed that the `high` model variant is dropped.
- Generated HANDOFF uses a combined Plan and history heading with sibling links,
  not the required separate substantive Plan and Historical documentation
  sections. Portable repository/worktree identity and consistent exported time
  are missing from the document contract.
- The observer needs coverage for idle UI lifecycle changes, restart and changes
  arriving during an export, beyond the initial settled-event fake coverage.
- The state adapter uses a hardcoded host/cache path; the parent requested a
  supported portable discovery contract. Cancellation and installed API-shaped
  fixtures also need correction.
- A location-scoped read of the service's plugin list showed that server and
  colocated TUI/RPC surfaces are already auto-discovered, but the companion is
  **failed** with an `Object.entries` TypeError during plugin loading. Parent
  did not request a reload, call its RPC or deploy runtime copies. The ordinary
  location-less API query defaults to `/home/james`, so it is not evidence about
  this repository's plugins. Native desktop and upstream goal plugin were active
  in the correctly scoped response.

The companion child owns these corrections. Parent recorded changes-required at
plan revision 21; no companion task is complete from the fake tests alone.

Independent source-recovery review also identified explicit stop branches needed
for conflicting record identities/revisions, available-but-unknown live status,
and active source sessions without separately identified workers. Parent read
and accepted those findings, reopening only source-aware guidance. The old root
handoff producer's unrelated-goal overwrite risk remains part of the pending
command integration. A separate read-only design child is resolving the sole
`/handoff` authority and preserved legacy command cutover, without runtime
deployment or changing screenshot behavior.

## Corrected resume guidance accepted

Parent followed up the handoff correction immediately: read the corrected
command/skill/guide branches and independently validated YAML, unchanged full
skill frontmatter and description, relative links, required explicit gates,
whitespace and the staged R100 rename. Contradictions now stop for an
authoritative-source decision; genuinely missing fields are gaps only in
otherwise consistent records. Overlapping edits require explicit inactive
source-session and worker status with complete, untruncated coverage; all active
or unknown cases ask. The child reported 46 temporary assertions, but removed
that checker, so parent acceptance relies on its own retained source inspection
and independently executed checks, not an unreproducible test-count claim.
Producer integration and actual recovery behavior remain separate pending work.
The saved plan records this source acceptance at revision 23.

## Source cutover preservation and remaining live gates

Parent accepted the source-only design after checking official V2 loading,
command, RPC and navigation APIs and the actual scoped server command list.
The live list exposes `handoff` and `resume`, not the desired source
`handoff_resume`, and command records have only name/description, not reliable
provenance. The replacement must therefore fail closed when any server command
claims `handoff` or its inventory is unavailable. No competing registration,
configuration duplication or undocumented precedence is acceptable.

The source legacy command was moved verbatim to
`docs/legacy-commands/handoff.md`, with an explicit non-runnable archive warning.
Parent independently verified hash
`d7e984ed69f7f5439eba3df18252ca4126ac6e9830ce530b6f797d19bb1177be`, the exact
preserved bytes under `/tmp/opencode/handoff-command-migration.jLaz0e/`, and the
absence of the old source registration. Full index bytes and the full staged
binary patch still match the prior PR #3 preservation, including R100 rename.
The child's initially empty patch hash was scoped to the handoff path, not the
full staged patch. Parent also required and verified wording that the TUI
replacement is planned, not active; deployed copies were not touched. Source
migration is accepted at plan revision 28. Real cutover still requires approval.

The live API fixture's ordinary generated message ID was replayed with identical
text and `resume:false`. Parent independently retrieved the same inbox before
and after: unchanged contents, exact original returned, and no active execution.
This is duplicate-ID contract evidence, not proof of the companion's custom ID
syntax, loading, full transfer or visible navigation.

The updated PR #2 was identified at
`96fa9e747809245958dcb8fd24b0e9b4300f0e1e`; its title is now Browser fixes,
Playwright re-enable, and email-management skill. User requested review and
integration, but the fresh permitted `get_files` read remains denied by lockdown.
No alternate transport bypass or unread integration was attempted. Parent asked
for permitted access or a user-supplied patch and retained protected MCP settings.

A bounded guidance-acceptance child now owns scratch-only fixtures/trials for
contradictory packages, paused inaccessible sources and legacy gaps. These trials
must not create goals or touch active source sessions and will not substitute
for still-blocked live handoff UI acceptance. The companion correction child
continues its distinct plugin scope.

## Session delegation authorization

The user requested one question-tool authorization at most per session, including
after a no answer, with later on/off control through explicit prompts. The parent
asked once for source session `ses_e85293a02ffe7Hlk5CfyoIgStT`; the user selected
Keep subagents off. For this session, `authorizationAsked: true` and
`subagentsEnabled: false`. Do not ask again, launch/resume children, or give them
additional assignments unless the user explicitly enables delegation. Workers
already running may finish their existing scope; this is not authorization for
more work. A fresh session must not inherit this session's authorization state.

The skill, usage guide and catalog now encode that gate and parent-only fallback.
Parent directly performed the update without a new child, validated 12 source
contract checks, YAML/metadata/links/line count, preserved existing non-ASCII text,
and verified the original staged binary patch remained unchanged. These are
skill-guidance checks, not a claim of a new runtime permission enforcement layer.

## Guidance trial timeout and cleanup

Parent independently read the retained trial's actual JSONL, summary and report
under `/tmp/opencode/handoff-recovery-acceptance-jc9iwc3o/`. Only one step-start
event was recorded in 240 seconds; no text or tool calls were available to assess
the conflicting-records case. The paused-source and legacy cases were not run.
Parent follow-up is failed/inconclusive, not accepted behavior. The observed
orchestration skill changes correspond to the user's later requested parent
update; the companion writer was concurrently owned by its original worker.
No concurrent work was discarded to force a clean-status claim.

The fixture backend remained active after its CLI timeout. Parent verified its
exact scratch location and Plan agent, interrupted only
`ses_e846d6b86ffeaN0sEugl3AxOz6` with `resume:false`, and confirmed it was absent
from the active map afterward. The main and companion sessions were not
interrupted. No worker was resumed or given more work. Subagents remain off;
there will be no retry through another tool or model session. Goal-plan revision
30 records the behavioral acceptance blocker and completed fixture cleanup.

## Direct verification work with delegation off

Parent updated the health checker without assigning a child. It now reads the
required plugin inventory at the checkout's exact location and refuses missing,
duplicate or inactive IDs. A passing unit suite cannot hide a failed companion
or an inventory for the service's default directory. Companion source tests are
included when its entrypoint is present; their success is explicitly not live
handoff acceptance. README and setup explain these limits.

The new `scripts/health-check.test.mjs` executes the actual shell checker with
mocked external OpenCode/Node I/O. Six tests cover healthy state, both suites,
failed plugin despite passing suites, wrong location, missing/duplicate IDs,
malformed/failed inventory and failed source suites. Parent ran all six plus the
26 desktop tests: 32 passed. Bash syntax and whitespace passed. Original staged
binary patch, project configuration and deferred screenshot backend hashes are
unchanged. The full real health check and currently changing companion suite
are not counted as passed by this run. No worker, model session, deployment,
reload, handoff RPC or screenshot was started. Plan revision 31 records this
partial verification progress; source and live companion acceptance remain open.

## Companion follow-up and real export evidence

The original companion worker finished its previously assigned correction scope.
Parent independently reran its 31 tests and read the updated adapter, renderer,
observer, exporter, session and TUI wiring. The first follow-up was changes
required: `tui.ts` called `focusHandoffTarget` without importing it, and source
session permissions still required an array the real source response omits.
No worker was resumed or assigned another correction while delegation was off.

Parent added `tui-wiring.test.ts`, which imports the actual TUI module with only
external SDK/Solid surfaces stubbed. Two of three tests failed on the missing
helper before the import fix; all three passed afterward. The combined goal-docs,
desktop and health suites now pass 66 tests. The actual full health checker also
passes: required plugins active at the exact repository location, MCPs connected,
source suites passing and 26 skill bundles. This is not rendered UI acceptance.

Automatic source discovery and the observer generated two goal packages here,
for the source session's current and retained archived goal. Parent verified
every snapshot-generated file SHA-256, shared UTC export times, exact source
session/goal/status/revision, repository identity `github.com/jtmb/computer-use`,
worktree `main` and relative scope `.`. Separate substantive Plan and Historical
documentation sections exist, and manual audit/checklist files remain. The
adapter and document tasks are accepted at plan revision 34; no manual service
reload, runtime-copy deployment or handoff RPC was performed.

Two real handoff gaps remain concrete, not theoretical completion claims:

- Installed V2.1.1 OpenAPI does include optional `Session.Info.permissions`;
  the source session omits that optional field. The current adapter still
  requires an array. Supported absent-field semantics must be established
  before treating the session as unrestricted or claiming handoff works.
  The retained complete OpenAPI is
  `/tmp/opencode/installed-openapi.PEGJ9u.json`; writing API output to a regular
  scratch file avoided the intermittently truncated large piped CLI output.
- An independent pure fixture with the same goal and two export times returned
  the same semantic fingerprint and transfer ID but different HANDOFF and seed
  text. The current fresh export timestamp can therefore diverge from an earlier
  same-ID seed. Retry content must be stable and equal to the verified saved
  bundle before idempotency is accepted.

Parent also completed a live non-mutating desktop smoke: app inventory, bounded
tree/find queries and a focus preview with `apply:false` worked; the preview
reported `dry_run:true`. A deliberately ambiguous app read refused with useful
candidate names. No preview token was saved, no mutation applied, and no screen
capture or protected dialog inspection occurred.

## Stable retry content and optional session overrides

Parent added advancing-clock export and failed-seed retry assertions first:
both failed on changing timestamps/text before the repair. The writer now reuses
only complete manifest- and snapshot-hash-verified bundles under its root lock,
returns their actual saved source/files to the exporter, and preserves the first
semantic export's bytes and time. Render version 1 forces a deliberate refresh
of older output; manual edits, partial bundles and changed source sessions are
not reused. The transfer fingerprint now includes the exact seed-text hash.

New regressions cover unchanged exports, changed meaningful state, exact saved
seed text after a transport failure, manual edits, older render versions,
partial-file recovery and source-session conflicts. A separate real filesystem
fixture at `/tmp/opencode/goal-docs-reuse-ao0YfA` was reopened in a new Node
process: no document writes, identical handoff bytes/modification time and the
original UTC export time. This proves the persistence behavior, not UI focus.

The permissions repair preserves the optional API representation instead of
declaring absent overrides unrestricted: when `Session.Info.permissions` is
omitted, destination creation omits it too; it does not fabricate an empty list
or allow rule. Explicit arrays are validated/copied, malformed values fail, and
the destination must match override presence/value, agent, model/variant,
project/worktree and have no parent or fork before seeding. The realistic
omitted-field test failed before the repair and passed afterward. Changed target
agent/restrictions and unrelated parent/fork fixtures refuse before prompt.

Parent also verified the companion's actual custom ID format against the idle
existing acceptance fixture: `msg_goal_docs_4eb25b45c7ff6ca3bb8bde67e67a27e2`
was admitted with `resume:false`; same-ID replay returned the same input with no
inbox change or active execution. No new session, goal, worker or security
setting was created for this check. This is API admission/replay evidence, not a
completed companion transfer.

All 71 combined tests and the actual full health check pass after these changes.
Automatic output was observed at source revision 35 with render version 1 and
matching generated hashes. Original staged patch and project config remain
unchanged; the screenshot backend is still deferred and untouched. Plan revision
36 records progress; live cutover/focus and remaining race/recovery acceptance
are not claimed complete. Delegation remains off.

## Pagination repair and reported server restart

Installed session-list responses were observed as `{data: [...], cursor: ...}`,
with a live next page. The former list helpers unwrapped `data` before inspecting
its sibling cursor, losing later pages in both startup export recovery and
transfer lookup. Parent reopened only the adapter task for this concrete defect.
Two actual-flow fixtures failed before the repair, then passed after sharing a
cursor-preserving decoder. Additional checks cover wrapped/raw pages and refusing
creation when the ten-page bound is reached. A live read-only two-page request
also confirmed that directory/limit plus cursor is accepted by this API.

The user reported a restart after code and tests were written. Parent resumed
the four pending checks rather than rebuilding previous fixes or replaying
fixture prompts. All four and the full 75-test regression suite passed; the
post-restart health check passed with both MCPs and the required exact-location
plugins active. The adapter correction is accepted at plan revision 38. No
subagent was resumed, authorization re-asked, setting changed or service restarted
by the parent.

The old temporary PR preservation bundle could not be read after the restart.
Parent did not recreate its name or pretend it still existed. The known full
staged binary patch SHA-256 still matched
`91d6022a66f661ad993f27b3d2c1ee1997dd8ac2261c2830ef213e22ccb1c805`;
project configuration still equals HEAD and the screenshot module still matches
its initial preserved hash. The isolated integration worktree also remains.

A new private checkpoint export at
`/home/james/Documents/computer-use-checkpoint-20261027T051951448952Z`
contains 81 changed/untracked source files (7,204,558 bytes), Git patch/index
records and a hash/mode manifest. Archive contents, source hashes and both patch
streams were verified stable across capture. It is a new post-restart checkpoint,
not a recreation of the lost initial bundle. The unrelated new dirty
README-writing reference and README-GIF work were preserved, not reverted.

## Parent-only handoff concurrency and lifecycle verification

The expired-create-lease and late-seed-failure fixtures first reproduced duplicate
destinations and overwriting a newer completed transfer. Destination creation now
supplies a deterministic `ses_goal_docs_…` ID, and lease-token checks prevent a
superseded invocation from replacing newer progress. The installed API was
independently checked with idle fixture
`ses_goal_docs_d388cd7c40c24893b4d794675a7d21df`: duplicate creation returned that
same ID, retained the original title/metadata even with conflicting input, and
did not activate execution. This is historical API fixture evidence; no fixture
was replayed during the latest continuation.

The three pending unexpired-claim and cancellation regressions passed. An
unexpired claim does not launch another creation or seed; cancellation after
creation retains one destination; interruption after possible admission replays
the exact same message ID and text. Another client still receives a pending-focus
result after an earlier open acknowledgement. The full combined suite then
passed 81 tests.

Parent review found another race between the initial transfer read and acquiring
the claim lock. Its regression failed with a completed record downgraded to
`in_progress`. The callback now preserves open-stage records under the lock and
verifies their targets before returning readiness; the regression passes.

Two actual-TUI-module regressions also failed before correction: an unverified
stale-owner recovery could navigate/acknowledge, and a user switching sessions
during the pending RPC could have focus taken back. Navigation now requires open
phase, admitted seed, verified target and the unchanged initiating source route
and worktree. Both regressions pass; pending transfers do not navigate or record
an open acknowledgement. These are wiring tests with SDK/Solid/UI I/O stubs,
not rendered-client acceptance.

A new observer-to-real-writer fixture checks eight semantic exports across
creation, checkpoint, pause/resume, completion, replacement, cancellation and
clear. Usage-counter changes cause no write; prior goal documents survive clear
and archive changes; there are zero prompt or session-create calls. Parent read
the observer and server entry point and found no generation or per-prompt
injection hook. This does not settle all writer recovery/concurrency requirements.

Latest full combined run: **85 passed** (53 goal-docs, 26 desktop, 6 health).
Shell syntax for the health check and staged/unstaged whitespace checks pass.
Final actual health recheck and Node syntax checks for the changed TypeScript
source/tests also passed. `tsc` and `bun` are not available on PATH, so Node execution is not
represented as a full TypeScript check. Known original staged-patch hash,
unchanged project configuration and screenshot backend hash all still match.
Checkpoint comparison also found concurrent README/demo edits; they were only
inventoried and remain untouched. Source-only concurrency changes do not
constitute runtime cutover approval. No new subagent, model execution, capture,
deployment, commit, push, permission grant or remote integration occurred.

## Kernel serialization of stale-lock recovery

Parent reproduced a second writer-ownership race in the real recovery algorithm:
two callers could validate the same dead recovery owner, then a delayed unlink
removed the newer caller's freshly acquired recovery lock. The new controlled
interleave regression failed with `a stale cleanup removed the new recovery
owner's lock` before correction.

`process-lock.ts` now serializes the entire writer/recovery operation through a
Linux kernel `flock` on a persistent empty inode. The installed executable is
`/usr/bin/flock` from util-linux 2.41.3. It inherits an open file descriptor rather
than a shell command string; acquisition is nonblocking with a three-second
helper bound. The kernel lock remains held after the helper exits, until the
parent descriptor closes or its process dies. Unsupported platforms, unavailable
helpers, malformed paths, nonempty files and multiple hard links fail closed.
No dependency was installed, service restarted or permission changed.

The writer still conservatively preserves live/unowned legacy owner locks.
The kernel guard remains held during their recovery and during actual writes,
so competing new writers cannot race a stale unlink. The guard itself is never
unlinked. Do not delete/replace it while writers may run, or mix old/new writer
versions during runtime cutover. The cutover guide records this prerequisite;
runtime changes remain separately approval-gated.

The regression now passes. Four real-filesystem tests additionally verify
kernel ownership after helper exit, same-inode reacquisition, independent roots,
symlink/hard-link/nonregular/nonempty refusal, cancellation, and actual writer
exclusion against another idle local Node process. Killing only that test-owned
process releases its kernel lock; the real writer then recovers its dead owner
record and exports the expected documents. A subsequent manual-edit rejection
also releases the guard and preserves the manual content. Scratch directories
live under `/tmp/opencode` and are removed by the tests. These are not OpenCode
sessions or subagents; no model or prompt execution occurs.

The observer failure fixture now proves permission denial and disk failure leave
the upstream state bytes unchanged and keep the same snapshot retryable. The
atomic-rename fixture also checks guard release and a successful retry. Existing
semantic lifecycle, isolation, schema, bounds, manual-edit and revision checks
remain green.

Latest combined run: **91 passed** (59 goal-docs, 26 desktop, 6 health), followed
by a passing actual health check. New/changed TypeScript syntax, staged/unstaged
whitespace and health-check shell syntax checks pass. Three narrow Git ignores
cover only local coordination files; `git check-ignore` leaves goal snapshots
and the ownership manifest unignored. Concurrent README/demo edits remain
untouched. Original staged patch, project configuration and screenshot hash
checks still pass.

Actual automatic export at revision 42 was inspected after the source changes:
the exact main source session/worktree matched, all four package hashes matched
the manifest, and all three Markdown hashes matched the snapshot. The new guard
was present as an empty, singly linked mode-0600 regular file (inode 5380069),
with no transient owner/recovery lock left behind. Parent did not invoke reload,
runtime-copy deployment or a companion handoff RPC. Exporter/writer/regression
phase acceptance is recorded at plan revision 43; real TUI transfer, full
TypeScript checking, deferred screenshots and inaccessible PR #2 remain separate
unfinished gates. No goal completion is claimed.

The subsequent automatic revision-43 export was also hash-verified and retained
the same guard inode, demonstrating real repeated exports rather than only a
one-off scratch acquisition.

## Explicit continuation gates in the transferred seed

Parent found that `handoffPrompt` still began "Continue from this explicit
handoff" even though transport admission is intentionally context-only. The
corrected `/handoff_resume` guidance lived elsewhere and was not actually carried
in that initial seed. A new active/paused/closed fixture failed before correction
because the seed lacked the context-only and source-qualified continuation gates.

The seed now explicitly forbids execution from seeding/focus, waits for the
user's `/handoff_resume`, asks if the command is unavailable, rejects unrelated
current-session goal recovery, preserves paused/closed status without creating,
rebinding or activating a goal, and requires complete read-only verification of
inactive source session/workers before overlapping edits. Unknown/conflicting
source data requires asking. Actual Plan/History document bytes and provenance
are still included; only the transport preamble changed. Its hash already
participates in transfer identity, so changed seed bytes cannot replay an older
message ID accidentally. No retained export render-version change was needed.

The new regression passes for active, paused and complete statuses; the full
combined suite passes **92 tests** (60 goal-docs, 26 desktop, 6 health), with
clean changed-source syntax and staged/unstaged whitespace. This is static and
coordinator evidence, not a replacement for the previously inconclusive model
guidance trial or approval-gated real `/handoff_resume` acceptance. No model or
application-session fixture was retried.

## Strict companion type check against published SDK declarations

Although `tsc` is absent from PATH, VS Code includes the TypeScript 6.0.3 compiler
API. A first read-only pass lacked Node/SDK declarations and was inconclusive.
Parent then created the isolated scratch workspace
`/tmp/opencode/goal-docs-typecheck-0ansHU`, using the published OpenCode 2.1.1
plugin/theme SDK and matching peer declarations, Node 22 types and JSON Schema
types. npm's target and cache were both confined to that scratch directory;
install scripts were disabled, optional dependencies omitted, and neither repo
nor runtime dependencies/configuration changed. OpenTUI emitted a newer-runtime
engine warning; its runtime was not executed, only its real declarations checked.

The real-declaration pass reported 35 own diagnostics and two missing external
JSON Schema declaration diagnostics. Corrections narrowed the writer's supported
encoding to UTF-8, preserved the TUI guarded-call discriminated union, explicitly
narrowed cache entries, and fixed fixture method/metadata types and a needless
readonly-to-mutable schema cast. The actual schemas and writer behavior remain
unchanged.

Official V2 RPC documentation confirms that JSON Schema results are typed as
`unknown`, not inferred output objects. Rather than add an unchecked client cast,
`rpc-output.ts` now validates each response against the existing shared output
schema before returning the local result type. Tests accept actual handler
outputs and reject malformed status, arrays, nested progress, optional-field
types and unexpected keys. Actual-TUI wiring also refuses malformed RPC results
and missing target cache entries without navigation or acknowledgement.

Final result: **21 companion source/test files, zero diagnostics**, with
`strict:true`, `noEmit:true`, `skipLibCheck:false`, ES2022/ESNext and Bundler module
resolution. Normal TypeScript resolution falls back to the isolated dependency
workspace for external packages; no ambient API stubs are used. The durable
[typecheck-evidence.json](typecheck-evidence.json) records exact package versions,
integrities, compiler/options, dependency-lock hash and every checked source
hash. This is companion-wide checking, not a whole-repository check or rendered
client acceptance. The full behavioral suite now passes **95 tests** (63
goal-docs, 26 desktop, 6 health). No model, application-session fixture, screenshot,
deployment, restart, commit, push, permission grant or subagent was invoked.

## Truthful screenshot source documentation, with backend still deferred

Parent read the unchanged native capture implementation and the entire
desktop-vision bundle/catalog. The guide incorrectly guaranteed deletion and an
"only copy" attachment, treated a single inventory addition as owned, and showed
an inventory-based read/delete fallback. Those claims contradicted the confirmed
findings: ownership is not request-correlated, cleanup errors are suppressed,
PNG validation is header-only, the attachment limit follows the read, and late
or failed-trigger capture retention is not fully accounted for.

Canonical desktop-vision SKILL.md/README.md and only its catalog summary now
state those limits explicitly. Trigger snippets are described as existing
mechanics, not a safe fallback around the gaps. A capture deferral also forbids
shell equivalents; a different interaction/permission change still requires
separate approval. Inventory-only reading/deletion instructions were removed;
explicit file sharing is not deletion approval, and retention stays unknown
unless verified. This is documentation reconciliation, not an adopted capture
replacement or completion of findings 1/3/4/5/6.

Before-edit source was preserved in
`/tmp/opencode/vision-docs-before-VnWtJa/sources.json`. Parent verified exact
frontmatter preservation, unchanged unrelated WSL paragraphs and catalog
content, local links, shell-snippet syntax, 26-skill count and the original
screenshot hash. The final actual health check passed. All 21 type-checked
source/test hashes still match the durable report. No native capture, shell
trigger, GUI mutation, skill deployment, restart or backend edit occurred;
existing concurrent README/demo and Windows/browser work were preserved.

## End-to-end source/transfer/target identity checks

Parent's next source review found that shape validation was insufficient for
identity consistency. Five focused regressions failed before correction:

- The server accepted source B's acknowledgement of source A's seeded transfer
  in the same worktree and marked A's transfer complete.
- The TUI selected a current goal absent from the returned export set.
- A handoff response with a different source or the source itself as target
  could navigate and acknowledge.
- An unrelated same-worktree target's provenance could be accepted.
- A response acknowledging another transfer/target could produce a success toast.

Server acknowledgement now checks source-session ownership at both the initial
read and the under-lock update; a different source cannot use the already-open
branch either. The TUI checks exported goal membership, response source and
target independence, the cached target's exact source/goal/transfer provenance,
and the acknowledgement's transfer/target IDs. The shared provenance helper
preserves the server's existing metadata check without importing server-only
filesystem operations into the TUI. Correct source acknowledgement still works;
wrong metadata is checked across each identity field.

All five regressions now pass, as does the full **100-test** combined suite
(68 goal-docs, 26 desktop, 6 health). The strict 21-file companion type check
against real V2.1.1 SDK declarations still has zero diagnostics. The earlier
durable report is retained in
`typecheck-evidence-2026-10-27T061015082Z.json`; current hashes and verification
time are in `typecheck-evidence.json`. Actual health and staged/unstaged
whitespace checks pass. No live companion RPC, model fixture, screenshot,
deployment, restart or subagent was used for these regressions.

## Read-only live cutover inventory

The exact-checkout API inventory still lists the server's legacy `handoff` and
`resume`, with no `handoff_resume`; the replacement TUI must therefore remain
disabled. `opencode debug config` returns a list of discovery layers, not a
merged config object. An initial object-shaped parser could not inspect it;
parent inspected the real list shape and did not infer command absence.

Actual discovery layers include the pilot profile at
`/home/james/.opencode-v2-pilot/config`, the project config, and the home/repos/
project `.opencode` directories. Only the pilot's command files claim these
legacy names among discovered layers; neither config document defines them
inline. The pilot files are regular, not symlinks, mode 0664:

- `commands/handoff.md`: 827 bytes, SHA-256
  `8f53405441607fb20f2df0ca325a089ef65548edc622e65900a9d891d9b1250e`.
- `commands/resume.md`: 946 bytes, SHA-256
  `de730405361e8295f9f622c8ddcb8e2f791315ae3df6a0cc226838ac37dcc0fa`.
- `commands/handoff_resume.md`: absent.

Separate copies under `/home/james/.config/opencode/commands/` exist with
different hashes, but that tree is not among the observed pilot discovery
layers. Do not touch it. Retiring pilot global commands affects other pilot
repositories that lack the project companion; temporary testing versus permanent
cutover is a user scope decision, not implied approval. No runtime file was
changed, moved, copied, removed or deployed during inventory.

## Explicitly approved permanent pilot command deployment

The user selected **Permanent pilot cutover** in the scope question, whose text
explicitly withheld runtime-write authority. Parent then prepared
`docs/handoff-pilot-cutover-manifest.md` with exact paths/hashes, owner-only
backups, no-overwrite canonical installation, unrelated-profile preservation and
bounded failure rollback. A second question obtained **Approve this manifest**
for execution, expressly excluding command invocation, models, screenshots,
restart, goal changes, commits/pushes and global companion rollout.

The first execution attempt stopped in read-only preflight: the command API's
location is beside its list, not inside the list. The backup directory was still
absent and no runtime write occurred. Parent verified the actual envelope and
the unchanged legacy inventory before retrying the same approved manifest.

The bounded operation then succeeded. Verified byte copies were flushed before
retirement; original files were moved, not deleted, preserving inode/mode.
Canonical `global/commands/handoff_resume.md` (4635 bytes,
`12b407c7543019eb8a6d63026492d629c0051f8a31007378cecb7a7660c4cf9d`)
was staged, flushed and atomically installed without overwriting a destination,
with owner-only mode 0600. The old originals and byte copies remain under:

`/home/james/.opencode-v2-pilot/config/commands.backup-handoff-cutover-20261027/`

Private `receipt.prepared.json` and `receipt.applied.json` retain the observed
file metadata and before/after inventories. The sanitized durable summary is
`docs/handoff-pilot-cutover-receipt.json`. Parent independently reread both copies
and retired originals, checked their hashes/inodes/modes and confirmed the new
file equals canonical source. The separate `/home/james/.config/opencode` command
tree, unrelated pilot commands and command-directory mode were unchanged.

The documented file watcher updated the exact-project server inventory without
a restart: old `handoff` and `resume` disappeared, `handoff_resume` appeared, and
all unrelated names remained. Actual health, staging, project configuration and
the deferred screenshot backend still pass preservation checks. This clears the
server collision gate; it does not verify that the user's real TUI loaded the
replacement or focused a seeded destination. No handoff RPC, model execution,
capture, client/service restart, goal mutation, commit or push was performed by
the deployment. Live acceptance remains a separate user-approved step.

## Real TUI registration and home-launch mismatch

Parent opened isolated visible Ptyxis clients attached to the exact source
session, without submitting a prompt, invoking either handoff command, or using
the deferred screenshot path. Existing user tabs were not operated. The first
repository-launched probe's actual terminal redraw contained
`Handoff current session Export th Goal documentation` at row 17 after opening
the palette and searching for `handoff`. This verifies repository-scoped command
registration, not export/create/seed/focus acceptance.

A home-launched client attached to the same repository session was also
inspected. Reading only terminal descendants of the exact owned frame
`OpenCode Home Scope Probe` through the canonical accessibility backend showed
the palette query `handoff` and `No results found`. Traversal of that frame was
complete; other user-terminal contents were not read in this scoped check.
The selected source session's API location remained this repository. Therefore
selecting the existing project session did not make the producer available in
this home-launched client.

Independent read-only plugin inventories confirm the scope difference:
`computer-use.goal-docs` is active with server/TUI/RPC features at
`/home/james/repos/computer-use`, but absent at `/home/james`. CLI reconciliation
logs also report 15 plugins for the repository probe versus 14 for the home
probes. Plugin counts alone are not command-registration evidence; the actual
palette observations establish the difference. The global continuation and
repository-local producer now have mismatched deployment scopes. The approved
command-only manifest explicitly excluded global companion rollout, so this
limitation is not repaired by that deployment and must not be reported as a
working home/multi-tab handoff.

Probe limitations and corrections:

- Cleared proxy streams sometimes contained no subsequent redraw, despite a
  visible rendered palette. Empty streams were inconclusive, not proof of absence.
  Scoped AT-SPI readback above resolved the home palette case.
- A temporary single-file CLI observer passed via inline configuration never
  produced its expected output. Its loading is unverified; no registry claims
  rely on it and no persistent configuration was edited.
- The first probe inherited a bare GUI PATH and used the legacy binary path.
  Subsequent probes used the normal pilot launcher and original full PATH,
  restoring normal `node`/`opencode` availability without editing shell settings.
- Three remaining owned clients (26980, 27412, 27797) were terminated only after
  checking saved state, executable, parent PID and exact proxy arguments. The
  earlier owned repository probe 25994 was already stopped. Original user client
  4977 and shared server 4992 remained alive. Scratch diagnostics were retained.

No source code changed in this investigation. No screenshot, live transfer RPC,
continuation/model invocation, restart, global rollout, goal rebind/pause, commit
or push occurred. Remaining work is a separately approved scope correction and
bounded live transfer acceptance performed by the agent, not a request for the
user to inspect or operate the TUI. A home/new-session view has no selected
source to transfer; that must remain an explicit no-source state rather than
silently choosing a session or goal.

## Selected-session client repair and restart recovery

Source-only repair in `tui.ts` adds explicit TUI plugin option
`scope: "selected-session"`. The default remains exact project-worktree scope.
Selected-session mode snapshots the selected session's location, checks that
location's active `computer-use.goal-docs` RPC companion and command inventory,
and passes the captured location explicitly to export, handoff and opened RPCs.
It does not install a server/exporter at the home launch directory or choose a
session/goal from a home/new-session view. Route/session cache changes invalidate
availability; stale asynchronous checks cannot reenable an old source. Every
RPC repeats scope validation. Open acknowledgement now rereads the target's
location and transfer provenance rather than trusting an earlier cached object.

The actual-module TUI wiring suite grew from 12 to 24 tests. Five initial new
tests failed against the unchanged source, then passed after the repair. Further
coverage checks a disappearing companion, collisions outside the launch scope,
missing/relative locations, retained commands after home navigation, worktree
movement during validation and target movement before acknowledgement. The
fixture explicitly drives route/cache effects with its Solid stub; it is not a
real-Solid reactivity acceptance test. Strict checking against real V2.1.1 SDK
declarations caught two accesses to a field not declared on `LocationPublicRef`;
using the existing structural location contract resolved them without `any` or
skipping library checks.

Real loading was verified separately without invoking a transfer. One isolated
home-launched TUI used only process-local `OPENCODE_CLI_CONFIG_CONTENT`, with a
CLI-only entry pointing to the canonical companion directory and the explicit
selected-session option. Complete exact-frame AT-SPI readback of the active
`OpenCode Selected Session Probe` showed `Handoff current session` in the actual
palette under `Goal documentation`, where the unconfigured home probe had shown
no results. Client 29997 was terminated after executable/parent/proxy ownership
checks; source location and existing user clients were preserved. No persistent
CLI config, global server plugin, screenshot, prompt or model was changed/run.

The broad source run completed with 131 passing tests: 80 goal-docs, 45 desktop
(including 19 preexisting window-control tests), and 6 health tests. Actual health
also passed. The user then reported a server restart during the final type-check
evidence refresh. Recovery verified unchanged TUI source/test hashes, original
staged-patch hash, project configuration and deferred screenshot source hash.
The completed test suite and home probe were not rerun. Only the interrupted
strict check was finished: 21 source/test files, TypeScript 6.0.3, real published
SDK/peer declarations, `noEmit:true`, `skipLibCheck:false`, zero diagnostics at
`2026-10-27T08:12:45.386Z`. Compiler and dependency-lock hashes still match the
prior evidence; the durable evidence now records the two new source hashes.
Post-restart service discovery responded and GitHub/Playwright were connected.

A distinct remaining loading case was then checked once: a repository-launched
TUI with the same temporary CLI-only entry plus automatic project discovery.
Complete exact-frame readback of `OpenCode Combined Registration Probe` showed
exactly one producer row in the palette. Owned client 34909 was stopped only
after checking its exact executable, parent 34888 and proxy arguments. No
handoff command was submitted. This verifies registration coexistence in that
probe, not a completed live transfer or a persistent rollout.

Permanent CLI enablement is still outside the approved command-only manifest.
Actual export/create/seed/focus through the producer and explicit continuation
behavior remain separately approval-gated. Source tests, temporary registration
and a green health check do not satisfy those live acceptance gates. Screenshot
findings remain deferred; PR #2 remains unread under the access restriction.

## Prepared pilot CLI wiring manifest

The remaining persistent-client scope was inspected without changing settings.
A normal pilot launcher started one owned home-scoped TUI under `strace`, with
tracing restricted to read-open syscalls for the two candidate CLI settings
paths. Two observed calling threads belonged to owned client 35532 and opened
`/home/james/.opencode-v2-pilot/config/cli.json` read-only. The separate standard
CLI file was not opened in that trace. No file contents or existing user
processes were traced; no security setting was changed. Client 35532 and tracer
35535 exited after exact executable/parent/proxy ownership verification. This
resolves the effective pilot target; it does not establish transfer behavior.

Prepared `docs/handoff-pilot-cli-manifest.md`, SHA-256
`4bd0fd237852dbe2ef8f856e26d2653417313b8da46d27d87b8cee966a84fb26`.
It proposes only appending the selected-session CLI entry to the existing pilot
plugin array, preserving every prior plugin and all non-plugin settings. The
original 513-byte, mode-0600 file hashes to
`f053be32107160d139cea487435f55a6648200b13a8fbe58388f06b5fd22c700`;
the validated deterministic candidate is 668 bytes, SHA-256
`33777226840a92518b2edc8838032caca9567a7f78f2ecbb49c5641b1694c862`.
Only a private scratch candidate was written; the target and proposed adjacent
backup remain unchanged/absent. The manifest pins all 21 current source hashes,
requires a verified flushed backup and no-drift atomic apply, preserves the
separate config tree, and includes bounded no-overwrite failure rollback.

Wiring-only approval would not submit the producer. The manifest additionally
defines an optional, explicitly separate one-transfer acceptance scope using an
owned isolated client, exact source identity, independent destination and
`resume:false`. It expressly excludes `/handoff_resume`, destination execution,
goal changes, screenshots, restarts, commits and pushes. Neither scope has been
approved by the generic goal continuation. No runtime configuration was changed.

## Approved CLI apply, incomplete producer test and cache correction

The question tool obtained **Wiring + transfer test**, explicitly approving the
exact manifest above and its one non-executing producer test. It did not approve
continuation, models, workers, source-goal changes, screenshots or restarts.
Preflight revalidated manifest/source pins, exact original settings, absent
backup, ownership, mode, single link, non-symlink ancestors and protected source
hashes. The original bytes were exclusively backed up and flushed before atomic
replacement. The installed 668-byte CLI settings match the approved candidate;
mode 0600, every previous plugin entry, other settings and the separate standard
CLI file were preserved. The sanitized durable record is
`docs/handoff-pilot-cli-receipt.json`; the source manifest remains immutable.

An isolated normal home launch, without inline config, showed exactly one
producer in its actual palette. Initial submission preflight refused ambiguous
`ptyxis` application identity before sending anything. A fresh bounded search
then found only the exact owned frame, verified the source title and palette,
and sent one approved palette submission through a one-shot private control
action. Its exclusive, flushed invocation marker records exactly one attempt.

The test did **not** complete a transfer. The source package refreshed to plan
revision 56 at `2026-10-27T08:41:32.934Z`, but the manifest contained no transfer
record, a complete two-page after-list contained no source-qualified handoff
destination, and the owned TUI remained on the source. The only newly listed
session was the separately active README/demo session, not a handoff target; it
was not modified, stopped or adopted as evidence. The transient toast was not
retained, so the live abort reason itself is not proven from a captured error.
Owned client 38335 was stopped after exact executable/parent/proxy verification;
the source session was not interrupted and its agent/model/restriction/location
fields matched the baseline. No second submission was attempted.

Follow-up source review found an independently reproducible defect matching the
export-only symptom: effect-driven inventory refresh on an unchanged cache
replacement increments the inventory generation during the export RPC, causing
the caller to discard that completed export and stop before handoff. A new
actual-module regression failed with calls `[export]` before the correction and
passed with the full export/handoff/navigation/focus/acknowledgement sequence
afterwards. Selection effects now deduplicate by session ID and exact location,
and perform inventory work under `untrack`; actual selection/location changes
still invalidate pending work.

An additional isolated test used the actual Solid client runtime from the
pinned declaration workspace, with controlled reactive cache notifications and
SDK/network boundaries still stubbed. Removing the deduplication block reproduced
the export-only failure; the corrected actual module passed. Outputs are under
`/tmp/opencode/handoff-solid-regression-ihomixuz/`. This verifies that concrete
reactivity defect, not full application transfer or the uncaptured live error.

The changed source required a fresh run: 134 combined tests passed, including
81 goal-docs tests and the concurrently expanded desktop/window-control suites.
Strict real-SDK checking of all 21 companion source/test files passed with zero
diagnostics at `2026-10-27T08:48:32.424Z`. The current evidence has the corrected
source hashes; the approval-pinned prior evidence was retained byte-identically
as `typecheck-evidence-2026-10-27T081245386Z.json` with its original SHA-256.
Installed CLI/backup, separate settings, staging/config/screenshot hashes and
owned-client cleanup were checked independently. Permanent wiring is applied,
but actual transfer/focus is still unverified. Another producer invocation needs
explicit approval because the approved one attempt was consumed; continuation
and model execution remain outside scope.

## Separately approved producer retry and visible saved context

The question tool separately obtained **Approve one retry**, pinned to type
evidence SHA-256 `081f615de14b94fc5435d18532ec9959d444c0974b8da8ee7a73a24e3c3ce749`.
No new runtime settings write or continuation/model permission was included.
Source hashes were rechecked before one producer submission from an owned normal
home-launched TUI. Its fresh, complete two-page baseline contained 23 sessions.

This retry completed the producer's server stages and actual local navigation:

- Transfer: `goalhandoff_3ccb4e58c2be0bcefd2bd976877052050fe3c43a`.
- Target: `ses_goal_docs_e947f92f5e4b276263707296dc80e591`.
- Seed: `msg_goal_docs_e947f92f5e4b276263707296dc80e591`, 156,899 bytes,
  SHA-256 `db6fc4abb65527db6820bcb9f8c0cb4e01d41c4ebc5e1d620d4c17d7c2d2503b`.
- Exported source status/revision: active / 58 at
  `2026-10-27T09:07:12.548Z`, same repository/worktree/project, agent/model/variant
  and permission-override presence/value; independent target with no parent/fork.
- Exactly one source-qualified destination in a complete two-page after-list;
  exactly one pending user input, zero transcript messages, zero model tokens/cost,
  absent from the active-session map, and no goal binding through the read-only
  validated goal-state adapter. Source identity/restrictions remained unchanged.
- Actual owned TUI displayed the new target tab and the manifest recorded open
  acknowledgement complete. This is real client evidence, not `session.view`.

The native transcript was initially blank: a `resume:false` seed is durable inbox
input, not an executed transcript message. Explicit pending-cache refresh alone
did not make that text visible. A related source correction now refreshes pending
data for a verified target before focus and on reopening that target, and shows
the matching stable seed in a read-only dialog. Its preview is capped at 8,000
characters with explicit truncation disclosure; no other queued input can be
substituted. Three pending-refresh tests failed before the correction; they and
the added preview/truncation/mismatched-input checks now pass.

Without invoking the producer again, complete exact-frame AT-SPI readback of
the retained target in the active owned frame showed **Saved handoff context —
no execution**, the actual `resume:false` text, explicit `/handoff_resume` gate,
source session/directory and handoff goal heading. This verifies visible actual
context while keeping the full seed pending. Client 42677 was subsequently closed
after executable/parent/proxy checks; the destination and seed remain retained.
The initial attempt and separately approved retry each have one private exclusive
submission marker. There was no third producer invocation.

An initial byte comparison against the then-current source exports failed because
the source's later checkpoint commentary had legitimately advanced its exported
history and export time. No target content was rewritten to force a match.
Instead, verification extracted all three original embedded documents, checked
their consistent source/status/revision/export time and mandatory Plan/Historical
sections, verified the original plan against the unchanged revision-58 plan apart
from later export time, and recomputed the seed/bundle fingerprint, transfer ID
and stable destination ID against the persisted transfer record. The exact
historical document and seed hashes are durable in
`docs/handoff-live-acceptance.json`. Current source files separately matched their
current snapshot hashes. Saved export time is not a claim about current live state.

Final changed-source checks: **139 combined tests passed**, including 86 companion
tests; strict real-SDK checking of all 21 source/test files passed with zero
diagnostics at `2026-10-27T09:20:54.355Z`. Actual health and staged/unstaged whitespace
checks passed. Original staging, HEAD, project config, deferred screenshot,
deployed continuation, approved CLI/backup and separate settings hashes were
independently verified. Both approval-pinned type-check evidence versions remain
archived byte-identically, and the current evidence records the visibility fix.

Producer export/create/seed/focus and actual saved-context visibility are now
verified, with the staged visibility correction explicitly recorded. Full
`/handoff_resume` behavior and destination model execution have not been invoked
or approved. No source goal was paused/rebound/reactivated, no screenshot or
restart was performed, and no commit/push/publication occurred. The overall goal
still includes deferred screenshot findings, restricted PR #2 and remaining
continuation/combined-audit gates; this producer acceptance does not complete it.

## Read-only follow-up after `/resume_goal`

`get_goal` confirmed the existing goal already active at plan revision 59. No
goal lifecycle, objective or plan mutation was performed for that resume request.

Fresh permitted GitHub metadata still shows the same two open PRs and base:
PR #2 head `96fa9e747809245958dcb8fd24b0e9b4300f0e1e`, PR #3 draft head
`11cbb763328f27ae97c03b8e57f832f0fe9fb78b`, base `b47765e4...`.
One allowed PR #2 changed-file read again returned **access to pull request is
restricted by lockdown mode**. No alternative fetch/client or security change
was used to bypass it; the unread PR remains unintegrated.

The PR #3 asset remains byte-identical to its accepted pin. A strict check caught
later changes to its README-maintenance skill files. Read-only diff review showed
additions for the user's human-first, under-170-line README, layout reference and
GIF guidance. Every original accepted line remains in order in both files; the
new reference links exist. These are preserved later changes, not a reason to
restore the old files or repeat carry-back. Current root README has 98 physical
lines; canonical skill bundles number 26. No README/skill content was edited in
this follow-up.

The focused static audit checked 38 local link targets across the companion,
handoff, planning and maintenance guides; all existed. All 21 source hashes still
match current strict-type evidence, and the original staged-patch hash matches.
Canonical/deployed `/handoff_resume` bytes remain identical at SHA-256
`12b407c7543019eb8a6d63026492d629c0051f8a31007378cecb7a7660c4cf9d`.
Its native definition selects **Build**, contains no shell expansion block and
does not provide an agent override through the installed session-command API.
Do not describe a future invocation as a technically enforced Plan-mode sandbox.

Official V2 command documentation and installed SDK show that the supported
session-command endpoint expands the real registered command, appends supplied
nonempty arguments when there is no argument placeholder, and runs its selected
agent. A possible next acceptance check therefore needs explicit model approval:
one `/handoff_resume` invocation in the retained destination, with a read-only
safety-check scope, exact source IDs, no implementation or goal/source mutation,
and a bounded timeout allowing only interruption of that destination with
`resume:false`. It would consume the pending seed into model context and incur
normal model usage. It has not been approved or invoked. This would be one
active-source/coverage safety case, not proof of all absent/unrelated/paused/closed
behavioral fixtures. All prior no-model and screenshot deferral boundaries remain.
