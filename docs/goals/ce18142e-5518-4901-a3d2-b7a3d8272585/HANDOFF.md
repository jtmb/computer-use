# Handoff — `ce18142e-5518-4901-a3d2-b7a3d8272585`

- Goal ID: `ce18142e-5518-4901-a3d2-b7a3d8272585`
- Source session ID: `ses_e7b2588f9ffex9fhCMGyFF15LJ`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T08:52:16.392Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `7`
- Record: `archive`

## Objective

> Reduce end\-to\-end latency of the existing local OpenCode voice plugin and its manual transcript\-review workflow, without changing the OpenCode executable/frontend, adding native\-composer integration, auto\-sending manual dictation, or sacrificing accuracy, offline/in\-memory privacy, session isolation, cancellation or cleanup\. Reuse the already\-verified Sherpa recognizer and prior acoustic evidence; profile and optimize cold readiness, recognition finalization, response sentence buffering and speech startup with numeric\-only timing evidence and behavior regressions\. Prepare the existing opt\-in Sherpa rollout while preserving separate approval gates for active dependency/model installation, native configuration deployment, TUI reload/shared restart, live message submission and commit/push; verify source improvements independently of any blocked live rollout\.

## Current state

Goal status is `unmet`; the persisted plan revision is `7`.

Completion evidence:

No completion evidence is recorded.

Goal-level blocker:

> Verified source implementation is finished: lazy optional model loading, early prose chunks, session\-bound review\-time voice preparation, numeric\-only latency probe, persistent configurable mic hotkey, and15\-second recognized\-speech inactivity auto\-off with worker/controller latches and stale\-request protection\. npm run check passes39TypeScript\+58Python, stricttypes/lint; changedPython formatting, scoped whitespace, parent health and fresh offline native JSON rapid\-off/on/prewarm/shutdown probe pass with zero surviving owned resources\. Prompt\-to\-artifact evidence and limits are in voice\-assistant/ACCEPTANCE\.md\. However the actual faster loaded workflow is not achieved or accepted: fresh inspection confirms Sherpa packages and pinned model absent from active \.venv/models and both canonical/native CLI configs remain default Vosk\. Safe model/backend\-entry previews were verified read\-only, but separate authority to install optional dependencies/model, apply backend selection and reload only the owning TUI has not been granted\. Live human/key delivery, provider/end\-to\-end timing and deliberate test\-message submission cannot be inferred from source/fixture checks\. All independent planned work is complete; activation cannot meaningfully continue without those explicitly retained approvals\. No executable/frontend/wrapper edit, active install/config deployment, explicit reload/shared restart, live submission, human test, commit or push occurred\. Close as unmet on this concrete approval gate, not as full feature success\.

Stop reason:

> blocked

## Plan

Plan revision: `7` · updated 2026-10-29T08:42:32.000Z

> Optimize the existing review\-based voice plugin and add a settings\-configurable microphone toggle plus15\-second recognized\-speech inactivity auto\-off; keep host unchanged and rollout approvals separate\.

### Completion criteria

- Numeric\-only baseline and after\-change timings identify latency stages without logging audio or transcript content\.
- Verified source improvements reduce a measured startup or first\-speech delay while retaining recognition accuracy, manual review, session cancellation and cleanup\.
- Opt\-in Sherpa rollout is prepared and actual installed/loaded/live status is honestly verified or explicitly blocked on separate approval\.
- Relevant regression, type/lint and integration checks pass; remaining provider/live\-workflow limitations are explicit\.

### Phase `baseline` — completed

> Preserve existing work and identify measured latency bottlenecks\.

**Verification:**

> Actual native timing baseline and source review agree on unnecessary eager model work\. Prior recognition/acoustic tests remain retained, not re\-executed as discovery\.

- **`inspect` · completed:**
  > Inspect scoped diffs, startup/sentence paths and existing timing evidence; establish exact source ownership and a bounded baseline\.
  - Evidence:
    > Scoped status/diffs preserve prior source and untracked tests\. Production startup/capture/controller paths eagerly loaded Sherpa, large Vosk wake model and Piper before ready; replies waited for full sentences\. Network\-disabled/read\-only\-root native probe measured construct17906\.97ms, manual stream122\.87ms, first synthesis512\.70ms, warm synthesis277\.31ms, wake recognizer258\.93ms; no devices, saved audio or user prompts\.

