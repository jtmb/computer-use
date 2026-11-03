# Plan — `483f6755-70a7-4912-aee3-816fbe0b7546`

- Goal ID: `483f6755-70a7-4912-aee3-816fbe0b7546`
- Source session ID: `ses_goal_docs_e51bdf9cf361797e5ad2593e5b530dc9`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-28T03:59:00.586Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `active`
- Plan revision: `5`
- Record: `current`

## Goal objective

> Complete the remaining Codex\-parity computer/browser\-use acceptance work in /home/james/repos/computer\-use and fix the handoff\-resume failure observed in this conversation\. Keep source goal ec2a347f\-8071\-4358\-bc93\-a223a846247d untouched at usageLimited\. First reconcile the source session's current state, worker ownership, and post\-export login evidence; then diagnose, implement, and test a reliable explicit /handoff\_resume continuation flow without auto\-resuming context\-only seeds; complete remaining live acceptance and efficiency evidence under existing separate approval gates; and obtain a final independent GPT\-6\.1 Sol review\. Preserve unrelated dirty work; do not deploy, alter session/security settings, commit, or push without separate explicit approval\.

## Persisted plan

Plan revision: `5` · updated 2026-10-28T03:55:19.000Z

> Coordinate authorized disjoint Luna xhigh background units for instruction cleanup, explicit resume, input diagnosis, acceptance safety, and efficiency; preserve existing handoff automation writer and original acceptance obligations\. Parent alone manages plan and verifies results\. No deployments or gated actions\.

### Completion criteria

- The source goal and its export remain unchanged; current source status, post\-export p9 evidence and the complete relevant worker set are reconciled\. No overlapping edits occur while source or relevant workers are active or unknown; unrelated dirty work is preserved\.
- The handoff failure is reproduced and fixed: a context\-only resume:false seed remains passive, while one explicit /handoff\_resume is sufficient to continue without another user reprompt\. Regression tests cover both paths and preserve separate approval gates\.
- Remaining p9 work is accurately reconciled and completed only under existing separate approvals: reviewed deployment/fresh\-session discovery, real visible desktop/browser outcomes, real\-seat compositor input/launch, human\-operated private sign\-in, and demonstrated rollback\. Any unavailable operator prerequisite or missing approval stays an explicit blocker\.
- Efficiency evidence covers tokens, turns, latency and recovery cost, including a Code Mode versus direct\-tools comparison; measurements are observed rather than modeled or inferred\.
- All relevant tests and documentation are independently verified, and the completed work receives a bounded read\-only review from the specified parent chat using GPT\-6\.1 Sol; findings are reconciled by this session without changing the source goal\.
- No commit, push, publication, deployment/activation, or security/session\-setting change occurs without its separate explicit approval\.

### Phase `p0` — completed

> Reconcile the live source\-session state, worker ownership, post\-export p9 evidence, and repository baseline before any overlapping edit\.

**Verification:**

> Live API source/worker identities, pending inputs, descendant closure, PTYs, source export hashes and post\-login evidence reconciled\. Preservation criterion cannot claim original usageLimited state: external source cancellation is explicitly recorded\.

- **`p0-identity` · completed:**
  > Verify source repository/worktree and goal package identity, status, revision, export time, and generated\-file integrity\.
  - Evidence:
    > pwd and realpath confirmed /home/james/repos/computer\-use; origin github\.com/jtmb/computer\-use, branch main, HEAD c71b8cc\. Initial ec2a347f usageLimited revision46 export2026\-10\-28T01:06:23\.819Z hashes matched; subsequent external cancellation is recorded separately, never reverted\.
- **`p0-live-state` · completed:**
  > Reconcile the source session's latest live status, all descendant workers, current pending inputs, and post\-export login evidence; preserve source ownership\.
  - Evidence:
    > Source now inactive after transfer, handoff independent root active and reserved; full prior closure21 descendants inactive, no PTYs\. Source export now cancelled/cleared rev46 export03:41:03\.197Z with matching regenerated hashes, externally changed\. Shell184812 ACTIVE, capture pass2466x1664, Calculator launch/capture820x1332 pass; input INPUT\_FAILED\. Updated docs/codex\-parity live record\.
