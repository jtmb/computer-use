# Plan — `ec2a347f-8071-4358-bc93-a223a846247d`

- Goal ID: `ec2a347f-8071-4358-bc93-a223a846247d`
- Source session ID: `ses_e81c877d7ffe5NB5Y7DyeSEPGd`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-28T03:41:03.197Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `cancelled`
- Plan revision: `46`
- Record: `archive`

## Goal objective

> Implement the researched Codex\-parity computer\-use and browser\-use capability in /home/james/repos/computer\-use as a standalone, stock\-OpenCode v2 integration \(no OpenCode fork/repackaging, no reuse of Codex credentials, runtime, or proprietary browser engine\), following the fixed architecture and acceptance contracts already agreed: \(1\) shared bounded runtime contracts with session/agent attribution, permissions, cancellation and queues; \(2\) request\-owned in\-memory GNOME per\-window capture via the reviewed Shell bridge with complete PNG validation and bounded chunked transport; \(3\) session\-isolated typed Playwright browser backend with stable tab IDs, dedicated app\-data profiles, sandbox and TLS enforcement, no arbitrary model\-supplied JavaScript or raw CDP; \(4\) compositor\-native GNOME foreground input plus approved desktop\-ID app launch with release\-on\-failure and no ydotool fallback; \(5\) private user\-operated GTK sign\-in handoff that keeps website credentials out of tool arguments, results, transcripts and logs and returns only non\-secret status; \(6\) environment\-hygiene and credential\-broker review with no new password vault and no Codex credential reads; \(7\) plugin/skill integration supporting both native Code Mode and a direct\-tool rollback; \(8\) independent Luna xhigh security/outcome review with measured efficiency, then separately approved deployment and live acceptance\. Preserve all unrelated dirty and staged work, active worker ownership, and closed goal exports; keep commit, push, deployment/extension activation and session/security changes under separate approvals\.

## Persisted plan

Plan revision: `46` · updated 2026-10-28T01:06:15.000Z

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
    > HEAD b47765e; 74 tracked dirty paths; staged global/commands/handoff\_resume\.md; 35 untracked entries; closed goal exports untouched\. OpenCode v2\.1\.1, Node v22\.22\.2, GNOME Shell 50\.1, playwright\-core 1\.63\.0\-alpha\-2026\-08\-31\.
- **`p0-coordinate` · completed:**
  > Notify ses\_e8275dbd2ffe5vkgrWh4gVCnVB of scope and overlap boundaries and record its reply\.
  - Evidence:
    > No overlapping ownership; idle for implementation; constraints recorded \(closed exports untouched, permission\-before\-backend, source tests distinct from runtime acceptance, separate approvals\); caveat: its earlier export\-audit child owns only docs/goal\-docs\-verification\.md\.
- **`p0-contracts` · completed:**
  > Pin @opencode 2\.1\.1 tool/permission contracts and runtime Code Mode media behaviour\.
  - Evidence:
    > @opencode/plugin 2\.1\.1 tool\.d\.ts:9\-27 and permission\.d\.ts:20\-28; adapter\.js:183\-186 and 457\-463; installed opencode 2\.1\.1 harvests nested data\-URI file parts\.

### Phase `p1` — completed

> Create the shared bounded runtime contract used by all desktop and browser surfaces\.

**Verification:**

> Contract layer typechecks and passes 29 tests when reproduced by the coordinator; still unwired at that stage\.

- **`p1-contracts` · completed:**
  > Proposed new modules under tools/computer\-use\-runtime/src/: identities, bounded protocol, limits, operation queue, cancellation and private\-auth exclusion state\.
  - Evidence:
    > tools/computer\-use\-runtime/\{src,test\} plus package, lock, tsconfig, README; npm run check reproduced 29/29 and clean tsc\. auth\-guard\.ts:63\-164 splits a read\-only guard from signInPath/userActions/operatorActions; handleUntrustedModelCommand always false\. docs/features\.md reconciled\.
