# Plan — `50dd49c6-e25b-4f58-9c7f-6b0f1fab107a`

- Goal ID: `50dd49c6-e25b-4f58-9c7f-6b0f1fab107a`
- Source session ID: `ses_e78fdcc9affeNOlKMRek7Yobo3`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-30T00:06:01.796Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `complete`
- Plan revision: `13`
- Record: `archive`

## Goal objective

> Deploy and live\-verify the enhanced local goal plugin and other ready pending computer\-use changes requested by the user: ensure /yolo and goal settings are available in the running profile, preserve current models/permissions/voice/plugins and goal history with rollback backups, repair verified local\-plugin/goal\-docs compatibility without faking version or weakening state checks, verify ready command and GNOME bridge file deployments, document any separately gated activation or unfinished integrations, and run relevant regressions/health checks\. Preserve unrelated dirty work and the OpenCode binary/executable, launcher and symlinks unchanged; no commits, pushes, publication, desktop logout, or unapproved shared\-service restart\. Do not send further coordination messages through the user's prompt queue\.

## Persisted plan

Plan revision: `13` · updated 2026-10-29T22:35:24.000Z

> Deployment is live; implement the newly requested inbox repair before final whole\-goal acceptance, preserving all outstanding regression results and activation limits\.

### Completion criteria

- The running profile loads exactly one enhanced local goal engine and exposes /yolo, /goal and settings without changing the OpenCode executable or launcher\.
- Deployment preserves existing settings and goals with verified backups; ready command updates and GNOME bridge files are deployed and verified without unauthorized logout or shared restart\.
- Goal\-docs accepts only a verified supported local plugin/state contract, retains rejection of unsupported identities/layouts, and relevant tests pass\.
- Relevant regression, package smoke, scoped runtime health and preservation checks pass; unfinished optional integrations and separately gated activation are explicitly documented\.
- No further peer coordination messages are inserted into the user's prompt queue; no unrelated work, credentials, commits, pushes or publication are changed\.

### Phase `deployment` — completed

> Deploy verified ready artifacts through narrow reversible workflows\.

**Verification:**

> Plugin\-only CAS deployments preserved all non\-plugin config; live inventory confirmed enhanced local engine active with goal/yolo/pause/resume commands and /yolo status returned successfully\. Commands deployed with backup; GNOME two\-file deployment verified; no executable/shared restart/logout change\.

- **`plugin-config` · completed:**
  > Select the local enhanced plugin in canonical/project and live global/CLI configuration with rollback and settings preservation\.
  - Evidence:
    > Applied source\-authored plugin\-only CAS updates to active opencode\.jsonc and cli\.json using deploy\-goal\-plugin\.py\. Backups/receipts 452482b6850b644a6fb238e3acb67108 and 94edfd2650c20944131a8b669be018fa; goal file backup retained\. Live local\.goal\-mode\.server and /yolo status verified after supported configuration reload\.
- **`ready-artifacts` · completed:**
  > Deploy ready command and desktop bridge changes; distinguish source\-linked skills from unfinished optional integrations\.
  - Evidence:
    > commands deployed via \-\-only commands with backup\-20261029\-152654; 25 checkout/handoff source tests passed\. GNOME extension\.js/input\.mjs deployed with verified seven\-file manifest and \.backups/20261029T192241\.941691Z\-fk66bch6; 59 source and 6 deployer tests passed\. Skills preview is unchanged, globally source\-linked\. No GNOME refresh or optional integration activation\.

### Phase `integration` — completed

> Repair actual deployment integration and retain all identity safeguards\.

**Verification:**

> Actual local directory smoke passes on unchanged v2\.1\.1, package entrypoint test passes alongside both retained original package tests \(3 cases\)\. Live goal engine command /yolo status executes\. Companion core suite 57/57 plus actual runtime inventory/state read pass\. Remaining full regression, final reload/health and deployment documentation remain acceptance work\.

