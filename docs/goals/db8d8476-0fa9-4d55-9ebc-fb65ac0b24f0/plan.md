# Plan — `db8d8476-0fa9-4d55-9ebc-fb65ac0b24f0`

- Goal ID: `db8d8476-0fa9-4d55-9ebc-fb65ac0b24f0`
- Source session ID: `ses_e7b2588f9ffex9fhCMGyFF15LJ`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T17:28:41.952Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `9`
- Record: `archive`

## Goal objective

> Finish and verify the existing OpenCode v2 local voice\-plugin workflow autonomously in Build auto, carrying forward already implemented recording/timing/review/picker source and its evidence rather than repeating or discarding it\. The user now explicitly authorizes the previously previewed 114204494\-byte pinned LJ Speech model download/installation, owning\-plugin activation/refresh, and routine in\-scope verification without further approval questions\. Make at least two genuinely usable local Piper voices selectable and previewable while retaining Lessac by default; preserve safe verified switching, persisted preferences, offline CPU runtime and no runtime downloads\. Also fix the previously reported home/New session bug as first\-class scope in this new goal: F9 and a visible mic must work before any chat/message exists, allow stop/review/E edit/C continuation, and submit a nonempty reviewed first message to exactly one correctly scoped new session without requiring a typed starter, targeting an old tab, silently switching to an unsafe agent/permission mode, or creating chats/messages for empty/discarded recordings\. Use only supported public plugin/client APIs; preserve project/location/model/variant and safe selected agent/mode semantics, deriving or exposing any necessary explicit safe selection through supported APIs rather than private composer access\. Reaudit and repair the combined implemented controls as needed: configurable pause and no\-speech idle timing with legacy1\.5/15 defaults and honest endpoint/cap semantics; F9/mic stop drains accepted PCM/final tail once into review or quietly stops empty recordings; Enter sends,C appends to latest edited in\-memory draft,E edits without C stealing text,Esc discards; reject stale/session/request results and clean resources on cancellation/reload\. Verify source tests, actual installed alternative\-voice synthesis, PCM finalization/timing and supported TUI behavior separately; provide numeric/no\-content evidence and do\.\.\.

## Persisted plan

Plan revision: `9` · updated 2026-10-29T15:33:49.000Z

> Complete the authorized alternative\-voice installation and first\-message voice flow, preserving prior implemented controls and independently verifying the combined result in auto mode\.

### Completion criteria

- Lessac and the pinned LJ Speech alternative are installed with correct hashes and preserved manifests/models; both actually synthesize offline on CPU and picker changes persist only after successful native load\. Default remains Lessac unless explicitly changed by the user; missing/corrupt/stale selections preserve the working voice\.
- F9 and visible mic work on a fresh home/New session route without a typed starter\. Recording, stop/finalize, review/edit/continue work before session creation; explicit nonempty send creates and targets exactly one new session in the captured project/location, while empty/discarded/stale drafts create/send nothing and never target previous tabs\.
- New\-chat creation and submission use supported public APIs and safe project/model/variant/agent/permission semantics\. Preserve public selected state where exposed; otherwise use an explicit supported safe agent selection without silently starting an unsafe/default agent or importing private composer state\. Session creation/navigation/submission races and failed admissions cannot duplicate sends\.
- Existing pause/idle settings, manual stop tail/queued PCM preservation, empty stop, Enter/C/E/Esc, edited\-draft continuation, literal c editing, hands\-free/readout/F9 preferences, offline in\-memory privacy, stale\-request rejection and cleanup remain correct in the combined tree\. Fix discovered defects with meaningful regressions\.
- Behavior\-relevant complete source suites, strict typing/lint/format, whitespace/shell syntax and parent health pass\. Actual installed\-model synthesis/PCM and supported live UI/shortcut/worker loading are checked separately with numeric/no\-content evidence\. No fixture is represented as human or GUI acceptance; concrete capability limits remain disclosed\.
- README/ACCEPTANCE/relevant parent feature row and goal evidence accurately describe actual usable controls, new\-chat behavior, voices, installation, known limits and rollback\. Preserve all unrelated dirty/untracked/staged work and existing host binaries/wrappers/shared service; no security bypass, unrelated deletion, commit or push\.

