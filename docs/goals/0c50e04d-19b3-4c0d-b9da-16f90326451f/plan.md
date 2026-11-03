# Plan — `0c50e04d-19b3-4c0d-b9da-16f90326451f`

- Goal ID: `0c50e04d-19b3-4c0d-b9da-16f90326451f`
- Source session ID: `ses_e7ba9d353ffeK56PqN1qQssSF3`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-28T23:31:18.142Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `28`
- Record: `current`

## Goal objective

> Finish and verify the project\-scoped self\_learning capability in /home/james/repos/computer\-use: support bounded, evidence\-backed session analysis and reviewed skill creation/update proposals; validate the review/apply workflow on synthetic skills; activate and test only the project\-local plugin; reconcile the skill catalog and computer\-use tool audit while preserving unrelated work and configuration\. Keep generated real\-skill changes subject to specific review and approval; exclude global rollout, permission changes, shared\-service restarts, publication, commits and pushes\.

## Persisted plan

Plan revision: `28` · updated 2026-10-28T23:29:36.000Z

> Complete the missing evidence\-to\-reviewed\-skill workflow, verify it in isolation, then use the approved project\-local activation for real host testing and documentation reconciliation\. Execution remains paused in Plan mode\.

### Completion criteria

- The self\_learning tool is registered and successfully invoked in the real host for /home/james/repos/computer\-use using only an additive project\-local configuration change; unrelated plugins/settings are preserved and global configuration, permissions and shared\-service lifecycle are unchanged\.
- Analysis reads only authorized sessions from the invoking project within explicit byte, page, time and output limits; evidence references and incomplete coverage are reported honestly, and cross\-project, stale identity, cancellation and permission\-denial cases fail safely\.
- The capability supports evidence\-backed, generalized skill\-improvement proposals with existing\-skill overlap checks, explicit uncertainty and reviewable diffs; lexical frequency alone is never treated as a verified lesson or user authority\.
- Synthetic end\-to\-end tests demonstrate both an existing\-skill update and a new skill, including preview without writes, approval\-dependent application, stale/conflicting proposal refusal, validation, repeated\-run safety and tested recovery without altering real user skills\.
- The computer\-use tool audit, skill usage guide, catalog and feature inventory agree with observed source/runtime behavior; in\-scope checks pass and unrelated failures remain explicitly attributed rather than hidden\.
- Acceptance evidence maps each requested deliverable to actual checks, including host invocation and rollback/recovery; no unapproved real learned\-skill change, global rollout, publication, commit or push occurs\.

### Phase `rebaseline` — completed

> Confirm current source, approval scope, ownership and runtime contracts before implementation\.

**Verification:**

> Checked actual scoped Git state/index, historical reservations and current inbox, local SDK declarations, official v2 plugin/client/config contracts, existing adapter and 18 passing source tests\. Shared\-file ownership remains reserved for closure; no configuration or permissions changed\.

- **`baseline` · completed:**
  > Inspect current Git state/diffs and exact shared\-file ownership/activity; preserve inherited work and reconcile conflicts using current evidence rather than assuming an old registry or missing reply blocks edits\.
  - Evidence:
    > git status and staged\-name inspection confirm pre\-existing broad dirty/untracked state and a staged global/commands rename\. docs/parallel\-run\-coordination\.md reserves catalog to another parent; optional coordination tool is inactive, and native inbox returned empty, not a release\. Preserve shared docs pending reconciliation and work only in disjoint self\-learning source\. 18/18 source tests pass; features inventory 5/7, failing skill count and native\-row worker patch\.