- **`loader` · completed:**
  > Verify direct local\-directory loading and package entrypoints, not only a temporary smoke loader\.
  - Evidence:
    > Added root plugin\-only server\.js/tui\.js entries and root export; direct\-directory isolated v2\.1\.1 smoke passed with 17 model calls, 2 auto\-continuations, 3 reviews and YOLO surviving private\-server restart\. New package contract test passes; final lint/package recheck pending after JS entrypoint correction\.
- **`local-identity` · completed:**
  > Add narrowly verified local enhanced plugin compatibility to goal\-docs without false version labels or weakening v3 state validation\.
  - Evidence:
    > Enhanced package now explicitly declares enhanced\-state\-v3\-1 without changing version 0\.1\.1\. goal\-docs/state\.ts resolves only one active local\.goal\-mode\.server entry through absolute nonsymlink package metadata, refuses unsupported markers/bare version/ambiguous/inactive identities and requires v3 state\. Existing 0\.1\.67 checks retained\. Companion core suite 57/57 passes; actual scoped inventory resolves local\-enhanced/state\-v3@0\.1\.1 and reads current active goal 50dd49c6 revision1\. Task\-title modules/index/model untouched\.

### Phase `inbox` — completed

> Fix agent inbox workflow: separate peer coordination from human prompts, explicitly track task coordinator ownership, and make seen/acknowledged state truthful without silently steering or waking chats\.

**Verification:**

> 128/128 source cases, strict/library typecheck, actual native tool/RPC/peer readback, mailbox\-only no\-native\-queue/no\-wake observation and explicit seen\-only ACK verified\. Normal\-chat hook removed with actual\-setup unsafe\-storage regression\. No automatic coordinator/worker ceilings\. Optional visible inbox dialogs and separately gated GNOME refresh/live input remain unclaimed/documented, not replaced by source counts\.

- **`inbox-contract` · completed:**
  > Inspect existing coordination source/runtime and define the smallest mailbox/read\-ack/routing fix; identify actual task owner rather than inferring coordinator role from titles or arbitrary sender claims\.
  - Evidence:
    > Read tools/session\-coordination README, readiness/acceptance, index/service/model/result/tool/RPC/TUI contracts\. Existing durable inbox and explicit seen\-only ACK already exist, with native tool\-bound senders and assignment owners\. Confirmed service deliver defaults Inbox\-only and notices to session\.prompt\(queue,false\), which creates the user\-visible clutter; UI currently exposes settings only, not an inbox\.
- **`inbox-implementation` · completed:**
  > Implement and test separate agent mailbox routing and visible read/acknowledgement with duplicate, cancellation, human\-prompt preservation and coordinator\-provenance safeguards; do not send more native prompt\-queue traffic\.
  - Evidence:
    > Current implementation: explicit mailbox receipt with zero native prompt calls for Inbox\-only/status/notice; opt\-in steering/native denials and legacy\-unknown safeguards retained\. Scoped inbox read/seen/ownership RPC and optional TUI controller exist\. Automatic model\-context hook REMOVED after real lockup; actual\-plugin setup test verifies no prompt/model hooks with unsafe storage\. Native Effect schemas retain policy invariants, tool/RPC JSON omits undefined, actual native results work\. Final npm test128/128, strict/library typecheck pass; default\-queue mutation rejected\. Stored is not agent activation or work acceptance\.
- **`inbox-acceptance` · completed:**
  > Deploy the authorized inbox fix through supported plugin surfaces, verify actual mailbox/ack behavior without polluting the human prompt queue, document any native\-host limits and finish goal audit\.
  - Evidence:
    > Native inventory reports project server/TUI/RPC active; actual tool post/read/inbox/mailbox\-deliver/seen\-only ACK and settings RPC readback succeeded\. All three real selected peers stored replies; voice report fully read and ACKed\. A delivered mailbox\-only notice left voice idle/native pending\[\] unchanged\. Private \.session\-coordination state preserves outside repair; no new restart/security change\. docs/deployments/2026\-10\-29\-goal\-plugin\.md records incident, rollback, native/compiler evidence and optional GUI/GNOME limits\. Optional visible dialogs not claimed; user's unsent draft untouched\. Native steering, not mailbox, handles authorized activation\.

