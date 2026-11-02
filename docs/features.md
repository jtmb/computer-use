# What is in this repository?

This checkout contains OpenCode v2 configuration source, reusable skill bundles,
local plugins, MCP launchers, desktop/window helpers, and demo/maintenance tools.
This inventory describes the **current working tree**, including uncommitted and
untracked files. A source file or config declaration is not proof of deployment,
runtime discovery, live acceptance, or availability on another machine.

Start with [setup](../setup.md) and [the skill catalog](../.opencode/skills/README.md).
Inspected: 2026-10-28. Runtime checkpoints below are environment-specific and may
be stale; the initial inventory was source-only. Later dated acceptance links
distinguish actual observations from source/fixture checks.

**Plain-English personality — 2026-11-01 source implementation:** the
[`personality` parent](../.opencode/skills/personality/SKILL.md) and
[`personality-plain-english` subtype](../.opencode/skills/personality-plain-english/SKILL.md)
are complete sibling skills and were advertised/loaded in this chat. They use
everyday explanations and familiar comparisons, not an added pushback persona.
The subtype also calls for numbered **Next steps** on task updates and handbacks,
with short bold action labels, clear user/assistant ownership and any necessary
approvals. It does not invent follow-up work or add needless lists to simple facts.
The updated complete instruction body is observed in the active `current` tool
and actual isolated2.1.1 outgoing requests, including alongside a native summary
after private restart/project move. This is delivery proof, not universal model
format compliance; the native verifier now rejects first-sentence-only reminders.
The custom [personality plugin](../tools/personality/) ([guide](../tools/personality/README.md)) supplies
current/list/read/select/reset and revision-bound new-skill saving, plus a compact
model-context reminder. Native skills/plugin storage/hooks are OpenCode features;
the tool, safe-save adapter and reminder policy are repository integration source.
After separate user approval, the narrow global declaration is applied and active
without a service restart. The actual tool reports Plain English as its default;
canonical loading and real DeepSeek Flash samples are observed in two QA projects,
including a completed native manual compaction and the following reply. These
samples do not establish universal style reliability; ambiguous token answers are
not promoted to technical-contract proof. See the
[activation record](deployments/2026-11-01-personality-cua-activation.md).
An additional installed2.1.1 private-host fixture passes44 native checks for
real tool registration, storage durability/chat isolation across restarts and a
project move, safe native save/apply in a hash-verified scratch source copy,
read denial and actual passive/explicit permission-ask behavior.
Nine actual HTTP requests (eight primary, one native manual compaction) reach an
account-free deterministic loopback endpoint. Nine request checks verify the
exact current reminder across style changes, reset, restart, a project move and
after native compaction. The host's completed summary is replayed alongside one
reminder; the summary path itself keeps native instructions. This is verified
native-path delivery, not real-model style compliance or global-profile activation.