- **`contract` · completed:**
  > Reverify installed SDK/client, project\-local activation/loading and rollback paths, no\-start discovery and all acquisition/cancellation boundaries; record smallest safe design and approval scope\.
  - Evidence:
    > OpenCode v2\.1\.1 and actual installed @opencode/client/plugin 2\.1\.1 declarations inspected\. Official plugins guide supports explicit \./tools/self\-learning directory entry in project opencode\.json; arrays merge, rollback removes only that entry, without restart\. Client declarations confirm paginated message\.list and no\-start Service\.discover; discover has no AbortSignal option\. Existing adapter's 10s signal is not an overall discovery deadline, and response stream/time handling and host binding still require work/verification\. User approved only project\-local activation and host test\.

### Phase `workflow` — completed

> Implement usable evidence\-backed proposal and controlled skill\-improvement behavior\.

**Verification:**

> 66 passing fixtures cover bounded client session pages and messages, proposal dispatch and synthetic approval workflow; same\-process checks and native identity remain necessary and live host, internal acquisition, semantic evidence and full bundle validation are not proven\.

- **`analysis` · completed:**
  > Harden bounded project analysis and evidence inspection, including lineage/deduplication, privacy, injection resistance, stale identities, conflicts and truthful coverage; keep semantic findings distinct from lexical leads\.
  - Evidence:
    > adapter\.mjs now routes project session pages through the same\-process verified client and 2 MiB response stream cap; index\.ts supplies sessionAccess to dispatch while retaining native per\-session identity checks\. 66/66 fixtures pass, including oversized list before JSON parsing, wrong host/caller, project\-list permission denial before discovery and composed update/create workflows\. Native session\.get identity and server\-internal acquisition remain outside this HTTP cap; host behavior remains unverified\.
- **`proposals` · completed:**
  > Implement an existing\-skill\-aware proposal workflow with generalized lessons, source references, confidence, validation requirements, reviewable diffs and explicit no\-change outcomes\.
  - Evidence:
    > proposal\.mjs and index\.ts now require a bounded newline\-terminated README for creation and include SKILL\.md and README\.md in one reviewable diff/proposal hash\. npm test passes 58/58 including changed\-guide hash refusal, exact synthetic multi\-file application, stale rerun and conflict\-safe reverse checks\. The preview explicitly leaves shared catalog changes and other bundle edits for separately reviewed diffs; semantic evidence and host behavior remain unverified\.
- **`apply` · completed:**
  > Implement or verify the permission\-preserving review/apply path with exact proposal/source freshness checks, scoped canonical targets, conflict refusal, validation and recoverable changes; require specific approval for real learned\-skill edits\.
  - Evidence:
    > The read\-only tool rechecks proposal hash, project caller, loader, references and canonical source under native read assertions; SKILL\.md specifies exact user approval, fresh source/Git checks, ordinary native edit permission, validation and conflict preservation\. npm test passes 60/60 including synthetic manual approval denial, multi\-file create/update, stale refusal and conflicting reverse\-diff recovery; skill\-contract tests verify wording only\. No automatic writer, real learned edit, live approval or host permission behavior is claimed; comprehensive synthetic and live checks remain in later phases\.

### Phase `isolated-verification` — completed

> Prove the source workflow before enabling it for the working project\.

**Verification:**

> Synthetic update/create now pass actual selected repository catalog/link checks with adversarial failures and recovery; 66 package fixtures pass, one SDK test skips without the package peer\. The actual 2\.1\.1 SDK synthetic transport passed separately in scratch previously\. These do not establish real host, permissions or full bundle acceptance\.

- **`synthetic` · completed:**
  > Exercise actual workflow components on synthetic session evidence and disposable canonical skill roots for both skill update and creation; verify preview, application, denial, staleness, reruns and recovery\.
  - Evidence:
    > end\-to\-end\.test\.mjs copies the actual scripts/shared\-skill\-portability\.test\.mjs into disposable roots and executes its two selected catalog\-category/tag and local\-Markdown\-link tests on synthetic update/create bundles before edits, after approved fixture edits and after recovery\. Negative cases verify the specific missing\-row and broken\-link failures\. npm test reports 66 passed, 1 skipped; approvals/permissions are simulated, and other portability rules, loader discovery and semantic quality remain unverified\.
