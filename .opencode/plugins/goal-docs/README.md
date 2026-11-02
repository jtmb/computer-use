# Goal Docs companion

Project-local OpenCode V2 goal-document exporter and source-chat handoff command.

## Simplified `/handoff`

The command now sends a normal steering request to the **current chat**. That chat
composes a short continuation prompt from its conversation, includes a Markdown
link and exact path to the relevant existing `HANDOFF.md`, creates one independent
chat in the same worktree, and sends the message with `delivery: "steer"` and
`resume: true`. The source confirms actual admission and stops the transferred
work; it does not claim the receiver has completed it.

The command does not invoke goal-export/transfer/open RPCs, navigate to a blank
destination, show a pending-seed preview, or require `/handoff_resume`. It does not
automatically create or migrate goals or change their status or approval limits.
It works without a goal or the server RPC companion. Command-collision and exact
selected-worktree checks remain. Export observation remains a separate capability.

Source wiring tests cover the dispatch and refusal boundaries. Live invocation of
the revised command and model-authored destination delivery remain unverified;
existing TUI instances may still have the old module loaded. No runtime settings
or deployed copies were changed for this revision.

## Worker naming and automatic source requests

### Ordinary root goal-task titles

The separate [task-title controller](task-titles.ts) handles ordinary root chats
with an active goal at normal model-context boundaries. It preserves an initial
concise user/model label and appends the exact full session ID. A changed goal,
phase/task identity or task description requests a new **model-authored** semantic
label through the supported transient `session.generate` API; plan-revision or
usage churn does not. Publication now requires the host capability described
below; an unsupported host does not generate a replacement. Raw task prose is untrusted summary input, never a truncated
title. Generated output must be a plain 2–5 word label at most 28 characters.

Children/forks, reviewers, handoff-lineage workers, foreign locations/projects,
Plan/read-only/reverted sessions, blocked phases and nonactive goals are excluded.
Handoff workers retain the separately verified lineage behavior below. A deliberate
rename observed at the guard checkpoints wins; generation and durable saves are
followed by fresh session/task checks before writing. Per-session serialization,
durable attempted-task deduplication, a 15-second generation signal and unload
cancellation prevent replay in the owning loaded instance. Errors suspend this
controller for that session until reload rather than interrupting native execution,
except unsupported capabilities and verified same-session title conflicts.
No goal, prompt history, child title or handoff setting is changed.

#### Goal-tool receipts — allocation-bound verification

The existing optional [goal-tool adapter](goal-tool-titles.ts) accepts successful
mutation receipts, not goal status/history/list reads or reused/conflicting/error
results. It asks the same controller to review the current owned task; it does not
force a rename or replace the conditional-publication/manual-title safeguards.

The 2026-11-01 source correction keeps the existing 128-part and 2,000,000-byte
text limits but charges all UTF-8 fragment bytes **and join separators before
joining**. Previously the per-fragment check could permit a combined allocation
far above the final text limit before rejection. Textual output/state fields are
also size-checked before trimming, lowercasing or regex classification, and text
payloads before JSON parsing. A nonnull wrapper error is refused without trimming
it, as the final receipt path already refused such errors. Oversized status text
now fails closed instead of being treated as an unknown success-like value.
Structured receipt objects are not serialized or recursively size-audited here;
this is a bound on this adapter's text processing, not all host acquisition/memory.

At the 2026-11-01 source checkpoint no tests, types or loaded naming outcome had
been checked. The later user verification instruction supersedes the old testing
restriction, not solo execution or consequential-action gates.

On 2026-11-02 all eight new receipt-boundary tests and two-root strict/library
checking pass against unchanged production source. The existing two owning tests
already passed and are not rerun. Five earlier isolated faults were caught; a
sixth survived because overflow-first input masked its missing per-part byte guard.
Strengthening only that test with overflow-last inputs catches the same fault at
the forbidden join, while accepting each exact-boundary counterpart. The original
surviving result and all six original logs remain, rather than being replaced by
the corrected result. See the [commands, controls and limits](../../../docs/title-receipt-verification-2026-11-02.json).
These are actual hook source tests with a recording controller, not native title
generation/manual-title CAS, full types/build or an observed exhaustion repair.
Numeric limits, tool selection, controller and capability guards are unchanged.