- **`p1-tests` · completed:**
  > Proposed tests covering foreign and stale IDs, replay, overflow, disconnect, competing operations and refusal to clear auth state\.
  - Evidence:
    > 29 node:test cases across identities, protocol, queue, auth\-guard, limits/context/errors, independently rerun by the coordinator\.

### Phase `p2` — completed

> Replace screenshot\-directory inference with request\-owned in\-memory per\-window capture\.

**Verification:**

> All capture suites pass under coordinator reproduction\. Explicitly unverified: live compositor behaviour, fractional\-scaling pixel mapping, D\-Bus reply sizes, any real window capture\.

- **`p2-capture` · completed:**
  > Capture modules in tools/gnome\-window\-control/ using window actor textures and Shell\.Screenshot\.composite\_to\_stream, plus a bounded Begin/Chunk/End client\.
  - Evidence:
    > capture\.mjs \+ 14 capture tests \(incl\. coordinator\-added async\-compositor case after making the texture path thenable\-tolerant\); desktop\-windows\.py capture verb; 10 bridge tests\. Coordinator wired extension\.js Begin/Chunk/End/Abort with sender binding and lazy dynamic import; mocked extension suite 48/48\. Deployer now manages five files with a source override and safe legacy\-marker upgrade; 5/5 deploy tests\.
- **`p2-validation` · completed:**
  > Complete PNG decode, checksum, dimension and expiry validation, one active capture per broker, buffer release on abandon, no filesystem screenshot reads\.
  - Evidence:
    > SHA\-256 and complete PNG structure verified client\-side; pixel/byte bounds before transfer; single active capture; expiry releases buffers; truncated, oversized, digest\-mismatch, missing/duplicate/late chunk cases covered\.

### Phase `p3` — completed

> Provide a session\-isolated typed browser backend without unsafe execution surfaces\.

**Verification:**

> Backend typechecks and passes 18 fake\-boundary tests reproduced by the coordinator; no real browser launch or GUI acceptance; gaps carried to p5/p8\.

- **`p3-worker` · completed:**
  > Supervised per\-session Node worker using pinned Playwright, minimal environment before import, dedicated profile, stable opaque tab IDs and typed operations\.
  - Evidence:
    > tools/computer\-use\-browser/ with manager capacity refusal, profile validation and lock refusal, opaque tab ids with ownership classes, snapshot\-generation refs \(STALE\_REF\), six\-variable child env allowlist, sandboxed bundled Chromium\. 18/18 tests and clean typecheck reproduced\.
- **`p3-isolation` · completed:**
  > Concurrency bounds, stable\-reference validation, profile\-lock refusal, sandbox and TLS enforcement, absence of unsafe surfaces\.
  - Evidence:
    > Foreign tab ids rejected, third session refused without eviction, profile lock refused naming the path, child env excludes DEBUG/PWDEBUG/NODE\_OPTIONS, screenshot and snapshot budgets enforced, no evaluate/runCode/CDP in src\. Omissions documented: no download retrieval, no upload allowlist, auth guard not wired\.

### Phase `p4` — completed

> Add compositor\-native foreground input and approved application launch\.

**Verification:**

> Input and launch controllers pass 34 tests under coordinator reproduction and are wired into extension\.js with sender binding, single\-use observations and disposal\. Explicitly unverified: any live compositor input, pointer\-constraint behaviour, key mapping against real keymaps, and actual application launch\.

