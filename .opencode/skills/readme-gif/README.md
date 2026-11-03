# README GIF

**Auto-approve means no interactive questions** for authorized goal work, including
routine Git. Existing ask/confirm steps are interactive-mode guidance: under auto,
reuse authority/defaults or record blockers and continue, without asking.
See [the shared autonomy contract](../development-conventions/references/autonomous-work.md).

Create a readable, truthful README demo from real application actions and verified
results. Use this skill for animated product demonstrations or repeatable
recording workflows, not fabricated interface mockups.

## Prerequisites

- A target checkout with applicable instructions, README, and application or
  representative fixture available.
- Isolated public/sample data and a non-destructive demo workflow.
- A supported capture route and available encoder; this bundle does not install
  software or provide a generic recorder.
- A way to decode the GIF and review the README in its target renderer.

## How to request it

- "Make a README GIF of the preview and filtering workflow using sample data."
- "Create a short product demo; preserve the existing asset and show me a draft."
- "Review this GIF at README size and check that its captions match real actions."
- "Add a repeatable recording workflow, but do not install or publish anything."

## Example workflow

For an application with a preview and searchable results:

1. Inspect the app and plan the opening state, preview, search, details, and final
   hold.
2. Create a fresh isolated fixture area in a location approved by the project and
   fingerprint the sample inputs.
3. Capture the actual preview and filtering actions, waiting for real results.
   Keep action targets and observed outcomes with the numbered frames.
4. Encode a new versioned asset; do not silently replace a shipping asset.
5. Decode and watch the result, verify fixture preservation, then review the
   embedded animation and a still-image alternative at supported widths.

Expected delivery: a verified local GIF, scoped README changes if requested,
recording/evidence locations, dimensions, duration, file size, and any limitations.
This is a representative workflow, not a recording executed by this skill import.

An explicit request for a CLI demo can use captured stdout, labeled as a
transcript replay. Never fake an agent session or app UI, and never repurpose
private verification screenshots as public assets.

## Tools and commands

Loading the skill supplies guidance; capture and encoding are separate operations.
Read [encoding and review](./references/encoding-and-review.md) before choosing an
encoder. Reuse inspected project helpers rather than assuming a particular script,
package manager, or runtime exists.

Representative read-only checks from a target checkout:

```sh
git status --short
python3 -c 'from PIL import Image; print(Image.__version__)'
git diff --check
```

These commands are examples, not evidence that the tools are installed. Capture
writes frames/evidence; encoding writes a new GIF; embedding edits Markdown.
There is no bundled command with an implicit dry-run or `--apply` flag.

## Verification and limitations

Check the decoded GIF's duration, dimensions, loop, size, and completed actions;
watch it inside the rendered README and provide a non-animated alternative. File
existence or encoder success alone is not acceptance. GIF palette limits, timing
quantization, and display scaling can reduce readability. A screenshot of one
frame does not verify the animation.

Follow the target project's branding, composition, and documented line/size
budget. Preview and replacement approval requirements are project-specific; do
not infer them from this skill.

## Troubleshooting

- Skill missing: check the active loader's configured source path and permissions.
- No capture/encoding tool: report the missing prerequisite; do not install or
  switch to an unsupported capture route.
- Stale or wrong scenes: start a fresh frame set and fix result waits or
  choreography; do not conceal failures with overlays.
- Unreadable or oversized GIF: shorten the story and tune palette/frame sampling
  while preserving text, results, and hold times.
- Unverified isolation: stop; do not launch against the personal app to work
  around a failed fixture setup.

## Safety

Preserve existing assets and user settings. Never record secrets or personal
logs. Do not delete fixtures automatically. Installs, destructive/system actions,
publication, commits, and pushes require separate approval under project policy.

## Related documents

- [Agent workflow](./SKILL.md)
- [Encoding and review](./references/encoding-and-review.md)
- [Native app recording](./references/native-demo-recording.md)
- [Tend source and adaptation notes](./PROVENANCE.md)
- [License](./LICENSE.txt)
