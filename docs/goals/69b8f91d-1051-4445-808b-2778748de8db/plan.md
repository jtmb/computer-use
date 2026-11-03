# Plan — `69b8f91d-1051-4445-808b-2778748de8db`

- Goal ID: `69b8f91d-1051-4445-808b-2778748de8db`
- Source session ID: `ses_e85293a02ffe7Hlk5CfyoIgStT`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-27T04:50:24.954Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `complete`
- Plan revision: `6`
- Record: `archive`

## Goal objective

> Plan and, after the user switches to Build mode, implement proper discoverable OpenCode tool definitions for this repository's desktop screenshot and AT\-SPI computer\-use capabilities, preserving safety boundaries and verifying tool discovery and behavior\.

## Persisted plan

Plan revision: `6` · updated 2026-10-27T01:21:04.000Z

> Expose repository\-native computer\-use as typed OpenCode v2 tools, rather than relying solely on skill prose and shell commands; scope the initial implementation to the native GNOME host, preserving screenshot privacy and AT\-SPI preview/apply behavior\.

### Completion criteria

- A fresh OpenCode session in the intended scope discovers correctly named and schema\-defined desktop screenshot and accessibility tools, without duplicate or conflicting registration\.
- A real screenshot tool invocation returns a model\-viewable image and removes only its own transient capture; privacy preconditions and ambiguous\-file failures are enforced\.
- AT\-SPI read\-only calls work and state\-changing calls preserve the existing complete\-search, target\-token, preview/apply, protected\-field, and verification gates\.
- Configuration, skills, docs, and health checks match the actual implemented surface; focused tests and a fresh\-session smoke test pass without modifying unrelated work\.

### Phase `contract` — completed

> Confirm the exact OpenCode tool contract, runtime scope, and existing computer\-use safety boundaries\.

**Verification:**

> Verified official V2 plugin/tool, MCP, config, and attachment contracts plus local runtime versions \(opencode v2\.1\.1, Node 22\.22\.2\) and direct execution evidence\.

- **`inventory` · completed:**
  > Read canonical desktop utility, screenshot workflows, active config/runtime, and any existing plugin packaging or tests; distinguish GNOME native from WSL capabilities\.
  - Evidence:
    > Read desktop\-control\.py fully, both desktop skill guides, project/global config, AGENTS\.md, plugin docs, MCP docs, and attachment docs\. Confirmed native GNOME Wayland with active ydotool and socket, AT\-SPI apps/tree working, and only github/playwright MCPs registered\.
- **`api_choice` · completed:**
  > Verify V2 plugin tool registration, image/file result format, Code Mode discovery, and permission mechanisms against official docs and runtime; select smallest native plugin or local MCP design and decide project vs global scope without duplicates\.
  - Evidence:
    > V2 docs verify repo\-local \.opencode/tools TypeScript definitions auto\-load, tool\(\) schemas, and file attachments with image/png data URLs; global deployed tools/vision\.ts and tools/desktop\.ts provide a working precedent\. Chose repo\-local \.opencode/tools adapters calling the canonical Python script, avoiding duplicate registration and keeping Python as the sole AT\-SPI safety implementation\.

### Phase `implementation` — completed

> Implement typed screenshot and AT\-SPI tool definitions with bounded adapters and update canonical configuration/docs\.

**Verification:**

> node \-\-test 15/15 pass, health\-check\.sh PASSED, bash \-n and py\_compile clean, git diff \-\-check clean, plugin reload logs show no errors\.

- **`registration` · completed:**
  > Add a canonical repo\-local tool provider with explicit JSON schemas, stable names, bounded inputs, cancellation/timeouts, and no arbitrary shell or unrestricted screenshot paths\.
  - Evidence:
    > Added \.opencode/plugins/computer\-use/\{index,desktop,screenshot,logic\.test\}\.ts; plugin registers namespace desktop with desktop\_screenshot/apps/tree/find/act, JSON schemas with additionalProperties:false, bounds, AbortSignal cancellation, timeouts, and output caps\. Probe of ctx\.tool\.list\(\) returned all five ids\.
