# Plan — `313b3d97-c8ff-480e-81aa-3ef2095727c0`

- Goal ID: `313b3d97-c8ff-480e-81aa-3ef2095727c0`
- Source session ID: `ses_e81c877d7ffe5NB5Y7DyeSEPGd`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-27T18:56:29.413Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `cancelled`
- Plan revision: `3`
- Record: `archive`

## Goal objective

> Implement the researched Codex\-parity computer\-use and browser\-use capability in /home/james/repos/computer\-use as a standalone, stock\-OpenCode v2 integration \(no OpenCode fork/repackaging, no reuse of Codex credentials, runtime, or proprietary browser engine\), following the fixed architecture and acceptance contracts already agreed: \(1\) shared bounded runtime contracts with session/agent attribution, permissions, cancellation and queues; \(2\) request\-owned in\-memory GNOME per\-window capture via the reviewed Shell bridge with complete PNG validation and bounded chunked transport; \(3\) session\-isolated typed Playwright browser backend with stable tab IDs, dedicated app\-data profiles, sandbox and TLS enforcement, no arbitrary model\-supplied JavaScript or raw CDP; \(4\) compositor\-native GNOME foreground input plus approved desktop\-ID app launch with release\-on\-failure and no ydotool fallback; \(5\) private user\-operated GTK sign\-in handoff that keeps website credentials out of tool arguments, results, transcripts and logs and returns only non\-secret status; \(6\) environment\-hygiene and credential\-broker review with no new password vault and no Codex credential reads; \(7\) plugin/skill integration supporting both native Code Mode and a direct\-tool rollback; \(8\) independent Luna xhigh security/outcome review with measured efficiency, then separately approved deployment and live acceptance\. Preserve all unrelated dirty and staged work, active worker ownership, and closed goal exports; keep commit, push, deployment/extension activation and session/security changes under separate approvals\.

## Persisted plan

Plan revision: `3` · updated 2026-10-27T18:51:02.000Z

> Staged standalone Codex\-parity integration in /home/james/repos/computer\-use: shared bounded runtime, GNOME capture/input, session\-isolated browser, private sign\-in handoff, hygiene review, plugin/skill integration, independent verification, then separately approved deployment\. Flash coordinates; Luna xhigh implements and independently reviews\.

### Completion criteria

- Standalone at runtime: the integration works on unmodified stock OpenCode v2 with no Codex packages, runtime, processes, credentials or proprietary browser engine required, and no OpenCode fork or repackaged binary\.
- Capture: request\-owned in\-memory per\-window GNOME capture passes complete\-PNG validation, bounds, chunk ordering, stale\-target refusal, late\-result rejection and buffer release, and never reads or deletes user screenshot files\.
- Browser isolation: two concurrent sessions keep separate workers, contexts, profiles and stable tab IDs; cross\-session redirection, stale references and profile\-lock conflicts fail closed; sandbox and TLS validation stay enabled and no arbitrary model\-supplied JavaScript or raw CDP surface exists\.
- Input safety: compositor\-native foreground input verifies exact target and mapping, serializes operations, releases held keys/buttons on failure, cancellation and disconnect, bounds timed input, and performs no ytdootool fallback or privileged\-dialog input\.
- Private sign\-in: user\-entered website credentials never appear in tool arguments, tool results, transcripts, worker logs or debug output; only non\-secret status returns; origin/iframe/form races, cancellation, helper death and uncertain submission fail safely without automatic replay\.
- Credential and environment hygiene: no new password vault, no Codex credential reads, no credential export, and child processes receive only an explicit minimal environment verified by tests\.
- Exposure and rollback: native Code Mode and a direct\-tool rollback configuration both work, nested image delivery to the model is proven in a live session, and insecure legacy routes cannot bypass authentication guards\.
- Independent review: a reviewer that did not implement the surface independently reproduces security and outcome evidence, and efficiency is measured in tokens, turns, latency and recovery cost rather than assumed from fewer calls\.
- Deployment and live acceptance: fresh GNOME session loads the reviewed bridge, stock OpenCode discovers the tools, representative GUI and browser workflows pass with real visible outcomes, and rollback is demonstrated, all under separate explicit approval\.
- Preservation: unrelated dirty, staged and untracked work, active worker ownership and closed goal exports remain unchanged, and no commit, push, publication or security\-setting change happens without separate approval\.

### Phase `p0` — completed

> Establish a safe baseline and reconcile with concurrent sessions before any change\.

**Verification:**

