# Plan — `031edaea-0b22-4dec-9ae2-90c03837a630`

- Goal ID: `031edaea-0b22-4dec-9ae2-90c03837a630`
- Source session ID: `ses_e7b2588f9ffex9fhCMGyFF15LJ`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T05:35:25.715Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `11`
- Record: `archive`

## Goal objective

> Make the OpenCode voice assistant reliably capture complete spoken requests on this laptop and stream dictation into the normal message composer in real time, without a separate review popup or automatic sending for microphone\-button input\. Resolve the known recognition\-throughput, premature\-cutoff, missing\-word and safe\-composer\-integration blockers with verified implementation, not by deleting blocker labels\. Preserve existing drafts/attachments, session routing, microphone placement after Ctrl\+P commands, Ctrl\+P voice settings, privacy/offline speech, cancellation and cleanup\. Explicitly prompt the user with a test phrase and a ready/listening cue before any human speech test\. Verify source, runtime loading and the actual user workflow separately; retain required approval gates for host/runtime changes, deployment, shared restart and publication\.

## Persisted plan

Plan revision: `11` · updated 2026-10-29T04:10:33.000Z

> Resolve the actual recognition and native\-composer blockers, preserve the microphone/footer/settings work, and finish only after source, loaded\-runtime and explicitly prompted speech acceptance agree\.

### Completion criteria

- Microphone\-button dictation streams into the normal OpenCode message composer while speaking, with no separate review popup and no automatic submission; Enter remains a deliberate user action\.
- Complete known phrases, including testing one two three and a short sentence, are recognized without the demonstrated early cutoff or omitted suffix in controlled acoustic and explicitly prompted human tests; measured recognition throughput is fast enough to avoid growing backlog on this laptop\.
- Streaming updates preserve pre\-existing text and attachments, reconcile recognizer revisions without duplicate words, respect concurrent user edits, and never cross sessions or overwrite a different prompt/dialog\.
- The microphone remains at the right end after Ctrl\+P commands when subagent status appears/disappears; settings remain in Ctrl\+P, with loading/listening/processing/error feedback that reflects actual readiness\.
- Audio stays local/offline and in memory, buffers remain bounded, cancellation/unload/session changes release plugin\-owned resources, and system audio defaults/security settings and unrelated work are preserved\.
- Relevant type/lint/unit/integration checks pass; runtime loading and real workflow checks are recorded separately; blockers are resolved by evidence rather than relabeled\. Any host/deployment/shared\-restart/publication action has its required explicit authority\.

### Phase `diagnose` — completed

> Establish an evidence\-backed baseline and viable paths for both blockers before further implementation\.

**Verification:**

> Actual PCM rate validated, current and candidate CPU models benchmarked under the same offline runtime, vendor asset identity checked, source/dirty\-state preserved, installed/latest public plugin declarations inspected\. Recognition implementation has a measured candidate; composer\-host support remains an explicit blocker, not a cleared requirement\.

- **`preserve_prior_fixes` · completed:**
  > Retain earlier microphone/footer/settings, safe manual review, processed\-audio timeout and bounded\-capture source changes and their existing evidence\.
  - Evidence:
    > Inspected voice\-assistant Git status and ACCEPTANCE\.md\. Prior npm run check passed 24 TS and 13 Python tests; isolated wall\-clock mutation returned only testing and failed the complete\-phrase assertion\. Existing native\-composer and physical\-throughput failures remain explicit, not accepted fixes\.
- **`measure_capture_bottleneck` · completed:**
  > Revalidate sample format/rate, decode timing, CPU contention, cold/warm recognizer behavior and queue accounting using bounded synthetic/device probes; identify a reproducible cause rather than assume low volume\.
  - Evidence:
    > Measured actual PCM 31,850 bytes/s versus expected 32,000, with probe nodes removed\. Offline same\-machine benchmark: current lgraph real\-time factor 1\.650–2\.397 \(too slow\); official small\-en\-us\-0\.15 candidate 0\.398–0\.615 with 0\.766s load, preserving testing one two three in clean/noisy cases\. Candidate noisy sentence substitutes and for in, so human/acoustic accuracy is not accepted\. Asset matched vendor HTTPS size/MD5 and SHA256 30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498\. Scratch\-only, no runtime/model\-selection change\.
