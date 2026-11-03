# Plan — `55f4842e-6b49-4507-bc5f-7d045dc92798`

- Goal ID: `55f4842e-6b49-4507-bc5f-7d045dc92798`
- Source session ID: `ses_e81c877d7ffe5NB5Y7DyeSEPGd`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-27T19:25:24.843Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `cancelled`
- Plan revision: `4`
- Record: `archive`

## Goal objective

> Implement the researched Codex\-parity computer\-use and browser\-use capability in /home/james/repos/computer\-use as a standalone, stock\-OpenCode v2 integration \(no OpenCode fork/repackaging, no reuse of Codex credentials, runtime, or proprietary browser engine\), following the fixed architecture and acceptance contracts already agreed: \(1\) shared bounded runtime contracts with session/agent attribution, permissions, cancellation and queues; \(2\) request\-owned in\-memory GNOME per\-window capture via the reviewed Shell bridge with complete PNG validation and bounded chunked transport; \(3\) session\-isolated typed Playwright browser backend with stable tab IDs, dedicated app\-data profiles, sandbox and TLS enforcement, no arbitrary model\-supplied JavaScript or raw CDP; \(4\) compositor\-native GNOME foreground input plus approved desktop\-ID app launch with release\-on\-failure and no ydotool fallback; \(5\) private user\-operated GTK sign\-in handoff that keeps website credentials out of tool arguments, results, transcripts and logs and returns only non\-secret status; \(6\) environment\-hygiene and credential\-broker review with no new password vault and no Codex credential reads; \(7\) plugin/skill integration supporting both native Code Mode and a direct\-tool rollback; \(8\) independent Luna xhigh security/outcome review with measured efficiency, then separately approved deployment and live acceptance\. Preserve all unrelated dirty and staged work, active worker ownership, and closed goal exports; keep commit, push, deployment/extension activation and session/security changes under separate approvals\.

## Persisted plan

Plan revision: `4` · updated 2026-10-27T19:21:30.000Z

> Staged standalone Codex\-parity integration in /home/james/repos/computer\-use: shared bounded runtime, GNOME capture/input, session\-isolated browser, private sign\-in handoff, hygiene review, plugin/skill integration, independent verification, then separately approved deployment\. Flash coordinates; Luna xhigh implements and independently reviews\.

### Completion criteria

- Standalone at runtime: works on unmodified stock OpenCode v2 with no Codex packages, runtime, processes, credentials or proprietary browser engine, and no OpenCode fork or repackaged binary\.
- Capture: request\-owned in\-memory per\-window GNOME capture passes complete\-PNG validation, bounds, chunk ordering, stale\-target refusal, late\-result rejection and buffer release, and never reads or deletes user screenshot files\.
- Browser isolation: two concurrent sessions keep separate workers, contexts, profiles and stable tab IDs; cross\-session redirection, stale references and profile\-lock conflicts fail closed; sandbox and TLS validation stay enabled and no arbitrary model\-supplied JavaScript or raw CDP surface exists\.
- Input safety: compositor\-native foreground input verifies exact target and mapping, serializes operations, releases held keys/buttons on failure, cancellation and disconnect, bounds timed input, and performs no ydotool fallback or privileged\-dialog input\.
- Private sign\-in: user\-entered website credentials never appear in tool arguments, tool results, transcripts, worker logs or debug output; only non\-secret status returns; origin/iframe/form races, cancellation, helper death and uncertain submission fail safely without automatic replay\.
- Credential and environment hygiene: no new password vault, no Codex credential reads, no credential export, and child processes receive only an explicit minimal environment verified by tests\.
- Exposure and rollback: native Code Mode and a direct\-tool rollback configuration both work, nested image delivery to the model is proven in a live session, and insecure legacy routes cannot bypass authentication guards\.
- Independent review: a reviewer that did not implement the surface independently reproduces security and outcome evidence, and efficiency is measured in tokens, turns, latency and recovery cost rather than assumed from fewer calls\.
- Deployment and live acceptance: fresh GNOME session loads the reviewed bridge, stock OpenCode discovers the tools, representative GUI and browser workflows pass with real visible outcomes, and rollback is demonstrated, all under separate explicit approval\.
- Preservation: unrelated dirty, staged and untracked work, active worker ownership and closed goal exports remain unchanged, and no commit, push, publication or security\-setting change happens without separate approval\.

### Phase `p0` — completed

> Establish a safe baseline and reconcile with concurrent sessions before any change\.