**2026-10-31 source checkpoint:** optional `session.capabilities()` must return an
object with exact numeric `conditionalTitleUpdate:1`. Missing, malformed or rejected
handshakes cause no generation, record writes or rename and do not suspend the
controller. There is no version guess, probe write or legacy fallback. Supported
publication sends the exact last-read title as `expectedTitle`. Only an exact
same-session `Session.TitleConflictError` is treated as a concurrent rename:
re-read task and ownership, record the actual title as `manual` if still eligible,
and neither retry, compensate nor permanently suspend. Failed state/session reads
remain reported failures; they are not silently called ownership changes.

The [unapplied native artifact](../../../tools/opencode-title-cas/README.md) now
tests this exact current controller through the real staged Promise adapter and
core. Three integration cases verify supported publication, final-read/write human
conflict and refusal of the old adapter without effects. Removing only the
precondition or only the capability gate in separate staged controller copies
fails actual title preservation. The complete artifact passes49tests(48positive
plus one unsafe old-adapter observation) and seven expected-failure controls;
187goal-docs source tests pass. Bun strips types: full strict/library checking,
OpenAPI regeneration, native application and loaded/manual-title acceptance are
still unverified. The old host must remain fail-closed if it loads this controller;
no native capability has been deployed by this source work.

The independent handoff-worker naming branch now uses the same optional numeric
capability and exact last-read precondition. Unsupported hosts skip only the
rename, not unrelated policy/settings/manual-handoff behavior. A verified
same-session conflict does not suspend or retry. Parent found a further awaited-
handshake race and added fresh ownership/lineage/Plan/revert/title checks before
publication. Nine owning tests and59focused automation/settings/wiring cases pass;
seven earlier fixture failures remain documented rather than removing their
semantic assertions. Combined real staged worker proof and full types remain
pending at this source checkpoint.
Later parent proof in`/tmp/opencode/title-cas-odB6rF` verifies both exact copied
controllers through the real staged Promise adapter/core:6cases cover success,
final-write manual conflict and unsupported-host refusal for root and worker.
Worker metadata/policy stay intact and no handoff is sent. Separate root/worker
precondition-removal and capability-removal controls fail stored-title preservation.
The full artifact57tests and9title failure controls pass, as do196goal-docs source
cases. Staged OpenAPI generation/freshness/schema checks now pass too; neither the
served schema nor full types or installed title behavior is inferred.

Later read-only loaded diagnostics on the exact coordinator/location now include
`publicationCapability:unavailable`(eligible, not suspended or pending). Sampled
native title/time stay unchanged across the bounded probe(1,654bytes/168ms).
The [dated observation](../../../tools/opencode-title-cas/loaded-readiness-2026-10-31.json)
establishes the new diagnostic field is loaded, not that the running native host
supports conditional publication. No generation, rename, settings change,
deployment or reload was issued; the loading mechanism is not inferred.

Read-only diagnostics use RPC `computer-use.task-titles/status`, scoped to the
exact plugin location and session. They report eligibility, suspended/pending
state, current versus attempted task hashes, current versus recorded titles and
`publicationCapability`(`unavailable` or `conditional-title-v1`).
New attempts record `attempted`, `preserved`, `generated` or `manual`; legacy
records report no action rather than guessing provenance. Reading status never
generates, retries, renames or migrates a record. For example:

```bash
opencode api post '/api/rpc/computer-use.task-titles/status?location%5Bdirectory%5D=%2Fhome%2Fjames%2Frepos%2Fcomputer-use' \
  --data '{"input":{"sessionID":"<exact current session ID>"}}'
```