- **`resolve_composer_route` · completed:**
  > Verify all public session\-local composer/draft capabilities and a supported upgrade/extension route; identify exact source ownership and authorization needed if host support is missing\.
  - Evidence:
    > Rechecked installed SDK 2\.1\.1 and official V2 TUI guide; npm latest is 2\.2\.0\. Downloaded only its declaration from the npm tarball after verifying registry SHA\-512 integrity: UI still has no prompt/composer/draft editing API\. No runtime upgrade performed\. Voice\-assistant/AGENTS\.md forbids private TUI internals and binary edits\. A safe native draft contract requires host\-side public support and separately scoped authority; upgrading the plugin alone does not clear the integration blocker\.
- **`choose_supported_approach` · completed:**
  > Select reversible recognition and composer approaches with measured tradeoffs, compatibility, rollback and explicit approval boundaries\.
  - Evidence:
    > Choose checksum\-pinned official small\-en\-us\-0\.15 as the recognition candidate, retain the existing lgraph model for rollback, and require production\-worker/acoustic/human verification before acceptance\. Keep normal\-composer integration contingent on a public revision/session\-bound host draft contract rather than private\-renderable or keystroke workarounds\. Source/model setup changes can proceed independently; no shared rollout or publication is inferred\.

### Phase `recognition` — completed

> Make local recognition keep up and preserve complete utterances under realistic live capture\.

**Verification:**

> Source backend selection and matching readiness handshake are implemented without changing the default/live engine\. Real native synthetic and JSON/cold/slow/session\-switch/cleanup paths pass; negative source regressions detect removed reset and pre\-fix session races\. Package check passes 29 TS \+ 40 Python tests, types/lint; actual telemetry syscall trace has zero write/connect attempts\. Most importantly, both complete required phrases passed actual speaker\-to\-microphone capture at decoder RTF below 0\.19 with streaming partials, resource cleanup, and unchanged system audio defaults/volumes\. Evidence covers recognition implementation/regressions/controlled acoustics only: loaded replacement TUI, prompted human speech, composer/draft integration and final acceptance remain unfinished\.

- **`implement_recognition_fix` · completed:**
  > Implement the measured capture/decoder/model fix with bounded resources and no silent truncation; preserve source provenance and existing dependencies/settings unless an in\-scope change is actually needed\.
  - Evidence:
    > Completed opt\-in source path: documented public context\.options\.recognitionBackend reaches AudioWorker spawn, existing offline wrapper, argparse worker selection and explicit Speech backend; ready handshake reports backend and refuses mismatch rather than silently reverting\. Default remains Vosk\. Added transport/TUI/CLI/wrapper tests for readiness queueing, invalid choices, mismatch and cleanup\. Early ORT\_DISABLE\_TELEMETRY opt\-out precedes native imports; actual Sherpa/Piper model loading under syscall trace produced no file\-write attempts, connections, private HOME/XDG files, or stderr\. Verified installed Piper ORT 1\.31\.1's documented environment suppression; Sherpa bundles ORT 1\.28\.2\. Latest package check passes 29 TS \+ 38 Python tests, strict types and lint; shell syntax passes\. Previous 39\-case native synthetic worker and maintained phrase/pause/noise smoke remain valid\. Source selection/setup is prepared, not applied; active venv/models/config unchanged\. Physical/acoustic, prompted human and normal\-composer outcomes remain pending\.
- **`recognition_regressions` · completed:**
  > Exercise actual worker/transport plus short reads, slow/cold decoder, partial/final suffixes, pauses, overload, cancellation and cleanup; prove the relevant negative regression fails without its fix\.
  - Evidence:
    > Inspected and ran actual bounded\-capture, worker, smoke and transport suites: 29 TS \+ 40 Python tests pass with strict SDK/Python types/lint\. Coverage includes 128\-byte device reads preserving all 32k bytes/routing, explicit overload refusal before prefix delivery, stalled\-reader/unload cleanup, EOF failure, processed\-audio vs slow wall clock, partial revisions, native buffered suffix and final flush\. Two newly added deterministic decoder/finalizer session\-race tests failed before the fix: stale partial published and old finalizer cleared the new session's listen\. Atomic capture publication/current epoch\+sequence checks now pass both\. Native JSON\-main regression with real Sherpa/Piper models, a deliberately delayed decode, cold readiness and epoch switch passed; generated complete phrase delivered only to epoch2\. Shutdown left zero live owned children/feeders/worker threads, and external network refused\. Physical I/O/lock path alone substituted; this is not acoustic/TUI acceptance\. Existing isolated native\-reset mutation also fails the behavioral suffix assertion\.
