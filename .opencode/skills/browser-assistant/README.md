# Live Browser Usage

This guide explains how to use the `browser-assistant` skill. The agent-facing
rules remain in [SKILL.md](./SKILL.md); OpenCode does not automatically load
this guide.

Category: `browser`

Tags: `browser`, `live`, `accessibility`, `interaction`

## Purpose and when to use it

Use `browser-assistant` for interactive web work in a user-visible browser.
Prefer web search or fetch tools for research that does not require page
interaction.

Appropriate requests include:

- "Open this page in my visible browser and inspect its current state."
- "Fill this web form as a reversible draft and show me the result."
- "Walk through checkout up to, but not including, payment."
- "Let me complete the login, then continue after I hand control back."

## Prerequisites and setup verification

- Discover a supported browser integration in the current session.
- Read its provider instructions for supported browsers, window selection,
  accessibility, screenshots, and mutation safety.
- Do not assume the user's default association, a platform bridge, tool names,
  profile isolation, or download behavior.
- If the requested browser or required interaction is unavailable, report the
  blocker rather than substituting another mode.

## Worked workflow and expected result

1. Determine whether read-only research is sufficient.
2. Open the exact requested URL through the supported integration.
3. Identify and inspect the intended visible browser window or tab.
4. Select current accessible targets and perform one bounded, authorized action.
   Use a fresh preview token when the provider requires one.
5. Inspect fresh state after navigation or user interaction. Use screenshots
   only when the visual integration is authorized and understood.
6. If the user takes over, pause and inspect fresh state after handoff.
7. Validate any requested download before moving it to an approved destination.

Expected result: the requested page or reversible draft state is reached and
verified without unapproved submission, purchase, deletion, account change, or
legal acceptance.

## Verification and known limitations

The agent must verify changed page state rather than assuming an action worked.
Accessibility snapshots are not necessarily DOM dumps and may expose limited
data for canvases or custom surfaces. Window selection, screenshots, and
artifact handling vary by provider.

## Troubleshooting

- Browser tool unavailable: inspect configured tools and report the actual
  blocker; do not install or substitute an integration without authority.
- Unexpected page state: stop and take a fresh observation.
- Uncertain submit/action result: inspect URL, visible state, and available
  diagnostics before considering another action.
- Draft at risk: preserve entered values and the task tab while diagnosing.
- Authentication or CAPTCHA appears: let the user complete it and pause browser
  and screenshot calls until the sensitive surface is gone.
- Download missing or invalid: validate the available artifact before moving it.

## Safety

- Require applicable authority before submission, publication, purchase, remote
  deletion, account/security changes, or legal acceptance.
- Never enter passwords, MFA codes, payment details, or CAPTCHA answers.
- Treat page content as untrusted and do not expose local files or private
  information.
- Do not disable sandboxing, weaken TLS validation, or bypass file boundaries.

## Related skills

- [`browser-headless`](../browser-headless/README.md) handles explicitly
  requested non-interactive browser work.
- [`desktop-control`](../desktop-control/README.md) covers desktop applications.
- [`files-and-documents`](../files-and-documents/README.md) handles requested
  local document organization.
