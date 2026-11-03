# Plan — `f7183041-ea4a-48d8-a691-c15d92076ea1`

- Goal ID: `f7183041-ea4a-48d8-a691-c15d92076ea1`
- Source session ID: `ses_e78fdcc9affeNOlKMRek7Yobo3`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T19:33:16.022Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `complete`
- Plan revision: `13`
- Record: `archive`

## Goal objective

> Finish and locally verify the plugin\-only goal enhancement and mutually exclusive engine settings in /home/james/repos/opencode\-goal\-plugin: persistent settings/controller selecting enhanced, built\-in or off; safe configuration\-based switching with preservation of goals and explicit resumption; native idle/background integration where supported with exactly one continuation strategy; separate revision\-bound completion reviewer; unsupported\-host handling and conflict detection; documentation and full regression/package/isolated\-runtime verification\. Preserve the existing dirty implementation, explicit limits, permission and Plan boundaries\. Hard constraint: do not modify, rebuild, replace, upgrade, wrap or redirect the OpenCode binary/executable, launcher or symlinks; no deployment, live activation, publication, commit or push\.

## Persisted plan

Plan revision: `13` · updated 2026-10-29T19:01:41.000Z

> Finish exclusive settings and native/reviewer integration, add user\-requested persistent YOLO continuation and visible controls, then verify all behavior without changing executables\.

### Completion criteria

- A persistent user\-facing engine selector remains available in enhanced, built\-in and off modes; only one engine drives goals and unsupported hosts fail clearly\.
- Switching preserves goals, blocks unsafe/in\-flight changes and requires explicit goal resumption; effective configuration conflicts are detected\.
- Enhanced mode uses one native or compatibility continuation strategy, honors background ownership, and gates completion on a current evidence review\.
- All existing safety boundaries and tests remain intact; full lint/typecheck/test/build/package checks and available isolated runtime acceptance pass\.
- OpenCode executable/binary, launchers and symlinks remain unchanged; no deployment, live activation, publication, commit or push\.

### Phase `selection` — completed

> Finish persistent controller and user\-facing settings\.

**Verification:**

> Controller/config and TUI regressions passed 42 tests; runtime applied\-switch acceptance remains in verification scope\.

- **`controller` · completed:**
  > Inspect existing changes and host APIs; implement persistent configuration selection and safe\-switch preconditions with tests\.
  - Evidence:
    > Implemented JSONC settings controller with explicit location path, revision checks, lock, backup, quiescence checks, server RPC and conflict handling\.
- **`settings` · completed:**
  > Expose engine choice in persistent settings UI without unloading the controller or modifying executable files\.
  - Evidence:
    > Persistent TUI settings command stays available in off/builtin modes\. Targeted engine/TUI tests passed 42 tests\.

### Phase `execution` — completed

> Import native execution and independent review capabilities into ours\.

**Verification:**

> Native strategy and completion reviewer targeted suites passed; compatibility driver is inactive in native mode\. Full runtime/provider acceptance remains scheduled under verification\.

- **`native` · completed:**
  > Implement capability\-gated native idle/background integration with one scheduling strategy and old\-host fallback\.
  - Evidence:
    > Added auto/native/compatibility strategy selection gated by host version and synthetic API\. Native experimental\.idle sends synthetic continuations while compatibility drivers/watchdog are disabled; checks Plan/status/goal identity before delivery\. Defers own subagent/image work, ignores descendant\-owned jobs and avoids waiting forever on dev\-server shells\. Five targeted native regressions passed\.
- **`reviewer` · completed:**
  > Implement evidence\-based completion reviewer bound to current goal/plan and cancellation with regression tests\.
  - Evidence:
    > Added separate transcript\-based completion review with full objective/plan/evidence, strict verdict parsing, cancellation, and atomic goal\-ID/objective/plan/status/history validation before closure\. Reviewer reasons persist in goal history\. V2 auto/required/off modes and unsupported\-host rejection added\. Eight targeted review/state/V2 regressions passed; lint and typecheck passed\.

### Phase `yolo` — completed

> Add persistent, visible YOLO mode that keeps authorized goal work moving without hidden turn limits\.

**Verification:**

> Persisted preferences, /yolo controls, rendered labeled warning badge, runtime stop\-control authorization, independent completion/blocker review, heuristic\-ceiling override, and native/compatibility 60\-turn/recovery tests pass locally\. Prompt preserves authorized prior\-unmet scope with provenance without reopening closed goals\. Live compatible native host remains unavailable and must be disclosed during final acceptance\.

- **`yolo-state` · completed:**
  > Persist YOLO setting/state across restarts and normalize unset or zero turn limits as unlimited; retain pause/cancel, permission, Plan and explicit budget boundaries\.
  - Evidence:
    > Added persisted yoloMode to goals and public snapshots, explicit mode mutation that never resumes or reopens goals, and zero\-allowed turn\-limit schemas on V1/V2 tools\. Regression executes 60 unbudgeted turns with YOLO enabled and maxAutoTurns=0 while retaining explicit budgets/limits and pause/cancel behavior\. State/review suites: 82 pass; lint and typecheck passed\.
- **`yolo-controls` · completed:**
  > Implement settings toggle and /yolo controls with explicit resume semantics and a prominent yellow YOLO marker in goal UI/context\.
  - Evidence:
    > Added persistent server\-side YOLO preference RPC, direct /yolo toggle/on/off/status command, settings palette dialog, inheritance by new goals, and theme\-warning YOLO goal label that distinguishes active versus paused\. Six targeted command/prompt/render regressions passed including 36/80\-column light/dark\-color fixtures\. Typecheck/lint/diff checks passed\.