- **`source-checks` · completed:**
  > Run actual SDK/type checks and behavior\-relevant safety tests, including full response acquisition/discovery bounds, malformed/oversized data, cancellation and denied cross\-project access\.
  - Evidence:
    > npm test reports 66 passed, zero failures, one explicitly skipped SDK fixture because the peer is absent in the source package\. The same sdk\-contract\.test\.mjs and adapter copied to /tmp/opencode with an existing OpenCode client 2\.1\.1 dependency passed 1/1, verifying actual SDK info/session envelope decoding, project query serialization, and oversized response refusal with synthetic HTTP transport\. This is not a live service or permission test; prior bounded entrypoint type check and source syntax checks remain as recorded\.

### Phase `project-activation` — blocked

> Use approved project\-local activation to establish real host behavior without broad rollout\.

**Blocker:**

> Shared project configuration is reserved to another coordinator without a verified release; registration and live invocation are therefore pending\. Disposable rollback is verified without touching the real file\.

- **`activate` · blocked:**
  > Preserve the exact current project configuration, add only the verified local self\-learning plugin entry, and verify registration without global changes, blanket permissions or shared\-service restart\.
  - Blocker:
    > docs/parallel\-run\-coordination\.md reserves shared configuration to another parent \(lines 140\-145\); no current exact\-path release or live coordination tool was observed\. Preserve opencode\.json until ownership is reconciled rather than assume old silence grants overlapping edits\.
- **`host-test` · blocked:**
  > Invoke the actual tool in its host, verify server/session binding and bounded same\-project analysis with minimal non\-quoting evidence, and record real runtime errors/results separately from fixture passes\.
  - Blocker:
    > Real host invocation depends on the project\-local registration, which cannot be applied until shared configuration ownership is reconciled\.
- **`rollback` · completed:**
  > Rehearse restoration of the exact additive project activation change in a disposable target, verify preservation/readback and document the operational rollback; retain only accepted project activation\.
  - Evidence:
    > A disposable copy of the actual current opencode\.json accepted exactly the \./tools/self\-learning array entry; JSON deep comparison preserved all other settings, removing that exact addition restored byte\-identical original content, and readback confirmed the real file unchanged\. tools/self\-learning/README\.md documents surgical rollback and warns against overwriting later changes\. No runtime unload is claimed\.

### Phase `closure` — pending

> Reconcile documentation and independently audit all scoped outcomes\.

- **`catalog` · blocked:**
  > Integrate the self\-learning skill and optional tool status into the actual catalog/features documentation after ownership reconciliation; retain computer\-use coverage findings and avoid redundant tool\-per\-skill wrappers\.
  - Blocker:
    > The same coordination record reserves \.opencode/skills/README\.md to another parent; docs/features\.md also has an identified owner\. No current release is verified; preserve those shared files\.
- **`acceptance` · blocked:**
  > Rerun scoped suites, inventory checks, health and whitespace checks; inspect the combined tree and prompt\-to\-artifact checklist, disclose unrelated failures and close the new goal only against concrete completion evidence\.
  - Blocker:
    > Final acceptance depends on actual project registration, real host invocation, shared\-document reconciliation, full bundle validation and final scoped checks; source and synthetic evidence do not substitute\.

### Decisions