- **`p4-input` · completed:**
  > Input modules using Clutter\.VirtualInputDevice absolute motion, buttons, keyvals and scroll with exact\-target verification, mapping from real image dimensions and buffer rect, 2s timed\-action bound, serialization and release tracking\.
  - Evidence:
    > input\.mjs \+ launch\.mjs created with injected dependencies only\. Coordinator reproduced node \-\-test input/launch/capture = 34 passed \(20 new \+ 14 existing\), gjs parses the extension, and the mocked extension suite stays 48/48 after wiring\. Coordinator added D\-Bus XML and async wrappers InputBegin/InputClick/InputDrag/InputScroll/InputPressKey/InputTypeText/InputReleaseAll/Launch/ConfirmLaunch, an observation registry minted at capture End \(single\-use, sender\-bound, 60s TTL\), seat/pointer/keyval/appSystem adapters, and disposal on disable\. Off\-limit ydotool remains unused\.
- **`p4-launch` · completed:**
  > Launch path via Shell\.AppSystem desktop IDs with inventory, PID and appId readback verification; explicit transient\-window association; no ydotool fallback\.
  - Evidence:
    > launch\.mjs refuses invalid desktop ids, locked/modal states, unknown apps and org\.gnome\.Shell apps; returns beforeWindowIds and requires confirm\(\) to observe a new matching window rather than trusting the launch call\. Coordinator wired LaunchAsync/ConfirmLaunchAsync with a Shell\.AppSystem adapter and window\-record listing; docs/features\.md records that confirmation only reports matching new windows\.

### Phase `p5` — completed

> Implement the private user\-operated sign\-in handoff\.

**Verification:**

> Source and synthetic acceptance pass under coordinator reproduction \(12\+1 python, 35 runtime, 26 browser\)\. Recorded limitation: no human has yet typed into the real dialog, so the descriptor path is proven only against a fake writer; the GTK context\-menu reveal and absent zeroization remain documented limitations\. Therefore no readiness callback to the waiting Tailscale session is sent yet\.

- **`p5-dialog` · completed:**
  > GTK helper scripts/browser\-auth\-dialog\.py with helper\-local accessibility protection, extra inherited descriptor transport, status\-only replies, stdout/stderr exclusion and parent\-death handling\.
  - Evidence:
    > scripts/browser\-auth\-dialog\.py collects one value in a GTK4 PasswordEntry and writes a length\-prefixed payload once to inherited fd 3; refuses to run unless GTK\_A11Y=none; non\-secret JSON spec only; PR\_SET\_PDEATHSIG; status token on stdout only\. scripts/private\-secret\-stage\.py stages to an absolute target with O\_EXCL\|O\_NOFOLLOW at mode 0600, parent\-directory validation and status\-only JSON\. Coordinator reproduced python3 scripts/test\_private\_secret\_stage\.py = 12 passed, 1 skipped \(display\-dependent\), and confirmed Gtk\.init\_check\(\) returns True on the live Wayland session, so the skip is environmental rather than a broken toolkit\.
- **`p5-fill` · completed:**
  > Worker\-private authentication path using pinned ElementHandles, ownerFrame/document/origin/form checks, approved\-origin routing with service workers blocked, suspended observation, non\-secret statuses and no automatic replay\.
  - Evidence:
    > Browser backend gained a privileged credential\-fill path restricted to the auth\-flow capability: pinned ElementHandles, ownerFrame/document/origin and form\-action origin checks, service workers blocked, non\-secret status only, not exposed in the public operation union; uploads gated by the auth guard\. Coordinator reproduced npm \-\-prefix tools/computer\-use\-browser run check = 26 passed, and tools/computer\-use\-runtime = 35 passed including the secret\-entry transport tests \(success, cancel, timeout kill, abort kill, overlong refusal, spec cleanup, no marker in errors\)\.

### Phase `p6` — completed

> Verify credential and environment hygiene across launchers\.

**Verification:**

> Hygiene suite passes 8/8 under coordinator reproduction and the five identified launcher leaks are fixed with tests enforcing them\. Source\-level only: no MCP server was started to observe environment isolation end to end\.