**Verification:**

> Baseline preserved and contracts pinned; named session confirmed no path overlap and idle status\.

- **`p0-baseline` · completed:**
  > Record HEAD, dirty/staged/untracked baseline, installed versions and closed\-goal export inventory\.
  - Evidence:
    > HEAD b47765e; 74 tracked dirty paths; staged global/commands/handoff\_resume\.md; 35 untracked entries; docs/goals contains 7 closed export ids plus README, untouched\. Versions: OpenCode v2\.1\.1, Node v22\.22\.2, GNOME Shell 50\.1, playwright\-core 1\.63\.0\-alpha\-2026\-08\-31\.
- **`p0-coordinate` · completed:**
  > Notify ses\_e8275dbd2ffe5vkgrWh4gVCnVB of scope and overlap boundaries and record its reply\.
  - Evidence:
    > Reply received: no overlapping ownership, idle for implementation, constraints = keep closed goal/exports untouched, preserve permission\-before\-backend and preview freshness, keep source tests distinct from runtime acceptance, separate deployment/security approvals; caveat = an earlier export\-audit child last seen running owns only docs/goal\-docs\-verification\.md, outside scope\.
- **`p0-contracts` · completed:**
  > Pin @opencode 2\.1\.1 tool/permission contracts and runtime Code Mode media behaviour\.
  - Evidence:
    > @opencode/plugin 2\.1\.1 tool\.d\.ts:9\-27 and permission\.d\.ts:20\-28 read; adapter\.js:183\-186 and 457\-463 confirm executor mapping and execute\.before rejection; installed opencode 2\.1\.1 harvests nested data\-URI file parts \(offset \~141055042\)\. Live model image interpretation deferred to p8\.

### Phase `p1` — completed

> Create the shared bounded runtime contract used by all desktop and browser surfaces\.

**Verification:**

> Contract layer exists, typechecks and passes 29 tests when reproduced by the coordinator; package inventoried in docs/features\.md with README\. It is unwired, which is expected at this stage\.