- **`p0-baseline` · completed:**
  > Record the current dirty/staged/untracked worktree and identify exact path overlap before implementation\.
  - Evidence:
    > Broad pre\-existing staged rename, modified skills/config/scripts and untracked packages preserved; git diff \-\-check passes\. Active worker owns goal\-docs automation and docs/features\.md; four instruction\-cleanup files separately transferred\.

### Phase `instructions` — completed

> Remove the newly imposed dedicated reviewer workflow from instructions only while preserving handoff implementation and ordinary parent verification\.

**Verification:**

> Independent inspection and22 source/adjacent checks pass\. Four instruction files only changed by this child; existing handoff implementation/settings preserved as separate owner scope\. Runtime title correction remains a different active child unit\.

- **`instructions-cleanup` · completed:**
  > Narrowly update agent\-orchestration SKILL\.md/README\.md, skill catalog and orchestration\-methods\.test\.mjs for authorized background subagents plus unchanged successor handoff; preserve gates and goal\-parent\-only ownership\.
  - Evidence:
    > Child ses\_e7f5efd04ffeckj10pnlVBs1m0 released four scoped files\. Parent read all revised skill/guide/test plus catalog route: dedicated reviewer/worker\-chat prescription removed; authorized background subagents, parent ownership/verification, separate approvals and one\-root successor handoff remain\.
- **`instructions-verify` · completed:**
  > Parent inspect exact edits and run orchestration/autonomy guidance tests; verify handoff implementation unchanged by this unit\.
  - Evidence:
    > Parent independently ran orchestration\+autonomy tests15/15, adjacent shared\-skill\-portability7/7 \(links and metadata\), node \-\-check and git diff \-\-check\. Bounded source\-contract audit recorded in docs/test\-quality\-audit\.md; no runtime behavior inferred\.

### Phase `p1` — in_progress

> Diagnose and fix the explicit handoff\-resume flow without making context\-only seeds auto\-resume\.

- **`p1-diagnose` · in_progress:**
  > Analyze the current interaction and source command/skill flow to identify why the context\-only seed stayed passive and why the explicit /handoff\_resume did not proceed without another reprompt\.
- **`p1-fix` · pending:**
  > Implement the smallest bounded fix in the canonical handoff source so one explicit /handoff\_resume starts continuation while resume:false remains non\-executing; preserve unrelated edits\.
- **`p1-tests` · pending:**
  > Add or update regression tests for context\-only seeding, one\-shot explicit resume, source identity checks, and preservation of existing approval gates\.

### Phase `p2` — pending

> Finish the remaining p9 deployment and live acceptance only after reconciliation and separate approvals\.

- **`p2-deploy` · blocked:**
  > After separate deployment/extension\-activation approval, use the reviewed deployer and verify the fresh GNOME session and stock OpenCode tool discovery\.
  - Blocker:
    > No new deployment or activation approval\. Read\-only deployed bridge preview0/7 drift, current capture passes; handoff runtime command remains stale\.
- **`p2-input-fix` · pending:**
  > Diagnose real\-seat INPUT\_FAILED against installed Mutter contracts, add a bounded source fix and regression if confirmed; do not deploy or send live input\.
- **`p2-harness-safety` · pending:**
  > Harden the existing visible\-outcome acceptance helper's target selection and cleanup so unrelated windows/processes cannot be selected or killed; add isolated regressions without live GUI actions\.
- **`p2-live` · blocked:**
  > Reconcile post\-login state, then complete representative visible browser/desktop acceptance, real\-seat input and launch, human\-operated private sign\-in, and rollback verification\.
  - Blocker:
    > Current real Shell capture and launch pass, typing returns INPUT\_FAILED; successful visible\-change input, human sign\-in and live rollback remain absent\. Fix deployment and human interaction need separate prerequisites\.

### Phase `p3` — pending

> Measure actual efficiency and reconcile acceptance evidence after live workflows are available\.

- **`p3-efficiency` · pending:**
  > Measure token and turn use, latency, recovery cost, and Code Mode versus direct\-tools workflows using reproducible runs\.
- **`p3-docs` · pending:**
  > Reconcile acceptance documentation and the human\-readable feature inventory against independently verified outcomes and remaining blockers\.