### Phase `optimize` — completed

> Implement targeted latency improvements and requested microphone controls without degrading safeguards\.

**Verification:**

> Startup/response and microphone units are all source\-verified\. Numeric offline native model timings, negative\-before/positive\-after regressions, full39TS\+58Python suite and formatter/whitespace checks pass\. README/ACCEPTANCE retain first\-use preparation cost and loaded/human/provider limitations\. No dependency/config deployment, explicit reload, shared restart, live submission, physical microphone or binary edits performed\.

- **`startup` · completed:**
  > Decouple unnecessary speech\-output work from microphone readiness and verify real startup improvement\.
  - Evidence:
    > Speech caches optional Vosk wake and CPU Piper under independent locks; Vosk default remains eager and original wake grammar retained\. Model regressions failed before change, pass after; deferred loading, shared voice identity and retry covered\. Isolated constructor4394\.01ms vs initial17906\.97ms; first synthesis moved to5275\.91ms, warm321\.14ms\. Eager\-equivalent control10181\.28ms shows cache variation\. Faster ready only, not claimed faster live reply\. ACCEPTANCE\.md retains all numeric results and caveat\.
- **`response` · completed:**
  > Bound first\-speech buffering and add content\-free timing instrumentation with cancellation/regression coverage\.
  - Evidence:
    > First long\-prose chunk now emitted at completed word boundaries near120 chars, subsequent240; early\-speech regressions failed before fixes and pass, exact words/code/reasoning filtering and interruption/session suppression preserved\. New session\-bound prepare\_speech warms Piper on existing owned playback loop before review/submit, never plays/submits unreviewed text, cancellation nonblocking, failure retryable\. Python prewarm regressions failed before change and pass after\. Maintained scripts/latency\_probe\.py plus tests report numeric model stages only\. Native offline/read\-only\-root prepared run: construct4372\.161ms, stream102\.047ms, prepare5099\.926ms, first synthesis379\.112ms, warm287\.585ms, wake3382\.790ms\. Preparation cost is not hidden unless real review/provider work overlaps; live end\-to\-end remains unverified\. npm run check passes34TS\+51Python, strict types/lint; changed Python format and whitespace pass; evidence in ACCEPTANCE\.md\.
- **`microphone_controls` · completed:**
  > Add a settings\-configurable listening\-toggle hotkey and a15\-second no\-recognized\-speech timeout\. Off must stop microphone capture, not silently return to background wake listening or submit a message; synchronize visible mic state and cover shortcut changes, idle timer reset, stale events/session changes and cleanup\.
  - Evidence:
    > Implemented stored hotkey presets \(unassigned/F9/F10/Ctrl\+G\), reactive owned keymap command voice\.microphone\.toggle and shared mouse/shortcut toggle\. Native microphone\_off stops capture without submitting/muting playback; controller and worker latch off across queued configure/session refresh until explicit listen\.15s wall\-clock timeout arms only when capture ready; changed recognition resets it, noise/\[unk\]/stale partials do not\. Control loop also checks timeout during blocked native decode\. Real owned\-child/reader test verifies termination, stale output suppression and valid playback token\. Epoch/request\-tagged readiness/timeout events protect rapid toggles\. UI/controller tests choosing/changing/unbinding/saved shortcut and stale events pass\. Regressions failed before implementation and queued\-reconfigure latch fix\. npm run check39TS\+58Python, strict types/lint; seven Python format checks and whitespace pass\. README and ACCEPTANCE updated; live key delivery/loading not claimed\.

### Phase `verify` — blocked

> Verify combined source and prepare approved rollout\.

**Verification:**

> Source/tests/docs and independent native\-worker integration are verified\. Real active\-environment/configuration inspections establish that rollout has not occurred, rather than assuming a live speedup from source\-only evidence\. All independent planned implementation/check work is complete and prior acoustic evidence preserved\.

**Blocker:**

> Separate installation/configuration/owned\-TUI reload and prompted live acceptance authority is missing; changing the running setup would cross the retained deployment gates\.