- **`p1-contracts` · completed:**
  > Proposed new modules under tools/computer\-use\-runtime/src/: identities, bounded protocol, limits, operation queue, cancellation and private\-auth exclusion state, with TypeScript declarations for every tool boundary\.
  - Evidence:
    > Independent verification: files created under tools/computer\-use\-runtime/\{src,test\} plus package\.json, package\-lock\.json, tsconfig\.json and README\.md; \`npm \-\-prefix tools/computer\-use\-runtime run check\` reproduced 29/29 tests pass and clean tsc \-\-noEmit\. index\.ts exports only the named contract surface\. auth\-guard\.ts:63\-164 splits guard \(read\-only, handleUntrustedModelCommand always false\) from signInPath/userActions/operatorActions\. Coordinator reconciled docs/features\.md inventory plus README, keeping scripts suite at 82/82\.
- **`p1-tests` · completed:**
  > Proposed new tests covering foreign and stale IDs, replay, overflow, disconnect, competing operations and refusal to clear authentication state on model assertion\.
  - Evidence:
    > 29 node:test cases across identities, protocol, queue, auth\-guard and limits/context/error suites; independently rerun by coordinator\. Covered foreign/blank/oversized ids, frame overflow, trailing bytes, deep nesting, queue serialization/cancellation/overflow/throwing op, and model\-cannot\-clear auth state\.

### Phase `p2` — completed

> Replace screenshot\-directory inference with request\-owned in\-memory per\-window capture\.

**Verification:**

> Capture source path, client verb, extension endpoint and deployer/manifest integration all pass their suites under coordinator reproduction \(14 capture, 10 bridge, 48 extension, 5 deploy\)\. Explicitly not verified: live compositor behaviour, fractional\-scaling pixel mapping, D\-Bus reply sizes, and any real window capture\.

- **`p2-capture` · completed:**
  > Proposed capture modules in tools/gnome\-window\-control/ using window actor textures and Shell\.Screenshot\.composite\_to\_stream, plus a persistent bridge client with Begin/Chunk/End, 6 MiB PNG, 8,388,608 pixel area and 48 KiB reply bounds\.
  - Evidence:
    > tools/gnome\-window\-control/capture\.mjs \(single\-active, pre\-transfer bounds, sender\-bound single\-consumer handles, ordered chunks, expiry, digest\) \+ capture\.test\.mjs 14/14 incl\. new async\-compositor case; coordinator made captureTexture thenable\-tolerant because Shell's encoder is asynchronous\. scripts/desktop\-windows\.py gained a capture verb assembling chunks in one connection; scripts/test\_desktop\_windows\.py 10/10\. Coordinator wired extension\.js Begin/Chunk/End/Abort with sender binding and lazy dynamic import; mocked extension suite 48/48\. Deployer now manages five files with a source override and legacy\-marker upgrade; deploy tests 5/5\. Live compositor behaviour still unverified\.
- **`p2-validation` · completed:**
  > Proposed complete PNG decode, checksum, dimension and expiry validation, one active capture per broker, and buffer release on abandon, with no filesystem screenshot reads\.
  - Evidence:
    > Complete PNG structure and SHA\-256 verified in the client; pixel and byte limits enforced before transfer; one active capture per broker; abandoned handles expire and release buffers; no screenshot file is written or read\. Negative cases covered in capture\.test\.mjs and test\_desktop\_windows\.py \(truncated, oversized, digest mismatch, missing/duplicate/late chunk, expiry\)\.

### Phase `p3` — completed

> Provide a session\-isolated typed browser backend without unsafe execution surfaces\.

**Verification:**

> Session\-isolated browser backend typechecks and passes 18 fake\-boundary tests reproduced by the coordinator; capacity, profile, tab and ref isolation enforced; unsafe execution surfaces absent\. No real browser launch, no GUI acceptance, and known gaps \(downloads, upload allowlist, auth\-guard wiring\) carried into p5/p8\.

- **`p3-worker` · completed:**
  > Proposed supervised per\-session Node worker using pinned Playwright, minimal environment before import, dedicated profile under the discovered OpenCode data directory, stable opaque tab IDs and typed navigation, form, canvas, upload, download and snapshot operations\.
  - Evidence:
    > tools/computer\-use\-browser/ created: manager with MAX\_BROWSER\_WORKERS capacity refusal, per\-session profile resolution/validation with lock refusal, opaque tab ids with ownership classes, snapshot\-generation\-bound refs \(STALE\_REF\), six\-variable child env allowlist, sandboxed bundled Chromium, typed crash errors\. 18 tests pass; coordinator reproduced typecheck and 18/18\. No evaluate/runCode/CDP surface present in src\.
- **`p3-isolation` · completed:**
  > Proposed concurrency bounds \(two workers, eight tabs\), stable\-reference validation, profile\-lock refusal, sandbox and TLS enforcement, and absence of model\-supplied JavaScript, raw CDP and unrestricted request\-body tools\.
  - Evidence:
    > Isolation proven at source level: foreign tab ids rejected, third session refused without eviction, profile lock refused naming the path, child env contains none of DEBUG/PWDEBUG/NODE\_OPTIONS, screenshot and snapshot budgets enforced\. Deliberate omissions reported and documented in the package README: no download retrieval, no upload path allowlist, auth guard not yet wired \(p5 owns it\)\.

### Phase `p4` — in_progress

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
- GNOME compositor\-native input replaces ydotool expansion because ydotool absolute motion is a relative approximation\.
- Browser parity uses a typed per\-session Playwright worker rather than the shared\-current\-tab MCP or the currently unattached desktop browser\.
- Private sign\-in uses a user\-operated GTK dialog with descriptor transport; OpenCode forms and MCP form elicitation never carry website secrets\.
- Capture stays in memory and never infers ownership from the user screenshot directory\.
- Deployment, commit, push, extension activation and security\-setting changes remain separately authorized\.
- The named session's codemode:false preservation request is superseded by the user's explicit parity request; direct\-tool rollback is retained\.
- Goal re\-created at 40M tokens by explicit user choice after the prior 4M goal hit budgetLimited; phase p0 evidence carried forward\.
- External dependency recorded: session ses\_e82032444ffeP7hG18Zqr3hsp3 is blocked on phase p5 \(private user\-operated credential entry over a descriptor\) before it can finish its Tailscale deployment objective\. It gets exactly one readiness message with resume=true, only after p5 ships and is verified usable here \- never for a design, placeholder, unit tests alone or an unbuilt phase\. I create no goal on their side\.
- Accepted their verified corrections: Tailscale 1\.104\.2 documents \-\-auth\-key=file: support, and their secret\_setup\.py derives the repo root from \_\_file\_\_ rather than cwd, so cwd is not the established launch cause\. Their remaining blocker narrows to producing the key file without agent handling of the value, which is exactly the p5 capability\.