- The user explicitly approved scoped plugin activation and host testing; this approval does not grant global rollout, shared\-service restart, permission changes or blanket approval of generated skill edits\.
- The previous unmet goal and its audit history remain unchanged\. Existing prototype/tests/audit are inputs to reverify, not proof of end\-to\-end functionality\.
- Only the project\-local source/configuration and supporting documentation are within rollout scope; portable skills must continue discovering consumer tools rather than hardcoding this checkout\.
- No token budget, duration limit or auto\-continue cap was requested; none is set\. No plan file was requested or written\.
- This goal is paused in Plan mode; switch to Build mode and explicitly resume it before execution\.
- Rebaseline: checkout has substantial pre\-existing tracked/untracked changes and a staged rename; preserve them\. 18 self\-learning fixture tests pass\. Feature inventory has two failures \(skill count and unrelated native\-row worker patch\); catalog ownership is reserved and live release remains unverified\.
- Analysis hardening in progress: adapter now bounds waiting for uncooperative discovery, client operations and response streams and attempts stream cancellation; actual discovery has no cancellation option so timed\-out work may remain outstanding\. Core checks cancellation between permission and reads and refuses changed location/lineage before messages\. npm test passes 22/22 including added stalled\-discovery/stream and identity/cancellation regressions\. Semantic evidence inspection, total analysis limits, runtime behavior and proposal workflow remain unfinished\.
- Follow\-up: repeated calls share a stalled discovery instead of accumulating unabortable discovery operations; pre\-aborted requests do not invoke transport\. npm test now passes 24/24\. tools/self\-learning/README\.md discloses that bounding the wait does not stop discovery itself\.
- Further source hardening: 30\-second overall scan signal bounds I/O waiting, while native permission waits are not raced and may remain pending; no subsequent reads start after timeout\. Caller identity is rechecked before message access and final output, identifiers are restricted, and JSON analysis output is capped at 32 KiB with omitted\-pattern count\. npm test passes 29/29 including deadline, caller\-move, unsafe\-ID and output\-cap regressions\. Race\-free session moves and actual host behavior remain unproven; semantic evidence inspection and proposal workflow still need implementation\.
- A real SDK type\-check attempt in /tmp/opencode/self\-learning\-types\-EhclzUsN was terminated during the server restart, without diagnostics; it is inconclusive and must not be reported as a pass\. Avoid an immediate unbounded repeat; SDK/host acceptance remains in isolated verification\.
- Proposal preview is now wired in source via tools/self\-learning/dispatch\.mjs and index\.ts; npm test passes 44/44 including git apply checks for synthetic create/update diffs in disposable directories, a 32 KiB result cap, mixed\-operation refusal and asserted confidence\. Catalog, source snapshots, evidence assessments and confidence are caller\-supplied and unverified; lexical overlap is incomplete\. Preview neither writes nor authorizes, and semantic review, source\-aware catalog acquisition, approval\-dependent application, SDK and host verification remain open\.
- Follow\-up npm test passes 45/45; regression tests reject non\-string evidence IDs and terminal control characters in preview text\. git diff \-\-check passes for tracked changes, but does not cover the untracked self\-learning tree; node \-\-check dispatch\.mjs also passes\. Proposal source remains in progress pending actual semantic evidence review and source\-aware catalog/freshness verification\.
- The host skill\.list API exposes unpaginated loaded skill bodies internally; catalog\.mjs caps entry count and returned output, not host acquisition, and discloses this\. Loader comparison is metadata only, not source freshness or semantic evidence\. No real evidence\-derived skill change has been approved or applied\.
- Apply task remains in progress: review\.mjs checks a reviewed proposal hash and caller\-supplied source snapshot without writing; npm test passes 52/52 including disposable create/update fixtures that simulate approval denial, application, stale reruns and git reverse\-diff recovery\. The approval switch exists only in test code, snapshot checks do not read actual files or grant native permissions, validation checks only a synthetic name line, and no plugin writer or real approval integration exists\.
- Apply work remains in progress\. source\-check\.mjs now uses permission\-checked Linux no\-follow directory handles and bounded reads of the canonical source, rejects create collisions, symlinks, hardlinks, stale/oversized files and changed caller identity; dispatch exposes a non\-writing recheck with proposal plus reviewedHash\. npm test passes 57/57 including composed loader/evidence/source recheck and a disposable synthetic review/apply/reverse exercise with conflict refusal\. No lock or actual user approval is implied; synthetic validation checks name, description and heading only, and real host/native permissions remain unverified\.