### Phase `install` — completed

> Reverify existing source identity and install the explicitly authorized pinned alternative without disturbing working assets\.

**Verification:**

> Currentsource/worker identity and preinstallation asset preservation baselined; explicit114204494\-byte install complete\. Bothcatalogvoices verify all3pins and actually synthesize with installed CPU libraries under networkisolation; picker filesystem availability confirms both selectable\. Originalmodels/manifestentries intact; no stale approval blocker remains\.

- **`current_baseline` · completed:**
  > Inspect scoped current status/diffs, applicable instructions, installed assets/manifest, active plugin identity and prior evidence; retain completed source work and preserve overlapping/unrelated changes\.
  - Evidence:
    > Fresh scoped status/stat matches preserved prior source and untracked recording/review/voice catalog/tests; independent submodule instructions and parent maintainer policy re\-read\. Existing manifest regular/non\-symlink, all8recorded Vosk/Lessac/Sherpa assets independently hashed against pins;33\.09GB free\. Manifest backed up beside itself to manifest\.json\.backup\-voice\-followup\-6164289e50e64dc68f75aa5de8325c5f; baseline numeric/assets receipt in ignored state/voice\-followup\. Actual Sherpa worker9588 observed under owning TUI9393 lineage; no old PID assumptions reused\. Installer/catalog reviewed, default Lessac retained, only optional3LJ files planned\.
- **`install_lj` · completed:**
  > Run existing narrow pinned voice installer with manifest backup/preservation and hash readback; verify both voices with actual isolated CPU synthesis and failure\-retention tests, keeping Lessac selected\.
  - Evidence:
    > Ran existing narrow installer \-\-voice en\_US\-ljspeech\-high under user's explicit authorization\. All3LJ assets match catalog size/SHA256;8original manifest assets independently rehashed unchanged, merged manifest now11entries; backup retained beside manifest\. Actual src/voices\.ts returns bothvoices available\. Isolated network/PID bwrap probe used installedSherpa/Piper to select and synthesize both voices: Lessac134188WAVbytes andLJ155180bytes, distinct output digests, CPUExecutionProvider only\. Returned runtime toLessac; no physicaldevices, saved audio, packages/config/defaultpreference or sharedrestart changes\.

### Phase `home_voice` — completed

> Allow safe first\-message dictation on the home/New session screen through public APIs\.

**Verification:**

> Confirmed original home\-hidden\-mic regression failed before implementation and passes now\. Public2\.1\.1 interfaces support used create/prompt/router/model/agent operations with no private composer reads or permission mutation\.70TS\+81Python fullchecks pass, including preexisting finish/review/voice controls and new lazyhome/sessionorigin/race/admission cases\. Actual service/TUI acceptance is intentionally next rather than inferred from fixtures\.

- **`home_contract_tests` · completed:**
  > Inspect current public create/prompt/router/model/agent contracts and define home\-origin generation, safe agent selection and exactly\-once send\. Add regressions that reproduce the missing home controls/recording before fixing them; preserve existing session behavior\.
  - Evidence:
    > Read official V2 client/TUI docs and installed2\.1\.1 public Context/AgentInfo/SessionCreate/Prompt/Inbox schemas\. Public UI exposes model/router/location but no selectedcomposeragent; API accepts explicit existingagent/model/location and returns sessionidentity/inboxack\. Added home\.test\.ts contracts for lazy creation, capturedmodel/location, explicitsafeagent/no permissionoverrides, empty/stale/changedtab/location refusal, exactly\-once duplicatecalls, creationrace and wrongreturnedagent/scope rejection; preimplementation run fails for missing HomeVoice module\. Replaced old home\-absence TUI assertion with requested visiblehome/F9 regression; actually fails beforefix at missingmic\. Newmodule holds only in\-memory draft/create/submission promises; no typedstarter/automatic home submissions\.
