# Plan — `5cfb6b2c-7d0c-411c-919d-cd012592683a`

- Goal ID: `5cfb6b2c-7d0c-411c-919d-cd012592683a`
- Source session ID: `ses_e7b2588f9ffex9fhCMGyFF15LJ`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T18:50:39.799Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `4`
- Record: `current`

## Goal objective

> Finish the full voice\-assistant delivery carried forward from unmet goal2d783ea9\-f3cc\-432b\-b6be\-2fe56eaa1c7e \(and its predecessor goals103fa0ed/db8d8476\), retaining all completed source/native/model evidence and all remaining live acceptance requirements\. First fix the newly reported recording defect: button/F9 recording must by default continue through speech, decoder endpoints and pauses until the user presses the button/hotkey again; no default inactivity timer or hidden duration cap may finalize a healthy manual recording\. Expose inactivity auto\-off as an explicit persisted opt\-in setting, disabled for missing/legacy preferences; when enabled it must actually honor the chosen timeout and preserve all accepted transcript text into review\. Preserve bounded resource/device\-failure safeguards, offline CPU voices, hands\-free wake behavior, explicit send/edit/continue/discard, request/session isolation and cleanup\. Then complete prior renderer/desktop\-input owning\-host workflow verification and repairs, including new/existing chat mic/F9, settings/picker/preview, safe first admission, spoken reply and uncertainty recovery\. Own prerequisite errors and review canonical bridge correction/deployment readiness, retaining actual separate consequential\-action gates and no security bypass, no private APIs/host executable edits/shared restart or unrelated deletion\. Preserve dirty/untracked user work, add behavior regressions, run relevant checks and update acceptance/docs with honest evidence\. Do not commit or push\. Continue through independently resolvable work; never label fixtures as physical/human/live acceptance\.

## Persisted plan

Plan revision: `4` · updated 2026-10-29T18:50:01.000Z

> Fix manual recording semantics first, carrying all prior delivery and acceptance scope forward\.

### Completion criteria

- Default manual recording persists through endpoints, long speech and silence until explicit stop, without hidden auto\-finalization cap\.
- Explicit persisted timeout opt\-in defaults off including legacy preferences, propagates to worker and retains text on expiry\.
- Source/actual\-worker/native UI checks pass with regression coverage; resource/routing/cleanup guarantees preserved\.
- All inherited owning\-host desktop and complete new/existing voice workflow gates verified or explicitly retained with exact actionable prerequisites\.
- Docs accurately describe behavior and evidence; unrelated work/host/security/no\-commit boundaries preserved\.

### Phase `recording` — completed

> Repair default manual recording and explicit optional timeout\.

**Verification:**

> New recording semantics verified across storage/adapter/controller/protocol/actual worker/real pipes/native models and negative controls; running worker generation verified\. No source/worker check claimed human physical acceptance\.

- **`contract` · completed:**
  > Add default\-off opt\-in preference/protocol/settings and worker/controller semantics with regressions\.
  - Evidence:
    > Default idleTimeoutEnabled=false across missing/legacy settings, TUI explicit persisted opt\-in/duration, protocol configure\+reason\-tagged finish, worker manual endpoint/duration auto\-finalization removed\. Optional idle initiates drain/flush into matching review rather than drop text; wake pause behavior remains separately configured\. Regression coverage includes375sec virtual speech/quiet, actual\-pipe held\-decode drains, controller unsolicited/stale idle completion and setting propagation\.
- **`verify` · completed:**
  > Run actual\-worker long recording/quiet/endpoint/explicit finish and optional timeout checks plus full suites; fix failures\.
  - Evidence:
    > Final86TS\+91Python/types/lint, Pythonformat5files, whitespace and parenthealth PASS\. Actual installed offline Sherpa smoke12conditions\+explicit/empty stop\+opted\-inidle/noise PASS; stronger real\-paced34\.647s input \(20s silence,speech,12s pause,speech\) retains both known segments and completes35\.319s only on explicit teststop\.375s worker speech/silence tests pass; isolated old endpoint/duration/default\-timeout mutations fail\. Owningworker109409 started after all latest recording source using precisebootclock, installedSherpa/netisolation/capturelock verified; predecessor105963 replaced\.
- **`docs` · completed:**
  > Update current README/contract/acceptance/feature semantics without rewriting historical evidence\.
  - Evidence:
    > README, recording contract, latest ACCEPTANCE checkpoint and only parentfeatures voice row reflect manual second\-press\-only default, opt\-in timeout and actual evidence\. Historical checkpoints preserved\. Native legacy review9cases still pass after recording changes; all inherited host acceptance remains explicit\.

### Phase `inherited` — blocked

> Finish inherited integration and owning\-host acceptance\.

**Blocker:**

> Only remaining mandatory work is owning\-host full voice acceptance after exact shared bridge deployment and separately authorized GNOME session refresh/login\. Generic continue/finish intent cannot authorize potentially app\-closing desktop refresh under applicable instructions\.

- **`preserved` · completed:**
  > Retain completed native renderer/interactions/review/recovery/two\-voice work from predecessor\.
  - Evidence:
    > Predecessor goal verified83TS\+87Python,18native interaction scenarios, official isolated Node26 runtime and offline installed PCM/two\-voice/service probes\. Narrow subtitle clipping repaired\. All dirty/untracked artifacts preserved\.
- **`desktop` · blocked:**
  > Resolve reviewed two\-file shared bridge deployment/refresh gate using applicable exact authority, then verify supported input\.
  - Blocker:
    > Fresh deployer preview still exactly2/7 changes input\.mjs/extension\.js; exact shared deployment and separate GNOME session refresh/login approval not supplied\. Supported inventory works\. Ptyxis AT\-SPI terminal exposes only link actions, no supported editable input\. Focused host is another chat, so no test speech/commands injected\. Do not bypass deployment/logout gates or edit runtime copies\.
- **`live` · blocked:**
  > Verify full physical/owning\-host new/existing voice flows, settings/picker/preview/send/readout and cleanup, repairing defects\.
  - Blocker:
    > Owning\-host physical F9/settings/picker/human recording/send/readout depends on corrected loaded shared desktop input and exact intended chat\. Recording source/native pipeline and loaded\-worker identity pass but do not satisfy physical/human acceptance\.
- **`audit` · completed:**
  > Final all\-requirement artifact/evidence audit, full checks and accurate docs\.
  - Evidence:
    > Final audit: recording default\-off\+explicit\-stop semantics delivered with86TS\+91Python, types/lint/format, actual\-pipe375s tests, negative controls, native\-model34\.647s paced manual hold and finalword/multiple\-segment retention\. Native legacy9cases and parenthealth pass; freshwhitespace and ELFbaseline match\. Current README/contract/latestACCEPTANCE/parentfeatures updated, historical scope/evidence preserved\. Remaining entire\-host acceptance correctly fails authorization/input gate, not replaced with fixtures; no commit/push\.

### Decisions

- The user's new requirement supersedes pause/15\-second default manual\-stop behavior; legacy idleSeconds alone must not imply opt\-in\.
- Prior unmet goals remain history\. Successor retains all unfinished scope and verified work, not a reduced recording\-only goal\.

