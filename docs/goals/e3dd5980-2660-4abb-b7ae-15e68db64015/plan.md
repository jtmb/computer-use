# Plan — `e3dd5980-2660-4abb-b7ae-15e68db64015`

- Goal ID: `e3dd5980-2660-4abb-b7ae-15e68db64015`
- Source session ID: `ses_e78fdcc9affeNOlKMRek7Yobo3`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T17:01:12.635Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `complete`
- Plan revision: `3`
- Record: `archive`

## Goal objective

> Implement and locally verify the authorized keep\-working safeguards in the canonical prevalentWare/opencode\-goal\-plugin source, starting from published commit b5a6c6a0449a213c29ff34ea2d07c4ccbd351725: prevent unsupported premature \`unmet\` closure with a goal/plan\-revision\-bound stop audit and resumable waiting, remove implicit handback limits for unbudgeted goals while preserving explicit limits and permission boundaries, and add regression plus isolated V2 lifecycle coverage\. Do not deploy, activate in the live OpenCode runtime, publish, commit, or push; those remain separate approvals/follow\-up\.

## Persisted plan

Plan revision: `3` · updated 2026-10-29T16:41:26.000Z

> Implement and verify goal\-level stop\-audit and keep\-working safeguards in the pinned upstream source\. Preserve explicit limits, user cancellation, platform permissions and the live runtime boundary; local implementation does not imply deployment or publication\.

### Completion criteria

- The central lifecycle path rejects \`unmet\` closure unless a structured audit is current for the goal ID and plan revision, represents the full unfinished plan and specific external blocker, includes concrete sourced evidence and alternatives, and no reasonable in\-scope authorized work remains; marking every task blocked or supplying generic blocker prose is insufficient\.
- A genuine external dependency can be recorded as resumable waiting on the same goal without terminal \`unmet\`; explicit user pause/cancel and verified completion continue to behave correctly\.
- Unbudgeted goals have no hidden automatic turn/duration/low\-output handback ceiling; meaningful tool/evidence/task progress is recognized, stalls trigger bounded diagnosis/recovery with backoff rather than handback or tight loops, and explicit user/platform limits remain enforced\.
- Regression coverage reproduces premature\-stop\-while\-independent\-preparation\-remains, stale audits and concurrent plan changes, blocked phase vs independent work, all\-blocked claims, existing authorization, tool\-only progress, &gt;25 turns, transient failures, pause/cancel, Plan mode and explicit budgets/permissions\.
- Plugin lint, typecheck, unit/integration tests, build, package checks and an isolated V2 lifecycle smoke test pass; no live runtime activation, publish, commit or push is performed\.

### Phase `baseline` — completed

> Establish the pinned source baseline and map lifecycle, plan, continuation, package and test seams before editing\.

**Verification:**

> Pinned clean v0\.1\.67 checkout verified; lifecycle and serialized persistence seams mapped\. Relevant state/plan baseline passed 75 tests; full suite timeout will be distinguished and rerun later\.

- **`inspect-upstream-instructions` · completed:**
  > Read repository instructions, package scripts and contribution constraints; verify clean checkout at published commit b5a6c6a0449a213c29ff34ea2d07c4ccbd351725\.
  - Evidence:
    > Created /home/james/repos/opencode\-goal\-plugin and verified detached HEAD b5a6c6a0449a213c29ff34ea2d07c4ccbd351725; initial git status was clean\.
- **`map-lifecycle-and-continuation` · completed:**
  > Trace lifecycle transitions, goal\-plan validation, auto\-continuation limits and existing V2 smoke/test harness; identify mutation serialization and persistence boundaries\.
  - Evidence:
    > Traced closeGoal/markGoalUnmet and setGoalStatus in src/state\.ts; all writes use the serialized atomic mutate queue, while updateGoalPlan enforces goalID and expectedRevision\. Traced V1/V2 update\_goal schemas and continuation hooks in src/server\.ts, prompt policy in src/prompts\.ts, state/TUI/i18n schemas, and scripts/smoke\-v2\-lifecycle\.ts\.
- **`record-verification-baseline` · completed:**
  > Run relevant current package tests or document exact baseline failures before behavior changes\.
  - Evidence:
    > Baseline \`bun test test/state\.test\.ts test/goal\-plan\.test\.ts\`: 75 passed, 0 failed\. Full \`bun run test\` exceeded 120s while running test/server\-v2\.test\.ts; this is recorded as a timeout, not a test failure, and will be rerun with a longer limit\.

### Phase `audited-closure` — completed

> Implement the structured, revision\-bound stop audit and central \`unmet\` guard without weakening completion, pause or cancel semantics\.

**Verification:**

> Current audit scope is validated atomically at closure; stale/concurrent changes and remaining work are rejected, and external waits remain resumable on the same goal\.

- **`define-stop-audit-contract` · completed:**
  > Design audit fields and validation for goal/plan revision, unfinished plan coverage, blocked action and sourced evidence, existing authority, investigated alternatives, remaining independent work and dependency rationale\.
  - Evidence:
    > Implemented the strict goal\-ID/plan\-revision\-bound stop\-audit schema and coverage/evidence/authorization/alternatives/remaining\-work validation in src/stop\-audit\.ts\. test/stop\-audit\.test\.ts passes 8 tests, including all\-blocked\-plan and remaining\-work rejection\.
- **`guard-central-close-path` · completed:**
  > Enforce current audit and whole\-plan exhaustion atomically at the central lifecycle mutation so every tool/command/direct API path is covered; persist audit evidence and reject stale/concurrent bypasses\.
  - Evidence:
    > src/state\.ts validates status, audit classification, blocker equality, and current plan scope inside the serialized closeGoal mutation\. State/server tests cover stale revisions, concurrent plan mutation, missing audits, and terminal closure\.
- **`add-resumable-waiting` · completed:**
  > Represent genuine external dependency as a resumable nonterminal state on the same goal with clear blocker, distinct from terminal audited \`unmet\`\.
  - Evidence:
    > waiting persists the same goal as paused with stopReason external dependency, blocker, and closure audit; state tests verify persisted identity and successful resume without clearing the dependency context\.

### Phase `continuation` — completed

> Remove implicit handback for unbudgeted goals while preserving explicit constraints and safe bounded recovery\.

**Verification:**

> Hidden defaults were removed while explicit limits remain enforced; tool/plan progress is recognized and failure/stall retries back off\. Tests cover &gt;25 turns, low\-output tool progress, explicit failure limits, and retry spacing\.

- **`remove-hidden-limits` · completed:**
  > Eliminate default 25\-turn/duration and short\-output stopping for unbudgeted goals while honoring explicit user and platform limits\.
  - Evidence:
    > Unspecified auto\-turn, duration, prompt\-failure, and no\-progress limits now remain null; explicit limits remain enforced\. State tests verify 30 unbudgeted turns and continuing after five unbudgeted prompt failures\.
- **`recognize-meaningful-progress` · completed:**
  > Count tool activity, verified evidence and plan advancement as progress independent of response length; trigger diagnosis and changed strategy for stalls\.
  - Evidence:
    > Tool output and plan updates increment continuation progress independently of response length; tests verify tool and plan progress reset no\-progress accounting and unrelated assistant observations do not consume it\.
- **`bound-retry-recovery` · completed:**
  > Recover transient continuation/transport failures with exponential or otherwise bounded backoff, avoiding tight loops and preserving deliberate waiting when external input is required\.
  - Evidence:
    > Continuation retry/stall delays use increasing backoff capped at 60 seconds or the configured minimum interval, with explicit failure ceilings preserved\. Server tests verify increasing retry spacing, minimum interval, and configured failure limits\.

### Phase `regressions-and-docs` — completed

> Add failure\-reproducing tests and explain the new audit, waiting and continuation behavior in the plugin's user/developer documentation\.

**Verification:**

> Stop\-audit, lifecycle, continuation and V2 smoke regressions pass; README, prompts, and localized tool/status text reflect the new contract\.

- **`test-stop-audit-and-concurrency` · completed:**
  > Cover premature Tailscale\-style stop with independent preparation, all\-blocked laundering, stale plan revision, concurrent updates, restart persistence and genuine exhaustion details\.
  - Evidence:
    > Regression tests cover stale goal/revision, full plan coverage, pending work despite blocked items, all\-blocked plans with remaining independent work, sourced impossibility, authorization, same\-goal waiting/resume, and concurrent plan/close races\.
- **`test-continuation-and-compatibility` · completed:**
  > Cover tool\-only progress, over\-25 unbudgeted continuation, low\-output turns, backoff, explicit budgets, platform limits, Plan mode, pause/cancel, and permissions/authorization\.
  - Evidence:
    > The full suite covers &gt;25 unbudgeted turns, tool/plan progress, backoff and explicit limits, Plan mode, pause/cancel, V1/V2 schemas and lifecycle compatibility; final full run passed 396 tests across 11 files\.
- **`extend-v2-lifecycle-smoke` · completed:**
  > Demonstrate in isolated V2 lifecycle fixture: premature stop rejected, continuation scheduled, remaining work executed, and verified completion accepted\.
  - Evidence:
    > Isolated native V2 smoke passed on OpenCode v2\.1\.1: premature audited wait rejected, one uncapped automatic continuation delivered, remaining work executed, goal completed with evidence; the command\-array smoke also completed\.
- **`document-contract` · completed:**
  > Document audit schema/limits, resumable waiting, unbudgeted behavior, and runtime rollout boundary without claiming loaded\-runtime acceptance\.
  - Evidence:
    > README, continuation/system/compaction prompts, and English/Chinese tool/status messages document audited impossible closure, resumable waiting, truthful remaining work, and uncapped\-by\-default continuation\.

### Phase `full-verification` — completed

> Run the upstream quality gates and review the final combined diff for correctness, compatibility and scope\.

**Verification:**

> Lint, typecheck, full 396\-test suite, build, package dry\-run, isolated OpenCode v2\.1\.1 lifecycle smoke, and final diff checks all passed\.

- **`run-quality-gates` · completed:**
  > Run lint, typecheck, full tests, build and package checks using the repository's documented commands; fix relevant failures and rerun\.
  - Evidence:
    > Final bun run lint and bun run typecheck passed; bun run test passed 396 tests/0 failures; bun run build succeeded\.
- **`review-packaging-and-isolated-runtime` · completed:**
  > Verify exports/package contents and execute the isolated V2 lifecycle smoke test against the reviewed source build\.
  - Evidence:
    > bun run pack:dry\-run passed with the expected 7 package files; isolated V2 smoke passed against the reviewed local dist/server\.js build without live runtime state\.
- **`audit-final-diff` · completed:**
  > Review complete status/diff and confirm the live OpenCode runtime remains untouched and no commit/push/release occurred\.
  - Evidence:
    > Final git diff \-\-check passed; HEAD remains the pinned b5a6c6a0449a213c29ff34ea2d07c4ccbd351725 on detached HEAD, with only intended source/docs/tests/smoke/dist changes and no staged files\. No deployment, publication, commit, or push occurred\.

### Decisions

- Implementation target is the canonical prevalentWare/opencode\-goal\-plugin checkout at published commit b5a6c6a0449a213c29ff34ea2d07c4ccbd351725; do not patch installed npm cache or use a companion after\-hook\.
- This goal covers local source implementation and isolated verification only\. Runtime deployment/activation, commit, push, release, and publication are excluded and require separate explicit authorization\.
- Do not alter or reopen the earlier unmet Tailscale goal; this is a separate plugin implementation goal\.