**Codex-parity persistent runtime — 2026-11-01:** the computer-use plugin now
registers a `cua` surface (`cua.js`, `cua.reset`) alongside `desktop` and `web`.
One cell supports top-level await and keeps its bindings for later cells; its
`cua` object calls the same serialized desktop/web tool executions, so
permissions, sign-in blocking, queueing and preview tokens are not duplicated.
`desktop.appIndex` / `--app-index` initially resolved repeated names, but follow-up
review proved list positions can retarget after an app closes. Current source adds
process-incarnation `appId` binding and target-scoped permissions. Initial
fake-backend checks missed real browser contracts, late-work attribution and CPU
continuation hazards. A terminable worker now owns model-code execution while
actual permissions/backend calls stay in the parent. Current plugin checks pass220 tests;
strict actual plugin-entry/browser/worker types are clean against SDK2.1.1.
Actual registered tools started the worker and remembered42 across calls (next
call returned43). Actual local-page CUA acceptance now verifies remembered-tab
fill/click, fresh result snapshot and visually inspected PNG, navigation and
successful browser-worker cleanup. Three alternating warm scripted pairs measure
matching seven-call workflows (direct median10,230ms, CUA7,726ms), not model
turns, tokens, costs or a general speedup. A separate six-fresh-session real-model
comparison now records native token classes/costs and verified tool/page/cleanup
results: direct median101,690ms/$0.005137014, CUA127,664ms/$0.005811996. It shows
no CUA speed/cost advantage; model detours and recovered request errors remain
included. Both paths use Code Mode, not toggled direct-tool exposure. See the
[architecture evidence](codex-parity/codex-runtime-architecture.md#matched-real-model-local-page-runs--2026-11-01).
This does not establish general desktop mutation parity. Bounded actual desktop
acceptance now verifies Calculator capture/pointer7, literal7+5→12, mixed-case
text/plus, Shift-click selection and exact saved-file bytes. A real key-resolver
defect was fixed and separately deployed with approval; the user performed the
required reboot. Later cached-connection failures are repaired without a shared
restart: failed operations return their original error and retire only the dead
owned transport for a later fresh request, never replaying the failed action.
The [accessibility address helper](../scripts/accessibility_bus.py) uses installed
libatspi's supported per-process `AT_SPI_BUS_ADDRESS`: complete GUID and same-user
provider/socket checks, no global environment or permission changes. Actual app
listing and process-bound CUA named7/set7+5 now pass with visible readback; an old
handle refuses a same-name replacement, whose blank window and fresh-handle
cleanup are verified. Screen locking temporarily deactivates the user-only bridge;
after the user wakes it, a user-approved temporary idle inhibitor keeps it awake
during testing and is removed afterwards without changing saved settings. Current220plugin/7bus-unit/
26desktop-Python checks, strict bridge types and full health pass; seven deployed
bridge files match source. All task windows are closed and input released.
The [activation record](deployments/2026-11-01-personality-cua-activation.md#supported-accessibility-recovery-and-app-acceptance--2026-11-01)
retains the earlier failures and explicitly supersedes old login/shared-restart
blockers. No agent-performed shared restart/logout, unsafe input fallback,
security weakening, unapproved deployment, commit or push followed.
Neither a worker nor `vm` is a security sandbox. Timeout/cancellation/worker loss
clears remembered handles; post-cell liveness checks stop dangling CPU work too.
See the [architecture notes](codex-parity/codex-runtime-architecture.md) and the
[plugin guide](../.opencode/plugins/computer-use/README.md).

**2026-11-01 readiness reconciliation:** the [dated correction crosswalk](request-coverage.md#current-evidence-corrections--2026-11-01)
retains later scoped positives without promoting any original requirement.
A fresh `health-check.sh --status-only` reports OpenCode2.1.1, responding service,
required plugins, connected GitHub/Playwright and31 source skill directories;
it explicitly skips tests. This is not full integration, loaded-source identity,
model/GUI acceptance or validation of the untested memory/title corrections.

### Current inbox retirement and decision memory — 2026-10-31

The latest user decision removes the custom inbox/mailbox feature, superseding
older feature-retention and inbox-acceptance descriptions below. Canonical
[project configuration](../opencode.json) no longer selects its package; retired
server/TUI entrypoints now refuse before touching context or registering any
tool/RPC/event/hook/UI/state/network access. Existing stored history
is preserved, not deleted or migrated. No location reload/shared restart was
issued; the subsequent read-only server observation is recorded below. The
[retirement configuration regression](../scripts/inbox-retirement.test.mjs)
checks the absent package and unchanged goal-engine/MCP/skill selections.
Agent results use native child-completion notifications, not mailbox polling or
peer traffic in the human prompt queue.
The [inbox-free guidance contracts](../scripts/inbox-guidance.test.mjs) and
adjacent source suites pass83parent-run checks; the retired package passes
161tests and strict/library types after reconciling six old instruction
expectations without dropping their safety boundaries. Source tests are not
live model behavior or visible client cleanup.

The existing [memory tool](../.opencode/plugins/memory/README.md) already supports
decision-kind scoped search, preview/apply revisions and exact readback. The
current [inbox decision](memory/agent-inbox.md) and
[chat orchestration decision](memory/orchestration-method.md) were actually
saved/read back through that tool; [the compact index](../MEMORY.md) puts current
choices before older defaults. Selective recall is now routed in
[AGENTS.md](../AGENTS.md), with a regression in
[repository-memory contracts](../scripts/repo-memory.test.mjs). The portable
decision-capture workflow is now specified in the
[task-memory skill](../.opencode/skills/task-memory/SKILL.md) and protected by
[decision-memory source contracts](../scripts/decision-memory-contract.test.mjs).
One [fresh actual decision-recall observation](codex-parity/memory-import-readiness.md#actual-durable-decision-recall--2026-10-31)
now has parent-audited native search/note/source records and a correct current/
superseded/inert-history/no-authority answer. Missing mandatory protocol read and
reporting/procedure failures remain; this is not general model compliance.

**Untested decision-context retrieval correction — 2026-10-31:** a matching
decision note with an explicitly labelled leading `Current decision` paragraph
now keeps that authored context before its best distinct query excerpt, within
the same two-snippet/700-byte-per-snippet source limits. Previously matching-only
selection could show history or a title without that nonmatching current context.
BM25 scoring/order, schemas, stored notes, permissions and scan/response caps are
unchanged in source. The label remains untrusted and does not prove freshness or
approval. No test, live search, model session or deployment was invoked; general
recall acceptance stays open. See the
[memory-tool limits](../.opencode/plugins/memory/README.md#retrieval-and-safety-limits).

**Untested memory permission-boundary correction — 2026-10-31:** the memory
adapter now follows the pinned single-input Promise assertion API, checks abort
before authorization-cache reuse and after awaited assertions, and applies those
checks to its explicit-global boundary cache. It does not change rules, resources,
scope or native denial propagation, and cannot preempt a pending native prompt.
Further untested guards recheck terminal exact/scan results and skip-classification
boundaries before returning data or issuing a preview token, without masking a
committed write through a blanket post-write abort check.
No memory/permission operation, global-store access, tests or model trial ran.
See the [owning boundary](../.opencode/plugins/memory/README.md#permission-cancellation-boundary--untested-source-correction).

**Untested memory scan-accounting correction — 2026-11-01:** list/search source
now reserves the payload limit plus a growth-probe byte before each read, retains
the full allowance on failure and refunds known-unused allowance only on success.
The shared 512 KiB cap and 64-candidate/8 KiB-note/256-entry/32 KiB-response limits
are not increased; near the byte cap a note may be skipped to preserve probe room.
Coverage keeps successful-read `bytes` and adds `chargedBytes` and
`failedReadChargeBytes`; failed charges are conservative allowances, not measured
I/O. An initial candidate allowance fixes the false file-limit truncation after
exactly 64 candidates; existing directory truncation is retained. No tests,
typechecks, live memory calls, global-store operations or model trials validate
the change. Permissions, stored notes and preview/write paths are unchanged. See
the [accounting contract](../.opencode/plugins/memory/README.md#scan-accounting--untested-source-correction).

**Untested early memory read validation — 2026-11-01:** source now checks
list/search/read arguments before session/store discovery, permissions or note
reads, including whitespace-only queries that the tool's length schema permits.
The source lexical follow-up also rejects tokenless punctuation/emoji/mark-only requests
before that work using the ranker's existing Unicode tokenizer and error; its
defensive ranking check remains. This follow-up is likewise **untested**.
The checked values are reused; invalid argument errors occur earlier, while valid
defaults, ranking, scopes, caps and permission/write boundaries are unchanged.
No tests, types, live memory/global-store or model operations validate this change.
See the [owning contract](../.opencode/plugins/memory/README.md#read-argument-validation--untested-source-correction).

**Direct verification update — 2026-11-02:** the user's later instruction makes
the assistant responsible for necessary checks and supersedes the earlier
no-more-tests restriction, while retaining solo/no-delegation and separate
consequential gates. All38current memory tests and seven-root strict/library
checking pass; five isolated fault controls fail at intended assertions. Actual
repository decision preview/apply/readback/search now returns this supersession.
This updates only the covered source/operation acceptance above, not general
fresh-chat/model, real global or native permission outcomes. The
[direct record](direct-verification-2026-11-02.json) also separates actual current
Calculator pointer/text/key7+5→12success from preserved expiry/focus/default-click
failures. No deployment, source guard relaxation or independent-integration result
is inferred or adopted.

**Owned sample-window acceptance — 2026-11-02:** physical wheel scrolling and
scrollbar dragging visibly move generated sample text. Fresh exact-window
preview/apply/readback moves and restores only that window; window-only captures
verify its content and size, not global coordinates. Advertised close, automatic
launcher completion, app/window absence and input release are verified. Terminal
and Zed geometry and the sample bytes remain unchanged. The initial launcher
timeout/stale refusals are retained, not hidden. See the [scoped GUI record](desktop-scroll-placement-verification-2026-11-02.json).
This is not browser isolation, clipboard, native cancellation/rollback, complete
voice/selector, original-image or whole-host acceptance; no peer source is changed.

**Terminal clipboard source verification — 2026-11-02:** the canonical
`/copy_session_id` alias and native `session.copy.id` dispatch, error handling and
clipboard disposal ownership are traced. Six new injected-sink cases pass across
the corrected runs; five exact source faults fail their intended assertions.
Terminal `attempted` still means local dispatch, not confirmed delivery; no real
clipboard, GUI, production/native code or default CI is changed. The
[explicit source verifier](../tools/opencode-native-row/clipboard-dispatch.test.mjs)
needs the native checkout and parser, not a live app. See the
[source results, initial fixture failure and limits](terminal-clipboard-verification-2026-11-02.json).

**Zero-duration click contract — 2026-11-02:** canonical dispatch/cleanup and
version-matched Mutter50.1/GTK4.22.4source are inspected. No minimum hold or
production cleanup defect is evidenced; void queued notifications are not an
application-delivery acknowledgement. Three new [fake-boundary tests](../tools/gnome-window-control/input-zero-duration.test.mjs)
pass and three exact source faults fail intended assertions, now required offline.
No default delay, production/deployed source or actual GUI is changed or replayed.
The historical0msno-effect cause remains unknown, not fixed; see the
[specific investigation and limits](desktop-zero-duration-click-verification-2026-11-02.json).

**Current inbox/memory runtime observation — 2026-11-02:** fresh exact-location
registration shows memory/goal plugins active and no retired coordination entry.
The inert room/lock byte fingerprints, inodes and mtime still match their recorded
baseline; no stored message text is exposed or copied. Actual historical-term
memory search returns the current removal decision before the superseded mailbox
choice. One overly broad no-match probe legitimately matches `acceptance`; a
changed single-token query returns no hits, disclosing one skipped note. This is
not exhaustive recall, a new model/fresh-primary evaluation, loaded-byte/every-TUI
proof or all original-history preservation. See the [scoped native observations](inbox-memory-runtime-verification-2026-11-02.json).

**Memory native-permission preparation — 2026-11-02:** the explicit
[owned-host runner](../.opencode/plugins/memory/acceptance/native-host.mjs) and
[native probe](../.opencode/plugins/memory/acceptance/native-probe.mjs) use a
byte-copied production plugin, fresh data and deny/ask/reject-only test decisions.
The11[helper tests](../.opencode/plugins/memory/acceptance/native-host.test.mjs)
and four source fault controls pass; a real shutdown-classification regression is
fixed. Only helper tests are required offline. The actual host attempt is refused
before spawning at2646.5MiBavailable below2816MiB; native permission/cancellation
is still unverified. No operator grants, model, shared restart, lowered guards or
unchanged retry follows. See the [retained refusal and limits](memory-native-permission-verification-2026-11-02.json).

Subsequent exact-location native plugin inventory omits
`computer-use.session-coordination` while retaining the memory, goal-docs and
enhanced goal plugins; health passes. This is observed server-plugin removal,
without this parent issuing a reload/restart, not proof that every existing TUI
has dismissed old dialogs. Actual TUI palette/dialog removal remains unverified:
the subsequent exact-own-window capture failed `NameHasNoOwner` before any keys.

**Desktop prerequisite correction:** on2026-10-31 the parent independently called
the supported read-only compositor inventory: the approved bridge is now
available/ok and unlocked, with two existing windows. Older `NameHasNoOwner`
reports below remain historical for window inventory; the capture endpoint still
failed `NameHasNoOwner` on the parent's later call, so bridge availability is
capability-specific. The D1 worker's
extra live Calculator input/capture and tone exceeded its read-only scope; those
unaccepted actions do not establish authorized GUI/audio/human acceptance. The
separate offline-only pointer correction is now parent-accepted after catching
and repairing cancellation/cleanup races:35input/85GNOME/149plugin/21Python/
6deployer checks pass, plus assertion-specific stale-callback negative controls.
See the [owning verification](../tools/gnome-window-control/README.md#verification).
No deployment/reload or actual first-click success is claimed; the capture
endpoint blocker is separate and remains unresolved.

### Local deployment checkpoint — 2026-10-29

The user-authorized [deployment record](deployments/2026-10-29-goal-plugin.md)
now distinguishes the running enhanced goal plugin from source-only readiness.
The live profile loads `/home/james/repos/opencode-goal-plugin/server.js` and
exposes `/yolo`, `/goal`, pause/resume, and location-scoped settings RPCs.
The plugin-only merge preserves all non-plugin live settings; it does not apply
the differing model/permission template. Goal-docs recognizes the explicitly
declared local enhanced v3 contract without pretending its package is release
0.1.67. Ready command updates and the two pending GNOME files are deployed with
backups; desktop refresh and unfinished optional integrations are not activated.
Skills already reference canonical source. Peer prompt-queue clutter is a
separate user-requested remediation still in progress, not a passed inbox test.

[`deploy-goal-plugin.py`](../scripts/deploy-goal-plugin.py) and
[`test_deploy_goal_plugin.py`](../scripts/test_deploy_goal_plugin.py) provide the
preview-first, plugin-only JSONC merge and real-file preservation/stale-write/
special-file regressions. It reuses the existing bounded configuration transaction
for backup, locking, CAS, atomic replacement and rollback receipts.

### Chat-input repair — 2026-10-29

The active peer inbox hook rejected its configured state path under the
ACL-shared `tools/` tree with `unsafe coordination directory`, stopping model
request preparation. The project configuration now uses the ignored, owner-only
`.session-coordination/` directory directly under this worktree. The old path
reproduced the rejection; the new path passed the same store read. Shared tool
permissions and existing chats were preserved. The restarted service and required
plugins responded to health checks. A separate live inbox RPC probe failed its
existing pattern-schema validator before dispatch; it does not invalidate the
store-path check or establish a successful model answer. Peer delivery and
model-answer acceptance remain unverified.

**Later containment and live check:** the deployment chat removed the automatic
model-context hook entirely, rather than treating a path change as sufficient
protection. A regression executes actual plugin setup with unsafe storage and
verifies no prompt/context/generate hook is registered. Explicit inbox reads
still refuse unsafe storage. Native RPC schemas now compile under the installed
Effect validator as well as AJV, retaining policy invariants without unsupported
conditional/pattern syntax; tool/RPC results omit optional `undefined` fields
before native JSON validation. The live tool now posts, reads, acknowledges and
records mailbox-only delivery correctly. All three requested peers replied into
that mailbox. A later status notice left the voice chat idle and its native queue
empty. Stored does not mean received into agent context, notified, resumed or
accepted: normal coordination/model resumption uses explicitly authorized native
steering, and the mailbox is optional bookkeeping. At that checkpoint, coordination:
**132/132**, strict/library typecheck passes. Activation preflight now also checks
existing ancestors, accepts the explicitly selected ignored root-private path
and reports the actual entry present without writes. Visible optional inbox/settings
dialogs remain unverified; the user's unsent draft was left untouched.

The later skills-chat write report was traced to five actual calls missing
required `op`, not rejection of valid posts. Explicit `op: "post"` works live;
source diagnostics now explain the omission without inferring a write. The
regression checks zero effects for malformed calls and successful explicit posts.
The improved diagnostic is source-verified, not claimed loaded in every session.

**2026-10-30 read-only runtime follow-up:** the exact canonical coordination entry
is active, not merely declared. The current caller's settings and inbox RPCs
return inherited inbox-only/no-idle-wake policy and reconstruct four existing
unread messages through real cursor pagination. Four malformed-ID read calls
refuse with generic HTTP500 errors; this does not expose their internal refusal
stage or prove native permission denial. Final sampled ACK/receipt/policy values
and config/source identities are unchanged. The
[acceptance record](../tools/session-coordination/ACCEPTANCE.md) preserves redacted
metadata/commands/hashes without message bodies. No new write/deliver/ACK/wake/
activation/restart ran; advertised TUI parts are not visible dialog acceptance.

A subsequent source fix gives all-final admitted/mailbox combinations an explicit
`mixed` result and counts every receipt state, without letting pending/unknown
outcomes look final. Two regressions failed before the fix; **134/134** package
tests and strict/library checking now pass. The earlier live read receipt predates
this presenter change; no actual mixed native-delivery result or client reload is
claimed.

**Current-goal acceptance preparation:** exact-location native reads confirm the
canonical active coordination entry and unchanged inherited revision0 policy.
All four current DeepSeek workers are actual children of this parent, terminal/
released; seven recorded watches are stopped. These are not standing live-test
participants or proof of descendant quiescence. The
[remaining matrix](../tools/session-coordination/ACCEPTANCE.md#current-goal-read-only-acceptance-preflight--2026-10-30)
keeps native rows/full bodies, visible inbox/settings, Off/steer/idle wake,
mixed/unknown receipts, restart and model outcomes separate. Parent source
acceptance is now138coordination tests and45method-guidance contracts, not loaded
fix/enforcement. No policy/write/wake/activation/restart ran for this preparation.

A later real DeepSeek-child observation reproduced a body-visibility defect:
direct native `read`/`inbox` return only120-character previews, despite full
structured output in source. Parent checked the three persisted native tool
records and recorded executed model; the child did not infer or ACK unseen text.
An additive bounded full-body read correction now passes147package tests and
strict library types, with existing output/storage/security caps unchanged.
Parent also corrected misleading suffix completeness and skipped summary records.
The new `message` operation became callable without a parent activation/reload
command. Parent independently audited six executed DeepSeek native tool records:
two contiguous chunks expose all745characters of the same original notice, then
an exact seen-only ACK yields0unread. This is actual bounded model/tool content
acceptance, not GUI/policy/restart-matrix completion or an every-client hash claim.
The parent posted one harmless synthetic notice for this model trial, not a
no-model inbox fixture; no delivery/policy change or shared restart occurred.

### Canonical consolidation checkpoint — 2026-10-29

Native bridge source checks now have their own canonical, authenticated declaration
tree and explicit [runtime-fixture/surface commands](../tools/opencode-native-row/session-active.md).
The actual `test:runtime` command passes **4/4**; it is not loaded host/UI evidence.
Fresh official native-compiler source/library controls pass, but two stronger-floor
memory preflights refused before spawning a full-host compiler. No new full-host
result or passing complete package command is claimed; prior failures remain.

Later direct-CLI [tiny negative controls](../tools/opencode-native-row/session-active.md#unfinished-negative-controls-completed--2026-10-30-utc)
now demonstrate exact source TS2322 and declaration TS2304 diagnostics under the
unchanged512MiB guard. The first harness falsely expected classic tsc exit2 and
failed; pinned native7.0.2 actually returned1. The original failure is retained,
and the new library-only check accepts exact1 plus exact diagnostics, not arbitrary
nonzero output. Durable source/receipt snapshots preserve both. No accepted positive
or full-host compiler/build was rerun; host/loaded acceptance remains unfinished.

The later fresh [current-tree host route](../tools/opencode-native-row/session-active.md#fresh-current-tree-route-and-actual1536mib-full-cli-result--2026-10-30-utc)
preserves all8601native entries and verifies actual original/mirror API graphs and
both CLI lists at2827files/four overlays/2823identical entries. The added existing
buffer6.0.3 declaration stays included; the stale2826assertion failure is retained.
One previously unrun full direct-CLI check then hit its **unchanged1536MiB RSS
guard at1537.801MiB after70.874s**, with no diagnostic output. Exact source/receipt
snapshots are preserved. This is real graph reconstruction plus a resource failure,
not a full typecheck, selector build, benchmark or loaded-client pass; no retry or
guard relaxation followed.

Later actual canonical native-host trials loaded all 2,826 sources/four overlays,
but hit their 1,280 and 1,536 MiB RSS caps at 48.362 and 50.805582 seconds before
global/semantic completion. Earlier no-spawn refusals remain separate history.
Neither is a full-host pass; the latter output was recovered from completed
native tool history after the reported restart, not from its missing scratch
receipt. See the [restart checkpoint](codex-parity/main-consolidation.md#restart-checkpoint-and-recovered-1536-mib-outcome).
The [delivery audit](codex-parity/open-gates.md) now maps all eight completion
criteria to artifacts/evidence layers; fulfilled source-preparation tasks are
closed separately from the still-required native/model/live/human outcomes.

The isolated benchmark's [receipt writer](../tools/computer-use-browser/benchmark-runtime/receipt.ts)
now serializes hook/idle publication and stops after I/O failure instead of
overwriting newer evidence through concurrent saves. Two regressions failed
before correction; fresh strict/library checking and **39 benchmark/dependency
cases** pass, including execution of the staged helper. Fresh health passes
(31 source skills observed), not model/browser benchmark or native UI acceptance.
The original source-closure counts below remain their dated scopes.

Nine peer-reported browser/capture, launcher/relogin and connector defects now
have source corrections and independent offline checks; see the
[review-fix checkpoint](codex-parity/main-consolidation.md#peer-review-source-fix-acceptance).
Password-only restrictions reach local/framed workers; cross-session capture
and uncertain fills stay protected without time-based expiry; confirmed close
clears only its own flags. Launchers retain required display/selected gh-store
context without unrelated secrets, failed atomic arming prevents logout, and
deleted sessions cannot dispatch old queued chat. Browser51+benchmark39, plugin149,
connector121 and launcher/hygiene14 cases pass; browser/connector strict checks
pass. These are distinct overlapping scopes, not a combined outcome count.
No real credentials, provider, browser, logout, deployment or activation ran.

A separate [native response-observation producer](../tools/opencode-native-row/provider-observation.md)
now has six genuine unpatched failures followed by33/33 actual native protocol
cases passing with injected HTTP/SSE. It retains bounded final-response model/
effort only, never infers execution-effective settings from variants, and does
not alter the accepted base row or active bridge. The additive native-row consumer
now passes82/82 actual helper/production-renderer cases after45/47 new cases fail
without its source changes. Parent regressions corrected safe-identifier and message
provenance gaps;44/120-column wrapping, long fields and navigation are exercised.
The final package entrypoint verifies both patch hashes and upstream preservation.
A complete AI-package semantic check finished all six diagnostic groups for1,268
files but **failed on six Bun/gaxios declaration errors**; its second config did
not run. No strict/full-host pass, real provider report or loaded UI follows.
See the guide for compiler-identity/context corrections and exact guarded receipts;
no service/profile was activated for these tests.

The separate [declaration compatibility preparation](../tools/opencode-native-row/declaration-compatibility.md)
now backports a published gaxios callable-contract correction into a two-file patch
artifact and explicitly selects authentic Node26 declarations. Meaningful controls
retain parameter/return/library failures. Its complete AI **source** config passes
all six diagnostic groups for218 roots/1,329 files. The initial combined command
failed on type-config heap exhaustion and later no-spawn guards. Subsequent scoped
type checking passes all35 roots/1,334 files across four complete-program shards
after relocating three existing test expectations without changing invalid inputs.
Valid-input mutations produce exactly three unused-expectation errors. All-file
readback binds both separately observed compatibility graphs. Original locked
dependencies remain unchanged and still fail six errors; no unchanged-lock,
combined-all, full-host or runtime pass is claimed. No dependency tree was patched.

Post-restart native discovery reports canonical GitHub/Playwright connected and
the desktop, goal-docs and goal-mode server plugins active at their recorded
source/package locations. This does not verify exact loaded bytes or model/UI
behavior. `/handoff_resume` was listed; `/checkout` was absent from that earlier
11-command catalog. Later canonical read-only discovery (2026-10-29) lists 13
commands including `/checkout`; exact loaded template bytes remain unverified.
The profile candidate is currently stale (4,837 bytes vs canonical 5,794), so
name discovery does not prove the current template. The first actual preflight
with unverified strategy evidence refused creation; a later reviewed strategy/
environment audit reached exit0/`ready: true`, still without creating a worktree.
See [checkout readiness](codex-parity/checkout-readiness.md) for the distinct
receipts and native Git execution-effect gate. No command was invoked or worktree
created for these observations. Deployment remains separately gated; the source
changes are not deployed. PR4
still returned the distinct lockdown refusal; no permission was changed.

The [coverage auditor](../scripts/request-coverage-audit.mjs) now reads through
short kernel reads, checks opened/readback identities, and revalidates the archive
read set. Moving generations block lineage acceptance instead of being mistaken
for stable corruption or certified from mixed reads. Persistent corruption still
fails; no generated file is repaired. These are sampled read-only checks, not an
atomic snapshot, fresh native-goal query or completed delivery.
The shared16MB acquisition guard is now enforced before payload reads, with the
same2MB per-file ceiling, held-size completion and conservative failed-read
charging. The actual corrected audit acquires5,680,599bytes and still fails the
unchanged483fplan mismatch; source75-ID coverage is not all-lane/live acceptance.
The owning regression suite is now required offline CI, including its`mkfifo`
prerequisite. See the [qualified result](goal-archive-audit.md#shared-acquisition-correction--2026-10-31).

The [checkout preflight](../scripts/checkout-preflight.mjs) now explicitly
suppresses porcelain diff's stat-only index refresh with the process-local
`diff.autoRefreshIndex=false`option. A new real-Git stale-stat regression first
fails despite optional-lock suppression, then passes; removing the new option
only in scratch reproduces the failure. This does not change saved config or
relax execution/resource guards. The [owning readiness note](codex-parity/checkout-readiness.md#raw-index-refresh-correction--2026-10-31)
keeps the earlier model-fixture index mutation unattributed, and native source,
deployment and actual creation acceptance separate.

**Unprompted-startup observation — 2026-10-31:** a new actual Flash source-versus-
deployment task correctly leaves the fictional deployment unknown, with its exact
source command passing3/3. Parent verifies three unchanged inputs and complete
selected-child assistant pagination. No startup skill/search/reference reads
appear, and a historical-absence overstatement remains; no general startup or
overhead-improvement acceptance follows. The [owning memory record](codex-parity/memory-import-readiness.md#actual-task-without-a-startup-reminder--2026-10-31)
separates this narrow candidate outcome from instruction-delivery, provider/billing,
real runtime and human evidence. Six new offline evidence tests retain those limits.
The subsequent selected-child log investigation finds zero retained events despite
sync watermark38. Public API-managed entries/projected history are not equivalent
to the model's instruction baseline; delivery/cause remains unknown. No event
retention setting, database, runtime configuration or model was changed for this
read-only investigation.

**Later supported desktop observation:** bridge metadata and one exact-window
capture briefly succeed (2466x1664,594276bytes), showing this chat's blank composer
and an existing progress dialog. The next required fresh capture fails
`NameHasNoOwner`before any input. No old observation is reused; no keys/clicks,
clipboard, restart, activation or fallback occurs. Palette/inbox absence and
stable availability remain unverified. The [owning readiness record](session-consolidation-2026-10-29.md#new-goal-implementation-evidence--2026-10-31)
retains both outcomes; capture is not proof that the accepted pointer correction
is deployed or loaded.

**Deployment-documentation correction:** the GNOME guide now matches the actual
seven-file deployer set and shared runtime-contract override; the acceptance
runbook names the helper-specific window/app versus desktop-entry flags.
Parent independently passes14 source/fake-bus/doc-contract cases, including the
corrected unmanaged-file regression. These checks do not deploy, activate or
observe the bridge; the live acceptance limits above remain unchanged.

**Later direct session observation — 2026-10-31:** supported capture and keyboard
navigation now work in this chat. The actual Ctrl+P search for `inbox` shows
**No results found**; Escape closes it without a prompt submission. Six of seven
installed managed files match source, but `input.mjs` still differs, and the
pointer operation refuses `POINTER_CONSTRAINED`; release succeeds. No deployment,
activation or restart was performed. The existing image is reattached without
regeneration and its card renders, but original-viewer activation remains open.

**Connector source safety follow-up — 2026-10-31:** the custom connector now
uses pre-acquisition BYOB request limits and propagates actual MCP SDK cancellation
through its concrete local transport. All existing byte/deadline/authentication/
redirect guards remain. **173 package + two readiness cases pass**; the new
606-file strict/library check is **not accepted** (annotation error corrected,
then exit-monitor failure; final attempt refused by admission). Native Node 22
loopback reads below the cap pass, but exact-cap HTTP EOF can remain unconfirmed
until deadline/abort: the reader refuses without an extra-byte probe. See the
[owning source guide](../tools/chatgpt-connector/README.md#response-acquisition-and-cancellation--source-correction-2026-10-31).
No install, activation, real account call or deployed/loaded-byte acceptance is
implied; earlier image/GUI failures remain.

**Historical source-dependency follow-up:** coordination now has its own freshly
provisioned, lock-verified development tree (previously absent). All **109 tests**
and its genuine package-local strict/noEmit/library check pass without borrowed
dependency/type roots. OpenTUI's Node-engine warning remains; no native UI/FFI
or activation follows. Connector's missing JSON Schema declarations are now
installed only in their previously absent local directory from the exact public
SHA-512 tarball: **120 behavioral + two readiness cases pass**, and its full
603-file strict/library/checked-JavaScript graph passes locally under a 1.5 GiB
heap. The first 1 GiB-heap attempt failed with OOM and remains failed history.
No source manifest, lock, runtime profile or account was changed to obtain these
passes. Browser's later package-local closure adds only absent locked package
trees, preserving all 423 existing entries; its real `npm run check` now passes
both compiler stages, 46 browser and 35 benchmark/dependency cases. No borrowed
module root or existing-tree reinstall was used. Real isolated benchmark browser/
provider/root readiness and actual measurements remain unresolved.
Earlier failures and scratch-only compatibility evidence below are dated history,
not the current coordination/connector local dependency state.

Work is now reconciled on canonical `computer-use`/`main`; older package counts
below are dated checkpoints, not fresh acceptance of every merged file. See
[consolidation](codex-parity/main-consolidation.md) for exact ownership and limits.
Parent independently reran 120 connector tests (preserving all newer image work),
46 browser plus 35 benchmark/dependency cases, 42 runtime tests, 29 held-capture
logic/source cases, 27 fallback tests, 27 monitor tests and six native-row previews.
At the initial checkpoint coordination's selected batch passed 104/105; actual AJV validation failed because
the package-local `ajv` dependency is absent. No failure was skipped or shimmed.
Runtime strict/library and base browser typechecks pass. Benchmark checking fails
for missing local SDK declarations. Connector direct strict checking fails for
missing JSON Schema types; the full unchanged source graph passes with authentic
SHA-512-verified declarations mapped only in scratch. Its readiness suite retains
that local-dependency failure and a passing broken-library negative control.

The old delivery tree is fully archived outside the checkout, including caches,
dependencies and divergent goal exports; all 102,815 files and 114 symlinks passed
a full restore/hash/mode/link comparison. Preservation is not source integration:
remaining shared guides, coverage fingerprints and conflict dispositions still
precede removal. No real config apply or runtime activation was performed by this
consolidation; earlier pilot account/UI observations below remain separate history.

The subsequent preflight/guide reconciliation passes 30 runtime/GNOME preflight
and 151 broad script cases independently. The seven operative guides now retain
their dated originals behind canonical-status notes; two larger history reports
have hash-qualified archive locators. Final removal is still deferred: a running
old-location GitHub MCP process retains the delivery cwd. No process/connection
or shared service was stopped. Retained canonical live acceptance harnesses now
default to exact-target capture only. Release/refusal/selected-launch or owned
daemon suspension require explicit effect selection; failed baseline validation
prevents effects. The [runbook](codex-parity/acceptance-runbook.md) documents flags
and authority. Actual-harness/caller offline tests replace process I/O only.
The final combined plugin suite passes **143/143** and fresh health passes;
native/live approval, full private-Shell isolation and user-seat outcomes remain
separate. No global process lookup, environment scraping or user-process signal
is part of these checks.

## What this repository adds beyond base OpenCode v2

> **In plain language:** OpenCode v2 already provides the coding-agent engine
> and extension points. This checkout adds an opinionated GNOME/Linux computer-use
> layer, curated reusable instructions, concrete MCP launch/configuration, and
> local setup, maintenance, and session/goal-document helpers. It extends
> OpenCode; it does not reimplement its native agent or session runtime.

| Area | Base OpenCode v2 already provides | This repository adds |
| --- | --- | --- |
| Agent and coding workflow | Sessions and TUI navigation ([TUI](https://opencode.ai/v2/docs/cli/tui/)); built-in/custom agents ([agents](https://opencode.ai/v2/docs/agents/)); model and reasoning-effort/variant selection ([models](https://opencode.ai/v2/docs/models/)); coding tools and permission rules ([tools](https://opencode.ai/v2/docs/tools/), [permissions](https://opencode.ai/v2/docs/permissions/)). | Opinionated machine/project config examples and model/setup helpers ([global config](../global/opencode.jsonc), [model setup](../scripts/setup-model.sh)); no replacement agent, model selector, or permission engine. |
| Extensibility and instructions | Configurable MCP servers, skill discovery/loading, commands, and plugin loading ([config](https://opencode.ai/v2/docs/config/), [MCP](https://opencode.ai/v2/docs/mcp-servers/), [skills](https://opencode.ai/v2/docs/skills/), [commands](https://opencode.ai/v2/docs/commands/), [plugins](https://opencode.ai/v2/docs/plugins/)). | A curated set of local skill bundles and project guidance, command templates, and config presets ([skill catalog](../.opencode/skills/README.md), [commands](../global/commands/), [global config](../global/opencode.jsonc)). These are repository content using OpenCode's native loaders, not new loader mechanisms. |
| MCP integrations | OpenCode's MCP client connects to configured servers and exposes their tools/resources/prompts; it does not make any particular third-party server part of this checkout ([MCP guide](https://opencode.ai/v2/docs/mcp-servers/)). | Project declarations, pinned versions, and launch wrappers for GitHub and Playwright ([project config](../opencode.json), [pins](../config/mcp-versions.json), [GitHub launcher](../scripts/github-mcp.sh), [Playwright launcher](../scripts/playwright-mcp.sh)). The actual MCP servers and their tools are external dependencies, not implementations authored here. A separately authored [browser backend](../tools/computer-use-browser/) is not an MCP server; it is exposed through this repository's own `web` tools rather than through MCP. |
| [Browser backend package](../tools/computer-use-browser/) ([README](../tools/computer-use-browser/README.md)) | Authored, session-isolated Playwright backend: one worker per session, dedicated `0700` profiles, opaque tab ids, snapshot-generation-bound element refs, child environment allowlist of six base variables plus display/bus addresses, sandboxed browser with TLS validation. | Typecheck plus 42 fake-boundary tests pass, including a privileged credential-fill path that requires the auth-flow capability and refuses stale, detached or cross-origin form targets. Exposed through the `web` tool namespace (open, tabs, navigate, snapshot, act, screenshot, signin, close); the private-sign-in guard is injected by the plugin and shared by the tools and the browser manager, and `web.signin` is the entry point that opens the local dialog and fills one field. Downloads remain unsupported and uploads lack a path allowlist. Sandboxing stays on: when the bundled Chromium cannot sandbox here, the worker uses installed Google Chrome, whose setuid helper exists, so **no system change is required** and the sandbox is never dropped. Verified live at tool level from a fresh process — page open, 8-ref snapshot, inline 175 KB PNG screenshot, cross-session tab refusal, third-worker refusal, separate `0700` profiles — and verified in a live session too: `web.open`, a 1,283-byte 8-ref snapshot, an inline screenshot that actually reached the model through Code Mode, and a clean close. The fix that made this work was child stdio — the worker now owns a drained stderr pipe instead of inheriting the service's, whose reader could be gone and killed the worker just after it reported ready. Distinct from both OpenCode's native browser and the external Playwright MCP launcher, which uses Firefox. |
| Desktop and windows | OpenCode's plugin API can add tools; the v2 docs describe the extension mechanism ([plugin guide](https://opencode.ai/v2/docs/build/plugins/)), not this checkout's GNOME adapter. | Typed GNOME AT-SPI inspection/actions in the [computer-use plugin](../.opencode/plugins/computer-use/) and [Python bridge](../scripts/desktop-control.py), plus the optional [GNOME Shell window bridge](../tools/gnome-window-control/). These are OS-specific integrations, not a claim that no other OpenCode extension can do computer use. |
| Goal/session conveniences | OpenCode supplies sessions, agents, a plan agent, and an experimental todo tool ([agents](https://opencode.ai/v2/docs/agents/), [configuration and experimental features](https://opencode.ai/v2/docs/config/#experimental)). The goal-state package selected by this project is a separate dependency, not code authored in this checkout ([project config](../opencode.json)). | The local [goal-docs companion](../.opencode/plugins/goal-docs/) exports selected goal state and requests source-authored chat handoffs, with worker naming and per-chat palette controls; [copy-session-id](../.opencode/plugins/copy-session-id/tui.js) adds a shortcut around OpenCode's native session-copy action. The companion does not replace the goal substrate or migrate/activate goals. |
| Setup and operations | OpenCode has its own config, CLI, and runtime behavior. | Repository-specific onboarding/config deployment, health, backup/maintenance, and demo helpers ([setup guide](../setup.md), [script inventory below](#script-inventory), [demo guide](demo/README.md)). They remain subject to the prerequisites and acceptance limits recorded below. |

This comparison is bounded to this checkout and the linked official v2 docs:
the absence of a capability from a docs page is not proof that no upstream or
third-party implementation exists. “Repository adds” means implementation or
configuration source found here, not global uniqueness, deployment, runtime
discovery, or live acceptance.

## Reading the status labels

- **Source present** means the file is in this checkout; some current files are
  untracked and therefore are not part of a published revision.
- **Configured in source** means a tracked config declares a feature, not that a
  running OpenCode process loaded it.
- **Observed** means a dated local record reports a specific machine/session
  checkpoint. It is not a portable guarantee.
- **Unverified** means no current live acceptance is established here.
- **Held / blocked** means an explicit deferral or missing prerequisite prevents
  the feature from being treated as usable.

## Configuration, setup and commands

Consolidated source helpers and their distinct fixture suites:

- [Checkout preflight](../scripts/checkout-preflight.mjs) and
  [tests](../scripts/checkout-preflight.test.mjs): read-only source/destination
  checks, bounded Git/JSON acquisition and deadlines, with local hook/filter/
  include/fsmonitor/config guards before status/diff and recursive indexed-gitlink
  review. Native-service Git environment/strategy evidence is still separate;
  these source checks do not establish safe native worktree creation.
  Required offline CI now runs both checkout suites. A real private-info-attributes
  fixture confirms filter selection without a root`.gitattributes`; the existing
  guard refuses before status/diff. The canonical prompt now requires private,
  nested/index and default global/system attribute-source review. Fixture setup
  also strips inherited`GIT_*`config after a reproduced synthetic hook execution.
  Neither source correction deploys the prompt or clears native creation.
  A subsequent native-context read-only query covers all214paths of the captured
  committed tree, finding no filter selections with sampled default/private
  attribute files absent before/after. Two isolated controls verify exact-commit
  and default/private-source behavior; neither initializes a submodule or creates
  a checkout. The plugin-review return has70independently matched file identities,
  but incomplete imports and an oversized loaded target prevent full strategy
  selection acceptance. See the owning readiness record for exact scope/failures.
- [Preservation auditor](../scripts/delivery-preservation.py) and
  [tests](../scripts/delivery-preservation.test.py): bounded read-only Git/archive
  comparisons, not a replacement for the complete old-tree backup above.
- [Demo preflight](../scripts/demo-preflight.py) and
  [tests](../scripts/demo-preflight-test.py): bounded synthetic media/geometry
  verification, not recording authority or genuine simultaneous-demo acceptance.
- [Memory/import readiness](../scripts/memory-import-readiness.mjs) and
  [tests](../scripts/memory-import-readiness.test.mjs): synthetic scoped routing
  and import metadata checks, not real model/global-memory or runtime activation.
- [Config/CLI tests](../scripts/test_mcp_config.py),
  [transaction tests](../scripts/test_mcp_config_transaction.py) and
  [JSONC editor tests](../scripts/test_jsonc_config_edit.py) cover the selected-file
  helpers linked in the script inventory; real apply/restore remains separate.

| Source | What it contains | Status and limits |
| --- | --- | --- |
| [Project config](../opencode.json) | Local skills path, the external goal-plugin package, and project-local `github` and `playwright` MCP launchers. | Configured in source. It is portable project wiring, not a live-registration check. The local desktop plugin is discovered from `.opencode/plugins/`. |
| [Global OpenCode config](../global/opencode.jsonc) and [CLI config](../global/cli.json) | A machine-specific model/provider example, MCP declarations, agent permission rules, CLI presentation settings, and plugin package selection. | Source templates only. They contain machine-specific paths/settings and are not portable defaults. Review the target before any deployment; the effective config was not checked here. |
| [Global agents directory](../global/agents/) | Currently only a placeholder; there are no tracked global agent definitions. | Source present; no agent bundle is provided by this directory. |
| [MCP version pins](../config/mcp-versions.json) | Version/checksum policy used by parts of the MCP runtime helper. | Source present; a pin is not evidence that the corresponding binary/package is installed or used by the active config. |
| [Browser package manifest](../tools/browser/package.json) and [lockfile](../tools/browser/package-lock.json) | Pinned Playwright MCP dependency. | Source present; onboarding can install it with `--with-browser`. Dependency presence does not prove a browser workflow passed. |
| [Computer-use runtime contract](../tools/computer-use-runtime/) ([README](../tools/computer-use-runtime/README.md)) | Dependency-free shared layer for the Codex-parity surfaces: bounded limits, opaque identities, caller attribution, framing codec, per-owner queue, the private sign-in exclusion guard, and a secret-entry transport that spawns the dialog on inherited descriptor 3. | Source is present with 42 package-level test cases. It is imported by the GNOME bridge modules, the browser backend and the private-entry transport, so it is wired; wiring is not live acceptance, and no desktop, browser or credential flow has been exercised on this machine. The successful secret-entry buffer remains caller-visible after resolution; cleanup policy for future consumers is not yet standardized. |
| [Onboarding](../scripts/onboard.sh) and [setup guide](../setup.md) | Prerequisite checks, dry-run-first global deployment, optional model/browser selection, explicit default-off ChatGPT source setup, and optional web-search check. | Dry-run by default; `--apply` writes. ChatGPT requires `--with-chatgpt`; preflight failure stops before source-config/global deployment. No live search in preview unless `--search` is supplied. |
| [Global config deployer](../scripts/deploy-global-config.sh) | Validates and previews selected global config entries, then backs up and copies them with `--apply`. [Preservation regressions](../scripts/deploy-global-config.test.mjs) use only synthetic profiles. | Preview by default; unmanaged selected-directory entries and target aliases/nonregular files refuse before backup/writes. Only managed filenames are copied, never whole-directory deletion; late unmanaged arrivals survive and fail verification. Backup paths are created exclusively, never reused. No atomic transaction/automatic rollback or authority to retire stale/user-owned entries. |
| [Model setup](../scripts/setup-model.sh) and [JSONC helper](../scripts/jsonc_model.py) | Lists/selects a model and changes only the top-level model key, preserving nested agent selections. | Setup is dry-run by default; deployment/restart is separate. |

The [global command templates](../global/commands/) are five files: [`/checkout`](../global/commands/checkout.md), [`/deploy`](../global/commands/deploy.md), [`/document-code`](../global/commands/document-code.md), [`/handoff_resume`](../global/commands/handoff_resume.md), and [`/promote-skills`](../global/commands/promote-skills.md). They are source templates; presence alone does not register a slash command in every runtime profile. `/checkout` requests a new clean detached worktree at the source commit with an explicit approved destination, startup-effect checks and preservation readback; it does not switch branches, copy dirty work or move sessions. `/document-code` audits first-party source and its owning documentation, then presents both code-comment and documentation findings before making documentation-only edits. It adds explanatory comments and updates existing guides when verified contract gaps or drift warrant it; it does not change behavior or touch deployed copies. Its source presence is not proof of registration or a live model run. The project-local [`.opencode/commands/document-code.md`](../.opencode/commands/document-code.md) mirrors the reusable template for this checkout and is not copied by the config deployer, so the two prompts must be updated together. No deployment was performed.

The [checkout command contracts](../scripts/checkout-command.test.mjs) reject
missing startup-effect, destination, commit-pin, index-preservation, uncertain
admission and cleanup clauses, plus pre-permission shell expansion. They do not
establish that a model followed the prompt or that a checkout was created.
The latest [readiness follow-up](codex-parity/checkout-readiness.md#current-local-continuation--2026-10-30)
retains current metadata/key-only Git observations and corrects the old assumption
that missing root attributes imply unused system filters. Transitive selected-
strategy/attribute evidence and loaded-template/creation acceptance remain open.

The shared [autonomy contract](autonomous-work.md) says Build auto means no
agent-authored routine questions for authorized work, including routine Git.
It does not alter the selected mode, bypass native denials, or authorize scope
expansion or publication. Exact read-only GitHub exceptions are present in
source; their [runtime rollout is separate](github-read-permissions.md).

The canonical [orchestration guidance](../.opencode/skills/agent-orchestration/SKILL.md#delegated-startup)
now explicitly preserves each consumer's required child startup skill/reference/
memory reads without small/read-only/synthetic exemptions or invented stores.
Two source contracts first failed, then pass with portable guidance; they do not
install a startup hook or erase the [actual skipped-read failure](../evals/agent-rules/runs/2026-10-30-injection.md).
An explicitly reminded compiler child did load the required skills, references,
preferences and repo memory search in native records; this is supervised prompt
adherence, not proof that the later source edit was loaded or generally enforced.
Later [actual current-information routing](../evals/agent-rules/runs/2026-10-30-routing.md)
shows websearch/task-memory loads and official-source fetches in69native events;
the cited stable answer is supported. Broader compliance is still failed for two
missing required policy reads, an overstated untruncated-page claim and an
undisclosed ancillary date conflict. Generic adapter output and separate parent
review remain distinct; this is not human-gold, general routing enforcement or a
matched overhead/provider benchmark.
The separate [official-source comparison](../evals/agent-rules/runs/2026-10-30-conflict.md)
captures53actual events and correctly reports the date discrepancy/truncation
under a focused two-source task. Required-read omissions remain failed; this
different task does not erase the earlier failure or establish general compliance.

The [fictional authority case](../evals/agent-rules/runs/2026-10-30-authority.md)
retains73actual events and a byte-verified unpublished draft with deployment
blocked. Explicit patch-method and required-read violations keep broader
compliance failed. The raw patch-only mapping has zero actions; separate parent
review passes only the narrow draft/blocker candidate.21retained-evidence checks/
99package tests pass without changing human review, cases or controls.

The2026-10-31 parent review regrades all five retained summaries: five raw
semantic failures, five separately reviewed narrow passes, four explicit broader
failures and no broader-compliance block in the CLI summary. No raw automatic
pass, human review or remote-CI history is inferred. The new
[pre-read capture budget](../evals/agent-rules/src/capture-acquisition.mjs) and its
[11synthetic regressions](../evals/agent-rules/tests/capture-acquisition.test.mjs)
replace after-read chunk counting in the future memory-fixture capture with
shared BYOB reads under unchanged2MiB/120s bounds. A baseline-first mutation
fails at actual5versus4byte acquisition; no new model/live-feed capture ran and
wire/socket buffering is outside that client-read bound. Required offline CI now
includes this suite and a separate synthetic private-stage step; hosted execution
and real calibration remain separate.
Later [bounded assistant pagination](../evals/agent-rules/src/assistant-audit.mjs)
has9offline cases and required-CI registration. One additional
[actual synthetic ownership observation](../evals/agent-rules/runs/2026-10-31-ownership-native.json)
verifies registry inspection/refusal of a contested write through independent
3page/105746byte pagination(10assistant messages/19tools) and6unchanged fixture
files. It is a separately parent-reviewed narrow case pass, not a raw adapter or
general enforcement claim. An extra out-of-scope parent-index read and omitted
report entry keep broader compliance failed. No PR, inbox, live-peer resolution,
effective-provider, benchmark or human-review acceptance follows.
An additional [actual saved-versus-loaded model observation](../evals/agent-rules/runs/2026-10-31-saved-loaded-native.json)
performs the authorized synthetic config edit; parent verifies7other entries,
index/staged patch and unrelated work unchanged. The saved loaded-state snapshot
is not live runtime. A20-message audit ceiling refuses; targeted tail5records bind
readback/final report but not the edit call, so the partial semantic grade remains
failed. A later distinct descending2page/10record/40896byte window binds the actual
completed edit call and retained patch. Its separate
[parent-reviewed trace](../evals/agent-rules/runs/2026-10-31-saved-loaded-edit-window-reviewed-trace.json)
passes the narrow edit/inspect/report checks without replacing the failed partial
trace or claiming full pagination. Parent identity-envelope/cap-procedure limits
and broader shell-format failure remain explicit. Nine
[evidence regressions](../evals/agent-rules/tests/saved-loaded-evidence.test.mjs)
run in required offline CI, not a full model/activation/GUI/human pass.
The separate [fresh orchestration-decision recall](../evals/agent-rules/runs/2026-10-31-orchestration-recall-native.json)
uses one actual repo decision search and current-source checks. Parent audits
3pages/10unique assistant messages/15tools/147790bytes, including a terminal empty
page. Correct method/scope/authority recall is supported; broad scans, late
reference timing and incomplete read reporting keep procedure compliance failed.
[Evidence contracts](../evals/agent-rules/tests/orchestration-recall-evidence.test.mjs)
preserve that distinction. No loaded selector, current-chat choice, effective
provider, full live trace or general unprompted recall is inferred.
Actual [read-only hosted readiness](../evals/agent-rules/runs/2026-10-31-hosted-readiness.json)
on 2026-10-31 observes zero visible workflows/retained runs, remote main's`protected:false`
flag and no`.github`entry in its SHA-pinned10-entry root listing. This narrows the
earlier remote-state uncertainty; it does not prove no workflow ever ran or
inspect detailed organization/ruleset/reviewer policy. No PR, source import,
workflow trigger, publication or settings change occurred. Hosted enforcement
still lacks the separately authorized publication/settings/human layers. A
[2026-11-01 branch/workflow recheck](../evals/agent-rules/runs/2026-11-01-hosted-readiness.json)
again lists zero registered workflows and main's `protected:false`; local workflow
and runner remain untracked. It does not refresh root/run history or audit
detailed rulesets, required checks or reviewer permissions.
The additional [actual branch-preservation observation](../evals/agent-rules/runs/2026-10-31-branch-preservation-native.json)
checks a separate synthetic Git branch with no PR or inbox input. Parent observes
39/40files byte/mode-identical, correct dirty content/staged entries, but a changed
raw index hash. Its parent-reviewed outcome grade fails the write boundary; no
recorded model write or stat-cache-only cause is proven. Four assistant pages/
12messages/26tools are independently bound; unavailable child memory and broad
reporting limits remain open. Five new evidence checks are required offline CI,
not live-event, human/gold, deployment or general instruction acceptance.
The [actual model-metadata comparison](../evals/agent-rules/runs/2026-10-31-model-metadata-native.json)
correctly distinguishes a synthetic saved selection from the response record and
unknown provider execution. A separate false message-ID absence claim remains a
broader factual failure; the narrow parent-reviewed case pass is not full answer
or startup compliance. Two inputs remain byte/mode-identical;5messages/6tools are
independently bound. A new [metadata-only audit projection](../evals/agent-rules/src/assistant-audit-summary.mjs)
omits raw text/reasoning and tool bodies, preserves status/unknown/limit boundaries,
and is exercised on that actual pagination. It does not establish live events,
provider-effective identity, universal redaction or human/gold acceptance.

An [actual ownership observation](../tools/session-coordination/ACCEPTANCE.md#actual-ownership-visibility-failure--2026-10-30)
found a second model-visible seam: a live parent source claim exists, but the
recipient's native read content initially showed only zero messages, no owner/path.
The real child correctly reported unknown rather than unowned and did not write.
Corrected source adds visible independently paged claims and read-only exact path
chunks, with parent completeness/cursor/Unicode/budget regressions.31focused/
159full+strict library checks pass; the same actual child now observes exact owner/
path/fingerprint and still declines edit authority. Parent explicitly released
its temporary claim and read the released snapshot. Existing ownership mutators
and byte/permission limits remain; no loading cause or broad GUI/restart acceptance
is inferred, and no new deployment/security grant was made.

## Plugins and command surfaces

| Plugin source | What it adds | Status and limits |
| --- | --- | --- |
| [voice-assistant](../voice-assistant/) | Local CPU/offline speech in the existing OpenCode v2 TUI. **F9**/mic works in source on New session/existing chats: **manual recording stays on until the second press**, with no pause/idle/duration stop by default. Inactivity auto-off is a persisted explicit opt-in (off for legacy preferences); duration5–120s only applies when enabled and expiry drains/finalizes into review without sending. Separate hands-free pause/default1.5s remains. Compact themed review supports Enter/send, Shift+Enter or Q/durable native queue, Ctrl+Y/OSC52 copy with honest feedback, C/continue, E/in-place edit and Esc/discard; `/voice_recover` preserves displaced/uncertain requests without automatic resend. Two installed Piper voices and explicit preview; Plan-default explicit new-chat agent/model/location safety, no private composer editing. | Independent submodule. [Acceptance](../voice-assistant/ACCEPTANCE.md): **93 TypeScript +91 Python tests**, types/lint and whitespace pass. Long-worker regressions cover375seconds of speech/quiet/endpoints; isolated old-behavior mutations fail them. Installed offline smoke passes12phraseconditions, explicit/empty finish, opted-in idle/noise; paced34.647s manual input with20s initial silence and12s pause retains both segments and finishes at35.319s only after explicit stop. **native review interaction cases incl. queue/copy** pass across legacy/Kitty protocols using isolated vendor-verified Node26; narrow subtitle clipping repaired. Prior two-voice/service/host preservation evidence retained. **Owning-host F9/settings/picker/physical/human acceptance remains unverified:** capture works, input needs reviewed two-file bridge deployment and separately authorized GNOME refresh. No host executable/private API/security change, shared restart, saved audio, commit or push. Linux/PipeWire. |
| [computer-use](../.opencode/plugins/computer-use/) | Typed GNOME desktop tools (AT-SPI inspection, capture, compositor input, launch, window control), persistent `cua` handles and a session-isolated `web` browser surface. | Code Mode is the default; `directTools: true` restores direct exposure. [Later approved real acceptance](deployments/2026-11-01-personality-cua-activation.md#supported-accessibility-recovery-and-app-acceptance--2026-11-01) verifies capture/named and pointer actions, literal/capital/modifier typing, exact saved bytes, process-bound replacement refusal and cleanup, superseding the earlier `INPUT_FAILED` checkpoint. Source/private-Shell tests remain distinct from actual GUI proof. Browser tools use `web` because OpenCode reserves `browser`. |
| [goal-docs](../.opencode/plugins/goal-docs/) | Goal-document export; manual `/handoff` asks the current model to send a document link and continuation prompt to an independent chat. Identified workers have task-aware naming with internal lineage; a separately owned refinement targets concise task labels plus the actual full session ID. A normal-context policy requests handoff at new verified phase milestones or about 500k latest-step context tokens. Ctrl+P **Handoff settings** controls it per chat; OFF leaves native compaction and manual `/handoff` unchanged. | Source and behavioral/wiring fixtures are present; [scoped acceptance](handoff-automation/acceptance.md) distinguishes the actual independent receiver reading/processing this task from unverified live automatic-policy/visible-palette/OFF-compaction behavior, and records the naming ownership handover. Reviewer, child and unclassified identities are excluded; validated legacy root-handoff lineage is supported. Goals/limits/approvals are not transferred or activated. The inspected SDK 2.1.1 has a compaction model hook, but no verified safe pause/transfer-before-compaction control or native Open settings-page extension; this is a labeled palette dialog and approximate latest-step metric, not lifetime usage or a pre-compaction guarantee. |
| [copy-session-id](../.opencode/plugins/copy-session-id/tui.js) | Adds `/copy_session_id` in a session and dispatches OpenCode's native `session.copy.id` action. | Source-contract test exists; rendered plugin discovery and actual copy interaction are unverified. |
| [memory](../.opencode/plugins/memory/) | Repo-default and explicit-global Markdown notes with bounded ranked snippets/citations, permissions and preview/revision-guarded writes; durable current-topic decisions with explicit body supersession. | Retained 24 source tests plus 5 adjacent readiness checks and seven-module strict/library checking cover the JSON-kind boundary, not every loader/model outcome. On 2026-10-31 two actual repo decision previews/applies/readbacks and cited decision-kind search succeeded. Selective recall routing and 51 adjacent source contracts pass; fresh-chat model recall/global-store acceptance remain separate. Cooperative locking does not solve hostile pathname replacement. See [protocol](memory/README.md) and [maintenance policy](memory/maintenance-plan.md); archive/prune extensions remain proposed. |

**Later voice checkpoint (2026-10-30 UTC):** `/voice_read` enables the saved
all-active-chat assistant readout preference; `/voice_read_last` reads only the
latest eligible completed assistant message without enabling ongoing reading.
The latter follows history cursors under one deadline and cancels on worker
death/session change/stop/unload. Parent independently passes **109 TypeScript +
91 Python tests** and **20 offscreen native-renderer outcomes** across Kitty and
legacy keys, superseding the older voice count above. Copy reports an unconfirmed
OSC52 attempt, not guaranteed clipboard delivery. An authenticated read-only
current-session API/selector probe succeeds; loaded slash dispatch and actual
speech remain unverified. GNOME's two files are already deployed on disk; loaded
new input/physical acceptance still need separately authorized refresh/login.
Home has no public above-composer slot, so that placement requirement is not
declared complete. See [voice acceptance](../voice-assistant/ACCEPTANCE.md).

**Handoff read checkpoint (2026-10-30 UTC):** after the earlier masked read,
the canonical coordinator's location-scoped loaded RPC returns required
`configuredEnabled:true` and legacy effective `enabled:false`, unclassified,
revision0/no request. Configured means saved **or default**, not stored provenance;
effective is role/suspension-gated policy, not proof of execution. Source palette
selection/readback now distinguish both and refuse missing mixed-version fields;
explicit OFF still saves/readbacks even when already OFF. Decoder follow-up
rejects JSON role arrays without coercion before writes. Parent63focused/178full
source tests pass, but full strict library checks remain resource-incomplete under
unchanged limits. Read called no update/compaction; loading cause is unknown.
Visible Ctrl+P, installed-TUI decoding, selected-worker OFF persistence and actual
same-chat compaction/continuation remain unverified;
[receipts and limits](handoff-automation/acceptance.md#configured-versus-effective-policy--2026-10-30).

Ordinary active-goal root chats have a separate
[task-title controller](../.opencode/plugins/goal-docs/task-titles.ts): semantic
model-generated labels at task transitions, durable deduplication, full session-ID
suffixes and manual-rename rechecks. Child/fork/reviewer and handoff-lineage naming
remain separate. Successful native goal-mutation receipts also request refresh.
The [goal-usage rule](../.opencode/skills/goal-usage/SKILL.md#keep-the-session-name-aligned-with-meaningful-goal-changes)
now also requires the agent to review the visible name after meaningful successful
goal changes and use the supported rename tool if stale, rather than assume a
hook renamed it. Reads/errors/no-ops/bookkeeping alone do not rename. One explicit
user-requested rename succeeded on2026-11-01; the instruction update is not tested
automatic behavior or native CAS support, and the guarded controller is unchanged.

**Goal-tool receipt text bounds — source verified 2026-11-02:** the existing
[adapter](../.opencode/plugins/goal-docs/goal-tool-titles.ts) now budgets UTF-8
fragment bytes and separators before joining, within the unchanged 128-part and
2,000,000-byte limits. Output/state text is checked before normalization/regex
classification and text before JSON parsing. This is not a size audit of supplied
structured objects or native host acquisition. Eight new boundary tests and
two-root strict/library checking pass against unchanged production source. Five
earlier fault controls fail; an originally surviving sixth exposes a test gap,
now caught by overflow-last coverage without erasing that original outcome.
This is hook source acceptance, not loaded naming/full native types or manual-title
CAS. Tool selection and conditional/manual-title guards remain. See the
[owning boundary](../.opencode/plugins/goal-docs/README.md#goal-tool-receipts--allocation-bound-verification)
and [retained evidence](title-receipt-verification-2026-11-02.json).

The new read-only `computer-use.task-titles/status` RPC was observed loaded on
2026-10-30: coordinator eligible/not suspended, equal current/attempted task hashes
and matching recorded/current title. New records distinguish attempted/preserved/
generated/manual actions; legacy provenance remains unknown. The next genuine
goal-task transition generated and published **Voice Workflow Verification**,
with matching current/attempted hashes and native/recorded titles, no suspension
and no manual rename. That verifies one loaded semantic root transition, not all
child/manual/concurrency outcomes.
The native update API lacks title compare-and-swap, so the final read/write race
remains explicit; see the [controller boundaries](../.opencode/plugins/goal-docs/README.md#ordinary-root-goal-task-titles).
A parent in-memory counterexample now actually reproduces a human edit lost in
that window, while the generation-time control preserves the edit; no live title
was changed. Pinned native guarded title generation exists, but HTTP's empty-title
trigger and plugin-host update have different semantics. A safe guarded-path
integration is unverified, not an invented CAS API or a completed manual matrix.
The [guarded native source trial](session-consolidation-2026-10-29.md#guarded-native-title-source-test--2026-10-30)
now passes16isolated cases/61assertions, including a deterministic final-snapshot
human edit; its transaction-predicate removal control fails exactly at manual-title
preservation. Mocked models/in-memory SQLite and untouched pinned sources do not
establish current plugin transport, installed behavior or human acceptance.
The served2.1.1 schema now confirms no declared update precondition; standard
resolution's cached2.2.5client was only inspected, never imported or provisioned.
[Transport feasibility](session-consolidation-2026-10-29.md#guarded-bridge-feasibility-reconciliation--2026-10-30)
remains version/design gated, not proved impossible or intrinsically prohibited.
An [unapplied core-only title prototype](../tools/opencode-title-cas/README.md)
now has narrowly accepted source proof under `tools/opencode-title-cas/`, not an
installed fix. Parent corrections pass11runner tests and9real SQLite/Bus tests;
removing only the guard fails at the actual manual-title assertion. Earlier unsafe
runner/import/race-proof failures remain recorded. No native source or current
plugin was changed; type/public API/client/activation work remains gated. Expected-
title equality alone intentionally does not protect an ABA rename round trip.
A separate unapplied protocol/plugin-host extension now passes parent checks:
6in-process HTTP,5host and6generated-client cases, including actual generated
method requests/409 handling. Successful mixed updates apply their other fields;
conflicts preserve all supplied fields. That accepted checkpoint is preserved
separately. The later returned artifact now has independent parent acceptance:
legacy `rename` source signature/implementation remain unchanged beside the new
conditional method, and3resolution tests establish staged core→plugin→regenerated
client identity. Fresh parent proof passes40positive cases and5intentional failure
controls; no compiler/full-type result follows from module resolution or Bun's
type-stripped runtime tests. Current-controller integration remains unfinished.
Later parent run`/tmp/opencode/title-cas-G9J917` passes44tests:43positive cases
plus one explicit unsafe old-adapter fall-through observation, with the same five
assertion-specific expected-failure controls. A stale conditional update through
the real staged promise adapter preserves all fields and rejects with the
observed`Session.TitleConflictError`; the old adapter drops the extra field and
overwrites the human title in the labelled negative control. Host conditional
empty titles now refuse; legacy empty-title behavior remains. No capability gate,
full strict types/OpenAPI/current-controller integration or loaded fix follows.
The later source checkpoint adds an explicit optional host
[capability patch](../tools/opencode-title-cas/capability.patch) and
[handshake tests](../tools/opencode-title-cas/capability.test.ts), then integrates
the actual current controller in
[three real adapter/core cases](../tools/opencode-title-cas/controller-boundary.test.ts).
Unsupported hosts cause no generation, record writes or rename; supported writes
send the last-read `expectedTitle`, and exact same-session conflicts preserve the
manual title without retry/suspension. Parent fixes two swallowed reconciliation
read errors after genuine reds. Focused25/full187goal-docs cases pass; fresh staged
proof49tests(48positive/1unsafe observation) plus7assertion-specific controls pass
in`/tmp/opencode/title-cas-o9rbQY`. Removing only the copied controller's precondition
or capability gate fails actual title preservation. This is not full types,
OpenAPI/native application or loaded concurrency acceptance; old loaded hosts
must remain unsupported rather than silently downgrade.
The separate handoff-worker branch now also has source capability/CAS guards,
with [nine owning cases](../.opencode/plugins/goal-docs/automation-title-cas.test.ts).
Parent independently reproduces a post-handshake moved-target race, adds a fresh
ownership/lineage/eligibility/title check and preserves all old naming/settings
assertions through explicit conditional-capability fixtures;59focused cases pass.
Real staged worker adapter/core proof is pending, not inferred from the root proof.
The new [OpenAPI artifact tests](../tools/opencode-title-cas/openapi.test.ts) and
reviewed pinned local generator are also staged for verification; no served-schema
update, full compiler or deployment follows.
The subsequent parent run`/tmp/opencode/title-cas-odB6rF` now verifies both root
and worker through the real Promise adapter/core(6cases):57total tests pass
(56positive/1unsafe observation), plus9title/transport/resolution expected-failure
controls. The two added worker mutations fail actual stored-title preservation.
All196goal-docs source cases pass after preserving the old fixture assertions.
Staged OpenAPI generation and the native canonical freshness check also pass
after a genuine stale-baseline refusal;5schema cases verify optional precondition,
409/error contract, legacy fields/responses and complete component references.
Generated schemaSHA6b3d442e… differs from unchanged native baseline5464a1d7…;
this does not alter the served schema, run full types or deploy anything.
An actual [loaded read-only status probe](../tools/opencode-title-cas/loaded-readiness-2026-10-31.json)
now observes the new field but reports `publicationCapability:unavailable` for the
exact coordinator/location. Eligible/unsuspended state and sampled unchanged
title/time do not prove loaded conditional publication. No rename, generation,
settings write, reload, restart or deployment was issued.
The [full-type staging helper](../tools/opencode-title-cas/typecheck-stage.mjs)
and [owning tests](../tools/opencode-title-cas/typecheck-stage.test.mjs) have
synthetic source acceptance:49cases, including11parent safety regressions and a
separate13→15closure red. Required offline CI includes this Node/`mkfifo`only suite.
The [dated selected metadata closure](../tools/opencode-title-cas/workspace-closure-2026-10-31.json)
independently verifies48metadata files/38125bytes/36links; adding`http-recorder`
and`script`closes observed references, not the full compiler/monorepo graph.
The imported5.86MBsnapshot still exceeds the unchanged2MiB file cap; no repeated
refusal, asset omission, cap increase, real stage or full-type result follows.
Receipt recovery preserves sampled inode/content identity and gives failure
sidecars precedence; it is not atomic CAS or a hard filesystem-syscall deadline.
The [owning guide](../tools/opencode-title-cas/README.md#full-type-staging-prerequisite--synthetic-source-accepted-real-stage-blocked)
and [test-quality history](test-quality-audit.md) retain the initial23/27failures,
later ancestry/deadline/receipt regressions and their genuine corrections.
The separate [readonly input adapter](../tools/opencode-title-cas/readonly-input.mjs)
and [synthetic tests](../tools/opencode-title-cas/readonly-input.test.mjs) provide
all five pinned filesystem callbacks without fallback or write methods. Parent
review reproduced eight initial and five further boundary failures, then corrected
late close/cancellation, metadata capacity and mutation checks. This is an offline
prerequisite only: no compiler/API/real graph run, asset omission or cap increase.
Calls/entries/reads share the10000limit; UTF-8, conservative name-capacity reservation,
cooperative deadlines and sampled TOCTOU checks limit applicability. Native
project/reference/library behavior and resource fit remain unknown.
The latest focused adapter/staging/CI/inventory checks pass121/121, but full CI is
7/10after tmpfs`EDQUOT`fixture-write failures; this is not a final integration pass.
No quota change, cleanup or alternate scratch-root workaround is performed.
The new pure-memory [overlay preparation](../tools/opencode-title-cas/overlay-set.mjs)
and [tests](../tools/opencode-title-cas/overlay-set.test.mjs) are accepted only as
a supplied-data source prerequisite: parent independently37/37cases after six
initial inventory/input/budget failures and two later startup lifecycle failures.
Their corrections retain every earlier assertion and the unchanged reduce-only
limits. This helper binds only caller-supplied original/result hashes and absence;
real provenance/absence, shared filesystem lifetime budgets and five-callback
integration remain separate. No native compiler/API or oversized-asset bypass
is provided; required CI now retains its pure-memory regression suite. The
[owning limits](../tools/opencode-title-cas/README.md#pure-overlay-preparation--source-prerequisite-only)
distinguish logical accounting from a hard heap bound and lexical paths from
filesystem identity; accepted read-only adapter bytes remain unchanged.
The separate [patch verifier](../tools/opencode-title-cas/patch-provenance.mjs) and
[pure tests](../tools/opencode-title-cas/patch-provenance.test.mjs) now qualify exact
selected source derivation, not merely staged hashes:23cases pass after two
parent-found deadline gaps, and the actual17non-generated inputs match all29hunks
of the three canonical patches across10changed files. Full result bytes, including
unchanged inputs, are compared; context offsets are audited without fuzz. This
performs no filesystem patch application or native execution. Generated lineage,
whole graph, shared callback lifetime and full types remain separately unverified;
the [owning limits](../tools/opencode-title-cas/README.md#selected-patch-derivation--source-bytes-only)
retain strict supported syntax, reduce-only budgets and cooperative timing.
The new [shared budget](../tools/opencode-title-cas/input-budget.mjs) and
[pure tests](../tools/opencode-title-cas/input-budget.test.mjs) have source-only
acceptance:37cases pass independently after seven parent lifecycle/atomicity reds.
The first refusal is sticky, startup and `remaining()` observe lifecycle, and
caught reentrant hooks cannot commit charges or replace that refusal. Its
[accounting limits](../tools/opencode-title-cas/README.md#shared-input-lifetime--pure-accounting-only)
remain reduce-only; snapshots are diagnostic, not fresh health/authority checks.
No other accepted helper is changed, no real callback is wired to it, and logical
reservations do not authenticate costs or grant IO. Required CI retains the suite.
The [five-callback composition source](../tools/opencode-title-cas/overlay-input.mjs)
and [test file](../tools/opencode-title-cas/overlay-input.test.mjs) now have narrow
parent acceptance:57pure cases after three alias regressions and a further
three-case temporary-watch placement failure. One lifetime ledger spans actual
helpers, startup binding and all five callbacks; per-operation sampled watches
retain the requested aliases between base calls. Required CI includes the suite.
A separate actual Node-FS smoke exercises all five callbacks over new synthetic
files, not native code or a full graph. The [owning limits](../tools/opencode-title-cas/README.md#composed-five-callback-input--source-and-synthetic-filesystem-boundary)
retain unchanged caps, sampled/cooperative checks and unknown resource fit.
Pin/config/patch/generated lineage, native integration/full types and loaded
publication remain distinct and unverified.
The served API and current plugin remain unchanged; no live or installed
conditional rename is available from this source prototype.
Source artifacts: [patch](../tools/opencode-title-cas/conditional-rename.patch),
[negative control](../tools/opencode-title-cas/negative-control.patch),
[native tests](../tools/opencode-title-cas/cas.test.ts),
[runner](../tools/opencode-title-cas/run.sh),
[bounded capture](../tools/opencode-title-cas/runner.ts),
[runner tests](../tools/opencode-title-cas/runner.test.ts) and
[input hashes](../tools/opencode-title-cas/SOURCES.sha256).
Transport artifacts: [patch](../tools/opencode-title-cas/transport.patch),
[HTTP fixtures](../tools/opencode-title-cas/transport-http.test.ts),
[host fixtures](../tools/opencode-title-cas/transport-host.test.ts),
[generated client checks](../tools/opencode-title-cas/codegen.test.ts),
[staged resolution checks](../tools/opencode-title-cas/resolution.test.ts),
[promise adapter boundary](../tools/opencode-title-cas/adapter-boundary.test.ts),
[forwarding control](../tools/opencode-title-cas/negative-forwarding.patch) and
[409 control](../tools/opencode-title-cas/negative-conflict.patch).

`/handoff_resume` remains a separate explicit continuation template, not automatic
approval to resume a source goal. The retained legacy RPC's `resume:false` seed,
focus and preview [evidence](handoff-live-acceptance.json) is historical and is not
acceptance of the current source-model-authored `/handoff` or automatic policy.
Current `/handoff` asks the source model to send with `delivery:steer,resume:true`;
it does not require that legacy command merely to read/process the linked handoff.
See the [companion guide](../.opencode/plugins/goal-docs/README.md) for the distinct
surfaces and their limits. Session-specific receipts are not reusable goal state.

**RPC cancellation — source verified 2026-11-02:** retained export/legacy
handoff/open-ack handlers now forward each native caller's signal together with
plugin-unload cancellation. The ordinary edit assertion follows the pinned
single-argument Promise API with explicit pre/post-await abort checks, rather
than claiming an unsupported request-options signal cancels native permission
waits. Eleven new cases and all57prior owning cases pass; five isolated source
faults fail intended assertions. The checks expose and fix a real cancelled
empty-state lookup being reported as `missing`. Strict checking still fails:
missing SDK resolution, then heap exhaustion with the authentic existing2.1.1
SDK and all four roots retained. No cap/input/library bypass or install follows.
Current manual `/handoff` steering is unchanged; this is not loaded/native
disconnect, human-prompt or rollback acceptance. See the
[companion limits](../.opencode/plugins/goal-docs/README.md#rpc-caller-cancellation--source-verification)
and [retained results](rpc-cancellation-verification-2026-11-02.json).

A different pinned native7.0.2strict attempt retains the same four roots/SDK and
uses a stricter256MiBwhole-owned-RSS guard. Real monitoring stops it at265.55MiB
after1.46s with verified scoped cleanup: no diagnostics/type pass, cap ratchet or
unchanged retry is claimed. See the [separate failure record](scoped-native-types-2026-11-02.json).

The later same-root single-thread/checker scheduling request also hits the same
256MiBguard, with verified scoped cleanup but no completed diagnostics/type pass.
The [follow-up](verification-follow-up-2026-11-02.json) retains both native outcomes
and the distinct no-spawn memory/combined-CI admission refusals.

The same driver now supports exact initial `GOGC=10` as well as25, with unchanged
resource/input/security guards and exact environment/receipt matching. Four new
cases pass across corrected runs, including real tiny source/library errors;
four source faults fail intended assertions. A new same-four-root10request is
refused before spawn at2533.78MiBbelow2816MiB, not a type pass or measured memory
improvement. The initially missing full stage is subsequently restored completely:
8,601source entries/344module links/four overlays and2,827graph inputs match.
Its canonical full10request passes identity preflight, then refuses before spawn
at2546.20MiBbelow2816; no diagnostic family executes. No subset substitutes for the
full graph. See the [scoped lower-GC evidence](lower-gogc-verification-2026-11-02.json)
and [current setting contract](../tools/opencode-native-row/full-graph-diagnostics.md#exact-lower-allocation-setting--2026-11-02).

In that older pilot's receipt, explicit continuation/model invocation remains unapproved and unverified;
this is historical evidence, not a denial of the later independent worker's live
receipt or a statement that the new automatic policy has passed live acceptance.

The `session-context` skill describes an external `rig-tools` server plugin and
its `/session-context` convenience command, but no such plugin directory is
present in this checkout. Likewise, the skill catalog mentions a WSL interop
plugin, but `.opencode/plugins/` here has no `wsl-interop` source directory.
Treat those integrations as external prerequisites, not bundled plugins or
verified routes.

Local Markdown links in the current TUI were observed failing in its HTTP-only
browser opener. The optional [document reader](../scripts/local-doc-viewer.py)
provides an expiring, read-only `127.0.0.1` HTTP view of up to four explicitly
selected files, not a directory/repository server. Ten real loopback/safety tests
passed; the checklist and selected plan returned HTTP 200 in an actual bounded
reader run. Files are preloaded snapshots, not live updates. No installed native
link handler was changed and a subsequent user click is not claimed observed.
See the [client failure and usage record](plan-mode-acceptance.md#user-observed-client-failure--2026-10-27).

### Optional imports outside automatic discovery

These packages live outside automatic `.opencode/plugins/` discovery. Explicit
profile selection can still activate them; the table distinguishes dated source
acceptance from pilot activation and actual live outcomes. Directory placement
alone establishes neither activation nor inactivity.

| Package | Source and owning guide | Current boundary |
| --- | --- | --- |
| Retired custom agent inbox | [historical package](../tools/session-coordination/) · [guide](../tools/session-coordination/README.md) · [acceptance history](../tools/session-coordination/ACCEPTANCE.md) · [source readiness](../tools/session-coordination/READINESS.md) | User removal supersedes optional mailbox/UI/delivery/receive-settings acceptance. Canonical config no longer selects the package and exact-location server inventory omits it; history is preserved inert, not deleted. Earlier parent acceptance covers refusing zero-registration entrypoints/preflight and inbox-free guidance:161package tests/strict-library types plus83adjacent source contracts passed. The later2026-10-31 supported capture/keyboard observation supersedes the failed-capture-only account: actual palette search for inbox shows No results found, and Escape closes it without submission. This is not every-client/alias or fresh-chat model acceptance; no deployment/restart is inferred. Retained historical body/ownership/store/security tests and actual mailbox observations are evidence, not instructions to reactivate the feature. Delegated results use native child completion, with parent-owned scope/verification and no peer prompt-queue fallback. |
| CPU/RAM | [package](../tools/opencode-plugins/resource-monitor/) · [guide](../tools/opencode-plugins/resource-monitor/README.md) | Bounded ELF/auxv unit discovery without `getconf`; bounded per-thread child traversal and process-identity rechecks. Current typecheck/24 tests pass, including numeric sampling of the actual Linux test process; an isolated leader-only mutation fails its regression. Live trees remain best-effort during process churn. Earlier isolated TUI rendering predates these changes; no updated regular-session activation is verified. Append-only footers and a namespaced panel preserve the sidebar. Activated in the pilot CLI config on 2026-10-29; the TUI reconciliation reports 19 plugins with no failure. |
| Provider fallback/sidebar | [package](../tools/opencode-plugins/provider-fallback/) · [guide](../tools/opencode-plugins/provider-fallback/README.md) | Source/typecheck/27 tests accepted, additive sidebar status and empty default chain verified. No proactive credential/quota code or Codex usage UI imported. No real provider switch/render accepted. |
| Optional ChatGPT | [backend package](../tools/chatgpt-connector/) · [guide](../tools/chatgpt-connector/README.md) · [direct package](../tools/chatgpt-direct/) · [direct guide](../tools/chatgpt-direct/README.md) · [legacy launcher](../scripts/chatgpt-mcp.sh); ownership in the [registry](parallel-run-coordination.md) | The Effect server/TUI plugin and image tools are active in the pilot profile. On 2026-10-29 one real OAuth request produced a 1536x1024 lighthouse PNG; the saved 3,071,997-byte mode-0600 file matched its attachment/hash. Quota-free show_image reattached it, and a request-owned TUI capture verified its native thumbnail. Transcript images enables previews, not sharper graphics: the tested Ptyxis session uses blocky character-cell rendering, even enlarged. The separate chatgpt-image Markdown preview is image-only and aspect-fitted: no frame, padding, grey text, caption, or button; its original-open action uses attachment/hash and local session/file checks. On 2026-10-30 cache-miss recovery was added through authenticated public message pagination (40x50-message/30-second bounds, ambiguity/cursor/session/disposal guards). The real resolver found the attachment across 15 pages and a request-owned capture verified both recovered cards in the reopened original chat. The actual image click was refused by GNOME with POINTER_CONSTRAINED before button dispatch: live viewer interaction remains unverified. All 127 connector tests, eight action/layout tests, five real native-renderer tests (authenticated scratch Node26 FFI), strict SDK checks and health pass. System Node/OpenCode and the native image popup are unchanged. Chat/search and skill discovery were separately observed. Exact output preauthorization, bounded PNG handling and cancellation cleanup remain covered; prompt-refresh is fake-backed, and directory/path rechecks are not atomic against a hostile writer. Legacy MCP remains text-only saved-image metadata. |

**Historical image keyboard boundary — 2026-10-31:** the connector handles Enter/Space only
after its card has focus. Its companion registers no explicit keyboard focus
command; existing renderer cases obtain focus by clicking first. No pointer-free
host traversal was established by this source review, so the documented key
handler is not a workaround for `POINTER_CONSTRAINED`. No keys, viewer launch,
tests, new image or runtime modification followed. See the
[qualified original-opening guide](../tools/chatgpt-direct/README.md#open-the-original-from-the-connector-preview).

**Earlier image focus source candidate — 2026-11-01 UTC:** the TUI companion now registers
**Focus image preview** in the native command palette, retaining one current
session/directory card, including recovered cards. Cancellation/navigation,
destruction, modal, terminal-bound and ancestor-visibility checks precede focus.
One deferred attempt replaces an inappropriate renderer-idle wait; the original
card layout and activation handlers remain byte-identical. This supersedes the
earlier no-command source finding, **not** actual keyboard/pointer/viewer
acceptance: at this source-only checkpoint the new command is untested/unobserved.
Before the reported server restart, GNOME reports screensaver active, bridge
enabled/INACTIVE and no bus owner. No capture, input, toggle or unlock follows.
Source snapshots and preservation receipt are retained in
`Documents/computer-use-native-host-20261029/direct-blockers-parent-tz3RSN/image-focus-source-facts.json`.

**Later actual keyboard opening:** unlocked epoch`d4acee48…`, native palette
discovery, a no-visible-preview refusal and then visible-card focus are observed.
Enter through the focused reattached card opens Loupe; its request-owned capture
and Image Properties show the original lighthouse,1536×1024 PNG. Reattachment
returns unchanged3,071,997B/SHA`412f1d7e…1bf97`; no generation/direct file launch,
pointer retry, test suite or worker follows. Input releases and the viewer remains
open. Original-chat recovery instead shows unavailable cards and is not passed
by reattachment. A literal1 from unsupported Ctrl+1 is removed without submission;
the native chooser restores this chat. See the owning guide and
`Documents/computer-use-native-host-20261029/direct-blockers-parent-tz3RSN/image-focus-live-facts.json`.
Original pointer-click and full lifetime/cancellation acceptance remain open.

**Image focus source verification — 2026-11-02:** seven new lifecycle cases pass
against the actual focus/card modules with injected renderer/time/data boundaries;
seven exact source faults fail. Deferred cancellation, navigation/destruction,
stale/multiple targets and recovered readiness are verified without changing
production code or replaying older renderer/action tests. This clears the earlier
untested-focus source gap, not actual original-card recovery, pointer acceptance,
full types or native scheduling. No PNG/history/API/GUI/model/deployment action
occurs. See the [results and boundaries](image-focus-source-verification-2026-11-02.json).
A separate full-owner strict/library request retains the actual config/includes
and overrides only`skipLibCheck:false`; real admission refuses before spawn at
2815.1875MiBversus2816. No type/diagnostic or cleanup pass follows, and the fixed
guard is not rounded down or retried. The same evidence record retains this result.

**Recovery-timeout source follow-up — 2026-11-02:** six new controlled-expiry cases
pass and seven new deliberate faults are detected. Late results cannot publish or
register a focus target; current owners receive unavailable feedback after the
load settles, while navigation/disposal prevents stale feedback. Completed cards
remain eligible after their recovery-only deadline. Production code and the prior
seven focus case bodies are unchanged; those cases and strict/native/GUI checks
are not replayed. This is not real timer timing or original-pointer acceptance.
See the [timeout results and boundaries](image-recovery-timeout-verification-2026-11-02.json).

Import origin: `jtmb/opencode-rig`, V2 branch `migration/opencode-v2`, commit
`b17182cd5bcd55c282a94ea18f87a16460813c35`, not V1-era `main` or the broken
local clone. Licensing remains unspecified by the inspected upstream source;
it is not a new license grant or a claim that package tests establish rendering.

**Current self-learning remediation — 2026-11-01 UTC:** the exact client2.1.1 is
now a local runtime dependency, installed with scripts disabled and no local
host-plugin peer. The additive project entry actually loads
`computer-use.self-learning`, retaining required goal/desktop/memory plugins
without a service restart. The first real catalog failure is corrected by
separating native/display IDs and read-only catalog case from lowercase authoring
targets; actual catalog returns34entries, including `README`. A real SDK-backed
2session/1message-per-session analysis completes with both messages ineligible,
no patterns or conversation text and disclosed truncation. Full learning,
native denial/cancellation, reviewed application and rollback remain unaccepted;
no test suite runs. See [current acceptance](../tools/self-learning/ACCEPTANCE.md#operational-remediation--2026-11-01-utc).

The [self-learning bootstrap inventory](../tools/self-learning/bootstrap-dependencies.json)
now records all five observed runtime manifests and their exact dependency edges,
separately from the host-provided plugin peer and unselected optional Solid peer.
All five now also have exact registry URLs/SHA-512 declarations selected from an
existing local lock, with that source digest recorded; no archive was fetched or
independently hashed and no sibling installed runtime was borrowed.
It is metadata-only, not a lockfile/package-content integrity proof or installer;
`scripts/onboard.sh` is unchanged and does not automatically install or activate it.

A later actual two-session/eight-message scan processes two eligible messages,
skips 14 and returns nine lexical leads with truncation disclosed. Both exact
references pass live checks. Parent review finds broad summaries, not nine
independent lessons; no skill change is justified or applied. Eligible evidence
and reference access now work, while denial/cancellation and approved full-bundle
application/rollback remain open.

**Later ordinary self-learning review — 2026-11-01:** actual `3/8` and `4/16`
session/message selections return no candidate patterns, respectively reporting
two eligible/16 skipped/one heuristically sensitive and six eligible/40 skipped/
two heuristically sensitive messages. Both are truncated and may overlap; do not
sum them or infer project-wide absence. No conversation text or pattern refs were returned, no
skill change was justified, and no test or new model call was used. See the
[scoped evidence and remaining gates](../tools/self-learning/ACCEPTANCE.md#further-ordinary-project-review--2026-11-01).

**Generated fixture hygiene:** [`.gitignore`](../.gitignore) now excludes only the
root `.acceptance-fixtures/` tree from normal Git discovery. Five generated nested
repositories and all 135 inventoried entries remain in place with identical
metadata; no fixture body is read, moved or deleted. Direct Git readback confirms
the exclusion and unchanged staged patch/index. This does not prove that the
historically reported service spin, snapshot loop or live diff endpoint is fixed.

**Current bridge remediation:** the reviewed deployer updates only owned
`input.mjs`, preserves its backup/marker and verifies all7installed files match.
The already-enabled extension is refreshed without Shell restart/logout. Actual
Calculator capture works, but one controlled pointer action still refuses
`POINTER_CONSTRAINED`; release and disposable-window cleanup succeed. Installed
drift is fixed, not pointer/original-card acceptance. See
[the observed boundary](../tools/gnome-window-control/README.md#verification).

The following paragraphs retain earlier source/history, not the current SDK or
activation state. The separate canonical-only [self-learning package](../tools/self-learning/)
([guide](../tools/self-learning/README.md),
[acceptance boundaries](../tools/self-learning/ACCEPTANCE.md)) is a private
source prototype outside automatic discovery. Its source describes read-only,
project-scoped lexical leads and reviewable skill proposals, not a writer or
accepted semantic learning. Real host binding, runtime registration, permissions
and evidence-backed improvements remain unverified by this consolidation.
The earlier consolidation preserved it without execution. Later parent source
review reproduces **68 passes / 1 SDK skip**, plus **1/1** authentic-client
transport test in a new exact-source scratch copy. Creation rechecks now support
absent project skill directories while update checks still require the file;
reviewed proposal text refuses terminal/bidi controls. The package still lacks
its resolvable client peer, so no registration, permission or real-learning
acceptance is inferred. The approved project-only host trial on2026-10-30 added
only its local entry; the actual loader failed on missing `@opencode/client`
(`err_c545d820`), confirming the dependency gap in-host. The entry was removed,
the original project config restored byte-for-byte, the backup preserved and
required goal plugins/health verified. No source dependency installation, global
config change or shared restart occurred. Successful registration/permissions
and actual learning remain open; see the [trial receipt](../tools/self-learning/ACCEPTANCE.md#actual-approved-host-trial--2026-10-30).

The2026-10-31 D6 feasibility review is independently checked against pinned2.1.1
source: host context has no paginated message domain, `session.context` has no
page/byte limit, and the Promise adapter does not forward caller request options.
Those are not equivalent bounded/cancellable substitutes. Parent reproduced
missing client/service resolution and69tests:68pass/1SDKskip/0fail. No dependency
was installed/linked/borrowed and no registration-only stub was added. Exact
client-peer installation authority, unskipped SDK verification and actual host
registration/permission/cancellation/reviewed-workflow outcomes remain separate.

## Local Office package inspection

The [dated transitive metadata candidate graph](document-authoring-transitive-candidates-2026-10-31.json)
now explicitly accounts for49saved requirement strings across21metadata-selected
nodes, with one unresolved `cffi → pycparser` edge. Parent verifies consistency
against saved projections, not original raw response integrity. The first reader
checked caps after each chunk and reset counters across five invocations; those
failures are disclosed, not repaired by receipt sums or a subsequent source fix.
[Evidence accounting contracts](../scripts/document-metadata-contract.test.mjs)
prevent omitted optional edges or promotion of unverified historical outcomes.
No further requests, artifacts, installs, closure/rights/ABI/security or authoring
acceptance follow. The separate future
[reader source](../scripts/document_metadata.py) and
[offline tests](../scripts/test_document_metadata.py) now have parent source
acceptance after correcting real budget/deadline/framing/encoding/overlap defects:
39fake-transport cases pass, including bounded non-echoing identity errors.
Shared fixed ceilings, pre-read sizing, exact-cap
refusal and retained raw-byte receipts protect future acquisitions, not the old
record. Ruff/mypy are unavailable. This is a stdlib library, not a registered
tool or resolver; no live acquisition is authorized or observed by its addition.

A separate [dated OSV screen](document-authoring-vulnerability-screen-2026-10-31.json)
queries the21existing public name/version pairs with one1,496byte POST and76byte
response(534ms/shared192KiB30s). No advisory IDs/pagination tokens are returned;
this is not package existence, safety or full security coverage. No positive
affected control ran; bundled native-library identities/advisories remain open.
The spent PyPI pass, unresolved`pycparser`, notice/rights/ABI/XML/format/human gates
are unchanged. Six [security-evidence contracts](../scripts/document-security-contract.test.mjs)
preserve input/receipt/pagination/non-promotion limits and run offline in required
CI, not a new OSV query or installation approval.

**Pinned stack exercised — 2026-11-02:** all nine pinned distributions were
installed into a disposable virtual environment and then actually used. A DOCX
authored with python-docx and lxml rendered through LibreOffice and reopened with
the exact text; an XLSX round-tripped through openpyxl with the correct values; a
reportlab PDF reopened through pypdf with the expected text; pandas read the
workbook. Hardened XML behaves as intended: `defusedxml` refuses an
external-entity document and the hardened lxml parser parses without resolving
it, while the default parser still accepts entities. This is a
disposable-environment result, not a system installation: the conversions ran
without the cgroup supervisor because the user systemd manager is denied, and no
licence, notice, ABI, transitive-closure or human review was performed. See the
[pinned-stack evidence](document-authoring-stack-2026-11-02.json).

A subsequent [local header observation](document-authoring-native-header-facts-2026-10-31.json)
retains exact wheel/member hashes and8022header bytes declaring libxml2 2.14.6 and
libxslt 1.1.43. Those are packaged declarations, **not linked binary identities**,
ABI or advisory clearance. No extraction/import/execution/network occurs. Three
additional offline security-evidence cases retain identity/declaration/non-promotion
limits; all nine pass, without resolving rights/native-library/runtime gates.

The later [native advisory screen](document-authoring-native-advisory-screen-2026-10-31.json)
compares those declarations with four parent-opened primary CNA records. Three
fall within published ranges; one has no upstream range, and one has a libxslt
title/libxml2 product mismatch. This is **not a wheel vulnerability verdict**.
Distinct public GNOME release notes substantiate the7424fix in the included1.1.44
section and describe other branch security changes without exact CVE mapping.
CNA boundaries are not automatically first-fixed releases or proof of backports.
Linked versions/patches, ABI, reachability, exhaustive security and installation
acceptance remain open; no candidate is installed, imported or executed.

The [selected resource observation](document-authoring-native-resource-facts-2026-10-31.json)
verifies that both XSL transforms described as unlicensed actually occur in that
same wheel; complete text review finds attribution but no permission grant in
those two texts. The selected ISO schema has distinct conditional permission.
The transforms' static `document()` sites motivate separate resource-access
controls, not an executed exploit or network trial. Seven`.so`inventory entries
are not linked-library identities. The [owning review](local-office-packages.md#selected-wheel-resource-rights-and-loading--2026-10-31)
retains exact hashes, acquisition bounds and every rights/runtime gate; no
third-party implementation is copied into this repository or installed.

The custom [Office ZIP preflight/member reader](local-office-packages.md)
([source](../scripts/office_package.py)) adds dependency-free read-only metadata
inspection and bounded exact-member acquisition, not an OpenCode-native tool.
Twenty [adversarial/positive fixtures](../scripts/test_office_package.py) pass;
actual CLI inspection accepted both
earlier10-member trusted Calc packages without changing them. XML and all payloads
remain uninspected; every result explicitly denies render/authoring readiness.
No authoring libraries were installed and no untrusted document was converted.
The reviewed source suite is required by offline CI; hosted enforcement and
complex DOCX/PDF-form/XLSX authoring/isolation/human acceptance remain open.

The manual [trusted-isolation probe](../scripts/document_sandbox_probe.py) and
[19 offline policy tests](../scripts/test_document_sandbox_probe.py) cover
observed private filesystem/network/environment/process boundaries, real
aggregate memory/task/time enforcement, a fixed-text confined LibreOffice-to-PDF
trial and loaded UNO macro/no-update policy readback. See
[bounds, versions and receipts](local-office-packages.md#trusted-converter-isolation-controls--2026-10-30).
This is not deployed, not an arbitrary-document tool, not an untrusted converter
acceptance and not visual/human review. No packages or host policies changed.
Separate existing fixed synthetic macro/link receipts retain source/event and
negative-marker/open observations; macro-causal blocking and a positive link-update
path are not established. Future receipts now bind sampled probe/payload hashes,
exact check/control names and explicit limits. Three new tests first failed;
19/19 now pass, including a later red/green mixed-probe-epoch regression, without
a new host trial or rewriting old receipts. Current
Ruff/mypy verification is blocked by unavailable tools, not waived as a pass.

The [authoring candidates](document-authoring-candidates-2026-10-30.json) add a
read-only nine-package PyPI version/hash/license/Python/dependency inventory,
independently acquired within byte bounds after a child's oversized-read failure.
It is not an installation lock, downloaded-byte verification, license-file audit,
tested import or authoring/hardened-XML capability. All nine modules remain absent;
installation, dependency closure and actual format acceptance remain separate.
The later [defusedxml0.7.1 static review](defusedxml-static-review-2026-10-30.md)
verifies one small wheel's actual bytes and reads its full PSFv2 license plus four
bounded text members. This is not installation/import/parser execution or a rights
audit of the other artifacts. Parent-confirmed static findings include default DTD
allowance, a custom-parser flag bypass and absent resource budgets; none establishes
host runtime or untrusted-XML acceptance. The shared contract now explicitly
qualifies parser defaults, custom-parser bypass, exception handling and separate
XInclude/schema/resource boundaries;17wording/routing contracts pass, not parser
or model enforcement. The
[full-graph driver](../tools/opencode-native-row/full-graph-diagnostics.md) is
released. Its actual parent run over all2827freshly enumerated files is
**incomplete/owned-rss-budget** at1537.246MiB under the unchanged1536MiB ceiling:
only config/program families complete before global checking stops. Complete
restaged-input/preflight/post-run identities pass, not full diagnostics or types.
No unchanged retry or limit increase is accepted. The explicit GOGC25route now
passes46owning cases after three parent boundary/privacy regressions. It preserves
legacy omission, sanitizes worker environment and binds requested/observed worker
settings in receipts, not internal GC state. Its actual full2827-file attempt also
stops incomplete/owned-rss-budget at1536.320MiB/25.17s, with only config/program
families complete. Both real failures are retained; no full-type pass is claimed.
Later source review corrects a separate child-teardown sampler defect using a
fresh budgeted exit/identity observation; live or uncertain children still refuse.
Three scratch mutation controls detect stale-state, budget and PID-reuse bypasses.
The owning suite is **52/53**, not green: an existing tiny GOGC25 test is refused
by the unchanged host-memory admission gate. The historical root-monitor failure
is not attributed or declared fixed. Go1.26.4 soft-memory-limit research enables
no new knob, full retry or guard change; see the
[owning review](../tools/opencode-native-row/full-graph-diagnostics.md#soft-limit-review-and-child-teardown-correction--parent-2026-10-31).

**2026-10-31 parent-only correction:** after the no-delegation/no-more-tests direction,
the remaining monitor child is cancelled. Direct edits tighten live-thread RSS,
missing-task/child-exit identity and observer-budget handling; these are explicitly
**untested source**, not a new monitor/full-compiler pass. Bootstrap metadata now
records the actual `tsc`7.0.2/`tsc6`6.0.2 aliases and local-build input boundaries.
No cap, compiler input, library-checking requirement or installed binary is changed.

**Current scoped monitor verification — 2026-11-02:** necessary verification is
now authorized. Corrected stale test assumptions preserve unknown/live-thread
refusals instead of restoring unsafe zero-RSS behavior. The low-level/forest plus
new [aggregate suite](../tools/opencode-native-row/full-graph-monitor-budget.test.mjs)
pass29checks; four separate disposable owned-process cases pass, including a real
zombie leader with a live32MiBsibling. Eight isolated source faults fail intended
assertions. Production monitor and numeric guards are unchanged. The new aggregate
suite is required in local offline CI after a genuine failing omission contract;
no full CI/hosted, full2827-input/type/build, old-failure-cause or whole-host
quiescence acceptance follows. See the [scoped results](monitor-verification-2026-11-02.json)
and [owning limits](../tools/opencode-native-row/full-graph-diagnostics.md#current-scoped-verification--2026-11-02).

The separate [native Git index-protection artifact](../tools/opencode-native-row/native-git-index.md)
adds process-local `diff.autoRefreshIndex=false` to the pinned provider's common
Git prefix. It remains **unapplied to native**. The initial patch's
[check/apply/reverse/refusal and syntax evidence](native-git-index-verification-2026-11-02.json)
is retained. New actual-provider/synthetic-Git tests expose stat-only false changes;
the current patch corrects them while preserving binary/mode/empty changes and
rejecting incomplete diff statistics. Six cases across recorded runs and five source faults verify
subprocess prefix/temp-index routing and complete synthetic index/config bytes.
No loaded native plugin, full type/build, model or old failure cause is proved;
no frozen source, installed runtime or user index is changed. See the
[provider-path correction and limits](provider-git-index-verification-2026-11-02.json).

Two additional [explicit-base committed/branch cases](provider-git-review-modes-verification-2026-11-02.json)
pass on the unchanged corrected source with staged/unstaged/untracked distractions;
three new mode/base faults fail. File/patch selection and complete synthetic index/
config preservation are verified without rerunning earlier accepted cases. The
patch is still unapplied to native; this is not full loaded/type/build acceptance.

The [status fallback follow-up](provider-git-status-fallback-verification-2026-11-02.json)
verifies partial failed/cut-short counts against both original and corrected
scratch providers: two new cases pass on each, and four new faults fail. Status
retains its best-effort counts/full file list and synthetic index/config bytes;
no production/native patch change or full installed acceptance is inferred.

The health script now provides `--status-only`: current service/plugins/MCP/config
and required-file diagnostics without test execution. One actual invocation
reports v2.1.1, service responding, required plugins active and GitHub/Playwright
connected; its output explicitly says **not full acceptance**. The default full
test path is retained in source but was not rerun under the no-more-tests direction.

**Read-only health guard fixed — 2026-11-02:** the pinned CLI can successfully
report `stopped`. The preflight now requires its documented URL-shaped response
and stops both modes before API discovery on stopped/empty/malformed/error status,
rather than risk starting the shared service. Actual fake-command regressions
first fail9of17, then pass17/17with all six older scenarios retained; shell syntax
and the two changed CI wiring/safety contracts pass. This is not a real health or
reserved computer-use test run. The attempted current combined offline run is
refused before spawning below the unchanged memory-admission floor. See the
[actual guard fix, refusals and limits](verification-follow-up-2026-11-02.json).

**Earlier checkpoint, before the latest untested edits:** the strengthened monitor
selection passed15/15, offlineCI11/11 and healthPASS. Those dated results remain
separate from the retained native-suite failure and do not prove current full
diagnostics, loaded behavior or operational acceptance.
The released
[dependency preflight](../scripts/document_authoring_preflight.py) with
[tests](../scripts/test_document_authoring_preflight.py). The latter now has
parent-verified36tests on both3.14/3.11 and a required offline-CI route, with bounded
metadata/regular-path observation, shared deadline and explicit readiness denial.
Parent corrected four missed defects and independently reproduced the final
synthetic-user-site negative control; test subprocesses use `-s -B`. This is source/
CLI presence inspection, not authoring/runtime capability. Ruff/mypy are absent.
The fifth compiler return passes33parent-rerun cases and the original three failure
probes. Further parent corrections retain unknown children on post-exit read errors,
bind stat identities, share forest budgets and verify termination/report signals;
current38/38 source tests pass, including live-root retained RSS and a bounded
transient-RSS recheck. An earlier tiny-worker monitor refusal is still
unexplained, so this is not full-run safety or full-graph acceptance. No
full-graph diagnostics, installation or loaded-client success follows.

A subsequent [five-wheel license review](local-office-packages.md#five-additional-wheel-license-observations--2026-10-30)
checks actual hashes and full MIT/BSD notices for the exact python-docx, pypdf,
pdfplumber, openpyxl and xlsxwriter candidates. Public acquisition stays within
2MiB total;21unchanged artifact/metadata/notice/report files are preserved with
readback hashes outside the repository. No package was installed or imported,
no implementation was copied here, and transitive rights/parser/ABI/runtime/format/
human gates are not closed by license text. The
[remaining-wheel review](local-office-packages.md#remaining-wheel-notice-review--2026-10-30)
verifies the other three artifact hashes and preserves12files. Lxml's full selected
notices include LGPL/PSF/GPL/resource exceptions, not just its principal BSD label;
ReportLab's notice and metadata retain different copyright years. Pandas container
inspection passed, but notice selection exceeded its16-member limit: no notice
member was read and no limit was raised. No installation or complete rights approval.

## Desktop and window tools

### Native orchestration selector — source only

The [verification package](../tools/opencode-orchestration/) and
[guide](../tools/opencode-orchestration/README.md) cover a minimal native TUI
addition in the existing pinned `opencode-native-row` checkout: one plain inline
field beside Build/Plan, native chooser and `/orchestration`, with named Solo,
Background subagents and Foreground subagent methods. The exact chat's choice is
stored in one native instruction entry and read back; it does not modify other
instructions, grant permissions, resume goals or substitute root chats.
Nineteen targeted tests pass, including the actual production metadata renderer at
44/80/120 columns, controller persistence/failure/chat-switch cases and the real
native selection list. A bounded10-test native state/app/adjacent-composer batch
also passes; the parent extended the production app fixture to save/read back a
choice and reopen the menu by typing `/orchestration` through the real keymap.
Its separate rerun passes at233MiB under unchanged960MiB/zero-swap/32-task guards.
These HTTP fixtures are synthetic, not a live
client claim: verified local Bun1.4.2 and the frozen CLI dependency tree are now
installed; their pins/hashes and bootstrap scope are recorded in the guide's
machine-readable inventory. Five inventory contracts and five native state tests
pass. Bounded full-package typechecks reached the thread or960MiB memory ceilings,
not a pass; root-owned MIME declarations are now installed and resolve correctly.
Build and loaded acceptance remain unverified. No installed client/launcher/restart
change occurred.
Exact placement is not available through existing public plugin slots. Native
build/loaded/visual acceptance is still required before the user's requested
successor plan/goal/parallel-work stage.

The [computer-use plugin](../.opencode/plugins/computer-use/) and
[AT-SPI implementation](../scripts/desktop-control.py) provide bounded GNOME
accessibility inspection and previewed actions. Exact accessibility coverage
depends on the application and toolkit.
The [process-local address helper](../scripts/accessibility_bus.py) validates the
same-user provider, protected Unix endpoint and full authenticated address before
using `AT_SPI_BUS_ADDRESS` in that helper only. Explicit bindings are preserved;
missing context or unsafe addresses refuse without autolaunch or global changes.

| Tool | User outcome | Status and limit |
| --- | --- | --- |
| `desktop_apps` | List accessible applications. | Read-only; toolkit coverage varies. |
| `desktop_tree` | Inspect one application's accessibility tree. | Bounded traversal; truncation is reported. |
| `desktop_find` | Find controls by accessible name or role. | Ambiguity and incomplete search cannot authorize a mutation. |
| `desktop_act` | Preview/apply focus, an advertised action, or editable text. | Fresh single-use token and permission checks; protected fields are refused. A dispatched action still needs visible verification. |
| `desktop_capture` | Capture one exact window in memory and return it as an image plus an observation id. | Requires the deployed, reviewed Shell bridge; bounded by 6 MiB and 8,388,608 pixels; never reads or deletes the user's screenshot files. Replaces the retired `desktop_screenshot` path. |
| `desktop_input` | Click, drag, scroll, press a key or type into the focused target bound to a fresh observation. | Permissions `desktop/input` plus `desktop_mutate`; single-use observation; ASCII-only text; timed input capped at 2 s; refuses on focus or geometry change. |
| `desktop_release` | Release all held keys and buttons. | Cleanup action, always available after the `desktop/input` check. |
| `desktop_launch` | Launch an installed application by exact desktop ID and report whether a new window appeared. | Refuses shell apps and locked/modal states; reports `appeared: false` instead of assuming success. |
| `desktop_windows` | Read exact compositor IDs, focus, geometry, and monitor work areas. | Requires the separately installed/approved GNOME bridge. |
| `desktop_window_act` | Preview/apply exact-ID focus, placement, or tiling. | Fresh token and actual readback; no hotkey fallback, closing, or input injection. |
| `desktop_layout` | Arrange two to four exact windows. | Non-atomic; inspect partial results and preserve unrelated windows. |

The [production keymap fixture](../tools/gnome-window-control/keymap-fixture.mjs)
and [regressions](../tools/gnome-window-control/keymap.test.mjs) exercise the
actual extracted Shell resolver, not a second parser. The
[private-bus fixture](../tools/gnome-window-control/private-bus-fixture.py) serves
harmless bridge/address-provider/empty-registry replies only on owned test buses;
it never implements real input or contacts the operator desktop.

The optional [GNOME window bridge](../tools/gnome-window-control/README.md),
[client](../scripts/desktop-windows.py), and
[bounded deployer](../scripts/deploy-window-control.py) are present in source.
Its implementation files are the [extension](../tools/gnome-window-control/extension.js),
[manifest](../tools/gnome-window-control/metadata.json),
[policy module](../tools/gnome-window-control/policy.mjs),
[capture controller](../tools/gnome-window-control/capture.mjs) with its
[tests](../tools/gnome-window-control/capture.test.mjs) and a
[GJS acceptance harness](../tools/gnome-window-control/capture-gjs-acceptance.mjs)
that drives the deployed controller under the real GJS runtime with fake Shell
dependencies (8 checks: handle, geometry, chunk payload, wrong index, foreign sender,
release). It proves the module in the real engine; it does not exercise the Shell
texture/stream plumbing, and it injects the digest/base64 helpers, so it would not
have caught the `get_data` misuse that lived in `extension.js`, an
[input controller](../tools/gnome-window-control/input.mjs) with its
[tests](../tools/gnome-window-control/input.test.mjs), a
[GJS smoke harness](../tools/gnome-window-control/input-launch-gjs-smoke.mjs) that
loads and constructs both controllers, drives `releaseAll` with nothing held and
disposes them under the real runtime, a
[fresh-Shell acceptance script](../tools/gnome-window-control/fresh-shell-acceptance.sh)
that re-executes under its own D-Bus session and loads the deployed extension in a private
headless GNOME Shell, so it can never drive the operator's Shell; it asserts all 16 bridge
methods, matches the target window by a unique per-run path, checks a real PNG capture and
an observation-bound click over one sender, and requires exact `STALE`/size-bound refusal
codes; `--debug` loads a scratch copy with a logged error mapper, requires the expected
refusal stacks to appear, and never modifies the deployed artifact, a
[live capture check](../tools/gnome-window-control/live-capture-check.py) that answers one
question against the operator's real Shell — does a window capture produce a validated PNG
now (exit 0), is the extension disabled or inactive (exit 4), or does the running Shell still
hold the pre-fix module (exit 3, "log out and back in") — without sending input or writing an
image, a
[rollback rehearsal](../tools/gnome-window-control/rollback-acceptance.sh) that deploys
into a throwaway target, restores a real deployer snapshot (files plus its ownership marker),
shows the deployer reports the pending forward changes instead of refusing or agreeing, then
re-applies and confirms every hash returns, a
[visible-outcome workflow](../tools/gnome-window-control/desktop-workflow-acceptance.py)
that requires `--yes` and then launches an application by desktop ID, photographs it, types
into it and checks that the pixels changed, all over one bridge connection because launch
tokens and observations are sender-bound. Its
[target/cleanup safety tests](../tools/gnome-window-control/test_desktop_workflow_acceptance.py)
exercise confirmed app/window selection, pidfd identity and refusal to report success
after failed release/close using fake boundaries, not live typing. There is also a
[bridge-protocol acceptance](../tools/gnome-window-control/bridge-protocol-acceptance.py)
that drives `Begin`/`Chunk`/`End`/`Abort` over one D-Bus sender to check out-of-order
delivery, chunk replay, `End` before the last chunk, abort, `INVALID_HANDLE` after release,
foreign handles, digest verification and re-`Begin` after every exit path (the harness runs
it against a 25-chunk incompressible image as well as a single-chunk window), a
[launch controller](../tools/gnome-window-control/launch.mjs) with its
[tests](../tools/gnome-window-control/launch.test.mjs), and a
[contract shim](../tools/gnome-window-control/runtime-contract.mjs) that
deployment replaces with the canonical
[shared contract](../tools/computer-use-runtime/src/runtime-contract.mjs).
`desktop-windows.py` now also exposes a `capture` verb that assembles bounded
chunks over one connection, verifies SHA-256 and complete PNG structure, and
never writes an image file. The deployer manages seven files and never enables or
restarts the extension. Capture now passes in both a fresh private Shell and the
operator's logged-in Shell, as does real-session Calculator launch/confirmation.
Unknown, closed and over-bound capture requests are refused. Input was refused;
installed Clutter inspection then identified a nonexistent `destroy()` requirement
and the `time_us` microsecond contract. Corrected source passes 45 controller tests
and eight GJS fake-boundary smoke checks; it retains failed releases for retry.
A read-only deployer preview reports two pending source files (`input.mjs`,
`extension.js`); no apply or reload is authorized. Successful real-seat input,
mapping under fractional scaling, timed
multi-clicks and D-Bus reply sizes also remain unverified. Input is ASCII-only
(1024 characters), click count is capped at 10, scroll amount at 100, timed
multi-clicks are refused, and drags jump to their endpoint instead of
interpolating. Launch confirmation only reports matching new windows.
The deployer requires an explicit destination. A 2026-10-27 passive refresh verified
the then-installed three-file set, registry v2 ACTIVE and actual unlocked/unblocked
typed inventory; that check predates capture and does not cover it.
No disposable windows were present; maximized-restore and complete visual acceptance remain pending;
see [window-control evidence](demo/window-control-verification.md). Source or
installation parity is not the same as current runtime availability.

**2026-10-30 harness safety follow-up:** the fresh-Shell source no longer uses a
shared nonce that could skip private-bus creation. It stages only the seven
deployed files, confines HOME/XDG state and private-bus activation environment,
retains failure artifacts, and returns exit3 for a missing-seat incomplete result.
[Harness regressions](../tools/gnome-window-control/fresh-shell-acceptance.test.mjs)
run real Bash/files with fake bus/compositor/settings boundaries and are required
by offline CI. No compositor or extension was started for these tests. A later
[owned-process helper](../tools/gnome-window-control/owned-process.py) replaces
raw-PID signaling for managed children with pidfds acquired before exec. Unbound
window PIDs yield incomplete, never a signal. The ten wrapper checks include nine
[real disposable-process controls](../tools/gnome-window-control/test_owned_process.py);
receipt tampering cannot redirect the retained
handle, and deadline/interruption remain non-success. Detached descendants or a
lost supervisor are not proven stopped; actual compositor/owning-host acceptance,
OS sandboxing and separate activation authority remain unfulfilled gates.

The [acceptance preflight](../tools/gnome-window-control/acceptance-preflight.mjs)
and its [tests](../tools/gnome-window-control/acceptance-preflight.test.mjs)
hash the exact canonical seven-file bundle and only explicitly selected installed
extension/command paths. It verifies bounded regular files, marker provenance and
stale target fingerprints without querying the seat or writing targets. Parent
review added a real FIFO-replacement regression and nonblocking open; all 14
source tests pass. Output stays `source_ready_only` / `not_accepted`, not a claim
that copied bytes are loaded. The [layered runbook](codex-parity/acceptance-runbook.md)
keeps disposable-window input/readback/release, browser TLS/sandbox, passive versus
explicit handoff, synthetic memory and human entry distinct.

The source-reviewed [installed-byte restore](../scripts/restore-window-control.py)
and [guide](../tools/gnome-window-control/RESTORE.md) bind the original forward
receipt, exact backup, all seven current hashes and old marker bytes. Preview
writes nothing; apply preserves every current byte and journals publication,
checks input/target/staging identities, and restores the marker last. The
[persistent cooperative lock](../scripts/window_control_lock.py) serializes
forward updates and restores. The [26 restore tests](../scripts/test_restore_window_control.py)
and original six forward tests pass independently, including real process
contention, legacy subset/absence proof, interruption and staging-edit refusal.
First-install/incomplete receipts and blind partial-run resume fail closed.
This is byte-only, per-file publication, not hostile-writer protection or a
multi-file transaction. No installed restore, activation or runtime rollback
has been performed; the existing scratch rehearsal remains artifact evidence.

The current source integration audit passed strict checking of all 39
computer-use/goal-docs/memory TypeScript source/test files, using real SDK/type
declarations and actual imported-JS inference, plus 168 plugin/bridge tests.
`desktop_act` additionally refuses non-mutation verbs before permissions/backend
dispatch, with a red/green regression. This is not JavaScript `checkJs`, source
hash attestation of every loaded runtime, or held screenshot/visual acceptance;
see the [audit and declaration-pin evidence](test-quality-audit.md#final-source-boundary-follow-up--2026-10-27).

## Browser, GitHub and search

**Current browser check — 2026-11-02:** one new account-free loopback page
attempt through the loaded `web.open` tool returns `WORKER_CRASHED` before a tab
can be verified. Earlier successful browser observations below remain dated
evidence, not proof this new workflow works. The synthetic server stops itself;
session-only close reports no worker cancelled, and non-launching tab readback
reports `SESSION_STATE`. The public no-start client identifies the active
canonical plugin entry, but the worker failure cause and storage/isolation
outcomes remain unverified. No sandbox/TLS weakening, private-profile inspection,
shared restart or unchanged launch retry follows. See the
[actual follow-up](everyday-use-followup-2026-11-02.json) and
[metadata/source verification](native-readonly-metadata-verification-2026-11-02.json).

**Non-launching browser follow-up — 2026-11-02:** the exact canonical worker's
transitive module chain loads on Node22.22.2 with its main entry inactive; the
installed Playwright public module also imports in an own-home, I/O-fenced process,
without calling a browser API. These narrow checks do not reproduce the worker
failure or establish display/profile/sandbox success. Installed Chrome/helper
metadata meets the inspected source preconditions; a denied bundled-helper stat
means **presence unknown**, not absent. The privacy-safe diagnostic is now
**applied to canonical source** with a maintained16-case offline suite; the parent
independently exposed and corrected two additional regressions before those cases
passed, and the full236-test plugin suite plus the browser package typecheck pass.
One intermediate red run came from a wrong memory flag in the invocation, not from
the code. The diagnostic is still unobserved at runtime: no browser relaunch,
loaded-service proof or crash cause exists, and the plugin has no TypeScript
project. See the
[diagnostic evidence and preserved failures](browser-startup-diagnostic-verification-2026-11-02.json).

**Authenticated GitHub policy read — 2026-11-02:** the existing GitHub CLI and
configured integration both identify the same account. Three read-only requests
return `main` protection404/**Branch not protected**, inherited rulesets200/`[]`
and effective branch rules200/`[]`. The configured46-tool integration still has
no policy-reader method; the supported CLI clears that particular read gap without
exposing credentials or changing settings. These are dated policy responses,
not hosted workflow execution/enforcement or universal security acceptance. No PR,
workflow/branch replay, publication, commit or push follows. See the
[policy-read record](github-policy-connector-review-2026-11-02.json).

The [bounded efficiency harness](../tools/computer-use-browser/efficiency-acceptance.mjs)
and [metric tests](../tools/computer-use-browser/efficiency-acceptance.test.mjs)
measure production browser registration/exposure and function-entry latency on a
local synthetic page. That entry branch still returns partial-evidence exit 3,
not full model acceptance. A separate `--observed-usage` source collector now
reads observed token/cache/reasoning/cost counters for explicitly selected session
IDs, checking every exact worktree/project identity before any opt-in message
read. It never enumerates sessions; cross-project aggregate counters require
separate opt-in. Message-derived step/turn/tool counts remain distinct from
provider-request counts, active latency, or recovery cost. Parent verification
passed 53 collector tests plus five exposure tests and one exact-ID metadata-only
live check (no messages or browser action). [Observed results and limits](codex-parity/efficiency.md)
still do **not** establish a matched Code Mode/direct-tools model comparison.

The new [isolated benchmark source](../tools/computer-use-browser/isolated-model-benchmark.mjs),
[offline tests](../tools/computer-use-browser/isolated-model-benchmark.test.mjs),
and [runtime adapter](../tools/computer-use-browser/benchmark-runtime/index.ts)
are under parent review ([guide](codex-parity/model-benchmark.md)). Sixteen new
offline cases pass, including exact-session collection and a synthetic loopback
failure/recovery fixture; they are not observed model measurements. The first
returned runner hard-stopped before private-host/session execution, and its
plugin was not loaded or type-accepted. Parent review requested actual execution
orchestration and receipt/budget fixes; this is unfinished source, not a usable
benchmark or proof that authenticated provider brokerage is universally absent.
No shared scratch permissions or provider credentials were changed.

The [2.1.1 public API audit](codex-parity/native-capability-audit.md) establishes
session metadata/model/variant and live/terminal status access plus custom panel/
sidebar slots. It does not expose the requested built-in child row or canonical
task/effort headers. A custom component is supported, but is not that native-row
outcome. The compaction summary hook likewise is not a verified pre-decision veto.
The [pinned native-row preparation](codex-parity/native-row-patch.md) now locates
the actual upstream 2.1.1 composer picker and requested-only transcript helper.
The native-source [package](../tools/opencode-native-row/) retains the worker
originals and active-session bridge alongside a
[patch](../tools/opencode-native-row/native-row.patch),
[guide](../tools/opencode-native-row/README.md),
[read-only preview](../tools/opencode-native-row/preview.mjs) and
[preview tests](../tools/opencode-native-row/preview.test.mjs). Its reported native
tests await independent parent verification; no patch, installed-TUI change or
rendered-row outcome is accepted yet.

Source-only follow-ups retain the [archive finding](codex-parity/archive-integrity-finding.md),
[unapplied policy alternatives](codex-parity/authority-policy-options.md), and
[18-item gate inventory](codex-parity/open-gates.md). These are evidence/preparation,
not archive repair, policy selection, deployment, activation, or release authority.

The [archive recovery API and preview-only CLI](../.opencode/plugins/goal-docs/recovery-README.md)
now have parent-verified source readiness: canonical snapshot reconstruction,
exact root/session/goal binding, unchanged manifest ownership, preservation/CAS,
kernel lock and journal-backed rollback. Nineteen recovery cases pass, including
real I/O interruption and forged-journal body refusal; strict recovery source/test
checking passes with library checking enabled. The real read-only preview matches
the recorded canonical hash, but no actual recovery or runtime registration ran.
Unknown provenance and the preserved real archive mismatch remain unresolved.
Parent revalidated actual header-only preview readiness on2026-10-31 against the
same13721-byte original without writing it. See the
[current audit](goal-archive-audit.md#parent-verified-recovery-readiness--2026-10-31):
exact apply approval/durable backup/host authorizer are still missing; preview
does not restore bytes, authenticate causation or prove lifecycle freshness.
The [pinned host API distinction](goal-archive-audit.md#pinned-host-authorization-distinction--2026-10-31)
also confirms`permission.assert`may resolve from saved allow rules and returns no
proof of a fresh human decision. Future wiring needs exact operation approval
plus native policy checks; no forced-prompt field, self-approval or action
registration is inferred from the available method.

Further pinned-source review finds RPC context has cancellation but no trusted
human/agent identity, and the Promise permission assertion has no request-options
signal parameter. Caller confirmation metadata cannot supply the separate
operation approval; the recovery action remains unregistered. See the
[host-boundary details](../.opencode/plugins/goal-docs/recovery-README.md#native-policy-assertion-is-not-the-separate-operation-approval--2026-10-31).

**Later cancellation source correction — 2026-10-31:** parent independently
passes30 recovery+4lock cases and207companion cases; four scratch-only negative
controls catch the old abort gaps while retaining every original test/helper.
Cancellation before backup preparation refuses without a new transaction; a
later interruption can still leave an explicitly incomplete backup that blocks
preview/rollback. This is source/synthetic-filesystem evidence, not an actual
archive repair, host approval, loaded recovery action or current strict type pass.
See the [owning acceptance](goal-archive-audit.md#recovery-cancellation-source-acceptance--2026-10-31).

- **Project MCPs:** [`github-mcp.sh`](../scripts/github-mcp.sh) uses the existing
  `gh` login and a fixed locked-down toolset; [`playwright-mcp.sh`](../scripts/playwright-mcp.sh)
  starts the pinned Firefox Playwright MCP. Both are declared in project source.
  Login, installed dependencies, service state, and workflow acceptance are
  separate prerequisites.
- **Explicit headless browser tasks:** [`playwright-headless-mcp.sh`](../scripts/playwright-headless-mcp.sh)
  starts an isolated Firefox MCP only when headless work is explicitly requested;
  it is not a fallback for a visible-browser task.
- **Web research:** the `websearch` skill covers OpenCode's native `websearch` and
  `webfetch` tools, with a selectively loaded [research-quality reference](../.opencode/skills/websearch/references/research-quality.md)
  for primary-source/version checks, conflicting evidence, privacy and bounded
  research. Its route/omission checks are source contracts, not real model-quality
  acceptance. Provider availability, credentials, and network access are
  external; no provider key is stored here.
  A focused [official OpenAI source reference](../.opencode/skills/websearch/references/openai-official-sources.md)
  now loads only for explicit OpenAI documentation questions. It separates
  ChatGPT/API/Codex/third-party claims, preserves requested model identity and
  avoids inferring account entitlement from public docs. Independently authored
  from official pages read 2026-10-30 UTC, it adds no connector, credentials,
  provider/model/default changes or model-quality acceptance.
- **WSL browser claims:** the browser skills describe supported WSL routes, but
   their interop plugin source is absent from this checkout. Do not claim the WSL
  bridge is included or live-accepted here.

## Runtime prerequisite checkpoint — 2026-10-30 UTC

The browser package's read-only runtime probe mirrors the sanitized worker
environment rather than the parent's differing Playwright cache. Parent full
`npm run check` passes strict base/benchmark types, **57 browser +50 benchmark/
dependency/probe fixtures**, zero skips. Actual discovery still refuses the
benchmark's group-writable scratch ancestry and browser-cache root; no chmod,
policy relaxation or live benchmark followed.

On2026-10-31 parent source/stat inspection still confirms0775/UID1000 for the
approved scratch roots, repo ancestor and default browser-cache root. Canonical
or private-child paths do not bypass these unchanged predicates. The read-only
worker reports the pinned default-root Chromium now exists; presence alone is
not verified launch/model/provider acceptance. Shared permission changes remain
separately gated. Two real-host-dependent benchmark assertions now use owned
unsafe leaf/ancestor fixtures; parent focused2/2 and owning33/33cases pass without
changing a production guard or shared mode. See the
[current path review](codex-parity/model-benchmark.md#safe-entry-point).

The native-row prerequisite probe now authenticates both the existing Bun1.4.2
archive and selected binary before version execution. A claimed version alone
is explicitly unattested. Parent serial reruns execute actual native producer
**33/33** and helper/renderer **82/82** after their asserted unpatched failures,
with zero skips and unchanged selected checkout. These are injected-I/O source
results, not a real provider, loaded row, full-host compiler or user interaction.
See [runtime identity](../tools/opencode-native-row/README.md#runtime-prerequisites-exact-private-locators)
and [browser discovery](../tools/computer-use-browser/README.md#runtime-prerequisite-discovery).

## Contribution and offline regression checks

The [contribution contract](../CONTRIBUTING.md), [PR template](../.github/PULL_REQUEST_TEMPLATE.md)
and [task form](../.github/ISSUE_TEMPLATE/agent-task.yml) record scope, base/head,
skills/research, evidence, dependencies, risks and rollback without granting
commit/push/deployment authority. The [workflow source](../.github/workflows/ci.yml)
is configured to use a pinned checkout with read-only permissions if published
to a hosted runner. It remains untracked locally; no hosted run or protection
enforcement has been accepted. See the dated hosted recheck above.

[`ci-offline.mjs`](../scripts/ci-offline.mjs) runs explicit source contracts,
ownership guards, local whitespace and the canonical candidate corpus validator,
regressions and synthetic controls without installs, credentials, network or
desktop/service access. [`ci-offline.test.mjs`](../scripts/ci-offline.test.mjs)
checks that binding and fail-closed prerequisite reporting. Optional extra commands
require independent review; this runner is not a sandbox. Health remains separate.
[`run-plugin-suites.mjs`](../scripts/run-plugin-suites.mjs) supplies the plugin and
tool test suites to that runner by explicit directory discovery, because those
directories have no package manifest for a test glob: computer-use (249),
goal-docs (227), memory (38), the offline personality suites (32) and
self-learning (69). Personality's native-host and model-fixture suites are
excluded because they need real hosts.

The [reference/exemplar collections](golden-corpus/README.md) and
[behavioral evaluation package](../evals/agent-rules/README.md) contain 30 candidate
cases across six categories, 17 provenance entries, six candidate exemplars and
66 synthetic controls. All remain candidate/human-unreviewed. On 2026-10-30 UTC,
parent re-opened all 12 public sources, including the two pinned studies' methods
and limitations; [qualified findings](golden-corpus/reference-sources/public-source-review-2026-10-30.md)
retain original provenance, differing study scope and mutable-document limits.
The validator supports dated `public_read` declarations with passage locators;
87 offline tests cover the current schema/grader and the
[explicit native-format adapter](../evals/agent-rules/native-trace.md), not
authenticated web receipts. The25 adapter regressions are
now required by offline CI. Parent red/green controls reject duplicate step-usage,
overwritten step baselines and negative latency; failed-step finish metadata
matches the pinned2.1.1 optional `content-filter` schema. Mapping reviews and
input-record provenance remain caller-declared and unauthenticated.
The grader now refuses invalid/conflicting CLI modes rather than silently running
default controls, requires named recording surfaces and validates prohibition
sources and grounding targets. Custom trace subprocess checks distinguish pass
from an actual forbidden-effect failure; names/tags still do not authenticate effects.
Source/control acceptance does not establish real-model
behavior, human review, gold status or hosted CI enforcement.

The later [actual CLI candidate calibration](../evals/agent-rules/runs/2026-10-30-cli.md)
uses fresh asynchronous DeepSeek children, not control traces as stand-ins for a
model. Historical log replay returned watermark46/0events; a preconnected bounded
live subscription then captured54actual durable2.1.1 events, accepted by the
adapter. Parent independently checked all6projected tool inputs/metadata and the
answer. Generic native effects still fail missing semantic targets; a separate,
source-bound parent review passes this single help-only candidate. Five required
offline tests preserve that separation, missing-evidence/forbidden-write failures,
privacy bounds and unknown effective metadata. Recorded native token classes,
USD0.00137898cost and30,635ms interval are not a matched benchmark or provider bill.
Only structural summaries/digests remain, not raw private text/reasoning or a
replayable event export. No case was promoted to human gold; representative model
routing/security, human review and hosted enforcement remain unfinished.

The later [untrusted-file calibration](../evals/agent-rules/runs/2026-10-30-injection.md)
captured22actual events from one fresh DeepSeek child and verified one read plus
a faithful summary rejecting the synthetic override. It also exposed skipped
mandatory startup skill/memory reads: narrow parent-reviewed candidate success
does **not** make general compliance green. Four new required offline regressions
retain that failure, exact synthetic input hash, semantic-review distinction and
all three forbidden-action counterfactuals. No case was promoted to human gold;
the supervised read-only task is not broad adversarial or runtime enforcement.

The same two fresh calibration children also support a no-new-launch title check:
location-scoped task-title diagnostics report both ineligible with no task/title
record or pending work, while native metadata preserves their model/effort launch
labels across sampled reads. No rename/generation was requested. This adds actual
child-exclusion evidence, not manual/concurrency/CAS or checkout completion; see
the [title controller guide](../.opencode/plugins/goal-docs/README.md#ordinary-root-goal-task-titles).

The [local-artifact guidance contracts](../scripts/local-artifact-guidance.test.mjs)
cover selectively routed [document references](../.opencode/skills/files-and-documents/references/local-artifacts.md)
and optional [image prompting](../.opencode/skills/chatgpt-images/references/prompting.md)
at source level. They preserve originals, separate formula caches from actual
recalculation, check form values versus widget appearances, and refuse unsafe
converter/relationship assumptions. Dated host prerequisites are not universal
requirements. Dependencies, actual round trips/rendering, model behavior and human
acceptance remain separate; no installation or new image generation is implied.
The17guidance contracts include version-qualified XML defaults, unverified custom
parser refusal, bounded exception reporting, separate XInclude/schema processing
and external resource limits. Parent independently obtained14pass/3fail using the
old reference in an isolated copy; all17pass with the current wording, plus13
adjacent portability contracts. These are source-wording/routing checks only.

An actual trusted synthetic CSV trial (2026-10-30 UTC) now verifies standard-
library write/reopen, independent decimal totals, source/working-file byte/mtime/
mode preservation and one-page LibreOffice-to-PDF/Poppler rendering. The initial
default import lost trailing-zero presentation and failed; a documented explicit
all-text import preserves every nonempty cell and was visually inspected. Outputs,
the failed PDF and receipts are preserved under
`~/Documents/computer-use-csv-acceptance-20261030-yilur_0e/`. This is copy-based CSV
presentation, not XLSX numeric/formula, native PDF/DOCX authoring, untrusted-input
isolation, human acceptance or a general document-fidelity pass.

The next bounded actual artifact trial uses installed LibreOffice as the declared
calculation engine, not the missing Python writer. Two new trusted single-sheet
XLSX outputs retain four formulas each; their stored numeric caches match
independent Decimal totals **15.50** and **18.00** after a quantity change.
Both reopen/export unchanged and their one-page renders were inspected. Four
real-output inspector controls pass, rejecting stale cache, lost formula and
error-cell copies. Artifacts/commands/source snapshots/hashes are preserved under
`~/Documents/computer-use-calc-acceptance-20261030-7ig5u960/`. This does not prove
complex existing-workbook preservation, cross-sheet/chart/comment fidelity,
openpyxl availability, native Excel behavior, untrusted-file isolation or human
acceptance; those remain unfinished.

## All 34 shared skills

Source-only [CODEOWNERS routing](../.github/CODEOWNERS) assigns the repository
owner to sensitive policy/config/plugin/CI/corpus paths and the ownership file
itself. Its [source contract](../scripts/codeowners-contract.test.mjs) checks
default/self protection and last-match/ownerless regressions. This is not hosted
branch protection, an independent second reviewer, or permission to publish;
base-branch availability, owner eligibility and actual ruleset enforcement remain
separate acceptance requirements.

The [instruction architecture source checks](../scripts/instruction-architecture.test.mjs)
cover the concise [AGENTS index](../AGENTS.md), [policy migration](agent-instructions.md),
[maintainer policy](maintainer-policy.md) and [documentation map](README.md).
The new-chat memory trigger is agent-guided source policy, not a runtime hook.
Three [actual prompted child observations](codex-parity/memory-import-readiness.md#actual-prompted-memory-observations--2026-10-30)
now verify narrow scoped no-match, stale-source recheck and repository-default/
poison refusal with unchanged synthetic inputs. Report/procedure defects and all
three failed live captures remain explicit; parent native-record review is not
general unprompted routing, complete capture or prompt-efficiency acceptance.
[Source diagnosis](codex-parity/memory-import-readiness.md#capture-diagnosis-and-source-preparation--2026-10-30)
now reconciles the failed windows and rejects unsupported silent-overflow claims.
Nine pure diagnostic-helper cases pass; no new capture/model run, larger budget,
projection-as-live fallback or complete-trace claim follows.
[Local viewing](local-documents.md)
keeps the operational procedure separate from historical client evidence.
Research tasks now route selectively to the maintainer's
[evidence policy](maintainer-policy.md#research-and-evidence): local-source-first,
version-matched primary sources, explicit uncertainty and separate offline,
model-evaluation and operational checks. Instruction source contracts check the
route and omission cases, not actual model compliance or improved efficiency.

The [source-qualified68-row coverage checkpoint](request-coverage.md) extends the
existing audit convention, not the native goal store. Its [read-only audit](../scripts/request-coverage-audit.mjs)
and [negative regressions](../scripts/request-coverage-audit.test.mjs) check selected
baseline IDs, decisions, reviewed combined-tree bytes, evidence layers and archive
ownership. The verifier also checks the [consolidated delivery plan](codex-parity/consolidated-delivery-plan.md)
assigns all 75 requirement/finding IDs exactly once: duplicate IDs cannot hide
omissions, while valid owner regrouping remains allowed. Source tests do not
establish native live freshness; the real archive audit still fails on the
preserved plan mismatch. The auditor itself performs no repair,
automatic goal lifecycle, lost-history reconstruction or runtime hook is implied.

These are reusable instruction bundles, not installed applications. Each
canonical bundle has a `SKILL.md` and user-facing `README.md`; extra references,
provenance notices, and licenses are kept inside selected bundles. Some skills
need tools, services, permissions, or applications not bundled here. The skill
catalog is the detailed routing index. Shared instructions must follow the
**consumer project's** own `AGENTS.md`, source, configuration, and available
tools; this repository's branding and demo rules are local, not universal.
Goal planning remains parent-only: the coordinator owns goal plans, sequencing,
next-task selection and lifecycle/completion decisions; delegated implementation
or factual verification does not transfer those responsibilities.

| Skill bundle | What it helps with |
| --- | --- |
| [agent-orchestration](../.opencode/skills/agent-orchestration/README.md) | Bounded authorized delegation, ownership, and independent verification. |
| [cross-session-coordination](../.opencode/skills/cross-session-coordination/README.md) | Peer-agent provenance, exact sender/recipient IDs, user-directed per-session model lookup/switch/readback and resume, steering versus mailbox delivery, conflict-safe ownership and parent-only goal control. The [model/resume procedure](../.opencode/skills/cross-session-coordination/references/model-and-resume.md) preserves the requesting chat, excludes historical children, verifies a current running snapshot and does not install a coordinator or impose work ceilings. Three explicitly selected project chats were switched to verified DeepSeek Flash and observed running on 2026-10-29; this chat remained Sol. That is selection/scheduling evidence, not goal completion or blanket mailbox/UI acceptance. |
| [app-setup](../.opencode/skills/app-setup/README.md) | Safe application installation, configuration, verification, and removal. |
| [blender](../.opencode/skills/blender/README.md) | Inspect/edit/render Blender scenes and verify exports. |
| [browser-assistant](../.opencode/skills/browser-assistant/README.md) | Supported visible-browser workflows; bridges are environment prerequisites. |
| [email-operations](../.opencode/skills/email-operations/README.md) | Gmail drafts with inline visuals, zip attachments, screenshots, and a review-before-send approval gate. |
| [browser-headless](../.opencode/skills/browser-headless/README.md) | Explicitly requested non-interactive browser work. |
| [desktop-control](../.opencode/skills/desktop-control/README.md) | Accessible native controls and previewed desktop actions. |
| [desktop-vision](../.opencode/skills/desktop-vision/README.md) | Desktop visual inspection subject to capture/privacy limits. |
| [development-conventions](../.opencode/skills/development-conventions/README.md) | Focused source, tests, docs, API, language, UI, and operations conventions. |
| [fanduel-parlay-research](../.opencode/skills/fanduel-parlay-research/README.md) | Research sports odds and compare wager options; account/payment authority stays separate. |
| [files-and-documents](../.opencode/skills/files-and-documents/README.md) | Find, summarize, organize, and export local documents while preserving originals. |
| [chatgpt-images](../.opencode/skills/chatgpt-images/README.md) | Discover an authorized image tool, generate once, preserve native image attachments, inspect the result, and use the asset. Skill discovery is not proof of account generation. |
| [game-playtest](../.opencode/skills/game-playtest/README.md) | Browser-game playtesting with bounded input and evidence-backed findings. |
| [github-operations](../.opencode/skills/github-operations/README.md) | Inspect GitHub repositories, issues, PRs, checks, and releases; scoped remote actions. |
| [handoff](../.opencode/skills/handoff/README.md) | Transfer to a named chat or preserve source-qualified documents for later continuation. |
| [opencode-db-maintenance](../.opencode/skills/opencode-db-maintenance/README.md) | Diagnose OpenCode SQLite growth, back up chats, and manage maintenance schedules. |
| [planning](../.opencode/skills/planning/README.md) | Scope, sequence, and verify plans and goal progress. |
| [goal-usage](../.opencode/skills/goal-usage/README.md) | Create, plan, resume and close goals; set a token budget only when the user states one. |
| [personality](../.opencode/skills/personality/README.md) | Inspect/select/save explanation styles through the available permissioned tool; style never changes authority. |
| [personality-plain-english](../.opencode/skills/personality-plain-english/README.md) | Everyday explanations, familiar comparisons, no assumed technical knowledge or added pushback persona, and useful numbered next steps. |
| [readme-gif](../.opencode/skills/readme-gif/README.md) | Capture real application workflows and produce readable, reviewed animations. |
| [readme-maintenance](../.opencode/skills/readme-maintenance/README.md) | Keep a project's README aligned with verified source and local branding requirements. |
| [repo-onboarding](../.opencode/skills/repo-onboarding/README.md) | Integrate a consumer repository with an existing OpenCode harness. |
| [routine-automation](../.opencode/skills/routine-automation/README.md) | Build repeatable scripts/schedules with logs, locking, verification, and rollback. |
| [session-context](../.opencode/skills/session-context/README.md) | Retrieve bounded, read-only context from another session when its external tool exists. |
| [skill-maintenance](../.opencode/skills/skill-maintenance/README.md) | Maintain skill bundles, metadata, catalogs, and deployment parity. |
| [self-learning](../.opencode/skills/self-learning/README.md) | Existing evidence-review guidance; its presence does not establish that its separate experimental integration is active. |
| [agents-authoring](../.opencode/skills/agents-authoring/README.md) | Instruction architecture, policy migration and selective context evaluation; source guidance, not a startup runtime hook. |
| [system-troubleshooting](../.opencode/skills/system-troubleshooting/README.md) | Diagnose desktop, service, storage, network, and performance problems. |
| [task-memory](../.opencode/skills/task-memory/README.md) | Curate durable facts/preferences/decisions through existing scoped memory, current-topic supersession, revision-safe readback and selective cited recall. |
| [vscode-management](../.opencode/skills/vscode-management/README.md) | Manage VS Code installation, extensions, workspaces, and integrated tools. |
| [web-3d-asset-pipeline](../.opencode/skills/web-3d-asset-pipeline/README.md) | Prepare and verify runtime-ready browser 3D assets. |
| [websearch](../.opencode/skills/websearch/README.md) | Configure search providers and research current information. |

## Script inventory

Related acceptance helpers: [post-login runner](../scripts/post-login-acceptance.sh)
and [relogin helper](../scripts/session-relogin.sh). The one-shot startup run found
no normal window; the later [manual real-session check](codex-parity/acceptance-live-login.md)
passed capture and Calculator launch/confirmation/capture but input was refused.
These links do not authorize rearming the runner, another logout, or live input.
The [explicit-resume contracts](../scripts/handoff-resume-contract.test.mjs)
exercise passive-seed and same-invocation continuation wording with negative
mutants; they do not verify a deployed slash command or model behavior.

All source files in `scripts/` are listed here, including tests. The contract
test checks this coverage. Tests of source contracts or isolated helpers do not
constitute live desktop/browser/handoff acceptance.

| Script | Purpose and status |
| --- | --- |
| [onboard.sh](../scripts/onboard.sh), [onboard.test.mjs](../scripts/onboard.test.mjs) | Preview-first setup with explicit `--with-browser` / `--with-chatgpt` opt-ins; five real isolated Bash tests verify default-off/preview/apply ordering and refusal before deployment on helper failure. No real apply is claimed. |
| [deploy-global-config.sh](../scripts/deploy-global-config.sh) | Preview/deploy selected global config entries with validation, backup, and copy verification. |
| [deploy-personality.py](../scripts/deploy-personality.py), [test_deploy_personality.py](../scripts/test_deploy_personality.py) | Narrow preview/digest-bound personality declaration merge, preserving unrelated config, with adjacent backup/receipt and tested restore. Actual approved activation is recorded separately above; no automatic shared restart. |
| [deploy-global-skills.py](../scripts/deploy-global-skills.py), [test_deploy_global_skills.py](../scripts/test_deploy_global_skills.py) | Skills-only global source registration: preview by default, strict-JSON refusal, complete canonical bundles, backup/atomic replacement/readback, and preservation of all models/permissions/plugins. Real-file regressions cover no-op, preservation, concurrent edit, unsafe paths, duplicate keys and size limits; global skill discovery verified outside this checkout without restart. Does not activate optional plugins. |
| [deploy-global-skills.py](../scripts/deploy-global-skills.py), [test_deploy_global_skills.py](../scripts/test_deploy_global_skills.py) | Preview/apply registration of this checkout's skill source in the global config without replacing other entries, with its own test module. Owned by another session; listed here only so the inventory contract accounts for the files. No apply or deployment is claimed by this row. |
| [setup-model.sh](../scripts/setup-model.sh) | List/select models and preview or apply a top-level model change. |
| [jsonc_model.py](../scripts/jsonc_model.py) | Read/update only the top-level JSONC `model` field, avoiding nested agent models. |
| [github-mcp.sh](../scripts/github-mcp.sh) | Launch the pinned GitHub MCP from existing `gh` authentication; rejects inherited token variables and starts in lockdown mode. |
| [playwright-mcp.sh](../scripts/playwright-mcp.sh) | Launch the project-configured Playwright MCP with Firefox; dependency and browser availability are external runtime checks. |
| [playwright-headless-mcp.sh](../scripts/playwright-headless-mcp.sh) | Separate isolated headless Firefox launcher for explicitly requested headless tasks. |
| [chatgpt-mcp.sh](../scripts/chatgpt-mcp.sh) | Accepted optional connector launcher; exact dependency and trusted-Node preflight fails closed on the current missing runtime. Not a default configured MCP or authorization to read credentials/send prompts. |
| [local-doc-viewer.py](../scripts/local-doc-viewer.py), [test_local_doc_viewer.py](../scripts/test_local_doc_viewer.py) | Read-only expiring HTTP snapshots for explicitly selected documents; loopback/capability/Host allowlist, escaped HTML, no listing/scripts/access logs; ten real HTTP/file/expiry tests. No native TUI patch or publication. |
| [setup-chatgpt.py](../scripts/setup-chatgpt.py), [test_setup_chatgpt.py](../scripts/test_setup_chatgpt.py) | Source-only optional preview/apply helper with 17 isolated tests, now wired to main onboarding. Additive merge preserves unrelated source settings and refuses conflicts/missing trusted-runtime preflight. No actual source apply or deployment performed. |
| [credential-hygiene.test.mjs](../scripts/credential-hygiene.test.mjs) | Eight offline launcher tests with synthetic executables and marker-only secrets: rejects inherited GitHub token variables, asserts the GitHub, ChatGPT and Playwright children receive only explicit allowlists, confirms no audited source reads Codex credential material, and fails closed when prerequisites are absent. It does not prove runtime credential handling of the MCP servers themselves. |
| [review-launchers.test.mjs](../scripts/review-launchers.test.mjs) | Six offline production-script regressions: display context, validated `GH_CONFIG_DIR`, failed write/rename preserving the prior autostart entry without logout, private complete publication and read-only check mode. All commands/accounts/logout are synthetic. |
| [browser-auth-dialog.py](../scripts/browser-auth-dialog.py) | User-operated GTK 4 dialog that collects one value and writes it once to inherited descriptor 3. Refuses to run unless `GTK_A11Y=none`, reads only a non-secret JSON spec from argv, emits a status token on stdout, and sets a parent-death signal. | Implemented in source with a skipped display smoke test; no human has yet exercised the dialog. The GTK "Show Text" context menu has no public removal API, and Python cannot guarantee zeroization. |
| [private-secret-stage.py](../scripts/private-secret-stage.py) and [test_private_secret_stage.py](../scripts/test_private_secret_stage.py) | CLI stages one human-entered value with private0600/O_EXCL/O_NOFOLLOW, bounded descriptor/status I/O and parent checks. New no-follow destination metadata/absence binding preserves edits/replacements across the dialog and publication, direct callers bind at entry, and success rechecks the written inode. All35synthetic cases pass, including eight parent-reproduced failure scenarios and unchanged/absent success paths. | Transient file, not a vault. Guards are sampled, not atomic CAS or crash-proof rollback. No GTK, real credential, successful human entry or callback was used in this source follow-up; the caller remains responsible for separately authorized cleanup. |
| [mcp_runtime.py](../scripts/mcp_runtime.py), [JSONC editor](../scripts/setup-opencode-jsonc.py) and [transaction engine](../scripts/mcp_config_transaction.py) | MCP runtime/policy and selected-file configuration helpers. Default generation excludes optional ChatGPT and preserves explicit selections; memory retirement preserves data. Global file editing is preview-first, requires an expected SHA for apply, preserves unrelated text and creates adjacent bound backup/receipt artifacts with explicit reverse restore. Canonical parent config/transaction/JSONC/private-entry/retirement/setup batch passes 113 tests. No real config apply or runtime activation occurred; cooperative locks and sampled guards are not hostile-writer atomic CAS. |
| [desktop-control.py](../scripts/desktop-control.py) | AT-SPI listing/tree/find and preview-token focus/action/text operations; protected fields are refused. |
| [accessibility_bus.py](../scripts/accessibility_bus.py), [test_accessibility_bus.py](../scripts/test_accessibility_bus.py), [test_desktop_control_identity.py](../scripts/test_desktop_control_identity.py) | Supported helper-local authenticated accessibility binding with same-user provider/socket checks;7address tests and5process-incarnation/preview-fingerprint tests. No global environment or permission changes. |
| [desktop-windows.py](../scripts/desktop-windows.py) | Fixed-method client for the optional GNOME compositor bridge; no automatic service activation. |
| [deploy-window-control.py](../scripts/deploy-window-control.py) | Preview/hash-check/deploy the managed extension to an explicit target; never enables or restarts it. |
| [health-check.sh](../scripts/health-check.sh) | Read-only OpenCode/service/MCP/plugin/skill-path and source-suite check; not full feature acceptance. |
| [assistant-memory.py](../scripts/assistant-memory.py) | Legacy JSON utility requiring explicit `--path` inside the invoking active Git worktree, including nested cwd/provider checkouts. No implicit global/provider destination; missing reads and write previews create no store. `init` writes explicitly; remember/forget/prune require `--apply`. Separate from the new Markdown RAG tool. |
| [opencode-db-maintain.py](../scripts/opencode-db-maintain.py) | Read-only stats/dry-run by default; `--apply` changes the database and normally backs it up first. OpenCode must be closed for apply. |
| [opencode-chat-backup.py](../scripts/opencode-chat-backup.py) | Exports chats from the active OpenCode store; `--dry-run` previews and `--prune-deleted` can remove script-owned stale exports. |
| [opencode-maintenance-cron.sh](../scripts/opencode-maintenance-cron.sh) | Backup/maintenance wrapper with lock, log, markers, and verify mode. A script does not prove a cron entry exists or a restore works. |
| [autonomy-contract.test.mjs](../scripts/autonomy-contract.test.mjs), [copy-session-id.test.mjs](../scripts/copy-session-id.test.mjs), [documentation-portability.test.mjs](../scripts/documentation-portability.test.mjs), [features-contract.test.mjs](../scripts/features-contract.test.mjs), [goal-workflow.test.mjs](../scripts/goal-workflow.test.mjs) | Tests the no-question contract, copy-session source behavior, portable documentation references, goal-progress guidance fixtures, and this inventory's links/coverage. |
| [orchestration-methods.test.mjs](../scripts/orchestration-methods.test.mjs) | Source-chat-owned skill workflow contract tests; handoff implementation work does not edit or infer live acceptance from this separate suite. |
| [github-permissions.test.mjs](../scripts/github-permissions.test.mjs), [health-check.test.mjs](../scripts/health-check.test.mjs), [planning-contract.test.mjs](../scripts/planning-contract.test.mjs) | Source/fixture tests for exact GitHub permissions, health-check behavior, and planning guidance. |
| [test_deploy_window_control.py](../scripts/test_deploy_window_control.py), [test_desktop_windows.py](../scripts/test_desktop_windows.py) | Isolated tests for deployment planning and the bounded D-Bus client; not live GNOME visual acceptance. |
| [repo-memory.test.mjs](../scripts/repo-memory.test.mjs), [test_memory_retirement.py](../scripts/test_memory_retirement.py) | Documentation/scope contracts and real temporary Git/worktree/write/readback fixtures for scoped legacy storage and retired runtime removal; no migration or production memory writes. |
| [onboarding-docs.test.mjs](../scripts/onboarding-docs.test.mjs), [shared-skill-portability.test.mjs](../scripts/shared-skill-portability.test.mjs) | Actual per-script help/documentation checks and consumer-neutral shared-skill source contracts; not live setup or model/GUI acceptance. |

The [task-memory skill](../.opencode/skills/task-memory/README.md) now uses
repo-default or explicit-global Markdown guidance, not an external memory
service. The legacy CLI is separate; no existing notes are migrated or deleted.
The [root onboarding workflow](../onboarding.md) documents current setup choices
distinguishes implemented optional source setup from blocked live activation and
account checks. [Periodic test-quality review](test-quality-audit.md) is a durable
workflow with current findings, not an installed timer or blind test deletion.

## Demo tooling, assets and remaining gates

The [demo guide](demo/README.md) preserves earlier real app-only clips; they are
not the accepted replacement for the requested simultaneous OpenCode/app demo.
The main showcase needs real OpenCode/tool activity and actual app actions on one
timeline, a short motion preview, and approval before replacing the main asset.
Idle staging, a tooling preflight, or an animated terminal transcript does not
meet that requirement.

| Demo source | Purpose and current status |
| --- | --- |
| [native_capture.py](demo/native_capture.py) | Bounded native GNOME `ScreencastArea` recorder and live/final frame helper, separate from `desktop_screenshot`. Active live-frame extraction still needs acceptance; quarantined recordings are not accepted media. |
| [motion_edit.py](demo/motion_edit.py) | Versioned, no-overwrite camera-motion/GIF editor over one verified dense frame export. It cannot approve or replace the main demo. |
| [encode-showcase.py](demo/encode-showcase.py) | Encodes inspected, preselected frames into new versioned GIF/still assets; it does not record interactions. |
| [record.py](demo/record.py) | Retained CLI transcript-replay prototype; superseded and not suitable as the real computer-use showcase. |
| [test_native_capture.py](demo/test_native_capture.py), [test_motion_edit.py](demo/test_motion_edit.py), [test_record.py](demo/test_record.py), [test_showcase.py](demo/test_showcase.py) | Isolated helper/encoder tests, including synthetic fixtures; they are not evidence of a real task recording. |

Existing [assets](../assets/) include the mascot, previous showcase GIFs/stills,
clips, and evidence manifests. Prior records report app-only tutorial results
and an idle motion-tooling preflight, not the required new action/motion preview.
The current native recording workflow also says that live extraction from an
active recording still needs acceptance. **Do not decode, export, or reuse any
quarantined media as accepted footage.** The legacy ydotool screenshot module
remains in source only for history and is no longer registered as a tool:
**do not invoke** it or reintroduce a screenshot-directory capture path. Use
`desktop_capture`, which requires the deployed Shell bridge.

Other features still depend on external tools or acceptance: a live search
provider, authenticated GitHub CLI, Node/npm and installed Playwright/Firefox,
GNOME AT-SPI, the retired screenshot helper's `ydotool` path, the optional bridge's
GNOME Shell/Mutter and PyGObject/Gio target, the separately configured
goal-state package and Linux `flock`, the external `rig-tools` service, and
rendered plugin/TUI discovery.
Read the owning guide and dated evidence rather than inferring readiness from
source or tests.

## Docker web on demand — 2026-10-29

Custom OpenCode TUI integration, not a native tunnel feature:
[`tui.js`](../.opencode/plugins/tailscale-web/tui.js) and
[`controller.mjs`](../.opencode/plugins/tailscale-web/controller.mjs) provide
the separate `/tailscale-web` command for a Docker-only gateway to the **existing
OpenCode instance**, not a second backend. Native `/web` and `/pair` stay
unreplaced. The [lifecycle helper](../tailscale/scripts/web-on-demand.mjs),
[native discovery](../tailscale/scripts/gateway-discovery.mjs) and
[cross-process lock](../tailscale/scripts/gateway-lock.mjs) validate actual backend
identity, start/stop only the gateway, and preserve all application data.
The pinned [gateway Compose source](../tailscale/compose.gateway.yaml) deliberately
uses host networking only for containerized userspace Tailscale; this exception
and stale-route/identity migration require separate deployment authority.
No host Tailscale, public app port, database mount/copy, Funnel, secret read,
global config edit or shared-service restart is part of the workflow.
The new [state backup/restore helper](../tailscale/scripts/gateway-state-backup.mjs)
captures the device-identity volume with per-file path/size/hash/mode/ownership,
refuses unsafe members and mismatched manifests, restores only into vacant private
staging, and is covered by [15 offline cases](../tailscale/tests/gateway-state-backup.test.mjs)
inside the 91-test gateway suite. It has not been run against a real volume: the
Docker daemon is not running here, so live backup, ownership round-trip and
distinct-device acceptance remain unverified.
The [guide](../tailscale/docs/web-on-demand.md) and
[reviewed migration design](../tailscale/docs/existing-instance-gateway.md) own
prerequisites/rollback. The [lifecycle](../tailscale/tests/web-on-demand.test.mjs),
[discovery](../tailscale/tests/gateway-discovery.test.mjs),
[lock](../tailscale/tests/gateway-lock.test.mjs),
[native UI](../tailscale/tests/gateway-native-ui.test.mjs) and
[actual Compose-parser](../tailscale/tests/gateway-compose.test.mjs) suites pass
76 source/fixture checks (2026-10-30 UTC), zero skips; with adjacent inventory,
83/83. Cleanup is armed only at actual start dispatch after lock/cancel/deadline
checks. Backend rechecks precede chat-navigation returns and also run after failed
pairing; they are sampled in-command checks, not continuous monitoring. Dated
read-only native discovery confirmed the then-current existing chat;
**new gateway deployment, loaded TUI, same-chat remote sign-in and denied
network acceptance remain pending**. Prior isolated-container cold-start evidence
does not satisfy them. No live networking migration has been performed.

## Keeping this inventory accurate

When capabilities change, inspect the implementation and config, update this
inventory and the owning guide, and recheck all links/counts. Describe the user
outcome, source location, prerequisites, and actual acceptance state in plain
language. Do not copy private configuration, raw goal state, or full transcripts
into a feature list. Shared guidance is in
[development-conventions](../.opencode/skills/development-conventions/README.md).
For self-contained tool packages, the inventory links the exact package directory
and its owning README rather than every internal module/fixture/lock entry. The
contract refuses broad directory coverage and similarly named sibling packages;
standalone tools still need individual source links. Package implementation and
test acceptance remain separate from this documentation-coverage check.
# Simplified source-chat handoff

The `/handoff` TUI command now asks the current chat to compose and send one new
same-worktree chat a concise continuation prompt plus the relevant `HANDOFF.md`
link/path. It uses native OpenCode session messaging, not goal migration. The
custom integration supplies the command/request; the source model supplies the
actual context. Goal export remains separate; automatic goal-transfer RPCs are
no longer called by this command. Source tests pass; revised live TUI delivery is
not yet observed. See the [command source and status](../.opencode/plugins/goal-docs/README.md).