- **`recognition_acoustic_gate` · completed:**
  > Repeat controlled speaker\-to\-microphone acceptance with known phrases, timing/backlog and cleanup evidence, without submitting test messages or saving audio\.
  - Evidence:
    > Controlled physical probe ran the actual production Worker\.capture, bounded reader and Sherpa native model using the real echo\-cancelled microphone\. Held the existing exact microphone lock; played only in\-memory Piper test audio through unchanged default output\. Both known phrases matched exactly once; 28/36 partial events appeared during playback, first partials 1\.138/1\.016s after playback start\. Decoder RTF 0\.185/0\.184 over 4\.625/5\.625s of actual captured PCM; no errors or growing backlog\. Every owned capture thread/child and transient PipeWire node was cleaned up\. Before/after default metadata and speaker/microphone volumes matched\. Saved numerical results only in acoustic\-result\.json; no microphone recordings/transcripts or OpenCode submissions, no human speech request, no model install/config rollout/shared restart\.

### Phase `native_composer` — blocked

> Deliver safe real\-time dictation in the actual normal message composer, not a substitute UI\.

**Blocker:**

> Installed 2\.1\.1 and latest published 2\.2\.0 public plugin APIs lack native composer draft editing\. Repository rules prohibit binary/private\-TUI changes; no explicitly scoped host source/runtime rollout exception has been given\. Need a supported public host extension or authorized upstream route\.

- **`composer_contract` · blocked:**
  > Establish a public client\-local/session\-bound draft\-editing contract with revisions, dictation ownership and preservation of text/attachments; keep any prohibited host/binary or unauthorized runtime change blocked explicitly\.
  - Evidence:
    > Fresh audit: opencode \-\-version is 2\.1\.1, npm view @opencode/plugin version is still 2\.2\.0\. Inspected installed UI interface and prior integrity\-verified latest context\-2\.2\.0\.d\.ts plus current official CLI plugin docs\. Public UI exposes dialog/router/panel/tabs/model/slots, not native composer snapshot/revision/owned\-range editing\. ACCEPTANCE\.md contains the prompt\-to\-artifact audit and exact unresolved requirements\.
  - Blocker:
    > A supported public host\-side, client/session/revision\-bound composer draft contract does not exist in installed/latest SDKs\. Current repository rules prohibit private TUI access and binary edits; no separately scoped upstream host implementation/rollout authority exists\. Need that external capability/authority before safe integration\.
- **`composer_integration` · blocked:**
  > Wire partial and final recognition into the supported native draft contract, remove the microphone\-input popup, and preserve deliberate Enter\-to\-send behavior\.
  - Blocker:
    > Depends on the absent public host composer contract\. Replacing manual review with simulated typing/private renderable access would violate scope and cannot safely preserve drafts, attachments, concurrent edits and session ownership\.
- **`composer_regressions` · blocked:**
  > Verify recognizer revisions, repeats, existing drafts/attachments, cursor/edit conflicts, session switches, dialogs, cancellation and the fixed footer position with realistic integration tests\.
  - Blocker:
    > Actual composer integration and host revision/ownership behavior are unavailable\. Hypothetical adapter fixtures cannot establish preservation, deliberate Enter\-to\-send or absence of the popup in the real composer\.

### Phase `live_acceptance` — blocked

> Load and verify the actual user workflow, then audit every criterion and document honest outcomes\.

**Blocker:**

> The requested native\-composer implementation is blocked upstream\. Optional recognition dependencies/model and native selection are not installed/applied; replacement loading/reload and actual human/layout acceptance retain their explicit gates\.

- **`authorized_runtime_loading` · blocked:**
  > Verify source/runtime identity, preservation and rollback; perform only the specifically authorized plugin/model/host rollout without a hidden shared restart\.
  - Blocker:
    > No explicit approval for optional dependency/model installation, native CLI selection deployment or owned\-TUI reload\. Active venv still lacks Sherpa and active models lacks the candidate\. No hidden rollout performed\.
- **`prompted_human_speech` · blocked:**
  > Explicitly provide a test phrase and a ready/listening cue before asking the user to speak; observe complete live dictation in the normal composer without automatic send\.
  - Blocker:
    > Requested native\-composer workflow and approved replacement TUI loading are not available\. No human speech test was requested; a future test must supply the phrase and verified Listening cue first\.
- **`layout_and_lifecycle` · blocked:**
  > Verify live footer stability with subagent status, narrow/wide layout as supported, loaded settings, session changes, interruption and unload cleanup\.
  - Blocker:
    > Replacement native\-composer plugin is not available/loaded, and live subagent\-transition/narrow\-layout acceptance is not established by existing source fixtures\. No authorized child spawn, shared restart or private host workaround inferred\.
