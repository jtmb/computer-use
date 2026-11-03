# Plan — `3950ba98-f04f-45c4-b138-ca34ea461e9d`

- Goal ID: `3950ba98-f04f-45c4-b138-ca34ea461e9d`
- Source session ID: `ses_e7b2588f9ffex9fhCMGyFF15LJ`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T11:10:02.603Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `complete`
- Plan revision: `4`
- Record: `archive`

## Goal objective

> Activate the already\-implemented faster Sherpa recognizer and microphone\-control changes for the existing OpenCode voice plugin, as the user now explicitly requests the agent to perform the pending installation, backend selection and owning\-plugin refresh\. Preserve prior verified source/acoustic work and the mic hotkey/15\-second no\-recognized\-speech auto\-off, manual review, offline privacy, session isolation and cleanup\. Install only the pinned optional packages/model into the plugin's existing environment; back up and narrowly deploy the canonical/native voice backend entry preserving unrelated configuration\. Verify installed and loaded worker identity and Ctrl\+P Voice assistant settings using supported public mechanisms, without changing the OpenCode executable/frontend/wrappers or restarting the shared service\. No commit/push, private TUI imports, simulated dictation or automatic test\-message sending\. If human speech is needed, provide an explicit phrase and verified Listening cue first; report any remaining live acceptance limits honestly\.

## Persisted plan

Plan revision: `4` · updated 2026-10-29T09:18:47.000Z

> Carry out the now\-authorized activation without repeating completed source/model experiments or altering OpenCode itself\.

### Completion criteria

- Pinned optional dependencies and model installed and independently verified in the plugin's active environment, preserving existing packages/models/settings\.
- Canonical and native voice backend entries narrowly select Sherpa with backups, readback and unrelated\-settings preservation; executable/wrapper hashes and shared service remain unchanged\.
- Owning plugin/worker refresh and loaded Sherpa/settings identity verified using supported mechanisms, or an exact capability blocker recorded rather than claimed live\.
- Relevant checks pass and rollback plus human/key\-delivery/end\-to\-end limitations are accurately documented\.

### Phase `install` — completed

> Install the pinned optional runtime with preserved existing state\.

**Verification:**

> Exact installed versions/assets and all\-package preservation independently verified\. Actual installed native model/production\-worker smoke passes, including15\-second controls\. No active configuration or shared service changes yet\.

- **`install_optional` · completed:**
  > Record versions/disk/baselines, verify wheels/assets and install only Sherpa optional packages/model\.
  - Evidence:
    > Recorded CPython3\.14\.4/x86\_64,33\.9GB available, one owning TUI's existing Vosk worker process chain\. uv pip installed only the two hash\-pinned2\.0\.1 packages from verified local wheels with \-\-offline \-\-no\-deps \-\-require\-hashes\. PEP503\-normalized full distribution comparison proves no other additions/removals/version changes\. Four verified pinned model files copied via existing installer from checksum\-verified local reuse staging; original models retained, manifest backed up\. Installed\-runtime offline recognition smoke PASSED12 direct/worker normal/quiet/noisy cases, paused phrase, paced firstpartial0\.637s, and two real\-paced15s silence/noise auto\-off controls; network refused\. Fixed the stale8\.5s smoke fixture to require actual idle\-off and reject any partial/final words, with new regressions failing before fix and passing after; EOF failures remain errors\.

### Phase `activate` — completed

> Select the backend and refresh only the voice plugin\.

**Verification:**

> Installed Sherpa is selected in both backed\-up/readback\-verified configs and observed loaded in a new ready worker under the same TUI, with old resources gone\. No shared restart or executable/frontend/wrapper edits\. Ctrl\+P hotkey setting is source\-verified; visible dialog/key delivery is explicitly unverified due desktop input capability failure, as permitted by the recorded acceptance criterion\.

