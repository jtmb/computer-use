# Handoff — `a85d6f31-2a2f-4b2a-a4e5-39a83ac45ed8`

- Goal ID: `a85d6f31-2a2f-4b2a-a4e5-39a83ac45ed8`
- Source session ID: `ses_e7b2588f9ffex9fhCMGyFF15LJ`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T14:06:26.155Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `12`
- Record: `archive`

## Objective

> Extend the existing local OpenCode v2 voice\-assistant TUI plugin with a real voice picker, configurable recording\-stop timing, stop\-to\-review microphone controls and resumable transcript review\. Add a persistent Ctrl\+P Voice assistant settings voice picker backed by verified local Piper voices \(retain Lessac as the default and provide at least one genuinely different selectable voice after any required model\-install approval\), without cloud speech services or runtime downloads\. Expose separately validated pause\-before\-review and no\-recognized\-speech auto\-off settings, preserving the current nominal 1\.5\-second pause and 15\-second inactivity defaults for existing preferences and making decoder endpoint/safety\-cap interactions explicit\. Pressing F9 or the microphone button again must stop physical capture, safely finalize accepted/queued audio and open Review spoken request if text was recognized; an empty recording simply stops without sending\. Add an advertised C to continue recording action that retains the current edited draft and appends subsequent dictation, with deliberate Enter\-to\-send, E\-to\-edit and Esc\-to\-discard controls; literal c must remain usable while editing\. Preserve the verified F9 default and explicit bindings, active Sherpa backend, existing readout modes/hands\-free behavior, offline CPU recognition/synthesis, in\-memory audio/transcripts, original\-session routing, stale\-event rejection, cancellation, bounded resources and cleanup\. Use only public plugin/client APIs, preserve all existing dirty/untracked work and existing packages/models/settings, and do not modify OpenCode's executable/frontend/wrappers, add native\-composer integration or restart the shared service\. Verify source/model/runtime/UI layers separately and document any actual blocker without claiming unobserved acceptance\. This goal is planning\-only and paused until the user switches to Build and explicitly authorizes/resumes execution; new asset installation/activation, live message\.\.\.

## Current state

Goal status is `unmet`; the persisted plan revision is `12`.

Completion evidence:

No completion evidence is recorded.

Goal-level blocker:

> Implementation/source progress is preserved and verified: configurable pause/idle settings, generation\-safe F9/mic stop\-and\-finalize with queued PCM/native tail, resumable edited\-draft review \(Enter/C/E/Esc\), safe offline voice\-picker/preview/acknowledged persistence and atomic native switching; full61TypeScript\+81Python checks,strict types/lint/format,syntax/whitespace and parent health pass\. Actual isolated installedSherpa/Piper probe verifies Lessac selection, absent\-alternative refusal/working\-model retention and in\-memory CPU synthesis with no devices/messages\. However the required genuinely different usable voice cannot be delivered or native\-accepted without the separately retained new\-asset installation authority: LJ Speech high is only previewed,3pinnedfiles,total114204494bytes,not downloaded\. voice\_assets and the voices phase are explicitly blocked, and the native plan tool refuses starting final acceptance before that phase is verified; no independent executable task remains to progress around this gate\. Actual UI/key/human/different\-voice acceptance remains pending, not fulfilled by fixtures\. The separately requested new\-chat voice bug also remains recorded but its objective expansion was refused without a literal /goal edit command\. This is an actual approval/sequencing impasse requiring user/external change, not completion or abandonment: keep all source work, pending acceptance, immutable criteria and verified phase evidence; no gate bypass, shared restart, new model install, live message, commit or push occurred\. README/ACCEPTANCE and relevant parent feature row record exact evidence/limits and scoped rollback\.

Stop reason:

> blocked

## Plan

Plan revision: `12` · updated 2026-10-29T11:53:20.000Z

> Deliver all four requested voice workflow improvements in the existing plugin: a genuine offline voice picker, configurable end\-of\-recording timing, finalizing F9/mic stop\-to\-review, and C\-to\-continue review\. Plan is paused; no implementation or new model installation is authorized by this planning request\.

### Completion criteria