- **`checks` · completed:**
  > Run behavior\-relevant suites and numeric native probes; update acceptance evidence and rollout guidance\.
  - Evidence:
    > Combined npm run check passes39TypeScript\+58Python, strictSDK/Python types and lint; sevenPython formatterchecks and child/parent scoped whitespace pass\. Parent \./scripts/health\-check\.sh PASSED\. Fresh real native JSON/main probe exercises prewarm and same\-session mic off/on during blocked decode: ready7763\.521ms, restart\-to\-partial2471\.540ms including artificial stall, complete known phrase once, network refused, zero live owned children/feeders/worker threads\. Only numeric/count results printed, protocol text retained in memory\. Fresh ELF/wrapper hashes match preserved baselines\. README, ACCEPTANCE prompt\-to\-artifact crosswalk and targeted parent feature row updated, preserving unrelated dirty/untracked work\. Bounded test\-quality review covers model locks/retries, buffering filtering, worker clock/control/pipe, UI settings and adjacent serializer/registration tests; no coverage deleted\. No live provider/physical/hotkey acceptance claimed\.
- **`rollout` · blocked:**
  > Verify active Sherpa installation/configuration and loaded workflow only with separate rollout authority, otherwise record exact blocker\.
  - Evidence:
    > Fresh importlib\.metadata inspection: neither sherpa\-onnx nor sherpa\-onnx\-core installed in active \.venv; pinned streaming model absent\. Canonical global/cli\.json and active pilot cli\.json still plain voice\-plugin path without backend override\. Model \-\-dry\-run \-\-with\-streaming keeps original4assets and proposes pinned4streaming files\. Read\-only JSONC backend\-entry previews verified only the voice entry changes to package\+options\.recognitionBackend=sherpa while unrelated configuration semantics remain exact\. Installation/config/owned\-TUI reload/live submission approvals were not inferred; no setup/deployment/restart was performed\.
  - Blocker:
    > Actual faster\-recognizer activation and loaded/human/end\-to\-end acceptance cannot proceed without the explicitly separate approval to install optional pinned dependencies/model, select Sherpa in canonical/native configuration, and reload only the owning TUI\. Any live test\-message submission remains separately deliberate\. Source implementation and all independent verification are finished; active worker/source generation and provider/human timing cannot be established by tests or read\-only configuration inspection\.

### Decisions

- User rejected source\-run frontend/native composer work and explicitly requested latency implementation tracked by a new goal\. Previous terminal unmet goals remain archived unchanged\.
- Existing dirty/untracked voice source is prior work and must be preserved\. Do not install/activate/reload the active plugin merely from general source implementation approval\.
- User added settings\-configurable microphone listening\-toggle hotkey and originally30 seconds without recognized speech automatically turning listening off\. Retain the new mic controls alongside latency work; never substitute speaker mute or auto\-submission\.
- User then delegated choosing15 vs30 seconds\. Choose15 seconds wall\-clock inactivity from actual listening readiness/last recognized speech, not PCM/noise arrival\. This supersedes the original30\-second requirement\. Timeout/off never submits or silently resumes wake listening\.
- Source\-only response improvements are verified; actual human/provider timing and loaded\-runtime acceptance require the separately gated rollout\.
- Final audit distinguishes verified source delivery \(latency changes, configurable mic toggle and15s timeout\) from the requested faster loaded workflow\. Do not claim that running OpenCode is now faster: active environment still lacks Sherpa and configuration remains Vosk\. No OpenCode executable/frontend/wrapper edit, explicit reload/shared restart, live message/human test, commit or publication was performed\. Further meaningful rollout work requires the separate user approvals\.

## Historical documentation

### Historical record coverage

Only retained archived goals are available. The plugin also bounds archives globally, so full historical completeness cannot be proven.
This is one retained archived goal. The goal plugin bounds archived records, so older records may have been pruned.
Only allowlisted goal lifecycle, checkpoint, and plan-revision records are included. No session transcript, screenshot, or unrelated project data is read or copied.
The goal plugin also bounds archives, checkpoints, lifecycle history, and plan change records; older entries may have been pruned.

### Lifecycle history

- 2026-10-29T07:52:01.000Z · **`created`**
  > Goal set with default continuation limits\.
- 2026-10-29T07:52:25.000Z · **`updated`**
  > Goal plan updated \(revision 1\): Persist latency scope and ordered verification before implementation\.
- 2026-10-29T07:52:47.000Z · **`checkpoint`**
  > I’ve created a new latency goal, separate from the blocked composer goal\. I’ll first measure model startup and speech buffering, then make targeted changes\. Active installation, configuration and reload remain separate rollout steps\.
