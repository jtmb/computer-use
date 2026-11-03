# Desktop Vision Usage

This guide explains how to use the `desktop-vision` skill. Agent-facing rules
remain in [SKILL.md](./SKILL.md); OpenCode does not automatically load this
usage guide.

Category: `desktop`

Tags: `desktop`, `screenshot`, `visual-verification`

## Purpose and when to use it

Use `desktop-vision` when visual confirmation is needed for the displayed
application, window state, focus, layout, rendered output, or a GUI error.
Prefer accessibility data when it can answer the question without a capture.

## Prerequisites and setup verification

- Discover a supported visual-capture integration in the current session.
- Read its provider documentation for authorization, capture scope, output
  ownership, image validation, sensitive-surface handling, and retention.
- Do not assume a shortcut, input service, output directory, cleanup behavior,
  screenshot tool, or platform bridge.
- If any required safety property is unknown or capture is deferred, do not
  invoke that backend or an equivalent shell command. Report visual verification
  as blocked and continue independent work.

## How to request it

- "Can you see what is on my screen right now?"
- "Verify visually that this application window is closed."
- "Look at the selected dialog and tell me which button is focused."

## Worked workflow and expected result

1. Check whether accessibility data already answer the question.
2. Verify that the capture request is authorized and the integration's safety
   contract is understood.
3. Announce the permitted capture and request only the smallest adequate region.
4. Inspect only an image proven to belong to this request or a file the user
   explicitly selected to share.
5. Report only what the image demonstrates. State retention or cleanup as
   unknown unless independently verified.

Expected result: an accurately described visual observation with no claim about
ownership, deletion, or full-screen privacy that the provider cannot prove.

## Verification and known limitations

The image must show the relevant application state. A successful trigger does
not prove the intended window was captured. File inventory or recency alone
does not establish ownership. Image size/header checks may not establish full
file validity; follow the provider's complete validation behavior.

## Troubleshooting

- No image returned: inspect provider status and report the failure; do not
  repeat an uncertain trigger without resolving possible delayed output.
- Multiple candidates or uncertain ownership: stop before reading or deleting.
- Wrong window captured: re-establish the target through an approved window
  integration, then reassess authorization.
- Sensitive or unintended content appears: stop and do not quote or retain it.
- Backend unavailable or held: report the blocker; never replace it with an
  unapproved shell shortcut or another capture mechanism.

## Safety

- Never observe a locked screen or a sensitive authentication, password, MFA,
  payment, or CAPTCHA surface.
- Treat unexpected private content as do-not-repeat.
- Never store, commit, upload, or paste a screenshot elsewhere without explicit
  authorization.
- Delete only task-owned captures when deletion is separately authorized and
  the provider's ownership is verified.

## Related skills

- [`desktop-control`](../desktop-control/README.md) operates accessible GUI
  controls.
- [`browser-assistant`](../browser-assistant/README.md) covers interactive web
  pages when its visible-browser integration is available.
