# Public demo execution brief (template)

This is a preparation template, not a transcript or proof that a task ran. Fill
the runtime fields only after the desktop is unlocked, the approved two-window
composition is visibly clean, and the native recorder reports it has started.
Attach the filled brief to the actual demo prompt; do not fabricate messages,
tool calls, approvals, typing, or outcomes.

## Runtime fields to fill

- Public OpenCode session: `ses_e837ba5b9ffe6MjOPg5aYbrFu6` (currently empty).
- Browser: actual Chrome, new signed-out demo profile; no personal account.
- Exact current Chrome compositor ID: **REFRESH AFTER UNLOCK**.
- Exact current public OpenCode compositor ID: **REFRESH AFTER UNLOCK**.
- Owned native `recording.json` manifest: **SET AFTER RECORDING STARTS**.
- Approved current logical capture region: **REVERIFY BEFORE RECORDING**.

IDs are tied to the extension's enable epoch. Screen lock disables the bridge;
unlock may issue new IDs even without desktop logout. Never reuse the old IDs
or infer that the version-2 code was loaded merely because the bridge reappears.

## First scene

Actual short prompt: **Find three Blender beginner tutorials on YouTube. Use the
visible signed-out browser; do not sign in or play a video.**

The actor must operate the real visible page using supported desktop tools.
Use named, fresh AT-SPI targets and exact preview/apply tokens. At the narrow
layout, Search may first be a button that reveals an editable search field.
Inspect the actual state; never assume a successful text write or button dispatch
produced a result. Search for `Blender beginner tutorial`, inspect the resulting
visible titles, and identify three actual results. No recommendations or results
may be invented. If the page is inaccessible or a consent/login/CAPTCHA appears,
stop and report it. Do not accept terms or bypass browser protections.

## Actor constraints

- This is the user's approved clean public demo execution. Do not create a goal,
  delegate, inspect another session/terminal, modify repository source, or alter
  any real mailbox/account/settings. Do not open a personal browser profile.
- Do not reposition windows: the recording composition is already established.
  If needed, use only fresh exact-ID focus for the supplied demo browser.
- Do not use headless Playwright, CDP, page JavaScript, coordinate clicking, unsafe
  Shell evaluation, screenshot shortcuts, or the flagged screenshot backend.
- The user approved native recordings of the isolated demo region for visual
  checks. The recording owner keeps its bus connection alive and controls stop.
  Do not call `StopScreencast` from another connection or start an unbounded clip.
- After each GUI mutation, extract a fresh frame from the genuine owned recording:
  `python3 docs/demo/native_capture.py frame --manifest RUNTIME_MANIFEST --apply`.
  Read the returned PNG and verify the actual result before continuing. A live
  frame must meet the recorded minimum PTS; extraction failure is not success.
  Do not substitute an old frame, canned image, or a different capture backend.
- Any native keyboard navigation must follow browser/desktop policy and verified
  named focus; never type blindly into another window. Never send messages,
  purchase, authenticate, enter secrets, delete data, or publish.
- Stop on unexpected private content, authentication, lost isolation, lock/modal
  refusal, changed geometry, or missing source. Preserve evidence and report the
  exact blocker; do not hide errors or retry an uncertain action.

## Recording and edit acceptance

Capture prompt, real tool activity, visible browser action and completed results
on one simultaneous source timeline. Preserve the source, action timestamps,
and verification frames in approved storage. After the run, verify source media
decodes and independently inspect the page/result. Then prepare a short encoded
motion preview: wide context, eased prompt/tool push-in, application-result
emphasis, and pull-back. No app-only or idle-only composition counts as this
action preview. Obtain user approval before replacing the README's main demo.

The final feature cut can add real isolated sample-mail and signed-out product
research scenes after composition approval. Existing CLI/app-only drafts remain
preserved and rejected. Never composite independently timed panes or claim edited
playback is execution latency. Publication, commits, pushes and consequential
system actions keep their separate approval gates.