- **`home_implementation` · completed:**
  > Implement visible home mic/F9, in\-memory home draft capture/review/continue and lazy session creation only for explicit nonempty send, with captured location/model and safe public agent/mode handling\. Guard route/tab changes, concurrent sends, cancellation, failed creation/admission and navigation; never send to a previous session\.
  - Evidence:
    > Added public\-API HomeVoice helper and controller home\-origin support\. Home mic/F9 now starts one\-shot recording without session, shows readiness/finalization/partial cues, reviews and continues edited drafts before any createcall\. Only nonemptyreviewSend resolves visibleexistingvoiceagent \(Plan default; explicit settingspicker\), captures model/variant/location, createsone session, verifiesreturnedagent/location/model, adoptsnew session for voice readout, navigates then verifiesexacttarget before prompt/admissionack\. Home\-origin epoch/generation and location checks reject stale/tab/location changes; promise\-cached attempts prevent duplicatecreate/resend or ambiguous automatic retries\. Existing sessions retain committedagent\. Actual transpiled TUI end\-to\-end mock tests cover homeC continuation\-&gt;onecreate/send, empty/discard/stale\-&gt;none, explicitagent/no permissionoverride; helper tests cover scope/modelcapture, duplication, creationrace, wrongreturnedagent/scope and transportfailure\. Full npm run check70TS\+81Python, strictSDKtypes/7modulemypy/lint and whitespace pass; source fixtures are not live session/human acceptance\.

### Phase `verification` — blocked

> Verify and repair the entire installed workflow rather than only the new source subset\.

**Verification:**

> Source73TS\+87Python/types/lint/format, syntax/whitespace and finalparenthealth pass; actual2voiceCPU/PCM/serviceadmission/refreshedowningworker pass\. GUI/key/human boundary attempted separately and unavailable, not accepted\.

**Blocker:**

> Live GUI/key/human acceptance requires the supported GNOME bridge, which is unavailable\.

- **`combined_regressions` · completed:**
  > Run full current suites/types/lint/format and audit changed/adjacent tests; add/fix lifecycle regressions discovered across finish, review continuation, startup voice selection, home handoff and cleanup\. Preserve distinct failure/privacy coverage\.
  - Evidence:
    > Full npm run check now73TS\+87Python passes with strict SDK types,7modulemypy/lint\. Independently failing\-before timeout tests repaired: actual TUI virtual15s emits request\-only cancel; real held\-native Worker\+Speech load retains priorvoice/dictation; stalecancel cannot touch newerrequest; atomic commit\+ACK resolves timer\-versus\-intransitsuccess; actual TUI packets crossJSON to realWorker/Speech and realACK back toTUI\. Native full smoke isolated half\-second finalpadding losing finalword identically in direct/worker; one\-second rightcontext fixes it without weakening text assertions\. Added meaningful finalcontext and emptyexplicitstop regressions\. Complete installed native smoke passes12phraseconditions plus explicit/emptyfinish, pausedphrase, two pacedidlecontrols, network refusal; firstpartial0\.629s, workerRTF0\.161–0\.344\. Final parenthealth passes after owner resolved unrelated stale\-security assertions\.