- Voice assistant settings has a persistent voice picker with installed/available state and a genuinely different verified local Piper voice in addition to Lessac after applicable installation approval\. Lessac remains the default; selection survives reload, CPU synthesis uses the selected voice, and missing/corrupt/failed models do not break dictation or silently replace the working selection\. No worker\-network access or runtime downloads\.
- Pause\-before\-review and no\-speech auto\-off are separate validated persisted controls, with legacy missing values inheriting nominal current defaults of 1\.5 and 15 seconds\. Their measured effect agrees with documented semantics across decoder endpoints and the existing 25\-second segment safety cap; noise/stale hypotheses do not indefinitely extend idle recording\.
- F9 and the mic button share one stop\-and\-finalize path\. A second press stops physical capture and produces exactly one review of the complete recognized transcript, including finalized tail/queued accepted audio; empty/no\-recognized\-text recordings stop without review or sending\. Finalization is bounded, capture failures/overflow are not disguised as successful full transcripts, and stopping cannot cancel OpenCode work or inadvertently mute a reply\.
- Review visibly offers Enter/send, C/continue recording, E/edit, and Esc/discard using only supported UI APIs\. Continue retains the latest edited in\-memory draft and appends new segments once; repeated continuations work, empty/failed extra recordings preserve the existing draft, and typing literal c in the editor never restarts capture\. Only an explicit send from review submits the accumulated draft\.
- Original\-session routing, request/generation identity, late\-result rejection, hands\-free/manual distinctions and cancellation remain correct through finish/restart races, session switches, disposal and reload\. Review cancellation or a stale dialog cannot send or append text to another session; no transcript/audio persistence beyond normal submitted OpenCode history\.
- Existing F9 defaults/explicit shortcuts, Sherpa recognition, voice\-only/all readout choices and existing user preferences/models/packages remain intact\. No OpenCode executable/frontend/wrapper changes, private TUI imports, native\-composer editing, cloud speech, shared restart, unapproved installs, live message sends, commit or push\.
- Behavior\-relevant unit/integration checks, strict types/lint, changed\-file formatting/whitespace and parent health pass with concrete recorded results\. Native model/PCM checks and supported live UI/voice\-selection/stop/continue acceptance are verified separately where authorized and available; unavailable layers remain explicit blockers, not fixture\-based completion\.
- README, ACCEPTANCE and the relevant parent feature\-inventory entry accurately describe the delivered controls, selected/default voices, timing semantics, compatibility, installation/activation gates, rollback and fresh test/runtime/UI evidence\. Goal closure audits every criterion; blocked new\-voice or live capability requirements are retained\.

### Phase `contracts` — completed

> Rebaseline the combined dirty tree and establish the finalization, review and preference contracts before behavioral edits\.

**Verification:**

> Technical contract and optional preference/protocol identities defined; new controller and real PCM worker regressions reproduce absent requested behavior before implementation\. Prior45TS\+60Python green baseline retained\. Current newly added workflow tests intentionally red until subsequent implementation; no live message/model/audio action\.

- **`baseline_and_contract` · completed:**
  > On authorized Build resumption, inspect scoped status/diffs and current worker/TUI ownership; preserve all prior dirty/untracked work\. Specify backwards\-compatible settings/protocol and request identities for graceful finish, pause/idle timing, voice IDs and continuation\. Resolve actual decoder endpoints and the 25\-second cap so settings cannot misrepresent recording duration\.
  - Evidence:
    > Rebaselined submodule status/stat preserving 15 prior modified files plus existing untracked work\. Inspected protocol/controller/worker/PCM/transducer/runtime/setup and public dialog/client contracts\. Added docs/recording\-contract\.md defining pause0\.5–10/default1\.5, idle5–120/default15, dynamic segment\-cap constraint, generation\-tagged finish/drain/empty completion, bounded inference failure, continuation/editing and safe voice selection semantics\. Added optional settings and timing validator plus finish command/completion protocol shape; unsolicited completions cannot submit\. Full npm run check passes45TS\+60Python, strict types/lint; diff whitespace passes\. Live proc inspection finds refreshed Sherpa worker243193; no new audio/model/UI/live message acceptance claimed\.
- **`regression_cases` · completed:**
  > Add failing behavioral cases for manual stop with final tail/queued audio, empty stop, duplicate stop, stop during decode, continuation/edit retention, stale requests/session changes, invalid/legacy settings and model\-switch failures\. Plan real UI acceptance without using live sends or physical audio as hidden unit\-test side effects\.
  - Evidence:
    > Added actual worker regressions in tests/test\_recording\.py for real owned pipe queued\-frame drain/native tail flush, duplicate finish, empty completion, before\-ready stop, stale request/session, configurable90s idle, invalid/nonnumeric timing and failed voice\-selection preservation\. Added controller regressions for exactly\-once finish review/stale completions, edited draft continuation with empty extra recording, explicit\-only send and session invalidation\. Ran both suites against preimplementation state: both fail as expected \(/tmp/opencode/voice\-workflow\-red\.log and voice\-worker\-red\.log\)\. Existing tests retain slow\-decode timeout, overflow, stale native\-final/session and review\-cancel boundaries\. Public select actions/editing surfaces and no\-live\-send test strategy were verified earlier\. Voice switch and continuation API are contract\-level additions; no fixture\-as\-live claim\.

