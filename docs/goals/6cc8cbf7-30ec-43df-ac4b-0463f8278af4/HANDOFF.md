# Handoff — `6cc8cbf7-30ec-43df-ac4b-0463f8278af4`

- Goal ID: `6cc8cbf7-30ec-43df-ac4b-0463f8278af4`
- Source session ID: `ses_e7b2588f9ffex9fhCMGyFF15LJ`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T07:52:04.823Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `5`
- Record: `archive`

## Objective

> Deliver reliable local voice dictation that streams microphone\-button input into OpenCode's normal message composer in real time, without a separate review popup or automatic sending, using only supported public plugin/extension APIs and leaving the installed OpenCode binary untouched: no binary patching, rebuilding, replacement or upgrade, no private TUI imports or simulated typing\. Reuse and preserve the prior verified recognition source, session\-race/privacy fixes and controlled acoustic evidence rather than repeating completed model experiments\. Preserve existing drafts and attachments, partial\-result revisions and concurrent edits, session routing, microphone placement after Ctrl\+P commands, Ctrl\+P voice settings, offline/in\-memory audio, bounded resources, cancellation and cleanup\. First verify whether a supported plugin\-only composer route can satisfy these requirements on the unchanged host; if none exists, retain the full objective and report the concrete blocker rather than substitute a different UI or claim success\. Verify source, approved loaded\-runtime identity and actual human workflow separately\. Give an explicit test phrase and verified Listening cue before any human speech test\. Retain separate approval gates for dependency/model installation, native\-config deployment, owned\-TUI reload/shared restart, sending/publication and commit/push\. Plan only while in Plan mode; implementation requires an explicit implementation request and switching to Build\.

## Current state

Goal status is `unmet`; the persisted plan revision is `5`.

Completion evidence:

No completion evidence is recorded.

Goal-level blocker:

> The explicit unchanged\-binary feasibility gate failed after a concrete public\-route audit\. Installed OpenCode 2\.1\.1 and its live 119\-path OpenAPI expose no native composer snapshot, client/session\-bound owned range, revision\-checked editing or edit acknowledgment\. The installed public SDK's tui\.prompt\.append schema contains only text/optional location, has no safe ownership/revision semantics, and exposed event APIs are subscribe\-only; public commands, slots and server RPC do not supply the missing native\-client capability\. Implementing the requested no\-popup, no\-auto\-send normal\-composer streaming with preserved drafts/attachments/concurrent edits therefore has no supported plugin\-only route on this unchanged host\. Binary patches/rebuilds/replacements/upgrades, private host access, simulated input and substitute UI are explicitly excluded\. No compliant implementation or rollout can proceed without a new supported host capability\. The actual installed ELF and running\-server image match SHA\-256 0e81c77fcc27b263708b133bbf9880cd641060c20e22d3dec8a79b9a8db90450; final ELF and existing wrapper hashes remained identical\. Prior recognition implementation/test/acoustic evidence was preserved, not repeated\. Only the acceptance audit was updated; documentation whitespace passes\. No behavioral source change, install, config deployment, draft mutation, speech test, restart, commit or publication occurred\. Evidence and the public\-route matrix are in voice\-assistant/ACCEPTANCE\.md under Unchanged\-binary plugin feasibility — 2026\-10\-29\. Full feature and loaded/human acceptance criteria remain unmet, not reduced or relabeled as success\.

Stop reason:

> blocked

## Plan

Plan revision: `5` · updated 2026-10-29T05:44:04.000Z

> Preserve the verified recognition work, establish whether the unchanged OpenCode host has a supported plugin\-only composer route, implement only if that gate passes, then verify source, approved runtime loading and the actual no\-popup dictation workflow separately\.

### Completion criteria