> Baseline preserved \(HEAD b47765e, 74 dirty tracked paths, staged handoff\_resume\.md, closed goal exports untouched\), OpenCode/Playwright/GNOME contracts pinned to verified 2\.1\.1 and installed versions, and the named session confirmed no path overlap plus idle status\. Its codemode:false preservation request is recorded as superseded by the user's explicit parity request, with direct\-tool rollback retained\.

- **`p0-baseline` · completed:**
  > Record HEAD b47765e, the 74 tracked dirty paths, the staged global/commands/handoff\_resume\.md entry, untracked directories, installed versions \(OpenCode 2\.1\.1, GNOME 50\.1, Playwright 1\.63\.0\-alpha\-2026\-08\-31\) and the closed\-goal export inventory as the preservation baseline\.
  - Evidence:
    > Recorded baseline: HEAD b47765e; 74 tracked dirty paths; staged global/commands/handoff\_resume\.md; 35 untracked entries including \.opencode/plugins/, docs/, tools/gnome\-window\-control/, tools/computer\-use\-runtime absent; goal export dirs under docs/goals/ \(7 ids plus README\) untouched\. Versions: OpenCode v2\.1\.1, Node v22\.22\.2, GNOME Shell 50\.1, playwright\-core 1\.63\.0\-alpha\-2026\-08\-31\.
- **`p0-coordinate` · completed:**
  > Notify ses\_e8275dbd2ffe5vkgrWh4gVCnVB of this goal's scope, shared\-file ownership and overlap boundaries, read its reply, and record any conflicting ownership before implementation starts\.
  - Evidence:
    > Sent ownership/overlap notice to ses\_e8275dbd2ffe5vkgrWh4gVCnVB and read its reply: \(a\) no overlapping ownership of any proposed path; \(b\) it is idle for implementation and has no edits underway in this worktree; \(c\) constraints to preserve \- keep its unmet goal and historical exports closed, preserve permission\-before\-backend checks, protected\-field refusal and fresh single\-use previews, keep source tests distinct from runtime/visual acceptance, and keep deployment/security/publication approvals separate; \(d\) caveat: an earlier export\-audit child was last observed running and owns only docs/goal\-docs\-verification\.md, outside this goal's scope\. Conflict recorded: it asks to preserve codemode:false\. The user's explicit Codex\-parity request supersedes that scope constraint \(the same session previously confirmed codemode:false was prior\-scope preservation, not a technical verdict\); this goal keeps a working direct\-tool rollback and re\-proves permission and cancellation behaviour inside Code Mode\.
- **`p0-contracts` · completed:**
  > Pin the exact @opencode/plugin/schema/client 2\.1\.1 declarations used by new code and confirm runtime 2\.1\.1 behaviour for tool permissions, cancellation and Code Mode media delivery before relying on them\.
  - Evidence:
    > Pinned @opencode/plugin 2\.1\.1 declarations: tools/opencode\-plugins/resource\-monitor/node\_modules/@opencode/plugin/dist/promise/tool\.d\.ts:9\-27 \(ToolContext\.signal, executable Info, editor\.get/update\), permission\.d\.ts:20\-28 \(assert\); adapter\.js:183\-186 maps execute through promiseExecutor and 457\-463 converts execute\.before rejection to Tool\.Error\. Runtime Code Mode media harvest verified in installed opencode v2\.1\.1 binary: nested file parts collected only when uri begins data:&lt;mime&gt;;base64, \(offset \~141055042\) and forwarded as file content\. Live model interpretation remains outstanding for p8\-efficiency\.

### Phase `p1` — in_progress

> Create the shared bounded runtime contract used by all desktop and browser surfaces\.

- **`p1-contracts` · pending:**
  > Proposed new modules under tools/computer\-use\-runtime/src/: identities, bounded protocol, limits, operation queue, cancellation and private\-auth exclusion state, with TypeScript declarations for every tool boundary\.
- **`p1-tests` · pending:**
  > Proposed new tests covering foreign and stale IDs, replay, overflow, disconnect, competing operations and refusal to clear authentication state on model assertion\.

### Phase `p2` — pending

> Replace screenshot\-directory inference with request\-owned in\-memory per\-window capture\.

- **`p2-capture` · pending:**
  > Proposed capture modules in tools/gnome\-window\-control/ using window actor textures and Shell\.Screenshot\.composite\_to\_stream, plus a persistent bridge client with Begin/Chunk/End, 6 MiB PNG, 8,388,608 pixel area and 48 KiB reply bounds\.