### Phase `recording` — completed

> Implement genuine configurable recording timing and safe stop\-to\-review below the UI layer\.

**Verification:**

> Configured pause/idle values are exercised in actual worker state machine, including90s wall\-time and0\.5/4s post\-endpoint PCM pauses\. Graceful finalization tested with real owned child/queued frames while inference is blocked: recorder stops before release, all3frames drain, one native final and one completion, empty/nonempty both pass\. Cold stop, stale request/session, timeout, EOF, overflow even during finish and cleanup regressions pass\. Controller rejects unsolicited/duplicate/stale/empty results and cannot auto\-send finished dictation\. No actual UI/key or physical model acceptance claimed; review controls still next\.

- **`timing` · completed:**
  > Extend src/protocol\.ts, src/controller\.ts and audio worker/recognizer configuration as needed with validated pause\-before\-review and idle\-off values\. Keep missing legacy values at the current nominal defaults, update active captures safely, preserve wall\-clock idle\-off during slow decoding and distinguish the separate bounded segment limit\. Test actual timer/endpoint behavior, not only settings labels\.
  - Evidence:
    > Controller now transmits validated optional pauseSeconds/idleSeconds on configure; native command validation rejects booleans/nonfinite/out\-of\-range values and worker applies values\. Pause drives processed quiet PCM after endpoint; idle remains monotonic wall\-time in control loop\. Segment cap=max\(25,idle\+pause\+1\) cannot silently stop longer idle selection at25s\. Added actual capture regression comparing0\.5s\-&gt;5frames vs4s\-&gt;33frames and proving89s stays armed/90s stops\.8new timing tests pass;9selected existing/new idle/noise/validation tests pass\. Native endpoint delay is explicitly additional, not mislabeled as exact full end\-of\-speech latency\. UI persistence/settings controls remain in later review phase\.
- **`finish_capture` · completed:**
  > Separate graceful finish from discard/cancel in the worker and controller\. Stop the owned recorder promptly, drain only valid bounded queued PCM, finalize recognizer tail on its owning thread and return one generation\-tagged completion; retain EOF/overflow errors and reject stale/duplicate results\. Route recognized words to manual review and empty captures to quiet mic\-off without auto\-sending\.
  - Evidence:
    > Implemented PcmCapture\.finish with expected EOF distinct from device failure, bounded retained queue and overflow refusal; worker stops owned recorder, drains accepted PCM then flushes recognizer exactly once on capture thread, returns epoch/request completion and rejects stale/duplicate finish\. Before\-readiness stop opens no late device; five\-second control\-loop deadline invalidates late flush without muting replies\. Existing click\-to\-dictation reader routing updated for new generation\. Controller F9/mic path emits finish, latches off, ignores repeated stop/stale events, reviews final words only and quietly handles empty result\. Tagged wake/partial/transcript events retain request identity; parser validates it\.43selected actual native\-worker/real\-pipe/PCM tests pass, plus3specific controller finish regressions; TS typecheck/Python mypy/ruff and diff checks pass\. Continuation and voice\-switch regressions remain intentionally red until later phases, not mistaken for complete feature acceptance\.

### Phase `review` — completed

> Expose the timing settings and make review resumable without sacrificing deliberate submission or text editing\.

**Verification:**

> Controller append/edit/empty\-continuation/explicit\-send and stale\-origin regressions plus actual transpiled custom review/TUI handler suites pass\. Separate public editor has no C binding; cleanup tests ensure review key layers/abort listeners are removed and replacing review cannot clear unrelated UI\. UI settings labels, persisted numeric validation and real worker timing semantics are independently covered\. Full source coverage currently55TS\+74Python plus one intentionally red later\-phase voice case; not represented as a complete goal/full\-green check\. Test\-quality boundary audit covered review/tui and adjacent controller/transport/PCM suites with distinct stale/cancel/EOF/overflow/finish cases retained\.