- **`p6-review` · completed:**
  > Review launchers; add regression tests proving unrelated parent secrets are not inherited and that no Codex credential path, export, vault or token\-bearing configuration is introduced\.
  - Evidence:
    > scripts/credential\-hygiene\.test\.mjs created \(8 tests, marker\-only secrets, fake executables, /tmp/opencode scratch\)\. Coordinator independently reran 8/8 and then fixed five real gaps inside its own scope: playwright\-mcp\.sh and playwright\-headless\-mcp\.sh now exec under env \-i with explicit allowlists; OPENCODE\_NODE\_BIN must be absolute, regular and owned by this user or root; github\-mcp\.sh now runs gh under env \-i rather than the full environment; mcp\_runtime\.py version probe uses a three\-variable environment\. Both todo markers were removed so the cases enforce\. Regression evidence: node \-\-test scripts/\*\.test\.mjs 82/82 at the time, github\-mcp\.sh \-\-verify\-only exit 0 resolving the real gh session, bash \-n and py\_compile clean\. Documented limitation: \~/\.opencode/bin/node is mode 0777 by installer default, so mode bits are deliberately not enforced\.

### Phase `p7` — completed

> Integrate tools into the plugin with skills and a working rollback configuration\.

**Verification:**

> Tools are registered and visible in the running session, both exposure modes exist, documentation matches the code, and all suites pass \(plugin 68, capture/input/launch 34, runtime 35, browser 26, python client 16, private\-entry 12\+1, scripts 82\)\. Live acceptance is not claimed: desktop tools reach the installed extension and fail with UnknownMethod for Begin/InputBegin/InputReleaseAll/Launch/ConfirmLaunch, which is the expected pre\-deployment state, and the browser worker fails at a sandboxed Chromium launch because this machine restricts unprivileged user namespaces and chrome\_sandbox is not setuid root\.