- **`p2-validation` · pending:**
  > Proposed complete PNG decode, checksum, dimension and expiry validation, one active capture per broker, and buffer release on abandon, with no filesystem screenshot reads\.

### Phase `p3` — pending

> Provide a session\-isolated typed browser backend without unsafe execution surfaces\.

- **`p3-worker` · pending:**
  > Proposed supervised per\-session Node worker using pinned Playwright, minimal environment before import, dedicated profile under the discovered OpenCode data directory, stable opaque tab IDs and typed navigation, form, canvas, upload, download and snapshot operations\.
- **`p3-isolation` · pending:**
  > Proposed concurrency bounds \(two workers, eight tabs\), stable\-reference validation, profile\-lock refusal, sandbox and TLS enforcement, and absence of model\-supplied JavaScript, raw CDP and unrestricted request\-body tools\.

### Phase `p4` — pending

> Add compositor\-native foreground input and approved application launch\.

- **`p4-input` · pending:**
  > Proposed input modules using Clutter\.VirtualInputDevice absolute motion, buttons, keyvals and scroll with exact\-target verification, mapping from real image dimensions and buffer rect, 2s timed\-action bound, serialization and release tracking\.
- **`p4-launch` · pending:**
  > Proposed launch path via Shell\.AppSystem desktop IDs with inventory, PID and appId readback verification; explicit transient\-window association; no ydotool fallback\.

### Phase `p5` — pending

> Implement the private user\-operated sign\-in handoff\.

- **`p5-dialog` · pending:**
  > Proposed GTK helper scripts/browser\-auth\-dialog\.py with helper\-local accessibility protection, extra inherited descriptor transport, status\-only replies, stdout/stderr exclusion and parent\-death handling\.
- **`p5-fill` · pending:**
  > Proposed worker\-private authentication path using pinned ElementHandles, ownerFrame/document/origin/form checks, approved\-origin routing with service workers blocked, suspended observation, non\-secret statuses and no automatic replay\.

### Phase `p6` — pending

> Verify credential and environment hygiene across launchers\.

- **`p6-review` · pending:**
  > Review existing GitHub, ChatGPT, Playwright and runtime launchers; add regression tests proving unrelated parent secrets are not inherited and that no Codex credential path, export, vault or token\-bearing configuration is introduced\.

### Phase `p7` — pending

> Integrate tools into the plugin with skills and a working rollback configuration\.

- **`p7-plugin` · pending:**
  > Coordinator\-owned registration, permissions, naming and configuration for Code Mode default plus direct\-tool rollback, with legacy insecure browser routes unable to bypass authentication guards\.
- **`p7-skills` · pending:**
  > Bounded documentation and skill updates covering observation discipline, confirmation policy, private sign\-in behaviour, tab lifecycle and honest limitations; reconcile docs/features\.md inventory\.

### Phase `p8` — pending

> Independently verify security, outcomes and efficiency\.

- **`p8-review` · pending:**
  > Independent Luna xhigh review of capture, input, isolation and private\-auth surfaces, reproducing adversarial cases rather than accepting implementer reports\.
- **`p8-efficiency` · pending:**
  > Measure tokens, model turns, latency and recovery cost for representative desktop and browser tasks under Code Mode and direct exposure, and confirm live nested image interpretation\.
- **`p8-audit` · pending:**
  > Run the repository bounded test\-quality audit at the integration boundary and record real findings without deleting distinct coverage\.

### Phase `p9` — pending

> Deploy and accept under separate explicit approval\.

- **`p9-deploy` · pending:**
  > Use the reviewed deployment mechanism only after approval; verify fresh GNOME login loads the reviewed bridge and stock OpenCode discovers the tools\.
- **`p9-live` · pending:**
  > Live acceptance of representative GUI and browser workflows with real visible outcomes, plus demonstrated rollback; record source results separately from live evidence\.

### Decisions

- Flash remains sequencing/integration owner; Luna xhigh implements high\-risk surfaces and a different Luna xhigh reviews them\.
- At most two implementation workers initially, with disjoint file ownership and no concurrent edit of shared registration or configuration\.
- GNOME compositor\-native input replaces ydotool expansion because ydotool absolute motion is relative approximation\.
- Browser parity uses a typed per\-session Playwright worker rather than the shared\-current\-tab MCP or the currently unattached desktop browser\.
- Private sign\-in uses a user\-operated GTK dialog with descriptor transport; OpenCode forms and MCP form elicitation never carry website secrets\.
- Capture stays in memory and never infers ownership from the user screenshot directory\.
- Deployment, commit, push, extension activation and security\-setting changes remain separately authorized\.