- Microphone\-button speech streams into the normal OpenCode composer while speaking, without a separate review popup or automatic submission; only deliberate user Enter sends it\.
- The installed OpenCode executable retains its verified identity, version and byte hash: no patch, rebuild, replacement or upgrade\. Only supported public plugin/extension APIs are used; no private TUI imports, host\-renderable manipulation or simulated typing\.
- Complete known phrases, including testing one two three and please show me the files in this project, pass controlled acoustic and explicitly prompted human tests, with recognition faster than real time and no increasing backlog, early cutoff or missing suffix\.
- Streaming reconciles revised hypotheses without duplication and preserves pre\-existing drafts, attachments and concurrent user edits; capture ownership is session/revision\-bound and cannot target another session or dialog\. Cancellation and unload do not discard unrelated user text\.
- The microphone stays at the far right after Ctrl\+P commands, including available subagent\-status transitions and narrow/wide layouts; Ctrl\+P voice settings and truthful loading/listening/processing/error feedback remain\.
- Audio remains local/offline and in memory, buffers stay bounded, plugin\-owned processes/threads/PipeWire nodes are released on cancellation/session change/unload, and system audio defaults, volume and security settings remain unchanged\.
- Relevant source checks pass and source, loaded\-runtime and real\-user acceptance are documented separately\. No dependency/model install, native\-config deployment, reload/shared restart, sending/publication, commit or push occurs without its required explicit authority\.
- Existing uncommitted work and prior verified recognition evidence are preserved\. A missing plugin\-only route is an explicit blocker, not grounds to claim success, weaken criteria, replace the normal composer, or repeat completed model experiments\.

### Phase `preserve_baseline` — completed

> Carry forward existing recognition work and evidence without confusing historical checks with newly verified live behavior\.

**Verification:**

> Existing source/status and acceptance records were inspected read\-only\. Completed recognition work is retained as prior evidence, not claimed as a fresh runtime or human acceptance result\.

- **`inventory_prior_work` · completed:**
  > Read the previous goal status, current scoped Git status and acceptance evidence; preserve all existing dirty/untracked files and the prior goal's history\.
  - Evidence:
    > Read previous goal 031edaea\-0b22\-4dec\-9ae2\-90c03837a630 \(unmet, revision 11\), current voice\-assistant Git status, ACCEPTANCE\.md lines 313–389 and src/worker\.ts\. No source edits or test execution performed for this planning request\.
- **`retain_recognition_evidence` · completed:**
  > Import the prior recognition implementation, privacy/session fixes and controlled acoustic evidence as historical evidence; keep replacement runtime loading and human/composer acceptance unverified\.
  - Evidence:
    > Current ACCEPTANCE\.md records 29 TS \+ 40 Python tests, real native JSON/session/cleanup probes, early telemetry opt\-out and two complete real\-microphone phrases at decoder RTF 0\.184–0\.185\. It explicitly states that native\-composer support, approved replacement TUI loading and human/live\-layout acceptance are unfinished\. These checks were not rerun in this new goal\.

### Phase `plugin_only_feasibility` — blocked

> Establish an evidence\-backed route to the real composer without changing the installed OpenCode executable; fail closed if no supported route exists\.

**Verification:**

> Executable/loader/SDK/config identities and running server were verified read\-only; actual binary is distinct from the PATH shim and matches the server process image\. Installed UI/slot/keymap/client/event contracts, official V2 references and live 119\-path OpenAPI audit converge on the same missing native\-client draft capability\. Audit and decision are finished, but the required plugin\-only route does not exist on the unchanged inspected host\.

**Blocker:**

> The installed unchanged OpenCode 2\.1\.1 host exposes no supported public native composer snapshot, session/client\-bound owned text range, revision\-checked edits or edit acknowledgments\. Existing alternatives cannot satisfy draft/attachment/concurrent\-edit preservation\. Binary rebuild/replacement/upgrade and private/simulated\-input workarounds are explicitly excluded\.