- **`configure` · completed:**
  > Back up canonical/native CLI config and deploy only the voice backend option with readback\.
  - Evidence:
    > Backed up canonical CLI source and active native CLI config beside their originals; receipts in ignored state/activation\. Canonical source changed through patch, active config deployed via existing applyRegistration with regular\-file/mode guards, two concurrent\-change checks, backup and atomic rename/readback\. Semantic comparisons prove both changes affect only voice options\.recognitionBackend=sherpa and preserve every unrelated preference/plugin\. Valid config hot reload requires no TUI/server restart\.
- **`refresh` · completed:**
  > Use supported local\-plugin reload/discovery to verify the owning worker and Ctrl\+P settings; no shared restart\.
  - Evidence:
    > Supported native config watcher replaced the old Vosk worker chain\(195679/195682/195684\) with Sherpa Python worker210376 under the unchanged owning TUI56678\. New worker has capture\-loop lock FD open\(proves model construction/start completed\), isolated network namespace, and maps installed \.venv Sherpa native library, not scratch libraries\. Old chain fully exited; original TUI still running\. Actual Ctrl\+P dialog navigation could not be automated: deployed desktop input rejected advertised keyChord, then documented key input failed INPUT\_FAILED; cleanup release succeeded and read\-only window inspection confirmed no tab change\. No fallback/bypass, activation is not blocked; exact visual/key\-delivery limit retained\.

### Phase `accept` — completed

> Verify installed path and honestly audit the user's usable workflow\.

**Verification:**

> Audited criteria against package/version baseline, all4asset hashes, guarded config backup/deployment/readback, actual watcher\-replaced ready worker and installed\-library mappings, old\-resource absence, native accuracy/silence smoke,99source tests, compatibility/health/format/whitespace and unchanged host hashes\. Activation is delivered without user installation or restart steps\. GUI key/menu automation and fresh human/provider timing remain explicitly disclosed limitations, as allowed by the acceptance criterion; no approval is still pending for backend activation\.

- **`runtime_checks` · completed:**
  > Run relevant installed\-runtime/source checks, verify unchanged host and cleanup, document rollback and remaining live tests\.
  - Evidence:
    > Installed\-runtime offline recognition smoke passes12direct/worker normal/quiet/noisy phrase cases, pauses, paced firstpartial0\.637s, two real\-paced15s silent/noisy idle\-off controls and network refusal\. Full npm run check39TS\+60Python, stricttypes/lint; UV compatibility35packages, changedPython formatting, child/parent scoped whitespace and post\-activation parent health all pass\. Actual running Sherpa worker210376 maps only installed \.venv Sherpa native libs, old Vosk chain gone, originalTUI56678 still running; PipeWire inventory shows exactly one voice echo group/four nodes\. ELF\+bothwrapper hashes unchanged\. README/ACCEPTANCE and only voice row of concurrently restructured parent feature inventory updated without overwriting other sections\. Backup receipts and scoped rollback documented\. Desktop input INPUT\_FAILED prevents live Ctrl\+P/key\-delivery check; heldinput release verified and no fallback\. No physicalmic/human/provider end\-to\-end test or message send claimed\.

### Decisions

- User explicitly said 'you do it' in response to the exact pending installation/config/owning\-TUI refresh gate; reuse that authority without asking the same approval again\.
- The previous terminal source goal remains preserved\. This follow\-up performs the authorized activation only; no executable/host frontend changes, shared restart, publication or automatic message submission\.
- Activation is explicitly authorized by the user's 'you do it'\. Reuse that exact authority; do not repeat approval questions\. Native config supports live reload, so prefer its supported watcher over restarting any TUI or shared service\.
- Do not repeat a rollout approval request or treat the desktop input integration failure as a failed backend activation\. The faster recognizer is installed/selected/loaded\. Keep human speech and visible shortcut delivery as disclosed limits; do not start a capture or send a test message just to manufacture end\-to\-end acceptance\.
- Activation is complete: Sherpa is installed, selected and loaded via supported native config hot reload\. The microphone hotkey remains a user\-selectable stored preference at Ctrl\+P → Voice assistant settings → Microphone hotkey; no shortcut was assigned/overwritten via a hidden storage or config workaround when desktop input failed\. Preserve that capability limitation without telling the user backend activation is blocked\.