- **`audit_and_document` · blocked:**
  > Run package and relevant parent checks, update acceptance/features against actual results, and close the goal only after all immutable completion criteria are supported by evidence\.
  - Evidence:
    > Interim full requirement crosswalk added to ACCEPTANCE\.md; README and parent features distinguish 69 passing source tests, native/real acoustic results, unchanged active runtime and unresolved composer/human/layout requirements\. Parent health and tracked/added\-source whitespace checks pass; no commit/push/publication occurred\.
  - Blocker:
    > Final success audit cannot pass while native\-composer, approved runtime loading and real human/layout criteria remain unsupported\. The interim evidence audit is complete, but the overall objective is not\.

### Decisions

- No token, duration or continuation cap was requested; none is set\.
- Delegation remains off; the parent owns implementation, verification and all goal operations\.
- Existing source work and unrelated dirty/untracked/staged files must be preserved\. No commit or push is authorized\.
- The current installed 2\.1\.1 SDK has no verified public native composer draft\-editing surface; private host\-renderable access, simulated destructive typing and editing the deployed binary are not acceptable substitutes\. A supported route must be established rather than declaring this cleared\.
- Human speech tests require an explicit phrase and ready/listening prompt\. Do not ask the user to infer when to speak or test a demonstrably failing pipeline\.
- A broad request to clear blockers does not itself waive source restrictions or separate deployment/security/shared\-restart/publication gates\. Keep any such missing authority exact while continuing independent authorized work\.
- Diagnosis ruled out PCM rate mismatch and measured a concrete CPU\-model bottleneck\. Benchmark the official small English model through production capture/acoustics before selecting it; do not trade synthetic speed success for an unverified accuracy claim\. Existing large model remains untouched for rollback\.
- A plugin\-only upgrade to npm 2\.2\.0 does not provide native composer editing\. Continue the independent measured recognition fix while retaining the exact host integration gate\. No binary installation, shared restart, permission change, commit or push is authorized\.
- Do not accept or roll out the small Vosk candidate yet\. The strengthened real\-model smoke test fails exact quiet\-speech recognition \(including testing becoming lasting\)\. A scratch\-only narrowed\-beam large model preserved words but measured RTF 2\.892–3\.921, still too slow\. Keep these failures and evaluate a faster accurate streaming path rather than weakening assertions\.
- Retain original lgraph runtime/setup pin until a replacement passes speed AND accuracy; faster small Vosk is not accepted merely because unit tests pass\. Next evaluate a different CPU\-local streaming engine in isolation\. PyPI reports sherpa\-onnx 2\.0\.1 has a CPython 3\.14 manylinux x86\_64 wheel; this is feasibility metadata only, not installation or model acceptance\. Current implementation task remains open\.
- Use the official streaming English 2023\-06\-21 LibriSpeech/GigaSpeech model \(HF revision 9a65b6ea94c311ca770c2bf895b30f456a22d703\) as the next candidate, not the weaker 2023\-06\-26 model\. Source pins match verified LFS/Git identities\. Endpoint resets must preserve native buffered lookahead\. Synthetic success does not clear acoustic/human acceptance or the absent public composer API\. Keep Vosk/default/live selection unchanged until an explicit supported selection/rollout path is ready and authorized; optional setup has not been executed\. Investigate the bundled ORT telemetry\-ID warning before any production activation\.
- Production recognition selection uses the existing native CLI plugin object options \(recognitionBackend: vosk\|sherpa\), not an OpenCode launcher or startup overlay\. A Sherpa request requires a matching worker readiness identity\. No live configuration was edited\. Correct telemetry attribution: the current Piper ORT package has import\-time 1DS initialization; its API disable call alone is too late\. The verified early environment opt\-out prevents initialization/persistence while network isolation remains mandatory\.
- Read\-only preflight found the existing microphone lock available\. A controlled synthetic speaker\-to\-microphone probe may proceed using that exact persistent lock, only plugin\-owned transient PipeWire resources, no OpenCode submissions, no saved microphone audio/transcripts, no system volume/default changes, and no human speech request\. If lock ownership changes, refuse rather than interrupt another TUI\.
- The local recognition throughput and controlled acoustic blockers now have passing real\-device evidence, not merely relabeled statuses\. Do not infer replacement deployment or final UX acceptance from this\. Proceed to native\_composer, whose existing public\-host\-contract/authority blocker remains exact; preserve all loaded\-runtime/human/layout and publication gates\.
- No remaining in\-scope public\-plugin implementation can produce the requested normal\-composer UX without a new host capability and applicable authority\. Preserve verified diagnosis/recognition phases and all source work; report the concrete external gate instead of auto\-continuing unsupported work, deleting blockers, or claiming completion\.