- **`record_host_identity` · completed:**
  > When execution is authorized in Build, identify the actual executable, version, SHA\-256, SDK declarations, loader and canonical native plugin entry\. Record a read\-only baseline without exposing credentials or modifying runtime/config\.
  - Evidence:
    > Read\-only baseline resolved PATH opencode to two pre\-existing shell wrappers, then the actual ELF /home/james/\.local/opt/opencode\-v2/opencode \(213648864 bytes\), version 2\.1\.1, SHA\-256 0e81c77fcc27b263708b133bbf9880cd641060c20e22d3dec8a79b9a8db90450\. Running authenticated server /proc/PID/exe matches that ELF hash\. PATH wrapper hash 0255c36705a0d1a60fd528034870301247b27125d4a702adcc28300ad88065ce; pilot wrapper acf760c76484974bbba79c90130071d0d7308e79eb59cac87db7d3df64aa4276\. Both canonical global/cli\.json and active pilot CLI config register the same local voice\-assistant package as a plain entry \(no backend override\)\. Installed public SDK is 2\.1\.1 with \./tui exports\. Existing dirty/untracked source preserved; no binary/wrapper/config writes, installs, reloads, restart or publication\.
- **`verify_public_composer_route` · completed:**
  > Audit the installed supported plugin/client\-local extension surfaces and official V2 documentation for native composer snapshot, revision/ownership\-bound text edits, attachment preservation and edit/session notifications\. Reuse prior absence evidence; investigate only concrete additional supported routes, not private internals or key injection\.
  - Evidence:
    > Extended the previous UI audit with actual installed SlotMap/Keymap, Promise client and server\-plugin event interfaces, official V2 keybind/client/RPC/API docs, and authenticated live /openapi\.json \(119 paths\)\. Live routes have RPC calls, event subscription and server\-brokered voice transport, but no TUI/composer/draft mutation endpoint\. Installed schema includes tui\.prompt\.append only with text plus optional location; it has no client/session target, revision, ownership or edit acknowledgment, and both client\.event and server plugin event are subscribe\-only\. Slots expose session/mode/panel data, not native draft handles\. Documented prompt commands clear/paste/submit/edit externally but do not supply guarded draft replacement or readback\. Plugin RPC runs server methods and cannot create a missing native\-client editing capability\. No mutating API call, key dispatch, clipboard change, new plugin activation or private host access was used\.
- **`decide_feasibility_gate` · completed:**
  > Document the exact supported API and compatibility evidence if a route exists\. Otherwise record why the unchanged host cannot safely satisfy the objective, block dependent implementation and report the missing capability; do not build hypothetical\-host fixtures as proof or relax the binary restriction\.
  - Evidence:
    > Documented the failed unchanged\-host gate and full public\-route matrix in voice\-assistant/ACCEPTANCE\.md lines 379–425\. No supported native composer snapshot/revision/owned\-range API is present in the installed SDK or live 2\.1\.1 server\. Public append event schema cannot be published through exposed client/server event APIs and lacks client/session/revision ownership\. Commands, slots and server RPC do not fill that gap\. Final SHA\-256 checks match the initial actual ELF and both existing wrapper hashes exactly; scoped documentation whitespace passes\. No behavioral source/config/runtime change, install, draft mutation, speech/model retest, restart, commit or publication occurred\.

### Phase `native_dictation` — blocked

> Only after the feasibility gate passes, connect existing recognition to the actual normal composer without a substitute UI\.

**Blocker:**

> Feasibility gate failed: there is no compliant supported composer\-editing route on the unchanged host\.

- **`define_safe_edit_contract` · blocked:**
  > Map the verified host API to client/session/composer identity, revision checks and a plugin\-owned dictation range\. Define safe handling for existing text/attachments, user cursor/edit conflicts, dialogs, cancellation and lost ownership before implementation\.
  - Blocker:
    > No verified public native draft capability exists to map into a session/revision/ownership contract\. Inventing a hypothetical host API is not implementation\.
- **`integrate_streamed_draft` · blocked:**
  > Implement the smallest plugin\-only change in the existing TUI/controller/worker route\. Reconcile full recognizer revisions within the owned draft range, remove manual\-input review only once native editing works, and leave Enter\-to\-send and existing hands\-free preferences deliberate and distinct\.
  - Blocker:
    > Cannot safely stream/revise native draft text or remove review using the available public plugin/client APIs\. Binary changes, private host access, key/clipboard injection and substitute input UI are outside the approved constraints\.