- **`review_continue` · completed:**
  > Use public dialog/keymap APIs for a review screen showing the full draft and Enter/send, C/continue, E/edit, Esc/discard\. Keep the editing surface separate from C's action binding\. Continue recording retains the latest edited draft, appends subsequent finalized text once and returns to review, including after an empty added segment; guard original session and review identity through cancellation/errors/disposal\.
  - Evidence:
    > Added src/review\.tsx using public custom dialog/inline keymap APIs: full plain\-text scrollable draft and visible Enter/send,C/continue,E/edit,Esc/discard plus mouse actions\. Editing uses separate native prompt so literal c is text, and edit Enter saves back to review rather than sending\. Controller stores edited continuation prefix only in memory, appends full finalized new segment once, returns to review for empty added segment or recording error, sends only explicit review result, and aborts stale review on new listen/session/disposal\. Natural handsfree capture is temporarily configured off during review then restored only if still same origin; explicit manual finish stays off\. Actual transpiled review helper tests cover full draft/no eager send, C with edited literal\-c text, layer disposal, discard/abort/replacement without clearing unrelated UI, edit cancel and stale edit\. All52TypeScript tests pass plus stricttypecheck and whitespace\. UI fixtures are not actual rendered/key\-delivery acceptance\.
- **`settings_and_controls` · completed:**
  > Wire F9 and footer mic to the same finish path and accurate Starting/Listening/Finishing/Review/Off states\. Add separate pause\-before\-review and idle\-off controls to Ctrl\+P Voice assistant settings with clear units, valid bounds and persisted values\. Keep footer layout, explicit hotkeys, manual\-review/hands\-free distinctions and existing readout modes unchanged\.
  - Evidence:
    > Ctrl\+P now exposes persisted pause0\.5–10s and idle5–120s prompts with units, current values and native\-endpoint caveat; invalid/cancelled inputs keep preferences unchanged and report validation errors\. Existing mic\-off latch survives valid timing changes\. Footer click and F9 share graceful finish; muted mic, Finishing recording toast/composer cue distinguish finalization from Listening\. Added actual transpiled TUI tests for persistence/native config values, invalid/cancelled entries, off\-latch preservation and second\-click cue\.55TS tests and stricttypecheck pass;74Python pass with only the deliberately prewritten future voice\-selection regression deselected\. Changed4Python formatting, mypy, ruff and whitespace checks pass\. No actual rendered/key\-delivery acceptance claimed\.

### Phase `voices` — blocked

> Provide real local voice choice with verified assets and safe, reversible synthesis switching\.

**Blocker:**

> Source/picker/runtime complete, but actual alternative\-voice model installation and native alternative acceptance remain blocked on retained asset\-install approval \(114204494bytes\)\. Native plan tool refuses starting the next phase until the current phase is verified, so final acceptance cannot be advanced around this blocker\.

- **`voice_assets` · blocked:**
  > Inspect vendor\-supported Piper voice metadata and curate Lessac plus at least one contrasting English voice\. Pin source revisions, model/config checksums and licensing; extend the existing previewable installer without replacing other models or clobbering manifest entries\. Show download size/changes and apply only under applicable explicit installation authority; otherwise retain this task/voice acceptance as blocked while independent source work proceeds\.
  - Evidence:
    > Fetched official pinned tree metadata and card/config bytes; modelLFSsha2565d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a, config/cardSHA256 independently computed\. Rejected Ryan because card is CC BY\-NC\-SA; chose LJ Speech with public\-domain dataset provenance\. Added shared voice\-assets\.json/audio\.voices catalog, \-\-voice installer/setup option, dryrun exact byte/license/pin output and manifest merge preserving previous entries\.13installer/setup tests pass including no\-network optional preview and retained manifest metadata; actual defaultLessac all3files independently verified;7Python\-source mypy passes\.
  - Blocker:
    > Source catalog and previewable installer are implemented and tested, but actual new\-model installation lacks the applicable explicit asset\-install approval retained by the user\-approved plan\. Preview: en\_US\-ljspeech\-high,3files,total114204494bytes\(\~114MB\), pinned revision5041a7a49ae5b3a0f30e6837769eb03fdbb231bd; modelcard identifies public\-domain LJ Speech dataset\. Existing Lessac hashes independently match\. No new model downloaded or defaultvoice changed\. Need installation authority before actual native alternative\-voice acceptance; independent picker/runtime source work may continue\.
