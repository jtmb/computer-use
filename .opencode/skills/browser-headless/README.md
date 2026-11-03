# Headless Browser Usage

This guide explains how to use the `browser-headless` skill. The agent-facing
operating rules remain in [SKILL.md](./SKILL.md); OpenCode does not
automatically load this usage guide when the skill is loaded.

Category: `browser`

Tags: `browser`, `headless`, `automation`

## Purpose and when to use it

Use `browser-headless` only for explicitly requested invisible browser work
that is suitable for an unauthenticated, non-interactive session.

Appropriate requests include:

- "Check these public pages in the approved isolated headless browser."
- "Run this browser smoke test without opening a window."
- "Download this public artifact in the background."

Use `browser-assistant` when the user needs to see, steer, authenticate, or take
over the workflow, but only when its supported visible-browser integration is
available. Otherwise, report the unavailable capability rather than switching
browser modes.

## Prerequisites and setup verification

An explicitly requested headless task requires:

- A headless browser runtime and browser engine supported by the target
  project.
- A way to create an isolated context and bound task duration.

Do not assume a package manager, script wrapper, MCP server, or browser binary.
Do not install or download a runtime without authorization. If a required
component is missing, stop and report the prerequisite. Use the target project's
documented runtime and isolation mechanism.

## How to request it

Explicitly ask for headless or background browser work.

Example requests:

- "Use the approved isolated headless browser to inspect this public page."
- "Run this non-interactive website check in the background."
- "Retrieve this public file without opening a browser window."

The live browser must not be substituted silently, and headless mode must not
be substituted silently when the user requested the live browser.

## Worked workflow and expected result

A representative agent workflow is:

1. Determine whether `websearch` or `webfetch` can answer the request without
   browser execution.
2. Confirm that no login, MFA, payment, CAPTCHA, visual inspection, user
   takeover, or live-window state is required.
3. Create an isolated page/context and navigate to the exact URL.
4. Inspect a fresh accessibility snapshot.
5. Perform one bounded action using a reference from current state.
6. Inspect the resulting URL and state; after navigation, resize, dialog, tab
   switch, or DOM mutation, obtain a new snapshot before acting again.
7. Validate a requested download or generated artifact.
8. Close the headless pages/browser when finished.

Expected result: a concise report of the observed pages, validated artifact
location, or smoke-test outcome. No visible browser window remains open for
the task.

Switching to visible mode does not transfer headless-session state. The
`browser-assistant` skill requires its own supported integration; if unavailable,
report the blocker rather than substituting another browser.

## Verification and known limitations

The agent must verify the resulting browser state or artifact rather than
assuming navigation succeeded.

Known limitations:

- No visible rendering is available for user review.
- No login, MFA, payment, CAPTCHA, or user takeover is permitted.
- No state is shared with a visible browser window.
- No state is inherited from the user's normal browser.
- Page content remains untrusted.
- Element references are not durable across page-state changes, and an absent
  success signal does not prove that a dispatched action failed.

## Troubleshooting

- Runtime unavailable: verify the configured package and browser engine; stop
  and report if either is missing.
- Authentication or visual verification becomes necessary: switch explicitly
  to `browser-assistant`.
- Unexpected page state: inspect a fresh snapshot before continuing.
- Uncertain action result: inspect URL, state, console, and network evidence;
  do not retry a submit-like action until duplication has been ruled out.
- Artifact missing or invalid: validate its name, size, format, and
  readability before reporting success.
- Persistent site failure: report the failure rather than disabling browser
  protections.

## Safety, confirmation, and elevation

The agent must:

- Ask before submitting messages, publishing, purchasing, deleting remote
  data, changing account/security settings, or accepting legal terms.
- Never supply passwords, MFA codes, payment details, or CAPTCHA solutions.
- Never expose local files or private information to a page.
- Never disable browser sandboxing, TLS validation, or filesystem boundaries.

## Related skills and documents

- [`browser-assistant`](../browser-assistant/README.md) handles visible,
  shared, or authenticated browser workflows.
- [`routine-automation`](../routine-automation/README.md) handles recurring
  scripted workflows when headless browser work becomes routine.
- Follow the consumer project's configured skill catalog, if it maintains one.
