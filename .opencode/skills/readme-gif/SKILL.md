---
name: readme-gif
description: Create and verify animated GIF demos for READMEs using real application workflows, isolated sample data, evidence-backed captions, and readable encoding. Use when the user asks for a README GIF, animated product demo, or a repeatable recording workflow.
license: MIT
metadata:
  schema-version: "1"
  category: "files"
  tags: "readme,gif,demo,recording,documentation,visual-verification"
---

# README GIF

## Auto-approve and autonomous work

For Build auto, project auto-approve or explicitly autonomous/no-question work,
apply this rule to all interactive ask/confirm steps below: Do not ask routine questions,
including Git questions, clarification forms or "continue?" prompts. Use existing
authority and reasonable reversible defaults. If essential authority or data is
missing, record the blocker and continue independent work instead of asking.
Explicitly read [the shared autonomy contract](../development-conventions/references/autonomous-work.md).
Native policy, mode restrictions and task scope remain effective; do not
self-grant permissions or enable autoaccept as a workaround.

Make a short, truthful demonstration of a working application, not a slideshow
of invented interface states. Adapted from Tend's README recording workflow;
see [PROVENANCE.md](./PROVENANCE.md) and [LICENSE.txt](./LICENSE.txt).

## Scope and safety

- Read the target repository's `AGENTS.md`, README, existing recording helpers,
  and Git status first. Preserve unrelated work, branding, and existing assets.
- A request to create a GIF authorizes scoped authoring, not dependency installs,
  deletion, system changes, publication, commits, or pushes. Ask separately before
  consequential actions. Never run cleanup/apply, process signals, privileged
  helpers, scheduling, payments, or account changes merely for a demo.
- Use an isolated application instance and public fixtures. Do not record the
  installed personal instance, real logs, credentials, notifications, private
  paths, or customer data. Never capture authentication or payment dialogs.
- Save scratch frames and evidence only in a temporary location allowed by the
  target project. Discover its approved artifact destinations rather than
  assuming a home-directory or system temporary path. Do not reuse stale frame
  sets or overwrite an existing asset silently. Preserve source footage/frames
  until acceptance; never delete them or widen filesystem access to hide a
  storage failure.
- Use the repository's supported desktop/browser tools and their safety gates.
  Browser capture defaults to the visible workflow; invisible browser automation
  requires an explicit user request. A native offscreen recording harness is a
  separate route, usable only when its isolation and capture method are verified.
  Do not bypass tool restrictions with an alternative capture mechanism.
- This skill supplies instructions, not a recorder or installed encoder. Check
  actual tooling before promising a capture. Report a blocker if it is unavailable.

## Workflow

### 1. Plan a small story

Choose one useful workflow with a clear start, a few real actions, and a completed
result. Agree on the destination, approximate duration, display width, and size
budget. Prefer a readable 15-40 second loop over a tour of every feature; this is
a starting point, not a fixed requirement.

Write a short shot list: scene, actual action/target, expected visible result,
caption, and hold time. Include time for results to finish and viewers to read.
End on a useful result and make the return to the opening understandable.

When the requested demo is about an agent-operated workflow, show genuine agent
actions and the corresponding application result. Do not fabricate answers, tool
calls, approvals, typing, interfaces, or completed tasks. If multiple views are
edited together, preserve provenance and do not imply simultaneous events unless
the source timeline supports that claim. Follow the target project's documented
branding, composition, preview, and README-budget requirements; do not assume a
particular product, app, line limit, or composition.

Use an isolated browser profile and public or clearly labeled sample data. Never
read a personal inbox or reuse authenticated browsing merely to make a demo
impressive. Do not send messages, delete real data, make purchases, sign in, or
accept terms as part of a demo unless the user explicitly authorizes the exact
action and the project permits it. Never present a mock application as a real
client operated by an agent.

Capture only a verified demo window/region with a supported recording route.
Do not retain or repurpose private desktop-verification screenshots as assets.
Before a platform-specific native recording workflow, explicitly read the
[recording reference](./references/native-demo-recording.md). It provides a
generic preflight for isolation, authorization, capture verification, and
retaining original evidence; it is not a recorder or platform guarantee.
If safe recording, app accessibility, or fixtures are unavailable, report the
specific blocker and request the needed user action instead of generating a
less-relevant substitute or bypassing capture restrictions.