- **`voice_picker` · completed:**
  > Add an allowlisted persistent voice\-ID picker to Voice assistant settings, clearly distinguish installed versus unavailable voices, retain Lessac by default and offer an explicit local preview action\. Extend protocol/runtime synthesis to select verified local files safely, initialize on the owned playback path, prevent mixed old/new queued speech, release old model resources, and preserve working selection/dictation on invalid or failed loads\. No runtime network or arbitrary model\-path execution\.
  - Evidence:
    > Implemented shared pinned2voice catalog and TUI picker with missing voices disabled, saved availability, explicit fixed\-phrase playback\-only preview and no runtime downloads\. Persists choice only after epoch/request/voiceID\-verified native ack; restores saved choices, coalesces updates during load, rejects stale ack and times out/cleans promises\. Runtime verifies all3files and atomically swaps candidate only if generation valid, retaining workingmodel on native/missing/corrupt/stale failures; runs on owned playback loop and invalidates old queued speech without touching dictation\. Full npm run check61TS\+81Python,strict7modulemypy/ruff/types and10changedPython formatting pass\. Actual network\-isolated installedSherpa/Piper probe selectedverifiedLessac, refusedmissingLJ, retained sameworkingnativeobject and synthesized132652WAVbytes in memory onCPU, no devices/saved audio\. Different installedvoice remains explicitly asset\-gated, not accepted via fixtures\.

### Phase `acceptance` — pending

> Independently verify source, native audio and usable UI behavior, then document exactly what is delivered\.

- **`source_and_native_verification` · pending:**
  > Run the actual npm run check suites, changed Python formatting, scoped git diff \-\-check and relevant parent health\. Audit changed and adjacent controller/transport/PCM/voice\-loading suites for distinct failure coverage\. Run bounded offline installed\-model PCM and synthesis checks for timing, finish tail, continuation seams, selected voice and cleanup; preserve privacy and do not open physical devices or send messages implicitly\.
- **`live_acceptance_and_docs` · pending:**
  > Under existing exact authority and supported integrations, verify settings, voice preview/selection, F9 and button finish, full review text, edit/C continuation, empty stop, no sending before Enter, session cancellation and owning\-plugin reload cleanup\. Reverify the prior desktop INPUT\_FAILED limitation instead of bypassing it; keep missing UI/human/model\-install evidence blocked\. Update voice README/ACCEPTANCE and only the relevant parent feature row, record scoped rollback and unchanged executable/shared\-service evidence, then audit all criteria before closing\.

### Decisions