- **`preserve_voice_controls` · blocked:**
  > Preserve the microphone\-only four\-cell control after Ctrl\+P commands, Ctrl\+P settings, session/capture routing and actual readiness/error cues\. Keep existing recognition/privacy fixes; avoid unrelated refactors or host changes\.
  - Blocker:
    > Existing controls/settings and recognition work are preserved, but their integration into the requested native\-draft workflow depends on the missing host capability\.

### Phase `source_regressions` — blocked

> Prove the supported composer integration and existing speech pipeline remain correct without treating fixtures as loaded\-user acceptance\.

**Blocker:**

> There is no compliant composer implementation to exercise\. Prior recognition test/acoustic evidence remains retained, not repeated as a substitute for this goal\.

- **`draft_and_session_regressions` · blocked:**
  > Add behavior tests for revised/repeated partials, final suffixes, existing drafts/attachments, concurrent typing/cursor changes, stale revisions, session switches, dialogs, cancellation/unload and zero automatic send\. Demonstrate the relevant regression fails without its fix\.
  - Blocker:
    > Actual host draft/revision/session semantics are unavailable; fake\-host fixtures would not establish the requested normal\-composer behavior\.
- **`preserve_pipeline_and_layout_checks` · blocked:**
  > Run relevant existing cold/slow/native recognition, short\-read, overload, readiness mismatch, session\-race and cleanup coverage; reuse prior model selection and rerun native/acoustic cases only when needed for changed behavior\. Cover footer/settings/readiness source behavior without claiming live rendering\.
  - Blocker:
    > No new compliant integration exists\. Previous recognition/controls/cleanup evidence is preserved; unnecessary model/physical reruns cannot clear the missing native composer route\.
- **`run_source_verification` · blocked:**
  > Run package\-owned type/lint/unit checks, formatting/shell checks for changed files, scoped tracked/added\-file whitespace and relevant parent health checks\. Compare against the dirty\-work baseline and record separate source/native\-model results\.
  - Blocker:
    > No behavioral implementation was changed in this follow\-up\. Documentation readback and scoped whitespace pass, but integration source checks cannot verify nonexistent host capabilities\.

### Phase `approved_live_acceptance` — blocked

> Verify the actual user workflow on the unchanged host only after the supported integration and required rollout approvals exist\.

**Blocker:**

> No compliant native\-composer integration exists to install/load\. Separate installation/config/reload/human\-test approval gates remain; no deployment was performed\.

- **`prepare_and_approve_rollout` · blocked:**
  > Prepare source/runtime identity, exact dependency/model/native\-entry changes, backups/readback and rollback\. Apply only specifically approved plugin/model/config changes and any approved owned\-TUI reload; never patch, rebuild, replace or upgrade OpenCode, and do not infer shared\-restart authority\.
  - Blocker:
    > There is no supported implementation to roll out, and no separate dependency/model/native\-config/reload approval was inferred from source implementation authorization\.
- **`verify_loaded_identity` · blocked:**
  > Verify the intended plugin and recognition backend really load, including the matching backend readiness handshake\. Recheck the executable identity/version/hash against baseline and refuse any binary drift\.
  - Evidence:
    > Installed ELF and both wrappers remain byte\-identical to the recorded baseline; the CLI\-discovered server process image matches the installed ELF\.
  - Blocker:
    > The intended replacement recognition/native\-composer plugin is not installed/loaded; unchanged\-binary proof alone does not establish loaded feature acceptance\.
- **`prompted_human_workflow` · blocked:**
  > In an approved test session, provide testing one two three and the project\-files sentence, wait for a verified Listening cue, and only then ask the user to speak\. Observe complete real\-time text in the normal composer, preserved existing draft/attachments, no popup and no automatic send; keep any final Enter deliberate\.
  - Blocker:
    > The requested no\-popup native\-composer workflow is unavailable; no human speech test was requested or run\.
- **`verify_live_layout_cleanup` · blocked:**
  > Verify narrow/wide footer placement and available real subagent\-status transitions without spawning agents unless separately authorized\. Check loaded settings, session changes, interruption and unload cleanup; verify audio defaults/volumes and privacy remain unchanged\.
  - Blocker:
    > No compliant replacement workflow is loaded, so actual combined composer/layout/session/unload acceptance cannot be established\. No agent spawn or GUI workaround was inferred\.
