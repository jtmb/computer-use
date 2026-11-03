# Plan — `a0c27e5c-32aa-4018-8ecc-551b4b26b7cb`

- Goal ID: `a0c27e5c-32aa-4018-8ecc-551b4b26b7cb`
- Source session ID: `ses_e78fdcc9affeNOlKMRek7Yobo3`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T18:03:09.591Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `complete`
- Plan revision: `5`
- Record: `archive`

## Goal objective

> Implement and locally verify the critical\-review fixes in /home/james/repos/opencode\-goal\-plugin on top of the preserved uncommitted implementation: reliable repeated fast continuation and stall wake\-ups in V1/V2; structured exhaustion/alternative validation; long\-objective audit support; resumable permission\-denial waits; conservative preservation of legacy explicit limits; separation of transport liveness from meaningful progress; leaner stop\-tool schemas; and expanded multi\-continuation plus wait/restart/resume coverage and accurate documentation of verification limits\. Preserve explicit limits, permissions, Plan mode, pause/cancel and completed work\. Do not deploy, activate live runtime, publish, commit or push\.

## Persisted plan

Plan revision: `5` · updated 2026-10-29T17:12:55.000Z

> Fix the reviewed correctness and compatibility gaps, then verify behavior without touching the live runtime or publishing\.

### Completion criteria

- Fast and stalled continuations retain wake\-ups in both server paths, including zero configured interval\.
- Stop audits reject available authorized alternatives, support long objectives and resumable permission denials, and state their evidence limitations accurately\.
- Legacy explicit limits are preserved; repeated activity is distinguished from meaningful progress without hidden default handback caps\.
- Stop schema duplication is reduced and lifecycle coverage includes multiple automatic continuations plus waiting/restart/resume\.
- Lint, typecheck, full tests, build, package checks and isolated V2 smoke pass; no deployment, publication, commit or push\.

### Phase `scheduler` — completed

> Fix lost continuation wake\-ups\.

**Verification:**

> bun test test/server\.test\.ts test/server\-v2\.test\.ts \-\-test\-name\-pattern 'fast executions': 3 pass, 0 fail\.

- **`schedule` · completed:**
  > Inspect preserved diff, fix effective\-interval wake\-ups in V1/V2 and add fast\-turn regressions\.
  - Evidence:
    > V1 now retains timed wake\-ups after deferred reservation; V2 no longer gates wake\-up on the raw positive interval\. Three fast\-execution regressions passed, exercising repeated continuations with zero and positive intervals\.

### Phase `audit` — completed

> Repair stop audit contract and compatibility\.

**Verification:**

> Read\-only review reproductions now have regression coverage for long objective, available alternative and permission waiting; targeted audit/state/V2 checks pass\.

- **`contract` · completed:**
  > Add structured alternative outcomes, long scope support, permission waits and compact schema with regressions\.
  - Evidence:
    > New stop attempts require structured alternative disposition and reject available alternatives; legacy audit fields remain parseable\. Scope supports long objectives; actual permission denial can wait\. V2 schema shares audit definition once instead of three copies\. Audit/state tests: 81 pass; targeted V2 tests: 7 pass; typecheck passed\. Schema size assertion added for final gates\.

### Phase `progress` — completed

> Preserve limits and distinguish useful progress\.

**Verification:**

> New regressions cover identical polling with changing narration, decision\-only churn and legacy custom limits; existing tool/plan progress tests pass after requiring a verified task result\.

- **`migration-progress` · completed:**
  > Implement conservative legacy migration and repeated\-activity accounting with regressions\.
  - Evidence:
    > Legacy persisted limits default to preserved provenance rather than erasure\. Successful repeated output still clears transport failures but bounded SHA\-256 fingerprints prevent it counting repeatedly as objective progress; assistant wording alone and decision\-only plan churn no longer reset stalls\. Audit/state tests: 84 pass; typecheck and lint passed\.

### Phase `verification` — completed

> Verify integration and documentation\.

**Verification:**

> All quality gates passed against the reviewed combined source including untracked audit/fixture/test files; deterministic runtime evidence is explicitly distinguished from real\-model compliance\. First smoke invocation failed only because nested bun was absent from PATH; rerun with the existing Bun directory in PATH passed\.

- **`smoke-docs` · completed:**
  > Expand multi\-continuation and wait/restart/resume tests and document limits of deterministic verification\.
  - Evidence:
    > Native V2 smoke now requires two automatic continuations\. A fresh subprocess test reloads the paused audited goal, refuses continuation while paused, and explicitly resumes the same persisted ID with audit/blocker preserved\. README and prompts document alternative dispositions, bounded progress fingerprints, legacy\-limit preservation and the limits of scripted/model\-independent validation\.
- **`gates` · completed:**
  > Run complete quality gates, audit combined diff and record exact outcomes and scope boundaries\.
  - Evidence:
    > Final bun test: 405 pass, 0 fail across 11 files; tsc \-\-noEmit and eslint passed; build and pack:dry\-run passed\. Isolated OpenCode v2\.1\.1 smoke passed with continuationCalls=2, prematureStopRejected=true, remainingWorkExecuted=true and status complete\. Final git diff \-\-check clean; pinned detached HEAD unchanged; no staged files, deployment, publish, commit or push\.