- User explicitly added the voice picker and requested one goal for all listed changes\. This is a new independent goal; the completed Sherpa\-activation goal and delivered F9\-default work remain completed history, not reopened tasks\.
- Plan\-mode goal creation is paused automatically\. All implementation tasks remain pending; switch to Build and explicitly resume/authorize execution before source changes\. No token budget, duration limit or auto\-turn cap was requested or set\.
- Current source evidence: Lessac is hardcoded in audio/runtime\.py and the pinned installer; there is no voice picker\. Worker manual endpoint buffering uses nominal 1\.5 seconds, idle\-off is hardcoded at 15 seconds, and the processed\-audio safety limit is 25 seconds\. These are separate behaviors that must not be conflated\.
- Use graceful worker finalization, not a controller snapshot of the last partial, to avoid losing the final words\. Keep immediate discard/session cancellation as a distinct path, with bounded drain and request\-generation checks\.
- A literal single\-key C action must not steal characters from a focused editor\. Recommended review design: nonediting full\-draft review with Enter/C/E/Esc, and a separate public editing prompt that accepts ordinary text including c\. Preserve edits before appending new speech\.
- Only Lessac is currently established as installed\. A one\-item picker or a settings label alone does not satisfy different\-voice acceptance\. New model installation/activation retains its applicable separate gate; never silently download on selection or claim blocked assets are usable\.
- Prefer public plugin dialogs, keymaps, storage and worker transport; do not change OpenCode's frontend/binary, import private composer internals, add another launcher, restart the shared service or persist unsubmitted transcripts\.
- The previous desktop INPUT\_FAILED is a known acceptance risk, not proof it is still failing\. Recheck supported capability at acceptance; no unsupported input workaround or fixture\-as\-live claim\.
- No separate plan file or repo goal export is being written\. The supported goal record contains the persisted plan; source implementation, publication and model installation remain untouched\.
- Pending user\-requested scope addition, not yet incorporated into the objective or executable tasks: fix voice\-first use from the home/New session screen\. Screenshot shows 'Open an OpenCode session before using voice\.' Source confirms src/controller\.ts listen\(\) refuses absent sessions, configure\(\) requires a session, and src/tui\.tsx hides the microphone unless the route is session; test/tui\.test\.ts currently asserts that restriction\. Proposed acceptance: F9 and a visible mic work on fresh home, recording/review/C continuation require no typed starter, explicit nonempty send creates/opens exactly one new session scoped to that draft, empty/discarded drafts send/create nothing, and switching tabs/location invalidates stale home drafts instead of targeting an old chat\. Public client supports session\.create and UI supports navigation/model selection, but selected agent/mode/permission preservation must be verified without private composer access; an unavailable public surface is a blocker, not permission to start the wrong agent\.
- Native update\_goal\_objective refused this requested planned\-goal expansion with: 'editing a planned goal requires an explicit /goal edit &lt;objective&gt; command'\. Do not retry, replace the goal, or use plan\-task changes to bypass that gate\. The new\-chat requirement is retained here as a pending planning addendum only; original objective, immutable criteria and executable tasks remain unchanged\. Incorporating it requires the user's explicit supported /goal edit instruction while preserving all existing voice\-picker/timing/finish/review requirements\. Goal remains paused in Plan mode; no implementation, session creation or message sending occurred\.
- User switched to Build and explicitly requested goal update then implementation\. Native objective edit again refused the literal /goal edit gate; no bypass/replacement\. Supported update\_goal\_status successfully resumed the existing goal\. Execute its already\-planned scope; new\-chat objective expansion remains pending the explicit command\. Existing no\-install/no\-live\-send/no\-publication gates remain\.
- Contract groundwork only is implemented, not recording controls\. Native worker still uses previous timing/stop behavior and UI remains unchanged\. src/controller\.ts currently ignores recording\_finished because no finish request is issued yet; replace this guard with exact outstanding\-request acceptance when implementing the graceful\-finish state machine\. Do not treat new protocol types or successful checks as delivered finish/review/voice\-picker behavior\. ACCEPTANCE records this boundary\.
- Model installation preview is available via \.venv/bin/python scripts/download\_models\.py \-\-dry\-run \-\-voice en\_US\-ljspeech\-high; actual narrow install would use same command without \-\-dry\-run and must preserve Sherpa/other manifest entries\. Current user implementation authorization is not being expanded into previously separated asset installation approval\. Keep source/runtime/picker work independent and do not close voice acceptance with one installed voice\.
- Attempt to start independent final acceptance was atomically refused by native plan tool: 'verify the current phase before starting the next phase'\. No plan changes from that attempt applied\. Honor this sequencing gate; do not start or mark acceptance in progress while voices remains blocked\. Current fullsource/defaultnative checks remain evidence for voice\_picker only\. Complete routine capability docs required by repository instructions without claiming final/live goal acceptance or bypassing the asset/phase gate\.
- Current source/default\-native audit: full npm run check61TS\+81Python passes, strict7Python\-modulemypy/ruff/types,10changedPython format checks, child/parent scopedwhitespace, setup\.sh syntax and parent health pass\. Actual bwrap\-isolated installedSherpa/Piper test selects verifiedLessac, rejects absentLJ without changingworkingobject and produces132652WAVbytes only in memory onCPU; no devices/messages/newweights\. README149lines, ACCEPTANCE requirement\-to\-artifact/evidence/limit table and only parent voice feature row updated, preserving concurrent unrelated edits\. Source recording/review/picker is delivered; realalternativevoice, rendered/key/human acceptance and separately requested newchat scope are not claimed\.
- No executable task remains in the current voice phase except blocked voice\_assets\. Native phase gate explicitly prohibits starting final acceptance until voices is verified\. The existing approval boundary requires user/external authority to install the previewed114204494\-byte LJ Speech model; the newchat objective expansion separately requires literal /goal edit\. Do not auto\-continue in circles, fabricate an alternative voice from one installed model, bypass phase/objective/install gates, or close as complete\. Preserve implemented source and all pending acceptance work for a specifically authorized follow\-up\.

## Historical documentation

### Historical record coverage

Only retained archived goals are available. The plugin also bounds archives globally, so full historical completeness cannot be proven.
This is one retained archived goal. The goal plugin bounds archived records, so older records may have been pruned.
Only allowlisted goal lifecycle, checkpoint, and plan-revision records are included. No session transcript, screenshot, or unrelated project data is read or copied.
The goal plugin also bounds archives, checkpoints, lifecycle history, and plan change records; older entries may have been pruned.

### Lifecycle history

- 2026-10-29T10:53:04.000Z · **`updated`**
  > Goal plan updated \(revision 1\): Persist the complete user\-requested scope, including the newly requested real voice picker, with ordered implementation and verification phases while respecting paused Plan mode and existing activation/asset approval boundaries\.