The following are historical loaded observations, before the new source handshake.
On 2026-10-30 the actual location-scoped RPC responded for the coordinator:
eligible, not suspended/pending, current and attempted hashes equal, with matching
recorded/current `Verify Image Preview` title. That establishes loaded diagnostic
registration and state comparison, **not** correct semantics for a subsequent
task or whether the legacy record came from generation versus manual preservation.
The next genuine goal-task transition reported a new matching task hash,
`action: generated`, and matching native/recorded title **Voice Workflow
Verification**, with no suspension/pending work. This verifies one loaded
model-authored root transition, not the full child/manual/concurrency matrix.
No manual rename was used to manufacture it.
Later exact-location diagnostics on two freshly executed DeepSeek children
(`ses_e718ed4cfffe9D6ffeiNpfx9Os`, `ses_e7187dac3ffeCf9xlSucHKM2Rk`) report
`eligible:false`, no pending/suspended work and null task/attempt/record/action
fields. Native metadata confirms their actual parent/location and unchanged
model/effort launch labels across sampled before/after reads. No child rename,
generation or migration was requested. This is loaded child-exclusion evidence,
not the remaining manual/concurrency matrix or an atomic race guarantee.
The inspected V2 `session.update` API has no conditional-title/CAS input: a rename
after the last read but before the native write remains a race, and multiple
plugin instances do not share an atomic lock. No atomic no-overwrite guarantee is
claimed. A new parent in-memory counterexample actually demonstrates that a human
edit committed after the final read is overwritten once by the unconditional
update; an edit during generation is preserved and the same task does not replay.
This is negative source evidence, not a live rename or passing manual matrix.