- **`native_and_tui` · blocked:**
  > Use bounded offline actual\-model PCM/synthesis checks and available supported desktop/TUI tools to inspect installed voices, settings, home/new\-session controls and owning\-worker refresh without private state or simulated live transcript injection\. Do not send a test message or open physical capture without an explicit test cue/phrase; record exact input/capture/runtime capability outcomes separately\.
  - Evidence:
    > Final2voice actualCPU synthesis135212/151596WAVbytes, distinctdigests, Lessacrestored, deniedcommit retains nativeobject\. NativePCM12conditions, explicit/emptyfinish, pausedphrase,2pacedidle/noise, firstpartial0\.629s, RTF0\.161–0\.344, netrefusal pass\. Actual HomeVoice/service1session/message/reply/0tools; probesremoved\. Sourcehotreload worker47009 after latestPython under sameTUI9393; old9588exited, installedSherpa/netisolation/capturelock and4PipeWirenodes verified\. ELF matchesbaseline; service9417predatesgoal\. Fresh desktopwindows fails missingGNOMEbridge\.
  - Blocker:
    > Supported desktop compositor bridge org\.gnome\.Shell\.Extensions\.OpenCodeWindowControl has no owner\. Actual settings/picker rendering, home mic visibility, F9 delivery and human stop/edit/continue/send cannot be verified\. No unsupported input/security/Shell\-restart workaround\.

### Phase `report` — pending

> Update authoritative capability documentation and audit all remaining requirements against concrete evidence\.

- **`docs_and_audit` · pending:**
  > Update README/ACCEPTANCE and only the relevant parent feature entry, preserving history while superseding old approval/scope blockers\. Verify scoped rollback and unchanged host artifacts, map every criterion to evidence, and close only on true completion or a genuine remaining external impossibility\.

### Decisions

- New goal explicitly requested by user after previous terminal unmet goal; preserve a85d6f31 history and its implemented recording/review/picker work \(historical61TS\+81Python\) as prior evidence, not current acceptance\. No goal objective edit or old\-goal reopening is required\.
- User explicitly confirms Build auto/no\-question execution and authorizes finishing the previewed voice installation and new\-chat bug\. Do not re\-ask routine install/activation/verification approvals; reuse this exact scope\. Native deny/ask and security controls remain intact; no commit/push authority is inferred\.
- No budgets, duration limit or auto\-turn cap requested; none set\. No subagents are authorized, so implementation and goal ownership stay in the parent\.
- Lessac remains default; LJ Speech adds a second actual voice, not a replacement\. Use existing installer/model pins and backup beside the protected manifest; no new library install or shared\-service restart is needed\.
- Home route has no session ID, and public UI currently exposes model but not necessarily selected agent\. Investigate supported APIs; choose an explicit safe selection flow if needed rather than silently running a default Build agent or using private composer state\.
- Prior no\-question policy and actual new authority supersede the earlier missing\-approval blocker; do not revive it from historical notes\. Native model/UI/human evidence remain separate, and unavailable physical/human evidence must be honestly distinguished from source success\.
- For voice\-created first chats, use a visible dedicated existing\-agent selection \(Voice settings; Plan by default\) shown in transcript review\. SDK2\.1\.1 does not expose composeragent/mode; do not infer it from an oldtab, silently use server Build default, read privatecomposer storage or override permissions\. Existing\-session dictation retains its committedagent\. Capture public model/location at beginning of dictation and reject scope changes; create/sessionprompt only after explicit nonemptyreview send\. Promise\-cached attempts prevent automatic duplicate creation or resend after ambiguous failures\.
- Independently failing timeout regressions reproduce absent TUI cancellation, ignored committed success after a virtual15s timer, and actual Worker\+Speech held\-native\-load cancellation/retention\. Fix within existing ownership with per\-request cancellation and atomic precommit/ack; keep TUI pending until worker resolves cancellation\-versus\-commit\. No epoch\-wide cancel or microphone reset\.
- Independent final documentation preparation is done: nested README/ACCEPTANCE/recording\-contract and ONLY parentfeatures voice row reflect authorized install/home fix, late\-ACK/timeout/native\-tail repairs, actual numeric evidence, retained prior history/rollback and exact missingGUI limit\. Four nestedlocal links resolve, fences balanced, README150lines; source/native/API fixtures never labeled livehuman/GUI\. Plan gate twice refuses starting report after blockedverification \('verify current phase before starting next phase'\); do not markGUI complete to bypass it\. Record completed document artifact audit here while report phase remains gated\.