- 2026-10-29T11:08:33.000Z · **`updated`**
  > Goal plan updated \(revision 2\): Retain the screenshot\-backed additional bug and proposed acceptance without bypassing the native explicit\-command gate that refused changing an already\-planned objective\.
- 2026-10-29T11:10:32.000Z · **`resumed`**
  > Goal resumed\.
- 2026-10-29T11:10:54.000Z · **`updated`**
  > Goal plan updated \(revision 3\): Record actual Build authorization and successful resumption, preserving the native objective\-edit blocker and existing scope\.
- 2026-10-29T11:10:55.000Z · **`checkpoint`**
  > The goal is resumed in Build\. OpenCode still rejects changing its objective without a literal \`/goal edit …\` command, so the new\-chat addition remains pending that gate\. I’ll proceed with the existing authorized work, starting with recording finalization and timing\.
- 2026-10-29T11:14:48.000Z · **`updated`**
  > Goal plan updated \(revision 4\): Checkpoint verified compatibility groundwork and passing baseline checks while retaining incomplete workflow regressions and all later feature phases\.
- 2026-10-29T11:15:02.000Z · **`checkpoint`**
  > \*\*Implementation has started, and the goal is active\.\*\* Completed the recording protocol groundwork and validation; \*\*45 TypeScript \+ 60 Python tests pass\*\*\. The new controls themselves are not finished yet\. Next are finalization/race regressions, then stop\-to\-review, continua\.\.\.
- 2026-10-29T11:15:04.000Z · **`autoContinue`**
  > Auto\-continue 1 reserved\.
- 2026-10-29T11:17:00.000Z · **`checkpoint`**
  > I’m separating “finish and review” from “discard recording\.” That lets F9 stop capture promptly while the decoder finishes the last words, without accidentally sending them or accepting a late result from an older recording\.
- 2026-10-29T11:17:56.000Z · **`updated`**
  > Goal plan updated \(revision 5\): Baseline regressions now cover the required lifecycle failures and reproduce missing behavior; proceed to actual recording implementation without shrinking scope\.
- 2026-10-29T11:19:19.000Z · **`updated`**
  > Goal plan updated \(revision 6\): Actual configured worker timing is now exercised and verified; proceed to graceful finalization and controller request gating\.
- 2026-10-29T11:23:54.000Z · **`updated`**
  > Goal plan updated \(revision 7\): Native recording semantics and controller finish routing now pass targeted regressions; advance to the resumable review and settings UI without closing remaining goal scope\.
- 2026-10-29T11:30:17.000Z · **`updated`**
  > Goal plan updated \(revision 8\): Resumable review/controller behavior and its actual helper handler tests now pass; continue with persisted timing controls and accurate UI state\.
- 2026-10-29T11:31:10.000Z · **`checkpoint`**
  > The stop/review and continuation regressions are passing, including queued final words, empty recordings and edited drafts\. I’m now adding the timing controls to Ctrl\+P and a clear “Finishing recording” cue\. Live keyboard delivery is still a separate acceptance check\.
- 2026-10-29T11:33:19.000Z · **`updated`**
  > Goal plan updated \(revision 9\): Requested recording and review controls are now implemented and source\-verified; advance to real local voice alternatives and their installation/activation evidence\.
- 2026-10-29T11:38:23.000Z · **`updated`**
  > Goal plan updated \(revision 10\): Record verified asset provenance/preview/source work and the exact remaining installation gate, then continue independently with picker and safe synthesis switching\.
- 2026-10-29T11:38:24.000Z · **`checkpoint`**
  > The timing controls are implemented and source\-tested\. For the voice picker, I’ve prepared \*\*LJ Speech\*\* as an alternative to Lessac: its model card identifies the dataset as public domain, and the download preview totals about \*\*114 MB\*\*\. No new model has been downloaded\. I’l\.\.\.
- 2026-10-29T11:50:43.000Z · **`updated`**
  > Goal plan updated \(revision 11\): Checkpoint completed picker/source/default\-native evidence and exact asset/phase blocker without starting the prohibited next phase\.
- 2026-10-29T11:53:20.000Z · **`updated`**
  > Goal plan updated \(revision 12\): Persist the final source/default\-runtime evidence and concrete external approval/sequencing blockers; no goal completion or unverified acceptance is asserted\.
- 2026-10-29T11:53:39.000Z · **`unmet`**
  > Implementation/source progress is preserved and verified: configurable pause/idle settings, generation\-safe F9/mic stop\-and\-finalize with queued PCM/native tail, resumable edited\-draft review \(Enter/C/E/Esc\), safe offline voice\-picker/preview/acknowledged persistence and atomic native switching; full61TypeScript\+81Python checks,strict types/lint/format,syntax/whitespace and parent health pass\. \.\.\.

### Checkpoints

- 2026-10-29T11:10:55.000Z
  > The goal is resumed in Build\. OpenCode still rejects changing its objective without a literal \`/goal edit …\` command, so the new\-chat addition remains pending that gate\. I’ll proceed with the existing authorized work, starting with recording finalization and timing\.
- 2026-10-29T11:15:02.000Z
  > \*\*Implementation has started, and the goal is active\.\*\* Completed the recording protocol groundwork and validation; \*\*45 TypeScript \+ 60 Python tests pass\*\*\. The new controls themselves are not finished yet\. Next are finalization/race regressions, then stop\-to\-review, continua\.\.\.
- 2026-10-29T11:17:00.000Z
  > I’m separating “finish and review” from “discard recording\.” That lets F9 stop capture promptly while the decoder finishes the last words, without accidentally sending them or accepting a late result from an older recording\.
- 2026-10-29T11:31:10.000Z
  > The stop/review and continuation regressions are passing, including queued final words, empty recordings and edited drafts\. I’m now adding the timing controls to Ctrl\+P and a clear “Finishing recording” cue\. Live keyboard delivery is still a separate acceptance check\.
- 2026-10-29T11:38:24.000Z
  > The timing controls are implemented and source\-tested\. For the voice picker, I’ve prepared \*\*LJ Speech\*\* as an alternative to Lessac: its model card identifies the dataset as public domain, and the download preview totals about \*\*114 MB\*\*\. No new model has been downloaded\. I’l\.\.\.

### Plan revision history

- Revision 1 · 2026-10-29T10:53:04.000Z
  > Persist the complete user\-requested scope, including the newly requested real voice picker, with ordered implementation and verification phases while respecting paused Plan mode and existing activation/asset approval boundaries\.
- Revision 2 · 2026-10-29T11:08:33.000Z
  > Retain the screenshot\-backed additional bug and proposed acceptance without bypassing the native explicit\-command gate that refused changing an already\-planned objective\.
- Revision 3 · 2026-10-29T11:10:54.000Z
  > Record actual Build authorization and successful resumption, preserving the native objective\-edit blocker and existing scope\.
- Revision 4 · 2026-10-29T11:14:48.000Z
  > Checkpoint verified compatibility groundwork and passing baseline checks while retaining incomplete workflow regressions and all later feature phases\.
- Revision 5 · 2026-10-29T11:17:56.000Z
  > Baseline regressions now cover the required lifecycle failures and reproduce missing behavior; proceed to actual recording implementation without shrinking scope\.
- Revision 6 · 2026-10-29T11:19:19.000Z
  > Actual configured worker timing is now exercised and verified; proceed to graceful finalization and controller request gating\.
- Revision 7 · 2026-10-29T11:23:54.000Z
  > Native recording semantics and controller finish routing now pass targeted regressions; advance to the resumable review and settings UI without closing remaining goal scope\.
- Revision 8 · 2026-10-29T11:30:17.000Z
  > Resumable review/controller behavior and its actual helper handler tests now pass; continue with persisted timing controls and accurate UI state\.
- Revision 9 · 2026-10-29T11:33:19.000Z
  > Requested recording and review controls are now implemented and source\-verified; advance to real local voice alternatives and their installation/activation evidence\.
- Revision 10 · 2026-10-29T11:38:23.000Z
  > Record verified asset provenance/preview/source work and the exact remaining installation gate, then continue independently with picker and safe synthesis switching\.
- Revision 11 · 2026-10-29T11:50:43.000Z
  > Checkpoint completed picker/source/default\-native evidence and exact asset/phase blocker without starting the prohibited next phase\.
- Revision 12 · 2026-10-29T11:53:20.000Z
  > Persist the final source/default\-runtime evidence and concrete external approval/sequencing blockers; no goal completion or unverified acceptance is asserted\.

## Continuation constraints

- This handoff is a bounded export of goal state, not a transcript. Do not infer unrecorded work or claim history is complete.
- Preserve the source session and goal record. This companion does not create, migrate, rebind, or close goals.
- Use the current plan revision and its completion criteria; do not silently remove or reopen verified work.
- No screenshots, credentials, raw session messages, or data from another repository are included.