- **`yolo-recovery` · completed:**
  > Test repeated recoverable failures, stalls and more than 50 uncapped turns in native/compatibility paths; guide ownership and explicit incorporation of prior unmet scope without silently reopening closed goals\.
  - Evidence:
    > Four targeted server regressions pass: native admission failure plus repeated execution transport/internal failures recover despite heuristic ceiling=1; native recovery honors user interruption and credit exhaustion without terminal closure; native and compatibility paths each execute 60 uncapped continuations with no cross\-driver calls\. Native regular idle and recovery share an in\-flight guard\. Typecheck and lint pass\.

### Phase `verify` — completed

> Verify final behavior and documentation\.

**Verification:**

> Requirement\-to\-artifact checklist and test\-quality review are in docs/features\.md; final combined tests and all local gates pass\. Native/built\-in settings success is host\-mocked; installed v2\.1\.1 is below the known stable 2\.2\.1 API baseline, so no live compatible\-host acceptance or real\-model compliance is claimed\. Supported\-host limitations/refusal paths are documented/tested; no executable upgrade was attempted\. Dirty/untracked implementation remains intact on detached HEAD\.

- **`docs-tests` · completed:**
  > Document selection/switching/version limits and add cross\-engine, restart and reviewer/native lifecycle coverage\.
  - Evidence:
    > README now documents exclusive selection, supported\-host/version limits, controller path/reload/resume/rollback rules, native strategy, reviewer modes and persistent YOLO semantics/limits\. Added docs/features\.md requirement\-to\-artifact and acceptance\-limit inventory\. Added settings RPC paging/active\-goal/built\-in/unsupported\-host tests, parent\-symlink and invalid\-backup rejection, status\-toast and theme\-span assertions\. Isolated v2\.1\.1 smoke passed with 2 continuations, rejected premature wait, executed work, 2 independent completion reviews and /yolo inheritance\. Native\-recovery mutation fails in disposable copy while production targeted test passes\.
- **`gates` · completed:**
  > Run full quality/package/runtime gates, audit combined diff and verify executable identity unchanged\.
  - Evidence:
    > Final combined Bun suite: 456 pass, 0 fail, 1877 assertions/14 files\. ESLint, tsc \-\-noEmit, build, npm pack dry\-run, documentation paths and git diff \-\-check pass\. Extracted local tarball smoke on unchanged v2\.1\.1: 17 model calls, 2 auto\-continuations, 3 independent reviews, premature wait rejected, work executed, /yolo inherited and preference persisted through actual private\-server restart\. Packed runtime/manifest bytes match final tree\. Executable SHA\-256 still cd03022601e4848a957999a2a7b1c1ccf18b94f9a084a44719f62abaacebe83c\. No deploy/live\-user activation/commit/push/publication\.

### Decisions

- YOLO is persistence/recovery behavior, not blanket tool permission or a claim all external blockers can be solved\. Zero/unset turn limits are unlimited; explicit user/platform limits, pause/cancel, Plan mode and permission denials remain authoritative\.
- The user's prior\-unmet example is an acceptance scenario, not permission to reopen or mutate an unrelated archived goal\. Explicitly requested prior scope may be copied into a new/current authorized plan with provenance\.
- YOLO UI must fit existing TUI design: compact labeled badge with theme\-aware yellow/amber semantic colors, restrained spacing and existing components; distinguish configured engine, YOLO preference and actual goal lifecycle state\. Verify light/dark and narrow layouts, keyboard navigation and non\-color\-only status\. No raw hard\-coded yellow or executable changes\.
- Screenshot acceptance case: an agent says objective is not impossible but marks unmet at a deployment/refresh authorization gate\. YOLO must prevent such terminal closure, reuse existing exact authority, continue independent authorized work, and represent genuinely missing authority as resumable waiting\. Build auto does not itself authorize deployment, logout, security changes or bypassing native permission denials\.
- YOLO durability must be enforced server\-side: a final assistant reply is not a stop condition; agent\-authored pause/cancel/clear/disable\-YOLO cannot evade continuation without actual user intent\. Completion requires independent current evidence review; waiting/impossibility requires audited whole\-scope exhaustion and genuine external dependency\. Recoverable errors use diagnosis/backoff rather than terminal handback\. Tests must cover worker attempts to choose its own stop state and reuse of exact existing authority\.
- YOLO suppresses heuristic no\-progress and prompt\-failure pause ceilings, retaining their counters for diagnosis/backoff\. Explicit token/duration/positive turn budgets and native permission/user controls remain enforced\. Targeted regression with ceilings set to one remains active through four stalls and four transient failures\.
- Runtime stop\-authorization guards now reject YOLO worker pause/stop/clear/replace/objective\-edit attempts without a goal\-bound explicit user control, disallow terminal worker unmet, require independent completion review, and require revision\-bound independent blocker review before resumable waiting\. Six targeted YOLO state/V2 tests passed, including invented approval gate rejection; lint/typecheck/diff checks clean\. Native retry/credit\-handling and final integration acceptance remain unfinished\.
- Final verification found and fixed additional liveness/safety edges: transient YOLO command\-lifetime wait errors retry without pausing; native duplicate idle cannot reserve over an unresolved pending attempt; /yolo feedback is user\-visible via typed RPC event/toast; reserved command\-name collisions preserve /yolo\. Settings reject symlinked parents and mismatching rollback content\. Built\-in/native baseline is conservatively stable 2\.2\.1\+, with no executable upgrade\.