- **`p7-plugin` · completed:**
  > Coordinator\-owned registration, permissions, naming and configuration for Code Mode default plus direct\-tool rollback, with legacy insecure browser routes unable to bypass authentication guards\.
  - Evidence:
    > Registration complete: desktop namespace exposes 12 tools \(capture, input, release, launch, apps, tree, find, act, windows, window\_act, layout\) and web exposes 7 \(open, tabs, navigate, snapshot, act, screenshot, close\), confirmed in the live Code Mode catalog\. Coordinator fixed two real integration defects: the browser surface was registered under the reserved \`browser\` namespace and silently lost navigate/snapshot/screenshot \(renamed to \`web\`\), and every desktop tool declared codemode:false \(added a post\-registration transform that enables Code Mode unless plugin option directTools:true\)\. Retired the ydotool screenshot tool from registration\. Added node\-binary resolution and a data\-directory fallback so the browser worker can start under a bundled OpenCode server\.
- **`p7-skills` · completed:**
  > Bounded documentation and skill updates covering observation discipline, confirmation policy, private sign\-in behaviour, tab lifecycle and honest limitations; reconcile docs/features\.md inventory\.
  - Evidence:
    > Added \.opencode/plugins/computer\-use/README\.md documenting surfaces, permission actions, Code Mode default plus the directTools rollback configuration, prerequisites, and honest limits\. Reconciled docs/features\.md: new desktop tool rows, retired\-screenshot wording that still claimed the old backend was held, browser backend now described as exposed via web tools with the sandbox blocker, and the plugin row updated\. node \-\-test scripts/\*\.test\.mjs passes 82/82\.

### Phase `p8` — completed

> Independently verify security, outcomes and efficiency\.

**Verification:**

> Independent review reproduced every suite and produced 7 findings; the coordinator fixed five at source with regressions \(launch capability, Clutter import, profile permissions, auth\-guard injection, legacy screenshot removal\) and delegated the other two with explicit specs \(persistent bridge for observation binding, cancellation propagation\)\. Cancellation has since landed and reproduces at 29 browser / 77 plugin tests\. The static efficiency model is recorded as a model, not a measurement\. The bounded test\-quality audit is recorded\.

- **`p8-review` · completed:**
  > Independent Luna xhigh review of capture, input, isolation and private\-auth surfaces, reproducing adversarial cases rather than accepting implementer reports\.
  - Evidence:
    > Independent Luna xhigh reviewer reproduced every suite \(GNOME 34, plugin 68, scripts 82, python 16, secret\-stage 11\+1, runtime 35, browser 26\) and reported 4 P1 and 3 P2 findings\. Coordinator fixed four: launch confirmation is now a one\-use sender\-bound launchToken \(forgery, foreign sender and replay covered by three new tests\); extension\.js now imports Clutter; profile validation refuses any group/other permission with a 0750 regression case; the legacy ydotool screenshot tool is deregistered and its permission test retired\. Two P1/P2 items were delegated with explicit specs: the persistent bridge daemon for cross\-process observation binding, and browser cancellation propagation\. Plugin suite now 70/70\.
- **`p8-efficiency` · completed:**
  > Measure tokens, turns, latency and recovery cost under Code Mode and direct exposure; confirm live nested image interpretation\.
  - Evidence:
    > Static cost model delivered: desktop capture→click needs Begin \+ N chunks \+ End \+ InputBegin \+ InputClick \(N\+4 D\-Bus calls\) and two model\-visible cycles in either exposure mode, because the image must return before coordinates can be chosen; browser open→snapshot→click is three direct cycles and can combine open\+snapshot in Code Mode but the click still needs a second cycle after the model reads the snapshot\. No live token/turn/latency measurement was performed, so this remains a model, not a measurement\.
- **`p8-audit` · completed:**
  > Run the repository bounded test\-quality audit at the integration boundary and record real findings\.
  - Evidence:
    > Bounded audit of the new suites recorded in docs/test\-quality\-audit\.md: 14 capture, 11 input, 9 launch, 35 runtime, 29 browser and 77 plugin tests each mapped to the distinct failure they detect; a tautology/assertion\-free scan found none; the six review\-discovered defects now have targeted regressions where the fix is source\-level; the audit states explicitly that no live compositor, Chromium process, GTK dialog or cross\-process D\-Bus identity is covered\. scripts/\*\.test\.mjs remains 82/82\.

### Phase `p9` — in_progress

> Deploy and accept under separate explicit approval\.

- **`p9-deploy` · pending:**
  > Use the reviewed deployment mechanism only after approval; verify fresh GNOME login loads the reviewed bridge and stock OpenCode discovers the tools\.
- **`p9-live` · blocked:**
  > Live acceptance of representative GUI and browser workflows with real visible outcomes, plus demonstrated rollback\.
  - Blocker:
    > COMPOSITOR INPUT ON A REAL SEAT PLUS THE OPERATOR'S LOGIN\. NEW THIS TURN \- measured browser crash recovery instead of assuming it, and the first attempt corrected a wrong expectation of mine: killing the worker does NOT auto\-restart \(three consecutive snapshots each returned WORKER\_CRASHED\), which is the documented fail\-closed behaviour, so recovery is an explicit reopen\. New crash\-recovery\-acceptance\.mjs now asserts: the crash is reported rather than hidden, an explicit open starts a new worker, the next snapshot returns a generation, and afterwards there are zero worker and zero Chrome processes for that session\. Measured recovery \(kill \-&gt; working snapshot via reopen\): 2,583 ms\. Recorded in acceptance\.md alongside the desktop frozen\-daemon measurement\. Current evidence: plugin 120, browser 46, runtime 35, scripts 82, gnome 39, client 21, harness 67 PASS exit 0, live\-capture\-check exit 3 \(module cache\), deployed drift 0/7, 124 dirty paths untouched, nothing committed\. STILL BLOCKED: a keystroke or button on a real seat and a human sign\-in run\.

### Decisions

- Flash remains sequencing/integration owner; Luna xhigh implements high\-risk surfaces and a different Luna xhigh reviews them\.
- At most two implementation workers initially, with disjoint file ownership and no concurrent edit of shared registration or configuration\.
- GNOME compositor\-native input replaces ydotool expansion because ydotool absolute motion is a relative approximation\.
- Browser parity uses a typed per\-session Playwright worker rather than the shared\-current\-tab MCP or the currently unattached desktop browser\.
- Private sign\-in uses a user\-operated GTK dialog with descriptor transport; OpenCode forms and MCP form elicitation never carry website secrets\.
- Capture stays in memory and never infers ownership from the user screenshot directory\.
- Deployment, commit, push, extension activation and security\-setting changes remain separately authorized\.
- The named session's codemode:false preservation request is superseded by the user's explicit parity request; direct\-tool rollback is retained\.
- This goal carries NO token budget by explicit user instruction: a budget is only set when the user states one\.
- External dependency: session ses\_e82032444ffeP7hG18Zqr3hsp3 waits on p5 for a one\-time ready callback with resume=true, only after p5 ships and verifies usable here\.
- Accepted their corrections: Tailscale 1\.104\.2 supports \-\-auth\-key=file:, and their secret\_setup\.py derives its repo root from \_\_file\_\_, so cwd is not the launch cause\.
- P2 queue gap closed in source: \.opencode/plugins/computer\-use/serialization\.ts wires the runtime owner queue to both surfaces \(owner=surface:sessionID, ordered mutations, independent sessions, queued\-call cancellation\) and adds a per\-call deadline that frees a slot held by an operation ignoring its abort signal\. Evidence: serialization\.test\.ts 11/11, plugin suite 90/90, runtime 35/35, scripts contract 82/82\. Live behaviour under a real hung Shell/browser call remains unproven and is recorded as source\-closed only\.
- Browser docs reconciled to avoid over\-claiming: worker startup is verified standalone \(\{"type":"ready"\} with channel=chrome via the installed setuid\-helper Chrome, no system change required\); page\-level work and web\.\* tool acceptance are NOT verified, and plugin\-level acceptance stays gated on the approved service restart\. docs/features\.md, tools/computer\-use\-browser/README\.md and docs/codex\-parity/acceptance\.md now state those three levels separately; the stale 'setuid chrome\_sandbox install required' blocker and 'no real browser launched' claim are removed\.
- Private entry remains NOT LIVE\-ACCEPTED\. A fourth real dialog run stayed open \~5 minutes and ended with a human cancel: exit 2, status 'cancelled', no target file, private spec removed\. That proves the dialog opens and cancellation fails closed, not staging\. No readiness callback sent, no scheduler exists, and scripts stay in place at their canonical paths with no install step\.
- Live tool\-level browser acceptance recorded \(2026\-10\-27\): driving the real web tool registrations from a fresh process against real Chrome opened https://example\.com \(opaque tab id\), snapshotted 1283 bytes with 8 refs, returned a 175,274\-byte inline data:image/png;base64 file part \(valid PNG, 2036x1366\), and closed with tabs discarded\. A two\-session run showed distinct tab ids, both own\-session snapshots, FOREIGN\_TAB refusal for a cross\-session tab id, CAPACITY\_EXCEEDED for a third worker, separate 0700 profiles under browser\-profiles/&lt;projectKey&gt;/&lt;session&gt;, and a screenshot beside a second live worker\. Harness profiles were deleted\. In\-session web\.\* discovery and Code Mode image delivery remain unverified\.
- Live in\-session call from this session returned 'Browser error \(WORKER\_CRASHED\)', confirming the running service \(started 09:19, before the worker env/lock fixes\) still serves the pre\-fix module\. The approved service restart is armed as a one\-shot quiet\-window watcher \(all sessions idle &gt;=120 s, fail\-closed if session state is unreadable, no\-op if the service already restarted, logged\); it was not forced while peer sessions ses\_e8275dbd and ses\_e8203244 were recently active, to preserve their in\-flight work\.
- The live evidence is now reproducible from the repository: tools/computer\-use\-browser/live\-acceptance\.mjs drives the real web registrations and asserts eight outcomes \(opaque tab id, ref\-bearing snapshot, inline PNG file part, distinct tabs across sessions, own\-session snapshot, FOREIGN\_TAB refusal, CAPACITY\_EXCEEDED for a third worker, 0700 profiles\), cleans its profiles and exits non\-zero on failure\. Run observed 8/8 with channel=chrome; browser npm run check \(tsc \+ 29 cases\) and scripts contract 82/82 remain green\.
- Criterion 1 attribution gap closed in source: serialization\.ts now validates every tool call's caller attribution \(sessionID, agent, messageID, callID\) through the runtime's validateCallerAttribution before any permission check, queue entry or desktop/browser action, rejecting INVALID\_CONTEXT otherwise\. Previously that contract was exercised only by its own tests\. Evidence: serialization\.test\.ts 12/12 \(including 'a caller with unusable attribution is rejected before anything runs'\), plugin suite 91/91, scripts contract 82/82\.
- tools/computer\-use\-browser/live\-acceptance\.mjs now registers the web tools through the production path \(withSerializedTools\), so its 8/8 run proves serialization and attribution validation do not break real browser work: real Chrome, 8\-ref snapshot, 175,274\-byte inline PNG, FOREIGN\_TAB and CAPACITY\_EXCEEDED refusals, 0700 profiles\.
- Approved service restart scheduled as a detached one\-shot at 16:35:27 local \(120 s after arming\) so this turn's message is delivered first; the earlier quiet\-window watcher was stopped because active sessions never met its 120 s idle condition\. Peer ses\_e8275dbd was notified by non\-resuming queue message before the restart\. The script is a no\-op if the service pid already changed and logs health afterwards to /tmp/opencode/service\-restart\.log\.
- In\-session browser failure root\-caused, and the earlier 'module caching' explanation is retracted as wrong\. After the approved restart \(new PID 245027, healthy, loading \.opencode/plugins/computer\-use/index\.ts from disk\) web\.open still returned WORKER\_CRASHED\. Cause: spawnWorker used stdio \['pipe','pipe','inherit'\], so the worker and Chrome wrote to the service's stderr, which in the daemonized service is a socket whose reader can be gone; the worker's first diagnostic line fails that write and kills it just after it reports ready\. Controlled evidence with the same worker/profile/session: dead\-reader stderr \+ inherit =&gt; WORKER\_CRASHED \(reproduces live symptom\); dead\-reader stderr \+ dedicated drained pipe =&gt; real tab opens\.
- Fix implemented in tools/computer\-use\-browser/src/manager\.ts: worker stderr is now its own pipe drained by the parent with a 2 KiB ring buffer, and a 300\-character tail is appended to the crash error so a startup kill is never unexplained\. Two new cases in test/manager\-cancellation\.test\.ts cover the tail and its cap; browser suite 31/31, plugin suite 91/91, scripts contract 82/82\. A second service restart is required to load it because plugin setup does not re\-run on file change \(verified with a temporary load marker\)\.
- Browser in\-session acceptance PASSED live after the second restart \(service PID 253390, healthy 16:42:22\), through Code Mode in this session: web\.open returned tabId cu1\.SnS8rSVtbImm\-Jll\.tab\-target\.\.\. with title 'Example Domain'; web\.snapshot returned 1283 bytes, generation 1, 8 refs; web\.screenshot DELIVERED THE PNG TO THE MODEL \(the rendered page was visible in the conversation, not just JSON\); web\.close returned cancelled:true, discarded worker and tabs, retained profile\. This satisfies the nested\-image\-delivery criterion and the in\-session discovery half of deployment acceptance; the desktop half remains blocked on the GNOME logout/login\.
- Docs reconciled to the observed state: docs/codex\-parity/acceptance\.md blocker A is closed with the controlled old\-vs\-new stdio experiment and the in\-session table; tools/computer\-use\-browser/README\.md records in\-session \+ Code Mode delivery as verified and documents the owned\-stdio rule; docs/features\.md replaces the 'unverified/cached module' claim\. The retracted 'module caching' explanation is marked wrong rather than deleted, so the audit trail keeps the correction\.
- Code Mode / rollback made testable: the transform moved out of index\.ts \(which imports the OpenCode SDK and cannot load in a plain test\) into \.opencode/plugins/computer\-use/codemode\.ts as applyCodemodeDefault\. New codemode\.test\.ts 5/5 covers the default, the directTools:true rollback, tools that omit the option, and namespace isolation; the transform now flips any desktop\_\* tool that is not already codemode:true so a future tool cannot silently fall onto the direct surface\. Plugin suite 96/96\.
- Live latency measured through Code Mode on https://example\.com/: open 2387 ms \(cold worker\+Chrome start\), snapshot 351 ms \(1283 bytes, 8 refs\), screenshot 1051 ms \(inline PNG delivered to the model a second time\), close 1579 ms; whole cycle 5368 ms\. Recorded in docs/codex\-parity/acceptance\.md\. Token/turn counts exist but recovery\-cost instrumentation does not, so that part of the efficiency criterion is recorded as open rather than assumed\.
- Bridge deployment readiness verified read\-only: deployed extension\.js, capture\.mjs, policy\.mjs and metadata\.json hash\-match source, and the deployed runtime\-contract\.mjs equals tools/computer\-use\-runtime/src/runtime\-contract\.mjs \(the repo copy is a shim the deployer resolves by design\), so a fresh login loads exactly the reviewed review of the extension \- no drift\.
- Real defect found by driving the plugin ENTRY POINT with a fake OpenCode context \(temporary node\_modules symlink, removed after\): the documented directTools:true rollback was PARTIAL\. capture, input, release and launch declare codemode:true in their own definitions, so the old 'skip the transform' rollback left 4 desktop tools in Code Mode\. Fixed in codemode\.ts: the option is now authoritative both ways \- default applies Code Mode to every owned tool, directTools:true switches every owned tool back to direct, and other namespaces are untouched\. Entry\-point evidence: 18 tools \(11 desktop \+ 7 web\), 18 Code Mode by default, 0 in rollback, real browser tab opened through the entry, dispose clean\.
- Regression coverage and docs updated for the rollback fix: codemode\.test\.ts 5/5 \(including a tool that declares Code Mode itself, and namespace isolation in both directions\); plugin suite 96/96, browser 31/31, scripts contract 82/82, git diff \-\-check clean\. docs/codex\-parity/acceptance\.md records the partial\-rollback finding and the entry\-point numbers; \.opencode/plugins/computer\-use/README\.md states that the option is authoritative in both directions and why a skip\-style rollback would be partial\.
- Auth\-guard blocking verified on the real tool surface with a real guard \(fresh process\): with sign\-in active, snapshot, screenshot and tabs are all refused with 'Browser operation refused while private sign\-in is awaiting\-user' in \~0 ms; cancel returns to idle and the surface works again in 344 ms with a warm worker\. The tool layer is deliberately stricter than the backend, whose status classification is therefore unreachable through tools \- recorded as intentional fail\-closed over\-blocking, not a gap\.
- Desktop acceptance made mechanical instead of guessed: docs/codex\-parity/acceptance\.md now records the exact current failure signatures \(capture \-&gt; UnknownMethod "Begin"; input \-&gt; 'observationId must be a non\-empty string', which proves the observation\-bound design\) and a five\-step post\-login runbook \(introspect method set, list, capture, observation\-bound click plus fresh capture, release\)\. No untested acceptance script was added; the steps use the already\-tested CLI\.