- **`audit_all_requirements` · blocked:**
  > Update acceptance/features with a prompt\-to\-artifact crosswalk separating source, loaded\-runtime and human evidence\. Complete only when every criterion is verified; otherwise preserve exact missing capability/authority and report blocked work\. Commit and push remain separately gated\.
  - Evidence:
    > The added acceptance section maps unchanged\-binary identity, client/event/command/slot/RPC limitations, preservation and unperformed rollout/human outcomes\. The earlier complete requirement crosswalk is retained\. No tests were represented as rerun or as successful native\-composer acceptance\.
  - Blocker:
    > Full completion criteria remain unmet because the required public composer capability is absent and excluded workarounds would violate explicit constraints\.

### Decisions

- This new goal is paused because it was explicitly created in Plan mode\. Planning is authorized, not implementation; starting work requires an implementation request, switching to Build and explicit goal resumption\.
- The previous unmet goal and verified recognition history remain preserved\. This goal adds an explicit installed\-binary\-untouched boundary rather than reopening or erasing the old record\.
- No token budget, duration limit or auto\-continue cap was requested; none is set\. Delegation remains off\.
- Current evidence already identifies no safe composer\-draft API in installed 2\.1\.1/latest checked 2\.2\.0\. The first execution gate is a focused supported\-route feasibility audit, not a promise that a plugin\-only solution exists\.
- Do not treat a host source rebuild, official binary upgrade/replacement, private TUI manipulation, alternate input popup/panel or simulated typing as satisfying the approved unchanged\-binary approach\.
- Keep all completion criteria intact if feasibility fails\. Mark the concrete blocker rather than declaring a reduced research\-only objective complete\.
- The substantive plan is provided inline and persisted in goal tools\. No separate plan file is requested or written; generated goal records are not a claimed repository plan\-file export\.
- User switched out of Plan mode and explicitly requested implementation \('ok go ahead and implement'\); goal resumed in Build\. Begin the preserved plan's binary\-unchanged feasibility gate\. This does not approve binary changes, dependency/model installation, native configuration deployment, shared restart or publication\.
- The approved Build implementation attempt reached a genuine feasibility blocker, not an unfinished coding subtask: available public plugin/client/slot/command/event/RPC surfaces cannot implement the requested safe normal\-composer dictation on the unchanged installed host\. Preserve all previous work and this evidence; do not fabricate an adapter, activate partial rollout, re\-run completed model experiments or claim success\.

## Historical documentation

### Historical record coverage

Only retained archived goals are available. The plugin also bounds archives globally, so full historical completeness cannot be proven.
This is one retained archived goal. The goal plugin bounds archived records, so older records may have been pruned.
Only allowlisted goal lifecycle, checkpoint, and plan-revision records are included. No session transcript, screenshot, or unrelated project data is read or copied.
The goal plugin also bounds archives, checkpoints, lifecycle history, and plan change records; older entries may have been pruned.

### Lifecycle history

- 2026-10-29T04:31:34.000Z · **`created`**
  > Goal set with default continuation limits\.
- 2026-10-29T04:31:34.000Z · **`paused`**
  > Goal recorded from Plan mode; execution paused until resumed from Build mode\.
- 2026-10-29T04:33:19.000Z · **`updated`**
  > Goal plan updated \(revision 1\): User explicitly requested a new goal and plan after requiring the installed OpenCode binary stay untouched\. Preserve verified recognition history, introduce a hard plugin\-only feasibility gate, retain the complete desired UX and approval boundaries, and keep execution paused in Plan mode\.
- 2026-10-29T05:36:06.000Z · **`resumed`**
  > Goal resumed\.
- 2026-10-29T05:36:31.000Z · **`updated`**
  > Goal plan updated \(revision 2\): Execution is now explicitly authorized in Build; start the first planned task without bypassing the plugin\-only feasibility gate or consequential\-action approvals\.