- 2026-10-29T07:54:35.000Z · **`updated`**
  > Goal plan updated \(revision 2\): Baseline identifies all three models loading before manual dictation readiness; optimize optional model loading first\.
- 2026-10-29T07:57:05.000Z · **`checkpoint`**
  > The native probe confirmed that manual dictation was waiting for three models\. Deferring the wake\-only Vosk model and Piper reduced one isolated startup run from \*\*17\.9s to 4\.4s\*\*\. There’s a trade\-off: Piper’s first\-use cost moved to speech startup\. I’ll account for that expli\.\.\.
- 2026-10-29T08:02:06.000Z · **`updated`**
  > Goal plan updated \(revision 3\): Record verified startup work and partial response improvements, and preserve the user's two new microphone requirements in the implementation backlog\.
- 2026-10-29T08:02:07.000Z · **`checkpoint`**
  > Added both requirements to the active work: \- A configurable hotkey in Voice settings to toggle listening on/off\. \- After \*\*30 seconds without recognized speech\*\*, listening turns off\. Turning it off won’t submit a message or silently resume background listening\. I’ll also kee\.\.\.
- 2026-10-29T08:02:35.000Z · **`updated`**
  > Goal plan updated \(revision 4\): Choose the user\-authorized15\-second inactivity timeout and persist the superseding requirement\.
- 2026-10-29T08:02:41.000Z · **`checkpoint`**
  > I’ll use \*\*15 seconds without recognized speech\*\*\. Recognized speech resets the timer; silence or noise won’t\. When it expires, listening turns off without sending anything\.
- 2026-10-29T08:02:42.000Z · **`autoContinue`**
  > Auto\-continue 1 reserved\.
- 2026-10-29T08:03:45.000Z · **`checkpoint`**
  > I’m continuing with first\-reply latency next\. I’ll add a repeatable, content\-free timing probe and reduce the amount of prose held before speech starts\. The microphone\-toggle work remains queued with the chosen \*\*15\-second\*\* timeout\.
- 2026-10-29T08:12:47.000Z · **`updated`**
  > Goal plan updated \(revision 5\): Record completed first\-speech buffering, safe preparation and numeric diagnostic work; advance to microphone controls and normalize the user\-authorized15\-second timeout\.
- 2026-10-29T08:13:23.000Z · **`checkpoint`**
  > Implemented and verified the response\-latency changes: \- Shorter buffering before speech starts\. \- Voice\-model preparation during review/processing\. \- Repeatable numeric\-only timing diagnostics\. \- \*\*34 TypeScript \+ 51 Python tests pass\.\*\* The goal remains active\. Next: the con\.\.\.
- 2026-10-29T08:13:25.000Z · **`autoContinue`**
  > Auto\-continue 2 reserved\.
- 2026-10-29T08:24:50.000Z · **`checkpoint`**
  > The hotkey and 15\-second timeout are now wired into the source\. The timeout also runs on the worker’s control loop, so a busy decoder cannot indefinitely delay mic\-off\. Off is latched against background\-listening restarts, and it does not submit text or mute an active reply\. I\.\.\.
- 2026-10-29T08:33:48.000Z · **`updated`**
  > Goal plan updated \(revision 6\): Source microphone controls and15s timeout are verified; move to combined regression/native transport audit and rollout authority checks\.
- 2026-10-29T08:42:32.000Z · **`updated`**
  > Goal plan updated \(revision 7\): Record complete source/integration evidence and the concrete activation gate after independent work is exhausted; do not conflate97passing source tests with active end\-to\-end delivery\.
- 2026-10-29T08:42:34.000Z · **`checkpoint`**
  > The combined checks pass: \*\*39 TypeScript \+ 58 Python tests\*\*, parent health checks, and an offline native\-worker rapid\-toggle/shutdown probe with no surviving owned resources\. The remaining blocker is activation\. Fresh inspection confirms Sherpa is still absent from the activ\.\.\.
- 2026-10-29T08:42:52.000Z · **`unmet`**
  > Verified source implementation is finished: lazy optional model loading, early prose chunks, session\-bound review\-time voice preparation, numeric\-only latency probe, persistent configurable mic hotkey, and15\-second recognized\-speech inactivity auto\-off with worker/controller latches and stale\-request protection\. npm run check passes39TypeScript\+58Python, stricttypes/lint; changedPython formatti\.\.\.

### Checkpoints