- **`screenshot` · completed:**
  > Implement single\-capture GNOME path with pre/post inventory, safe PNG validation, image return, exact cleanup, and fail\-closed privacy behavior; do not claim WSL support unless its trusted backend exists\.
  - Evidence:
    > captureOnce does pre/post inventory, refuses ambiguity without deleting, reads then always unlinks that exact name, validates 6 MiB cap plus PNG signature/IHDR dims, and returns a data URL\. Live run captured 2466x1664 484 KiB, screenshot count 27\-&gt;27, no leftover\.
- **`accessibility` · completed:**
  > Wrap existing desktop\-control\.py functionality in typed read\-only and preview/apply tools, retaining token freshness and sensitive\-field restrictions\.
  - Evidence:
    > desktop\.ts validates verb/field combinations, rejects mutation fields on read verbs, caps text/depth/nodes/wait, and delegates to desktop\-control\.py\. Live checks: tree/find read output, preview returned dry\_run with target\_token, apply without token rejected, stale token rejected\.
- **`integration` · completed:**
  > Register the provider in canonical V2 config for the chosen scope; reconcile desktop skills, catalog, setup guide and health check to describe actual tool availability and dependencies\.
  - Evidence:
    > Plugin auto\-loads from \.opencode/plugins \(no config change needed\); updated AGENTS\.md, README\.md, setup\.md, skills/README\.md, and both desktop skill SKILL\.md/README pairs; health\-check\.sh now asserts plugin files and runs the node tests\.

### Phase `verification` — completed

> Prove tool discovery, safe execution, cleanup, and no regressions in a fresh Build\-mode session\.

**Verification:**

> Fresh repo\-location sessions called desktop\_apps, desktop\_screenshot, and desktop\_act natively with real output; screenshot returned a model\-visible image \(model reported 2466x1664\) and left the screenshot directory unchanged at 27 files; test run 15/15, health\-check PASSED, git diff \-\-check clean; probe sessions deleted\.

- **`automated` · completed:**
  > Run focused tests for tool schemas, input rejection, screenshot ambiguity/cleanup, token expiry and apply behavior, and existing script checks plus git diff \-\-check\.
  - Evidence:
    > node \-\-test \.opencode/plugins/computer\-use/logic\.test\.ts: 15 pass / 0 fail\. health\-check\.sh PASSED including plugin files and the new test step\. bash \-n scripts/\*\.sh and python3 \-m py\_compile scripts/\*\.py clean\. git diff \-\-check clean\.
- **`live` · completed:**
  > Verify live tool inventory in a fresh OpenCode session, one safe screenshot returning an image with exact cleanup, AT\-SPI app/tree/find reads, and a harmless preview; verify GUI mutation only if an appropriate safe target is available\.
  - Evidence:
    > Tool registration proven via ctx\.tool\.list\(\) probe \(all five desktop\_\* ids\) with the plugin loading error\-free\. Live capture and AT\-SPI read/preview/apply\-gate behaviour verified with real desktop\. Native tool exposure in a brand\-new model turn was not directly observable from inside this session; this needs the user's fresh session to confirm\.
- **`audit` · completed:**
  > Inspect final diff/status and report verified coverage, limitations, and any activation/restart steps; do not commit or push without separate approval\.
  - Evidence:
    > git status shows 9 modified tracked files plus the new \.opencode/plugins/ directory; git diff \-\-check clean; no probe or temp artifacts remain; nothing committed or pushed\. Reported verified coverage and the one unverified item \(fresh\-session native exposure\)\.

### Decisions

- Plan\-mode restriction: no implementation or plan file writes now; goal remains paused until Build mode and explicit resume\.
- Prefer a V2 plugin tool transform if image results and per\-session permissions are verified; a local MCP is an alternative only if plugin tool output cannot provide the required image contract\.
- Default initial platform scope is native GNOME where the previous test proved ydotool and AT\-SPI availability; WSL Windows bridge support needs separate verified host source\.
- Project registration first to avoid unexpectedly enabling desktop control in unrelated projects; confirm global use before extending global configuration\.
- Keep plugin tool options at codemode:false \(documented direct exposure\) and leave completion criterion 1 for the user's fresh\-session confirmation rather than switching to codemode:true purely for in\-session verifiability\.
- Native exposure \(codemode:false\) confirmed end\-to\-end via opencode run in the repo location; no switch to Code Mode needed\.