- 2026-10-29T05:36:31.000Z · **`checkpoint`**
  > I’ve resumed the goal\. I’ll start with the unchanged\-host feasibility gate, preserving the completed recognition work and leaving the installed OpenCode binary untouched\.
- 2026-10-29T05:39:19.000Z · **`updated`**
  > Goal plan updated \(revision 3\): Actual executable and running\-service identity are now verified rather than mistaking the PATH shim for the binary\. Advance to concrete public\-client/event/command/RPC route coverage beyond the previous UI\-interface audit\.
- 2026-10-29T05:41:14.000Z · **`checkpoint`**
  > I checked the possible shortcuts beyond the UI interface\. The SDK contains a \`tui\.prompt\.append\` event schema, but the live client exposes no publishing method, and the event lacks session targeting and revision checks\. Commands, slots and plugin RPC also don’t provide the req\.\.\.
- 2026-10-29T05:41:40.000Z · **`updated`**
  > Goal plan updated \(revision 4\): The remaining concrete public routes—not just the UI declaration—have been checked against live host capabilities and the required safety semantics\. Record the negative audit and proceed to the explicit feasibility decision without implementing an unsafe substitute\.
- 2026-10-29T05:44:04.000Z · **`updated`**
  > Goal plan updated \(revision 5\): The explicit unchanged\-binary feasibility gate has a verified negative result\. Preserve the full objective and previous evidence, record every dependent implementation/verification blocker, and stop rather than bypass the user's constraints\.
- 2026-10-29T05:44:22.000Z · **`unmet`**
  > The explicit unchanged\-binary feasibility gate failed after a concrete public\-route audit\. Installed OpenCode 2\.1\.1 and its live 119\-path OpenAPI expose no native composer snapshot, client/session\-bound owned range, revision\-checked editing or edit acknowledgment\. The installed public SDK's tui\.prompt\.append schema contains only text/optional location, has no safe ownership/revision semantics, \.\.\.

### Checkpoints

- 2026-10-29T05:36:31.000Z
  > I’ve resumed the goal\. I’ll start with the unchanged\-host feasibility gate, preserving the completed recognition work and leaving the installed OpenCode binary untouched\.
- 2026-10-29T05:41:14.000Z
  > I checked the possible shortcuts beyond the UI interface\. The SDK contains a \`tui\.prompt\.append\` event schema, but the live client exposes no publishing method, and the event lacks session targeting and revision checks\. Commands, slots and plugin RPC also don’t provide the req\.\.\.

### Plan revision history

- Revision 1 · 2026-10-29T04:33:19.000Z
  > User explicitly requested a new goal and plan after requiring the installed OpenCode binary stay untouched\. Preserve verified recognition history, introduce a hard plugin\-only feasibility gate, retain the complete desired UX and approval boundaries, and keep execution paused in Plan mode\.
- Revision 2 · 2026-10-29T05:36:31.000Z
  > Execution is now explicitly authorized in Build; start the first planned task without bypassing the plugin\-only feasibility gate or consequential\-action approvals\.
- Revision 3 · 2026-10-29T05:39:19.000Z
  > Actual executable and running\-service identity are now verified rather than mistaking the PATH shim for the binary\. Advance to concrete public\-client/event/command/RPC route coverage beyond the previous UI\-interface audit\.
- Revision 4 · 2026-10-29T05:41:40.000Z
  > The remaining concrete public routes—not just the UI declaration—have been checked against live host capabilities and the required safety semantics\. Record the negative audit and proceed to the explicit feasibility decision without implementing an unsafe substitute\.
- Revision 5 · 2026-10-29T05:44:04.000Z
  > The explicit unchanged\-binary feasibility gate has a verified negative result\. Preserve the full objective and previous evidence, record every dependent implementation/verification blocker, and stop rather than bypass the user's constraints\.

## Continuation constraints

- This handoff is a bounded export of goal state, not a transcript. Do not infer unrecorded work or claim history is complete.
- Preserve the source session and goal record. This companion does not create, migrate, rebind, or close goals.
- Use the current plan revision and its completion criteria; do not silently remove or reopen verified work.
- No screenshots, credentials, raw session messages, or data from another repository are included.

