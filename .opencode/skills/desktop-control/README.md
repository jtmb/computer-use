# Desktop Control Usage

This guide explains how to use the `desktop-control` skill. The agent-facing
rules remain in [SKILL.md](./SKILL.md); OpenCode does not automatically load
this usage guide.

Category: `desktop`

Tags: `desktop`, `accessibility`, `gui`

## Purpose and when to use it

Use `desktop-control` to inspect and operate desktop applications through an
approved accessibility integration. Prefer named controls and roles over screen
coordinates.

Appropriate requests include opening an application, activating a named control,
entering non-sensitive text, checking accessibility support, verifying a GUI
result, or arranging selected windows when an approved compositor integration
exists.

Use a dedicated browser skill for browser-page interaction when available.

## Prerequisites and setup verification

- Discover the current session's approved desktop accessibility integration.
- Read its provider contract for app inventory, inspection, mutations, preview
  tokens, window operations, and verification.
- Determine whether visual verification is necessary and whether an authorized
  capture integration with known privacy and retention behavior is available.
- Do not assume a desktop environment, plugin, helper script, input service,
  browser bridge, or screenshot tool.

## How to request it

Ask in ordinary language. The user does not need to know accessibility roles or
provider tool names.

- "Open Calculator and verify that it appears."
- "Find the visible Open button in this application."
- "Enter this non-sensitive value in the selected field."
- "Place these two windows side by side if the approved window tools support it."

## Worked workflow and expected result

1. Inspect the current relevant application using the provider's read-only
   accessibility surface.
2. Locate one unambiguous, visible target by accessible name and role.
3. Preview the intended mutation and apply it only according to the provider's
   current safety contract.
4. Read fresh accessible state and, when needed and authorized, verify the
   visible result through a safe capture integration.
5. If the result is uncertain, observe again before retrying.

Expected result: only the requested control or window is affected, and the
outcome is verified through evidence the provider actually exposes.

## Tools and verification

Tool names, schemas, traversal limits, token lifetime, focus behavior, and
readback guarantees vary by provider. Inspect current documentation rather than
relying on examples from another installation. A successful dispatch or command
response alone does not prove that an application changed.

## Troubleshooting

- Application absent: check the exact app identity and launch it as the normal
  user using the project's documented method.
- Ambiguous target: stop and inspect the candidates; do not guess.
- Incomplete accessibility tree: expand the observation only within provider
  limits, then verify that the target is still unambiguous.
- Stale preview or element reference: inspect and preview again.
- Action accepted without visible change: inspect fresh state before another
  attempt.
- Capture or window bridge unavailable: report the limitation instead of using
  blind input, unsupported shell helpers, or a different backend.
- Sensitive field or authentication dialog present: do not inspect or operate
  it; let the user complete the sensitive step.

## Safety

- Perform one bounded action at a time and preserve unsaved work.
- Require applicable authority before sending, publishing, purchasing, deleting,
  changing security settings, granting permissions, or accepting terms.
- Never read or write password, MFA, payment, or CAPTCHA fields.
- Never run a graphical application as root or an uncontrolled input loop.
- Do not use a window bridge during credentials, payment, or authentication.
- Keep coordinate interaction as a last resort and use it only when supported,
  authorized, and necessary.

## Related skills

- [`desktop-vision`](../desktop-vision/README.md) provides visual inspection
  when an authorized capture tool is available.
- [`app-setup`](../app-setup/README.md) handles installation and acceptance.
- [`system-troubleshooting`](../system-troubleshooting/README.md) diagnoses
  application-launch and desktop-layer failures.