### Phase `acceptance` — completed

> Verify final live behavior, rollback preservation, tests and deployment documentation\.

**Verification:**

> Audited all five immutable criteria against final checklist and concrete native/source/preservation evidence\. Required enhanced live engine, commands/settings, narrow backed\-up deployments, strict local compatibility and relevant regression/smoke/health pass\. Newly reported writes were caller omission proven in exact saved inputs; source diagnostic/regression independently passes132/132 and valid native post works\. No claim optional diagnostic loaded in every existing session\. Ready GNOME disk files match7/7; gated activation/independent peer scope documented\. No required deployment work remains\.

- **`final-checks` · completed:**
  > Run final relevant regressions/lint/typecheck/package/direct\-directory smoke and scoped health; verify live commands/settings and preserved executable/config/goals\.
  - Evidence:
    > Final independent coordination npm test132/132 zero skips \+ strict/library typecheck pass; inspected tool\.ts/channel\.test\.ts regression and adjacent inbox JSON/native contract coverage\. Five exact skills\-session failed calls omit op; valid live post correction stored/read back, affected native pending\[\]\. Full enhanced regression previously458/458/1888assertions; lint/typecheck/package dry\-run and packed direct\-directory lifecycle smoke passed17modelcalls/2continuations/3reviews/YOLO persistence\. Fresh health passes; adjacent41/41, final inventory7/7\. Fresh native inventory exactly one enhanced/no builtin; six commands, settings enhanced/reloadRequired:false, YOLO available/off\. Both non\-plugin configs equal transaction backups, both binary hashes and original staged patch hash exact\. Goal backup found1691198bytes; GNOME dry\-run changes\[\]/7files; git diff \-\-check passes\. Complete audit at docs/deployments/2026\-10\-29\-goal\-plugin\.md\.
- **`deployment-record` · completed:**
  > Record deployment/rollback locations, compatible\-host and GNOME refresh limits, and remaining non\-ready optional work; no further prompt\-queue coordination\.
  - Evidence:
    > Reviewed final docs/deployments/2026\-10\-29\-goal\-plugin\.md prompt\-to\-artifact checklist and incident chronology; READINESS/README/features reflect latest132/132 and source/live distinctions\. Backups, rollback, unchanged settings/executables/index, normal\-chat\-hook removal, caller missing\-op diagnosis, mailbox readback and no\-wake limits explicit\. Optional rendered dialogs, GNOME refresh/loaded\-new\-input/physical voice, stable2\.2\.1\+ and concurrent peer\-owned checkout/voice/adoption work remain unclaimed\. No restart, config/security changes, commits/push/publication were performed for late repair\. Final feature/link7/7 and whitespace pass\.

### Decisions

