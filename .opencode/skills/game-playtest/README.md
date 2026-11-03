# Game Playtest Usage

This guide explains how to request `game-playtest`. Agent-facing rules remain in
[SKILL.md](./SKILL.md). OpenCode loads `SKILL.md` on demand; this README,
provenance, and license are not loaded automatically.

Category: `browser`

Tags: `games`, `playtesting`, `canvas`, `webgl`

## Purpose and when to use it

Use this skill for browser-game smoke tests, gameplay QA, canvas/WebGL visual
checks, HUD and overlay review, responsive sanity checks, diagnostics, and
reproducible bug reports. Verify player-visible postconditions rather than
assuming an input worked.

The workflow is adapted from OpenAI's public Game Studio playtest concepts. See
[PROVENANCE.md](./PROVENANCE.md) and [LICENSE.txt](./LICENSE.txt).

## Prerequisites and setup verification

The agent checks:

- the exact game URL and build/commit under test
- documented controls, main verbs, and expected states
- the project's existing start command and lockfile for local games
- the current project's approved visible browser integration
- an isolated headless runtime only when explicitly requested

Do not install packages, browser extensions, profilers, or dependencies merely
to start a playtest. Bind a temporary local server to loopback unless network
exposure is explicitly requested. If the required browser, input, screenshot, or
diagnostics capability is unavailable, report a blocker rather than switching
providers silently.

## How to request it

- "Smoke-test this browser game and report bugs by severity."
- "Exercise movement, jump, attack, pause, and restart."
- "Check the WebGL scene and HUD at desktop and narrow viewport sizes."
- "Run this playtest headlessly and call out what cannot be verified without a
  visible session."
- "Let me handle pointer lock, then continue after I hand control back."

Include the URL or project, expected controls, important game states, target
viewports, and any prohibited state-changing actions.

## Worked workflow and expected result

1. Start the existing project command on loopback if needed.
2. Inspect the page with the browser integration's accessible surface before
   input.
3. Check boot diagnostics only when the approved tools expose them; otherwise
   record the diagnostics gap.
4. Inspect a screenshot of the initial rendered state whenever canvas/WebGL is
   present. If no authorized capture is available, leave visual QA incomplete.
5. Exercise each main verb with one bounded input at a time and verify its
   post-state.
6. Cover representative play, pause/overlay, failure or success, and resize
   states relevant to the game.
7. Recheck available diagnostics and produce a severity-first report with exact
   reproduction steps and testing gaps.

Expected result: a reproducible assessment of boot, input, rendering, HUD, and
responsive behavior. These are representative steps; they were not executed
while creating the skill.

## Verification and known limitations

- Accessibility data cannot prove pixels inside a canvas; visual inspection is
  required for canvas/WebGL acceptance.
- The DOM can expose the canvas element and surrounding HUD but not the internal
  rendered scene.
- Console and network diagnostics vary by integration; report missing required
  evidence as incomplete.
- A narrow viewport does not emulate every touch, safe-area, GPU, memory, power,
  or network characteristic of a physical device.
- Pointer lock, gamepad, multitouch, timing-sensitive combinations,
  multiplayer, and long-session performance may need user or device testing.
- Identify whether testing used a visible or explicitly requested headless mode.

## Troubleshooting

- Blank canvas: inspect load indicators, available console/network diagnostics,
  missing assets, renderer fallback, and canvas dimensions.
- Input has no effect: refresh accessible state, verify focus and overlays, send
  one documented input, and inspect the post-state.
- Canvas has no accessible children: use bounded input and screenshot evidence
  rather than DOM selectors for scene objects.
- Stale element reference: take a fresh snapshot after navigation, resize, or
  user takeover.
- Pointer lock or gesture cannot be automated reliably: use bounded user
  takeover, then inspect fresh state after handoff.
- Required browser capability unavailable: stop and report a blocker; do not
  substitute an unapproved browser, desktop input, or arbitrary coordinate
  clicking.
- Nondeterministic animation or physics: use an existing approved deterministic
  test surface or report the observed frequency without claiming certainty.

## Safety

Ask before publishing content, purchasing, accepting terms, deleting cloud saves,
resetting account progress, or changing account/security/privacy settings. Never
handle passwords, MFA, payment details, or CAPTCHAs. Do not upload local files or
expose a local server without explicit scope. Follow the capture provider's
verified ownership and retention contract; do not assume screenshots are
uniquely owned or must be deleted immediately.

## Related skills

- [`browser-assistant`](../browser-assistant/README.md) handles visible work
  through an available supported integration.
- [`browser-headless`](../browser-headless/README.md) handles explicitly
  requested non-interactive browser work.
- [`web-3d-asset-pipeline`](../web-3d-asset-pipeline/README.md) validates
  browser-ready GLB/glTF assets.