### Phase `p4` — pending

> Obtain final independent review after implementation and acceptance work is complete\.

- **`p4-parent-review` · blocked:**
  > Request a bounded read\-only review from parent chat ses\_e81c877d7ffe5NB5Y7DyeSEPGd \(GPT\-6\.1 Sol\) after goal work; reconcile its findings without changing its limited source goal\.
  - Blocker:
    > Latest transferred user instruction explicitly ditches dedicated reviewer workflow and source stops after transfer\. Retain historical criterion but do not wake or recreate reviewer ceremony; ordinary parent verification applies\.

### Decisions

- User directly authorizes openai/gpt\-6\-luna\#xhigh background agents, up to10\. Supported general subagent available\. Runtime numeric admission limit not established; start conservative5 disjoint children, obey native admission, do not broaden permissions\.
- Exact child reservations: A four instruction files \(\.opencode/skills/agent\-orchestration/\{SKILL\.md,README\.md\}, \.opencode/skills/README\.md, scripts/orchestration\-methods\.test\.mjs\); B tools/gnome\-window\-control/input\.mjs,input\.test\.mjs and extension\.js input adapter only; C global/commands/handoff\_resume\.md and dedicated scripts/handoff\-resume\-contract\.test\.mjs only; D new tools/computer\-use\-browser/efficiency\-acceptance\.mjs and its test plus docs/codex\-parity/efficiency\.md only; E tools/gnome\-window\-control/desktop\-workflow\-acceptance\.py and dedicated safety test only\. Parent owns all goal updates and shared acceptance docs\.
- Existing independent handoff worker ses\_handoff\_b1ecb64b69f84bbaaacf3c5e0a0d08ac exclusively owns goal\-docs automation implementation/tests and docs/features\.md; none of our children may edit them or spawn descendants\.
- Transferred latest user requirement removes dedicated independent reviewer/worker prescription from instructions; keep handoff code/settings/naming unchanged\. Existing source changes remain intact\.
- Source historical goal was externally cancelled/cleared and re\-exported\. Do not restore, resume, rebind, merge or mutate it\. This continuation goal stays unchanged in objective; record preservation discrepancy honestly\.
- No commit, push, publication, deployment/activation, service restart, logout, credentials entry, account/security or permission changes authorized\. Context\-only resume:false stays passive; explicit continuation is not lifecycle approval\.
- Launched six general background children on verified openai/gpt\-6\-luna\#xhigh: instructions ses\_e7f5efd04ffeckj10pnlVBs1m0; input ses\_e7f5ebee8ffe9cjbtFDo9yQqlY; naming ses\_e7f5e510fffeo8T0KzkyO00gHI \(read\-only until exact naming ownership release\); explicit resume ses\_e7f5d962effeokB16SSCKuxYrD; efficiency ses\_e7f5d5e16ffe9h2DdlY4rJTIQd; helper safety ses\_e7f5d2fd4ffekliHo5NNltbYt8\. All write scopes reserved as recorded; naming is added user scope, no descendants allowed\. Parent accepts each result only after independent checks\.
- Latest direct title requirement supersedes hash\-in\-title design: concise human\-readable task label first, then ' · ' plus actual full session ID\. Session naming is not goal tracking; no goal hashes/IDs or instruction/file dumps in display title\. Preserve internal lineage metadata and unrelated handoff mechanics\. Naming child and active automation owner received exact stable\-ID steering corrections; naming edits await explicit scoped release\.
- Naming owner released exactly automation\.ts naming functions, automation\.test\.ts, automation\-wiring\.test\.ts, source\-handoff\.ts title instructions, goal\-docs/README\.md naming paragraphs to child ses\_e7f5e510fffeo8T0KzkyO00gHI; worker retains other automation/settings/TUI and docs/features\.md/scoped docs\. Child resumed with these exact constraints\. Parent manually renamed current session and all six owned child sessions to short task labels plus full actual session IDs using supported session\_rename; returned values verify titles\. Automatic formatter correction still awaiting child completion; no new hash title mechanism or code rollback\.
- Accepted instruction child independently and released its four paths; audit records source\-only limitations\. Other children remain owned and pending; do not equate reported completion or successful titles rename with runtime formatter acceptance\.