Plan deliberate motion from the target project's actual product and reader
needs. Keep enough context to understand each action and result. Do not hide
failures or approvals with edits. Follow the project's approval and preview
requirements before replacing a shipping asset, and preserve original source
evidence until acceptance.

### 2. Prepare isolation and evidence

Inspect any existing demo/test mode before executing it. Use a fresh fixture home,
cache, and data directory inside approved scratch storage; never change global
environment or user settings. A separate HOME alone does not isolate session
services: block or replace privileged helpers, system writes, background jobs,
and personal session-bus access as applicable. Inspect network behavior too.
When isolation cannot be demonstrated, stop before launching risky workflows.

Use real production parsing, filtering, rendering, and preview logic with clearly
labeled sample inputs. Demo mode must not substitute canned success output.
Record fixture paths, SHA-256, sizes, and modification times before capture; verify
them afterwards. If an intended workflow edits fixtures, specify the allowed
changes in advance and verify everything else remains intact.

### 3. Capture actual interactions

Use existing project automation where safe, or the supported interactive tools.
Observe the current state, perform a bounded action, then verify its visible
result. For native GUI tool actions, keep the required preview/apply token and
fresh-screenshot checks. Prefer result/state conditions with a timeout over
blind sleeps. Keep frame numbering and dimensions consistent.

Retain a local action log and result evidence beside the frame directory, such as
`actions.json` and `evidence.json`. Record actual targets, action/frame or timestamp,
observed results, and verification status; do not invent a schema the project
does not implement. These are local supporting artifacts, not new MCP tools.

Use assertions that match the target application and task. Fail the recording
if a required assertion fails; do not encode failed choreography as a successful
demo.

### 4. Encode with readable timing and color

Before encoding or optimizing, explicitly read
[references/encoding-and-review.md](./references/encoding-and-review.md).
It covers shared palettes, GIF time units, frame merging, overlays, and decoded
output checks. Do not copy Tend's hard-coded frame count, palette, captions,
fonts, or 38-second duration into an unrelated application.

Keep captions outside important controls and disclose sample data. Pointer or
click overlays may explain recorded actions using actual target bounds; they
must not invent clicks, hide errors, fabricate results, or suggest a callback is
a tested physical mouse click when it was not.

Write a new versioned GIF first. Keep source frames, fixtures, and evidence until
the user accepts the result; do not automatically delete them as cleanup.

### 5. Verify the delivered README

- Decode the finished GIF, not only the source PNGs. Verify dimensions, frame
  count, loop behavior, playback duration, bytes, and that each promised action
  has an observable completed result. Optimization can change the encoded frame
  count; total timing and visible results must still agree with the plan.
- Inspect representative decoded scenes after every completed action and watch
  the full loop. Check thin chart colors, text, clipping, cursor alignment, stale
  frames, privacy, abrupt transitions, and misleading captions.
- Embed a relative asset path with descriptive alt text and a suitable display
  width. Include a static screenshot/gallery or text alternative for readers
  who cannot use animation; preserve an existing alternative where available.
- Keep the hosting README human-focused and honor the consumer project's actual
  line or size budget, if one exists. Put detailed recording instructions and
  evidence in a focused guide when that matches the project's documentation
  structure; verify any documented budget after embedding.
- Review the GIF in a GitHub-compatible README render at desktop and narrow widths,
  on light and dark backgrounds. Do not claim a visual or browser check that was
  not performed; state any tooling limitation explicitly.
- Repeat fixture-integrity checks and confirm the personal app/settings were not
  touched. Review changed paths and run `git diff --check` plus relevant project
  checks. Report the asset path, size, duration, evidence, and remaining caveats.

Publication is separate: generating an asset or editing Markdown does not approve
uploading it, creating a PR, committing, or pushing.

## Usage guide

When explaining how to request this workflow, explicitly read
[README.md](./README.md). It and the reference files are not loaded automatically.