- Original implementation goal f7183041 remains complete; deployment is a new independently tracked goal with no inferred budgets\.
- User's screenshot objects to peer\-context queue clutter\. No more messages will be sent through that queue; existing messages are not silently executed or deleted\.
- Verified peer no\-overlap window covers goal\-docs/state\.ts, model\.ts, index\.ts and goal\-docs\.test\.ts; task\-title modules and historical verification reservations remain outside this deployment scope\.
- Deployment authority permits plugin/config activation and ready file copies, not OpenCode executable changes, security\-permission expansion, publication, shared\-service restart or desktop logout\.
- User asked why queued peer replies remain\. Native queue transport accepts them, but explicit API reads do not consume pending prompts\. No automatic consumption/cleanup is claimed\. Existing queue entries are preserved and not steered/deleted without explicit authority; no more coordination inputs are sent\.
- User explicitly requested inbox repair and asked who coordinates\. This chat owns the deployment request/goal; the other chat is a peer, not a delegated child\. No automatic election or authority from titles/peer labels; track roles with explicit task provenance\. Investigate and use dedicated mailbox primitives instead of human prompt transport\.
- Final regression exposed a real compatibility watchdog race: if the goal\-less busy\-turn watchdog expires before create\_goal finishes, no rescue remained\. Re\-arm configured watchdog on active goal creation/replacement while busy; explicit expired\-before\-creation regression and targeted watchdog suite pass 8/8\. Full final rerun is underway, not yet claimed green\.
- Package acceptance review retained both original peer\-runtime and engine\-range tests alongside the new local\-entrypoint test after detecting their accidental replacement during the first edit\. No original coverage remains discarded\. GitHub permission suite's unrelated old npm\-plugin pin is updated to the explicitly deployed local enhanced/exclusion selection; allow/ask/lockdown checks remain intact\.
- While final deployment regression runs, the coordinator may inspect existing inbox/coordination source and contract read\-only as disjoint successor preparation\. Do not implement or activate inbox changes before advancing the cursor; no peer/user prompt messages are sent\.
- Earlier queued peer input has now arrived at a normal native turn boundary\. The human prompt queue was not deadlocked; fix routing/UX rather than modifying the native execution loop or binary\. This phase resequencing explicitly advances the cursor for the newly requested independent inbox work\.
- Inbox repair contract: default Inbox\-only and non\-actionable notices remain mailbox\-only with explicit truthful delivery state and no native prompt call; retain separately opted\-in steering/wake safety and immutable legacy unknown transport\. Add a dedicated scope\-checked Agent inbox UI with explicit mark\-seen, plus bounded normal\-context unread discovery without injecting user prompts or waking idle chats\. Reads do not imply task acceptance\.
- Coordinator provenance: no global automatic election or authority from message body/title\. Show native\-bound sender and per\-assignment owner/worker facts; current requesting chat owns this deployment goal\. Keep role claims untrusted and parent\-only goal control\. Legacy manually queued inputs remain preserved unless explicitly selected for supported cleanup; do not forge them into verified channel records\.
- Activation preflight confirms package\-local dependencies, canonical exact project config and absent private tools/session\-coordination/local\-state\. Apply only its proposed additive one\-entry plugin declaration; preserve every existing plugin/non\-plugin setting and existing native pending input\. No native prompt traffic, shared\-service restart, executable change or permission expansion is authorized by this acceptance\.
- Critical escaped regression: user reports external chat had to restore normal requests after automatic inbox context discovery read unsafe group\-writable ancestors\. Outside repair changed canonical stateDirectory to private \.session\-coordination and restarted service; preserve that work\. This coordinator removed automatic ctx\.session\.hook\(context\) discovery entirely\. Actual\-plugin setup isolation regression proves no prompt/model hooks are registered even with unsafe storage; explicit inbox access still refuses unsafe paths\. Strict typecheck passes\. Do not claim live sender/UI/normal\-model regression acceptance from this source test\. No new shared restart or security relaxation\.
- Full goal\-plugin regression sh\_189316fdb001ug7eE9O0lLU1mq was cancelled because server restarted, per actual completion notification\. It did NOT pass and is no longer an outstanding running result\. Final full run must be repeated safely after inbox stabilization\.
- User explicitly rejected added bounded\-coordinator complexity; do not add coordinator elections, arbitrary worker ceilings or new orchestration\. User then explicitly requested contacting the three other open root project chats, checking remaining goals, resuming work and switching them to DeepSeek Flash while this chat stays Sol\. Native model lookup verified deepseek/deepseek\-flash \(DeepSeek V4\.1 Flash 1017\); all three selected sessions were switched to high and read back\. Exact native steering inputs with resume:true were admitted to task\-title, voice and skills chats; source stayed untouched\. Dedicated tool\-bound post resume\-flash\-msg\-189902b8b001 stored despite its tool\-output serialization error, confirmed through inbox RPC; no duplicate resend\. Peers must report/resume their own scope and preserve terminal goal history; no prompt\-queue replies to this chat\.
- User\-requested skill maintenance completed: enhanced canonical cross\-session\-coordination SKILL\.md and README, added references/model\-and\-resume\.md, and updated docs/features\.md plus protocol\-docs\.test\.ts\. Workflow covers exact selected existing chats, remaining goals, catalog\-resolved provider/model/effort, supported per\-session model switch and readback, keeping requesting chat unchanged, explicit authorized steering, one active\-map check, truthful terminal goal/acceptance boundaries, stored\-after\-tool\-error reconciliation and no arbitrary coordinator/worker ceilings\. Does not install a scheduler, change global models/permissions, restart services or add normal\-chat hooks\. Source/portability/inventory checks pass 22/22; actual native skill discovery returns the new description and canonical source path\. No deployment or commit needed for the existing source\-linked skill\.
- Final full enhanced regression sh\_18998ff8b001Oib8x1uO0SpElu completed458/458 \(1888 assertions/14files\); cancelled older sh\_189316\.\.\. is retained as cancelled\. Final lint/typecheck, npm pack dry\-run and actual packed direct\-directory private\-server smoke pass17modelcalls/2continuations/3reviews/YOLO restart persistence\. Scoped health passes; adjacent feature/GitHub permission/health/memory/instruction/portability41/41\. Native inventory/settings/commands reconfirm exactly one enhanced engine/no built\-in; both global/CLI non\-plugin settings equal deployment backups\. GNOME preview changes\[\] and both executable hashes remain exact\.
- Additional explicit user requests fulfilled independently: saved and read back repo interaction\-preferences via memory preview/apply, added startup locator in MEMORY\.md and one\-time AGENTS\.md preference read within existing two\-note total; source instruction/memory15/15\. User's new voice Queue/Shift\+Enter, clipboard copy, Hearing overflow auto\-expand and composer\-anchored box request was steered to exact voice owner ses\_e7b2588f with resume:true, readback admitted and fresh active\-map running\. Voice feature implementation remains with that independent owner, not a hidden unfinished child of this deployment\.
- User\-authorized background child ses\_e7649be49ffeAY5AErkZa19ITG exclusively owns source/test remediation under tools/session\-coordination/ for affected ses\_e788b549bffe8cyPIPC9FRsmJY: read operations work but post returns unsupported coordination operation\. Expected evidence: actual\-path reproduction, minimal repair, pre\-fix failing regression, package suite/typecheck and honest live post acceptance/reload gate\. Parent retains final\-checks cursor, goal planning and independent acceptance; no overlapping package edits\. No prompt queue fallback, automatic hooks/wake, shared restart, executable/config/security changes, commits or pushes\. Do not mark goal complete using earlier live post evidence until this newly reported regression is reconciled\.
- Independent supported session\.message\.list inspected exact affected skills session: FIVE failed writes omit op entirely \(input keys body/id/\[parentID\]/purpose/recipients\); read/inbox/status/policy include op and work\. Historical original reply has op:post and old separate JSON\-output error\. Child live valid post and parent coordination post both succeed, so no evidence of blocked valid writes\. Parent stored/read back skills\-missing\-op\-correction\-20261029\-v1 in existing thread; affected native pending\[\] verified, no wake/seen claim\. Existing child exclusively owns minimal missing\-op diagnostic and regression, no inferred operation/schema weakening/config/restart/messages\. Parent docs updated; goal remains active pending independent acceptance of that bounded follow\-up\.
- Background child ses\_e7649be49ffeAY5AErkZa19ITG finished and exclusive package ownership released to parent for review\. Changed only tool\.ts and test/channel\.test\.ts: precise explicit\-op errors without inferred writes, registered\-boundary no\-effects malformed input and valid real\-store post\. Parent reran132/132/typecheck and adjacent41/41, inspected assertions; live valid\-post issue resolved as missing caller op\. Clearer diagnostic is source\-verified only, no unauthorized reload to claim it in every session\. Saved correction remains mailbox\-only/unacknowledged; no native prompt traffic\.