Pinned native source does have a guarded **title-generation** path: it checks the
original title and transactionally binds the rename to an expected event sequence.
HTTP `session.update` with an empty title reaches that path; plugin-host
`ctx.session.update({title:""})` instead renames to an empty string. They are not
interchangeable, and no empty-title request was sent. The existing title hook may
offer a route without a native patch, but safe authenticated triggering at task
transitions, candidate-label binding and installed behavior remain unverified.
No fake `expectedTitle` field, compensating rename loop or removal of the atomic
requirement is accepted; current API/schema/source facts and the bounded
[counterexample](../../../docs/session-consolidation-2026-10-29.md#title-concurrency-counterexample--2026-10-30)
retain that gap explicitly.
An isolated pinned-native test now verifies the guarded publication:16tests pass,
including a human rename injected after the final title snapshot; stripping only
the test-scoped transaction predicate makes that same assertion fail. This is
real native-source/SQLite behavior with mocked model streams, not the current
plugin's guarded integration or a live rename. See the
[source-test evidence](../../../docs/session-consolidation-2026-10-29.md#guarded-native-title-source-test--2026-10-30).
Later read-only inspection confirms the served2.1.1 update schema has no declared
title precondition. Standard source-directory resolution finds a physical2.2.5
client, not an attested host SDK; it was not imported or installed. The
[bridge reconciliation](../../../docs/session-consolidation-2026-10-29.md#guarded-bridge-feasibility-reconciliation--2026-10-30)
keeps version/transport/design gaps explicit without declaring supported SDK
discovery inherently forbidden or a native patch universally unavoidable.
The supported `execute.after` hook also refreshes after a successful mutating goal
tool receipt; reads, reused/conflicting creates and error receipts do not refresh.
Normal context boundaries remain a fallback; there is no background idle polling.
Source presence alone is not loaded-hook/model acceptance.

The server's supported `context` hook can request a **source-model-authored**
handoff, once per source chat. It never calls the legacy transfer RPC, creates a
destination, admits a recursive prompt, activates a goal, or interrupts a session.
The source model still chooses the relevant document, composes the continuation,
verifies admission, and resolves ownership before a receiver edits anything.

- Identified independent workers use a concise natural task label followed by
  ` · ` and the destination's actual full `session.id` (for example,
  `Fix session names · ses_…`). Labels are 2–5 words, at most 28 characters
  (readable in the first 25), and exclude goal hashes/IDs, role labels, filenames,
  and instruction text. The title is a display name, not goal tracking;
  `metadata.handoffOrigin` retains its separate
  `role: "independent-worker"`, `hash`, `sourceSessionID`, and `task` lineage.
  A missing metadata hash is derived from the session ID. The source must resolve
  in the same exact directory, workspace and project. Titles alone never enroll
  a chat. An existing meaningful session title is the display-label authority;
  context and title hooks preserve it across goal/tool events and add only the
  full session-ID suffix. Goal plan/task descriptions never overwrite the title.
  When a title is generic or absent, a concise source-authored metadata task may
  seed a bounded fallback without inventing a goal. The worker model updates the
  display label with the native rename API only when the substantive work changes.
- Reviewer metadata (`handoffOrigin.role: "reviewer"`) or a title beginning with
  `Reviewer` takes precedence. Reviewer, child/fork and unclassified chats are
  excluded. The existing legacy root `Goal handoff <hash>` is also supported when
  `goalDocsHandoff` provenance matches the producer's deterministic target ID,
  its source resolves in that exact worktree/project, and its recorded goal is
  retained under that source session. Its hash stays in lineage metadata; a
  meaningful existing label is preserved, while a hash-only title gets the
  bounded fallback, and the full session ID is appended. This is lineage
  recognition only: it neither invokes
  legacy transfer RPCs nor resumes the old source goal. Title-only or unverifiable
  legacy claims remain excluded.
- Automatic requests default ON **only for identified workers**. They occur at
  normal model-context boundaries after a newly verified phase completion with
  unfinished work remaining, or at a latest-step context estimate of 500,000
  tokens. Paused/limited/closed goals, Plan/read-only sessions and staged reverts
  cannot trigger them. Missing/unreadable goal-state coverage fails closed.
- Startup, replacement goals and reenablement establish fresh phase baselines;
  already-completed phases are not replayed. A durable per-session one-shot latch
  is stored before the request is exposed. Concurrent requests/settings serialize
  in the owning plugin instance, and unloading aborts pending work. Uncertain
  writes/errors suspend automation instead of retrying; use manual `/handoff` to
  reconcile. A crash can therefore lose an automatic request, not justify a new
  automatic destination. Latches are not cleared by toggling OFF/ON.

### Ctrl+P control and native limitations

Select a chat, press **Ctrl+P**, and choose **Handoff settings** (group **Settings**).
Choose **Automatic handoff OFF** to stay in the same chat with native compaction;
manual `/handoff` is unchanged. This is a supported plugin palette command and
selection dialog, **not an added page in native Open settings**. Settings persist
per chat through server plugin storage via the separate
`computer-use.source-handoff-settings` RPC. Reads/writes pin the exact session,
directory and workspace; revision checks reject stale dialogs. The TUI reads back
the save and never silently activates a missing companion. An already-issued
request cannot be recalled by turning OFF. No model-facing settings tool is added;
the authenticated local RPC is not an unforgeable human-only security boundary.

The settings output distinguishes required `configuredEnabled` (the saved or
default policy choice, **not** proof it was persisted) from legacy `enabled`
(role/suspension-gated policy, not proof of a trigger or execution). The dialog
selects the configured choice and labels effective inactivity separately. Explicit
OFF still saves and reads back even if both flags are already false. Confirmation
checks revision, configured/effective flags and the request latch in the same
chat/worktree; missing mixed-version fields fail visibly without guessed writes.
The update input and persisted v1 format are unchanged. The loaded server read
has exposed both flags; installed-TUI decoding, visible selection and real
OFF/compaction remain unverified. See [acceptance](../../../docs/handoff-automation/acceptance.md#configured-versus-effective-policy--2026-10-30).

Stock SDK 2.1.1 exposes a `compaction` **summary-request** hook with an optional
replacement summary, not a documented pre-compaction cancel/defer/redirect hook.
This policy does not register that hook, disable compaction, fake a summary, or
claim to run before native/provider compaction. Compaction can win the race or
occur below 500k. `Session.Info.tokens` is lifetime usage and is never used.
Instead, the policy reads the latest completed assistant step in the current
session context, stopping at completed compaction, and sums its input, cache
read/write, output and reasoning counts (the SDK's `TokenUsage.total` semantics).
This is the native latest-step **estimate**, not an exact count of newly assembled
instructions/tools or a projected next request. Missing/invalid latest usage is
unknown, not zero or an invitation to use old/lifetime totals.

These are source/fixture-tested controls, not live automatic-rotation or rendered
Ctrl+P acceptance. The actual independent-chat handoff into the implementation
worker was read and processed; that separate live receipt does not establish the
new policy. See [the scoped acceptance/audit](../../../docs/handoff-automation/acceptance.md).
No runtime deployment/restart or goal migration was performed. Native goal
auto-continuation is not suspended by a hook request: admission is not process
quiescence or ownership release, and the receiver must check live overlap.

## RPC caller cancellation — source verification

The retained `export`, legacy `handoff` and `opened` handlers now accept the
native RPC call context and combine its cancellation signal with plugin-unload
cancellation. Previously they used only the plugin lifetime, so abandoning one
RPC did not signal the downstream operation while the plugin remained loaded.
Direct in-process calls without a call context retain their lifecycle-only API;
canceling one request does not abort the plugin's controller or another request.
The current source-model-authored `/handoff` command is a separate steering path
and is unchanged. No new RPC or recovery action is registered.

The pinned2.1.1 Promise `permission.assert` accepts only its assertion input, not
request options. The local adapter no longer passes an unsupported second signal
argument; it checks cancellation before asking and after the assertion settles.
This does **not** preempt an already-pending permission assertion, recall an
approval prompt, undo an admitted seed or roll back published files. Existing
handoff failure bookkeeping may still preserve uncertain progress after abort.

The 2026-10-31 checkpoint was source-only. After the later verification instruction,
eleven added tests cover all three pre-aborted methods, distinct/same/no-context
signals, concurrent caller versus unload isolation, pending single-argument
assertions, denial and handler-level creation/admission retry boundaries. They
also expose a real empty-state race: export reported `missing` after cancellation
arrived with the awaited lookup. A post-lookup abort check fixes that failure;
completed publication still reports `exported` truthfully.

The full owning suite now passes68tests, retaining all57prior cases. Five isolated
fault controls fail intended assertions. Required strict checking is **not** a
pass: initial SDK resolution fails; resolving the authentic existing2.1.1 SDK
without dropping any of the four roots then exhausts the unchanged256MiBheap.
No resource/library/input bypass, install or unchanged retry follows. See the
[actual results and retained failures](../../../docs/rpc-cancellation-verification-2026-11-02.json).
These are source/fixture results, not a native RPC or human-prompt cancellation,
real send/focus, trusted archive approval, deployment, reload or restart.

One later genuinely different strict route uses the existing pinned native7.0.2
compiler on the same four roots/authentic SDK, with a stricter256MiBwhole-owned-RSS
guard and real default monitoring. It is stopped at265.55MiBafter1.46s; scoped
cleanup is verified, but empty output is not completed diagnostics or a type pass.
No budget ratchet or unchanged retry follows. The [separate receipt](../../../docs/scoped-native-types-2026-11-02.json)
preserves this failure alongside both earlier TS6failures.

A later request adds only the documented single-thread/checker scheduling flags
to those same four roots and guards. It also stops at the256MiBowned-RSS guard,
with no completed diagnostics or type pass. The [follow-up](../../../docs/verification-follow-up-2026-11-02.json)
retains that separate result; full graph already used one checker and is not retried.

## Unregistered archive recovery API

The [recovery module and preview-only CLI](recovery-README.md) restore only the
single export-time header difference proven by a frozen canonical snapshot.
Apply/rollback require a trusted host authorization callback, exact identity and
CAS checks, verified preserved originals and durable journals. Parent source
checks include actual interruption/rollback and reject rehashed body edits.
This module is not imported by the runtime plugin, does not weaken normal export
guards, and has not been applied to the real archive. Source readiness is not
provenance resolution, loaded-host permission behavior or lifecycle refresh.

## Historical automatic-transfer implementation

The notes below describe the retained legacy RPC and its earlier pilot evidence,
**not the current `/handoff` command**.

## Integration

- The local plugin package lives under `.opencode/plugins/goal-docs/`. OpenCode V2 auto-discovers the server `index.ts` and TUI `tui.ts` surfaces there; no separate CLI-plugin registration is required.
- The TUI owns one keymap command with both `palette: true` and `slash: { name: "handoff" }`. It synchronizes the command inventory in the validated source worktree before either entry is exposed, repeats the check before each server RPC, and disables both entries if inventory is unavailable or already contains `handoff`. Source-selection/location changes, `command.updated`, `plugin.updated`, and plugin setup/reload trigger a fresh check. Late results cannot reenable a command after leaving its source.
- Selection tracking compares session ID and exact location before refreshing, and inventory work is untracked. Replacing an unchanged source cache object is not navigation: it must not invalidate an RPC already in flight. A regression reproduces the former export-only interruption; an isolated run with the actual Solid client runtime also fails without selection deduplication and passes with it. This is not full live-transfer acceptance.
- After the user's separately approved permanent pilot cutover, the exact-project server inventory no longer contains legacy `/handoff` or `/resume` and now contains `/handoff_resume`. The [cutover receipt](../../../docs/handoff-pilot-cutover-receipt.json) records the bounded deployment and verified backups. A separately approved real producer retry subsequently exported, created, seeded and focused one destination; see [live acceptance](../../../docs/handoff-live-acceptance.json). Continuation/model behavior remains unverified. Other profiles may still have legacy claimants and must fail closed independently.
- By default, the TUI requires the selected session's exact directory to match the plugin worktree; matching project identity alone is insufficient. A separately configured CLI-only instance may use `options: { scope: "selected-session" }` to resolve the worktree from the selected session instead of the TUI launch directory. That mode also checks for an active `computer-use.goal-docs` RPC companion in that exact worktree before exposure and every RPC. Missing source/location/companion coverage fails closed; the home/new-session route never chooses a source. Every RPC carries the captured location explicitly. This client-only mode does not install a server or exporter in other directories.
- The TUI uses the shared server RPC contract from `rpc.ts`, then navigates and focuses only in its initiating TUI client. `opened` is called only after that client's current route, freshly read target location and transfer provenance confirm the target. An invocation cannot follow a session that moved worktrees during validation.
- The separately approved pilot CLI entry is installed with its original settings backed up; see the [CLI receipt](../../../docs/handoff-pilot-cli-receipt.json). The first attempt stopped after export; a separately approved retry created, seeded and focused exactly one source-qualified destination. No continuation or model was invoked. Further invocations retain their own approval gate.
- The native transcript does not show an unexecuted `resume:false` inbox seed. The TUI refreshes a verified target's pending cache before focus and when reopening that handoff target, then shows a read-only preview of the matching stable seed ID. The preview is limited to 8,000 characters with explicit truncation disclosure; the full input remains saved. It is not composer prefill, a transcript message, a model invocation or permission to continue. Actual preview rendering was verified in the retained destination without another producer submission.
- Exports are written below the exact directory returned by `ctx.session.get`: `docs/goals/README.md` and `<goal-id>/{plan.md,HANDOFF.md,work-history.md,snapshot.json}`. The writer also keeps a checksummed `.goal-docs-manifest.json` for ownership, revision, and retry protection.

## Data and safety

- The read-only adapter validates `@prevalentware/opencode-goal-plugin` version `0.1.67` and state versions 1–3. It reads `OPENCODE_GOAL_STATE_PATH`, or `$XDG_DATA_HOME/opencode-goal-plugin/goals.json`, falling back to `~/.local/share/opencode-goal-plugin/goals.json`.
- The server first verifies the active goal-plugin package version through `ctx.plugin.list()`. If that API does not provide one unambiguous package version, `OPENCODE_GOAL_PLUGIN_PACKAGE_JSON` may select an absolute package metadata path; it is only read. Missing or mismatched package metadata fails closed.
- Server source-adapter configuration is environment-only: `OPENCODE_GOAL_STATE_PATH` (optional, `state.ts`) overrides the state file; otherwise `XDG_DATA_HOME` (optional) selects the data-home prefix, defaulting to `~/.local/share`; `OPENCODE_GOAL_PLUGIN_PACKAGE_JSON` (optional, `state.ts`) overrides the read-only package metadata path. TUI scope is a plugin option as described above. No configuration or deployment file is changed by this companion.
- Only the selected session's current goal and retained archives are exported. The adapter has file, record, plan, history, and text bounds; unknown goal fields (including assistant text, token trackers, messages, and transcript parts) are not copied. Credential-like strings are redacted. Archive and lifecycle history gaps are called out rather than represented as complete.
- Lifecycle observation listens for settled public session events, re-reads the validated snapshot, and compares semantic goal fields so usage-counter churn does not rewrite docs. Observer failures are logged and do not fail the goal operation. No model generation is used.
- Restart recovery and target lookup preserve the installed session-list response's `data` array and sibling `cursor.next`; both follow bounded pagination. An exhausted lookup refuses target creation rather than assuming an existing transfer is absent. Raw and wrapped page responses are regression-tested.
- Writes require a V2 `permission.assert` for `edit` on the scoped documentation path. Plan/read-only sessions are denied. Generated bundles, manifests, and actual filesystem reads have byte and entry bounds. Symlinked paths, manual edits, invalid ownership manifests, stale plan revisions, and live or unowned locks fail closed. A lock with valid owner metadata is recoverable only after its process is verified dead. Files are atomically replaced one at a time; a crash can leave a partial bundle, which a retry reconciles using the manifest.
- Linux writer coordination additionally requires `/usr/bin/flock` from util-linux (verified locally at version 2.41.3). `process-lock.ts` acquires a nonblocking kernel lock using an inherited descriptor, with a three-second helper bound and no shell. Missing support or helper failure stops the write; there is no inventory/timing or unsafe lock fallback. No install, service change or permission grant is performed.
- The empty `docs/goals/.goal-docs-process.lock` inode is persistent: **do not delete or replace it while writers may run**. The writer never unlinks it; the kernel releases ownership on descriptor close or process death. It serializes both writing and stale owner/recovery-file cleanup, preventing delayed cleanup from deleting a newer writer's lock. Symlinks, multiple hard links, nonregular files and existing nonempty guard contents are refused. This guard and the temporary owner/recovery locks are Git-ignored, not portable goal documents. Older companion versions do not participate in this guard; do not run mixed writer versions concurrently during cutover.
- The handoff RPC requires an explicit source session and goal ID, revalidates and exports before creating an independent session in the source session's exact location, preserves available agent/model/session permissions, and never supplies a parent/fork relationship. It seeds the actual handoff text with `resume: false`; it does not prefill an unsent composer, create/migrate/rebind a goal, or run goal tools. TUI navigation uses `router.navigate` and, when enabled, `tabs.focus` in the initiating client only; `session.view` is not used.
- The seed text itself says context-only and requires the user's explicit `/handoff_resume` before work. It carries the source-session/goal match rule, preserves paused/closed status, forbids goal creation/rebinding/activation, and requires complete read-only source/worker inactivity checks before overlapping edits. An unavailable continuation command or unknown/conflicting source data requires asking, not substituting another workflow. These are explicit context gates, not a substitute for `resume:false` or live continuation acceptance.
- The server RPC has no documented initiating-client identity field, so it checks source-session/location ownership and leaves navigation to the one TUI client that invoked it. Explicit session permission overrides must be a validated bounded array; malformed overrides fail closed.
- The parent independently live-verified `session.create(location)` and `session.prompt(text, id, resume: false)`, then read the exact seeded text back from a fixture inbox. Both ordinary and custom `msg_goal_docs_…` IDs were admitted and replayed without duplicate inbox input or session activation. A supplied `ses_goal_docs_…` creation ID was retained; repeated creation returned the same session without replacing its original title or metadata. These API fixtures do **not** establish real companion RPC transfer or client focus.
- The installed V2.1.1 OpenAPI makes `Session.Info.permissions` optional. An omitted field is preserved by omitting it from destination creation, not by inventing an empty array or allow rules. Source and destination must match on override presence/value, agent and model variant before seeding. This retains the same worktree/agent defaults without declaring the session unrestricted. Tests cover the actual omitted-field shape, explicit arrays, malformed overrides and changed target restrictions; real handoff acceptance remains separate.
- Parent observed automatic server/TUI/RPC discovery, active server state, and generated goal documents in the correct repository. The approved pilot-only command cutover deployed canonical `/handoff_resume` and retired the two legacy command files into verified backups without a restart; unrelated commands and the separate config tree were preserved. Later CLI wiring and a real producer retry have separate receipts and acceptance evidence. No `session.view` call is used.
- An unchanged semantic export reuses its manifest-verified saved bundle, including the original export time and bytes. This works across process restarts; manual edits, partial bundles, changed source identity, or unsupported render versions are not reused. Meaningful goal/provenance changes get a fresh bundle. Transfer identity also includes the actual seed-text hash, so changed rendered content cannot silently reuse an earlier message ID.
- New destination IDs are derived from transfer identity, so an expired creation lease cannot create two different destinations. Lease-token checks preserve newer progress against late success/failure responses, and claim acquisition cannot downgrade a seeded/open transfer. Cancellation retains any possibly created target or admitted input for a same-ID retry; it does not delete sessions or documents.
- The TUI navigates only when the server reports an open-stage, admitted seed with a verified target. Pending or unverified transfers stay put. If the user switches sessions while handoff is pending, the target is retained without taking focus. An earlier open acknowledgement is not proof of another client's focus; each invocation verifies its own route/tab before acknowledgement.
- OpenCode intentionally types JSON Schema RPC results as `unknown`. The TUI validates each result against the shared output schema in `rpc-output.ts` before narrowing it; malformed outputs cannot become trusted progress through a client-side cast. This covers export, handoff and open acknowledgement separately.
- Shape validation is not identity validation: the selected goal must belong to the exported set, the handoff must name the invoking source and an independent target, and cached target metadata must match source session, goal and transfer IDs. Open acknowledgements must match the requested transfer and target before a success toast. The server also checks the transfer's source session both before and under the acknowledgement lock, including already-completed transfers.

## Tests

Run the isolated unit tests without loading the plugin or contacting OpenCode:

```bash
node --test .opencode/plugins/goal-docs/*.test.ts
```

Most tests use in-memory filesystem, permission, event, inventory, and session fakes. `process-lock.test.ts` additionally uses real scratch files under `/tmp/opencode`, the installed flock helper and one idle local Node fixture process. It verifies cross-process exclusion, retained-inode reacquisition, cancellation, rejected unsafe paths/content, lock release after write failure, and real writer recovery after that fixture crashes; its scratch files are removed afterwards. The TUI wiring suite imports the actual `tui.ts` with external SDK/Solid modules stubbed; route/cache reactions are explicitly driven by its fixture. The cache-regression has separate isolated actual-Solid evidence. Selected-session tests cover exact RPC scope, home/no-source behavior, unavailable companion/inventories, collision refusal, stale async checks, fresh target validation, pending refresh and bounded previews that cannot substitute another queued input. Advancing-clock retry tests verify exact saved/seeded text; expired and unexpired leases, late failures, claim-acquisition races, cancellation, legacy render versions, manual edits and partial-bundle recovery are covered. The observer lifecycle test exercises the real writer through checkpoint, pause/resume, completion, replacement, cancellation and clear, retaining prior documents without prompt injection or usage-only writes. Tests do not create live sessions, send real prompts, read runtime goal state, or touch the desktop. Parent additionally verified unchanged bytes, export time and file modification time using real scratch files and a new Node process. Actual exports, custom-ID API replay, rendered registration and the separately approved real transfer/focus/preview have their own evidence. Explicit continuation/model behavior remains unverified.

The companion's 21 source/test TypeScript files also passed a strict, no-emit check with library checking enabled against the real published OpenCode 2.1.1 SDK and peer declarations. The [type-check evidence](../../../docs/goals/a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7/typecheck-evidence.json) records compiler/options, exact dependency versions/integrities, source hashes and limitations. Type declarations were installed with scripts disabled in an isolated scratch workspace, not this repository or the runtime. This is not a whole-repository type check or rendered TUI execution proof.
