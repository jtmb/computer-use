# Plan — `f68d5222-5998-4fde-b039-7d7f4e337cbb`

- Goal ID: `f68d5222-5998-4fde-b039-7d7f4e337cbb`
- Source session ID: `ses_e7bc63eaeffeOdexMk6GFp6VE7`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T02:20:56.038Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `1`
- Record: `archive`

## Goal objective

> Implement the agreed CPU/RAM monitor and ChatGPT connector repair plan and verify both integrations in this OpenCode chat, preserving existing settings and unrelated work\. Retain the no\-subprocess, no\-sign\-in, no\-credential\-access during verification, and no\-real\-ChatGPT\-message constraints unless explicitly amended\. Establish a permitted verification path, fix bounded process\-tree sampling and selective permission cancellation/SDK compatibility/image\-output safety, run current checks, and perform live activation only with separate exact authority\.

## Persisted plan

Plan revision: `1` · updated 2026-10-28T23:15:26.000Z

> Execute the approved repair plan without silently relaxing constraints: establish permitted baseline/verification access, repair monitor and connector, verify current source, preview exact activation and rollback, then accept both in this chat only after separate activation authority\.

### Completion criteria

- Monitor is loaded in this chat and produces valid CPU/RAM samples with bounded per\-thread descendant discovery and documented live\-sampling limitations\.
- Connector is available in this chat and passes a verified non\-message probe without credential access, sign\-in or real ChatGPT requests\.
- Selective permission cancellation clears server and TUI pending state, prevents late dispatch and preserves unrelated permissions; target SDK compatibility is verified\.
- Image\-output rename safety is verified with an executed regression before direct image registration is enabled\.
- Current behavior tests and typechecks pass using a permitted route; existing settings and unrelated work are preserved and no unauthorized subprocess, restart, activation, commit or push occurs\.

### Phase `access` — blocked

> Establish an authorized baseline and supported verification path before edits\.

**Blocker:**

> The approved plan retained the no\-subprocess rule\. Current tools cannot satisfy the required pre\-edit Git baseline and current\-source verification under that rule\.

- **`baseline-access` · blocked:**
  > Inspect scoped Git status/diffs and source ownership without violating the no\-subprocess restriction\.
  - Blocker:
    > Repository instructions require Git baseline before edits\. The shell starts a process; the current exposed catalog has no native local Git\-status/diff tool\. No subprocess exception was explicitly granted\.
- **`verification-access` · blocked:**
  > Establish a supported current\-source test/typecheck runner and TUI observation under the restriction\.
  - Evidence:
    > Enumerated the current Code Mode catalog through every page and inspected execution/test/local\-filesystem candidates\. No supported local TypeScript runner or local Git interface is exposed; Playwright arbitrary\-code execution is browser\-oriented and was previously found capable of launching a browser\.
  - Blocker:
    > Requires an explicitly approved bounded subprocess exception or an externally provisioned supported in\-process capability; do not install or activate a substitute without authority\.

### Phase `repair` — pending

> Repair the remaining monitor and connector behavior with regression coverage\.

- **`monitor-repair` · pending:**
  > Bound discovery across process threads; cover non\-leader children, exits, malformed/oversized proc data and PID reuse; document best\-effort sampling\.
- **`connector-repair` · pending:**
  > Verify target SDK compatibility and implement selective cancellation with server/TUI prompt cleanup, no backend dispatch after cancellation and no rejection of unrelated permissions\.
- **`image-repair` · pending:**
  > Resolve output\-directory rename authorization safety and execute the currently skipped regression before enabling direct images\.

### Phase `checks` — pending

> Verify actual updated source, not earlier test results\.

- **`source-checks` · pending:**
  > Run current monitor and connector behavior tests/typechecks and relevant repository checks through the approved route; audit test coverage and distinguish fixtures from live evidence\.
- **`source-docs` · pending:**
  > Update package guides and docs/features\.md to match verified behavior and outstanding runtime limits\.

### Phase `activation` — pending

> Identify this TUI's exact config and prepare separately authorized additive activation\.

- **`activation-preview` · pending:**
  > Confirm effective configuration and runtime identity; preserve existing goal/goal\-docs/voice settings; preview exact additive changes and selective rollback, including reload/subprocess effects\.
- **`activation-apply` · pending:**
  > Apply only after separate exact activation authority and a path compatible with subprocess/restart restrictions; never disable unrelated voice work as a workaround\.

### Phase `acceptance` — pending

> Demonstrate both integrations in this chat and audit all constraints\.

- **`live-monitor` · pending:**
  > Observe numeric CPU/RAM samples and footer/panel behavior in this chat without unauthorized process launch\.
- **`live-connector` · pending:**
  > Verify connector tool availability and a proven pre\-credential non\-message probe without ChatGPT backend dispatch\.
- **`final-audit` · pending:**
  > Map every criterion to current source checks or actual runtime evidence; report remaining failures without claiming completion\.

### Decisions

- User approved implementation and goal tracking in Build\. This does not explicitly amend the prior no\-subprocess rule or separately approve exact live activation\.
- Prior closed goal 1db89531\-6b9a\-4205\-a310\-e18320834cfe revision 11 preserves earlier work and findings; do not repeat or overwrite it\.
- No new repository or runtime source edits until the required Git baseline is available through a permitted path\. No credentials, sign\-in, real ChatGPT messages, shared restart, commit or push\.

