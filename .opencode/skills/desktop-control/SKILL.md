---
name: desktop-control
description: Inspect and operate desktop applications through an authorized accessibility integration, using visual verification when safely available. Use when the user asks to click, type, open, close, configure, or otherwise interact with a desktop application or dialog.
metadata:
  schema-version: "1"
  category: "desktop"
  tags: "desktop,accessibility,gui"
---

# Desktop Control

Operate desktop applications with an observe-act-verify loop. Prefer named
accessible controls over screen coordinates. Coordinate systems, scaling, and
input behavior vary by environment; use coordinates only when the approved
provider documents a safe mapping and the result can be verified.

## Auto-approve and autonomous work

In Build auto, project auto-approve, or explicit no-question work, do not ask
routine clarifying, preference, confirmation, Git, delegation-opt-in, or
"continue?" questions. Use existing authority and reversible defaults. If a
required approval or essential detail is missing, block that action, state the
reason, and continue independent work; never grant authority yourself.

## Browser boundary

Use a dedicated visible-browser skill for browser pages when one is available.
Do not assume a desktop accessibility tree provides safe or complete browser
control. If the requested browser interaction or evidence surface is unavailable,
report the limitation rather than substituting an unsupported route.

## Workflow

1. Discover the current session's approved desktop accessibility tools and read
   their provider documentation. Do not assume tool names, a plugin, a helper
   script, or a particular desktop backend is installed.
2. Inventory accessible applications with the provider's read-only capability
   when exposed. Inspect only the relevant application or element; use its
   accessible name and role rather than guessing coordinates.
3. Before mutation, inspect the provider's action contract. If it requires a
   preview, repeat the exact action with its fresh token. Stop when the target is
   ambiguous, the observation is incomplete, or the provider refuses the action.
4. Treat a dispatched action as unverified until fresh accessible state confirms
   the result. If visual verification is needed, use only a supported capture
   tool whose permission, ownership, privacy, and retention behavior are known.
5. If the result is uncertain, observe again before retrying to avoid duplicate
   actions. Do not infer success from a process exit code or dispatch response.

## Window focus and layouts

For compositor-level focus, placement, tiling, or arranging multiple windows,
first discover whether approved window-control tools and provider guidance are
available. Use exact current window identifiers and the provider's preview and
readback contract. Do not assume that accessible bounds are global desktop
coordinates or that a screenshot coordinate is suitable for input. Touch only
requested windows and report partial outcomes instead of silently replaying a
mutation.

If the required bridge is unavailable, report the limitation. Do not use blind
window hotkeys, unsafe shell evaluation, cross-platform input tools, permission
changes, or security bypasses as a fallback.

## Application launch

Use the consumer project's documented application launcher or the installed
application executable without unnecessary elevation. Wait for the application
to appear in the available accessible-app inventory before querying it.

## Fallbacks

- Some non-browser custom canvases and sandboxed apps expose little accessibility
  data.
  Use documented keyboard navigation or another input method only when the
  current provider explicitly supports it and its safety contract is understood.
- For non-browser desktop applications only, coordinate clicks are a last resort
  and require a fresh screenshot, a validated scaling transform, and immediate
  visual verification. Never assume screenshot pixels map directly to input
  coordinates; scaling varies by display and provider.
- If the target remains inaccessible, describe the exact manual action
  needed instead of clicking blindly.

## Safety boundaries

- Ask immediately before sending/publishing a message, making a purchase,
  accepting legal terms, deleting data, changing account/security settings,
  granting permissions, or confirming any other consequential action.
- Normal reversible navigation and edits explicitly requested by the user
  do not need repeated confirmation.
- Never read or write password fields. Ask the user to complete passwords,
  MFA, payment details, and CAPTCHAs themselves.
- Protected fields may be redacted or refused by the provider. Never use an
  alternate route to inspect or edit sensitive fields.
- Never inspect or operate a privileged-authentication dialog. Wait until the
  user reports that credential entry is complete, then inspect fresh state.
- Preserve unsaved work. Before closing a window, inspect for unsaved-state
  prompts and stop if the correct choice is unclear.
- Tokens are target-freshness guards, not authorization. Honor the provider's
  expiry and never treat a token as a replacement for a required authority gate.
- Perform one bounded action at a time, then verify. Never run an
  uncontrolled click loop.

## Usage guide

When the user asks how to use this skill, also read
[README.md](./README.md) for request examples, prerequisites, verification,
and safety requirements.