- 2026-10-29T07:52:47.000Z
  > I’ve created a new latency goal, separate from the blocked composer goal\. I’ll first measure model startup and speech buffering, then make targeted changes\. Active installation, configuration and reload remain separate rollout steps\.
- 2026-10-29T07:57:05.000Z
  > The native probe confirmed that manual dictation was waiting for three models\. Deferring the wake\-only Vosk model and Piper reduced one isolated startup run from \*\*17\.9s to 4\.4s\*\*\. There’s a trade\-off: Piper’s first\-use cost moved to speech startup\. I’ll account for that expli\.\.\.
- 2026-10-29T08:02:07.000Z
  > Added both requirements to the active work: \- A configurable hotkey in Voice settings to toggle listening on/off\. \- After \*\*30 seconds without recognized speech\*\*, listening turns off\. Turning it off won’t submit a message or silently resume background listening\. I’ll also kee\.\.\.
- 2026-10-29T08:02:41.000Z
  > I’ll use \*\*15 seconds without recognized speech\*\*\. Recognized speech resets the timer; silence or noise won’t\. When it expires, listening turns off without sending anything\.
- 2026-10-29T08:03:45.000Z
  > I’m continuing with first\-reply latency next\. I’ll add a repeatable, content\-free timing probe and reduce the amount of prose held before speech starts\. The microphone\-toggle work remains queued with the chosen \*\*15\-second\*\* timeout\.
- 2026-10-29T08:13:23.000Z
  > Implemented and verified the response\-latency changes: \- Shorter buffering before speech starts\. \- Voice\-model preparation during review/processing\. \- Repeatable numeric\-only timing diagnostics\. \- \*\*34 TypeScript \+ 51 Python tests pass\.\*\* The goal remains active\. Next: the con\.\.\.
- 2026-10-29T08:24:50.000Z
  > The hotkey and 15\-second timeout are now wired into the source\. The timeout also runs on the worker’s control loop, so a busy decoder cannot indefinitely delay mic\-off\. Off is latched against background\-listening restarts, and it does not submit text or mute an active reply\. I\.\.\.
- 2026-10-29T08:42:34.000Z
  > The combined checks pass: \*\*39 TypeScript \+ 58 Python tests\*\*, parent health checks, and an offline native\-worker rapid\-toggle/shutdown probe with no surviving owned resources\. The remaining blocker is activation\. Fresh inspection confirms Sherpa is still absent from the activ\.\.\.

### Plan revision history

- Revision 1 · 2026-10-29T07:52:25.000Z
  > Persist latency scope and ordered verification before implementation\.
- Revision 2 · 2026-10-29T07:54:35.000Z
  > Baseline identifies all three models loading before manual dictation readiness; optimize optional model loading first\.
- Revision 3 · 2026-10-29T08:02:06.000Z
  > Record verified startup work and partial response improvements, and preserve the user's two new microphone requirements in the implementation backlog\.
  - Revisit evidence:
    > User explicitly requested a hotkey configurable in settings to toggle mic listening/not listening, then specified automatic off after30 seconds without recognized speech\.
- Revision 4 · 2026-10-29T08:02:35.000Z
  > Choose the user\-authorized15\-second inactivity timeout and persist the superseding requirement\.
- Revision 5 · 2026-10-29T08:12:47.000Z
  > Record completed first\-speech buffering, safe preparation and numeric diagnostic work; advance to microphone controls and normalize the user\-authorized15\-second timeout\.
  - Revisit evidence:
    > User explicitly said 'or15 seconds you decide';15 was selected and confirmed\. Only the pending mic task timeout/summary changes; no completed task description or completion criterion is changed\.
- Revision 6 · 2026-10-29T08:33:48.000Z
  > Source microphone controls and15s timeout are verified; move to combined regression/native transport audit and rollout authority checks\.
- Revision 7 · 2026-10-29T08:42:32.000Z
  > Record complete source/integration evidence and the concrete activation gate after independent work is exhausted; do not conflate97passing source tests with active end\-to\-end delivery\.

## Continuation constraints

- This handoff is a bounded export of goal state, not a transcript. Do not infer unrecorded work or claim history is complete.
- Preserve the source session and goal record. This companion does not create, migrate, rebind, or close goals.
- Use the current plan revision and its completion criteria; do not silently remove or reopen verified work.
- No screenshots, credentials, raw session messages, or data from another repository are included.

