# Plan — `39a08e43-11a6-4e4f-ae59-3c31af603b18`

- Goal ID: `39a08e43-11a6-4e4f-ae59-3c31af603b18`
- Source session ID: `ses_e7ba9d353ffeK56PqN1qQssSF3`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-28T22:16:19.747Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `10`
- Record: `archive`

## Goal objective

> Implement a safe, project\-scoped self\-learning capability that identifies evidence\-backed session patterns and supports reviewed skill improvements, and audit computer\-use skill/tool coverage with justified gap recommendations and verification\.

## Persisted plan

Plan revision: `10` · updated 2026-10-28T22:01:28.000Z

> Inspect existing integrations, implement a bounded self\-learning workflow, audit computer\-use capability coverage, and verify safety and behavior\.

### Completion criteria

- Project\-scoped session analysis supports evidence\-backed, reviewable skill improvement proposals with appropriate privacy and authorization safeguards\.
- Computer\-use skill/tool coverage is audited with evidence and justified recommendations instead of automatic one\-to\-one tool creation\.
- Relevant tests and documentation verify implemented behavior and clearly disclose runtime or authorization limitations\.

### Phase `discovery` — completed

> Establish existing architecture, session access, safety constraints and tool coverage\.

**Verification:**

> Cross\-checked tool schemas against skill workflows, inspected native session pagination and project identity, preserved dirty tree and recorded bounded audit without invoking GUI tools\.

- **`inspect` · completed:**
  > Inspect source, instructions, repository status, session interfaces and relevant existing capabilities\.
  - Evidence:
    > Inspected dirty worktree, ownership registry, plugin/memory patterns, native tool catalog, and OpenCode V2 API/server docs\. API session list supports project/directory filters and paginated messages; verified current session identity and a bounded list response\. Optional coordination package is not active; guidance request admitted to named coordinator\.
- **`audit` · completed:**
  > Audit computer\-use skills and executable tool coverage with evidence and identify justified gaps\.
  - Evidence:
    > Inspected computer\-use skill entries and current desktop/web/Playwright catalogs; documented coverage, limitations, justified gaps and stale screenshot description in docs/computer\-use\-tool\-coverage\-audit\.md\.

### Phase `implementation` — in_progress

> Implement the smallest safe self\-learning capability that fits observed architecture\.

- **`build` · blocked:**
  > Implement bounded project\-scoped analysis and reviewable skill proposals using supported interfaces and authority gates\.
  - Blocker:
    > Source integration tests now compose analysis, permissions and the bounded reader, but no actual plugin\-host binding or evidence\-backed reviewed skill diff has been demonstrated\. Plugin activation/deployment requires separate approval and remains ungranted\.
- **`docs` · blocked:**
  > Document workflow, capability coverage, limitations and approval boundaries\.
  - Blocker:
    > Added usage guide, fail\-closed prototype guide and computer\-use coverage audit; shared docs/features\.md and \.opencode/skills/README\.md are parent\-owned in the existing coordination registry\. Ownership guidance was requested from the named coordinator and is not yet observed\. Inventory test currently fails on missing new skill coverage and an unrelated native\-row patch\.

### Phase `verification` — pending

> Verify implementation and audit against completion criteria\.

- **`tests` · pending:**
  > Run relevant tests and integration checks, including privacy, scope and review boundaries\.
- **`final-audit` · pending:**
  > Review changes and evidence, report remaining blockers, and determine goal completion\.

### Decisions

- Keep new plugin source outside auto\-discovery until separate activation approval; tool should expose bounded, non\-quoting evidence and leave skill edits to explicit human review\.
- Do not use unbounded session\.context, a guessed HTTP listener, or implicit CLI service startup to evade the plugin SDK's missing paginated message surface\.
- The new self\-learning skill loaded successfully in this session; that does not imply the blocked source prototype is registered or that session analysis or skill application works\.
- Official @opencode/client Service\.discover\(\) is read\-only and does not start a server\. Investigate a loopback\-only bounded client adapter that checks /api/info PID against the hosting plugin process and compares session identity; fail closed when binding cannot be established\.
- Implemented no\-start, loopback\-only service adapter with host\-PID/version and exact\-session identity checks, bounded streamed responses and cancellation\. Fourteen offline tests pass; official client read one current\-session page in a non\-host harness, and a wrong\-PID harness was refused\. Real plugin\-host binding and proposal workflow remain unverified\.
- The official client returned a project\-filtered session page with all three entries matching the invoking project; an isolated fake registry accepted the actual SDK plugin entry\. Repository health\-check passed with 30 skills, but does not test the optional plugin\. No deployment or actual skill proposal was performed\.
- Added three integration fixtures verifying non\-quoting analysis, denial before discovery and refusal of wrong\-process/session identities; npm test passes 18 cases\. Added tools/self\-learning/ACCEPTANCE\.md mapping each requested deliverable to real source evidence and remaining gates\.

