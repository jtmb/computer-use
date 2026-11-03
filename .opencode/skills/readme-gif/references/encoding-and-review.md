# Encoding and Review

Read this explicitly before encoding, optimizing, or accepting a README GIF.
These are portable techniques from Tend, not a drop-in Tend recording script.

## Input gate

Before producing an animation, verify:

- Frames come from the intended isolated run, in deterministic numerical order,
  with consistent dimensions and no stale frame set mixed in.
- Actual interactions and completed results are recorded. Define required result
  assertions for this application and refuse success output if any failed.
- Every source image decodes and the fixture integrity check passes.
- Fonts and optional libraries actually exist; no user font or dependency path
  is assumed. Stop or request installation if a needed dependency is missing.
- The output path is approved and unused. Preserve any current shipping GIF.

## Timing

When a demo includes multiple views, keep their source timestamps and edit
provenance so the presentation does not imply unrelated events were simultaneous.
Plan motion and framing around the actual product workflow and reader needs. Do
not hide failures or approvals with edits. Follow any project-specific preview
and asset-replacement requirements discovered in its instructions.

Separate capture cadence from playback duration. Slow recording on a busy host
does not justify racing through the results. Give completed states readable holds
and keep cursor movement shorter than the result it explains.

GIF delays use centiseconds (10 ms). Pillow's `duration` argument is in
milliseconds; choose multiples of 10 and inspect the decoded total, since encoder
rounding and frame merging affect it. Tend alternates 120 and 130 ms over 304
frames for 38 seconds rather than silently rounding every 125 ms frame down.
Those counts are Tend-specific, not a reusable requirement.

Merge consecutive unchanged frames only by adding their durations. Do not remove
reading time, a transient result, or an error state to meet a size target. An
infinite GIF loop uses Pillow's `loop=0`; verify the stored loop metadata and
actual playback rather than trusting the option alone.

## Palette and captions

Tend's Pillow encoder composes RGB frames, builds an atlas from representative
scenes, quantizes a shared palette, then quantizes every frame against that
palette. A shared palette reduces color flicker. Sample every important scene,
including dialogs, captions, light/dark UI regions, and charts.

GIF allows at most 256 palette entries. Tend uses 224 sampled colors and reserves
32 entries for thin chart hues. Reserve colors only when the target needs them;
do not reuse Tend's application-specific RGB values. Compare no dithering with
dithering at the intended display width: dithering can preserve gradients but
increase noise and size. Verify text edges, selection states, and thin lines.

Use consistent, readable captions in a margin that does not cover controls.
Disclose sample files/logs and distinguish live measurements from sample input.
Keep narration accurate to the observed state, not just the planned action.
Pointer overlays must derive from recorded targets and timing. Explain any
callback-driven demonstration honestly; it is not proof of physical input support.

Select disposal/optimization settings for the actual frame strategy. Tend uses
full composed frames, `optimize=True`, and `disposal=1`; do not assume those
settings suit transparent or partial-frame captures. Decode the result and look
for ghosting, trails, missing highlights, and corrupted transition frames.

## Size versus readability

Measure bytes and inspect the animation at its README display width. Prefer:

1. A shorter, focused story instead of more aggressive text downscaling.
2. Removing unused borders without clipping menus, captions, or focus outlines.
3. A shared palette tuned to the actual UI.
4. Lower capture density for static scenes while preserving total hold time.

Do not require a particular encoder or prescribe an invented project command.
Use already available tooling and record the exact invocation/settings used.
If the size budget cannot be met without losing meaning, report the tradeoff.

## Decoded output and README acceptance

Use an installed decoder such as Pillow to iterate all encoded frames, record
their dimensions and durations, and sum the durations. Check the GIF signature,
nonzero bytes, expected dimensions, more than one meaningful scene, and loop
metadata. A changed encoded frame count may be legitimate frame merging.

Inspect decoded scenes after every important action and watch the whole loop,
including its final-to-first transition. Compare captions and pointer overlays
against the action/result log. Check private data in every scene, not just the
first image. Keep unredacted scratch evidence local and out of publication.

Embed using the target project's established asset-link and rendering style.
Supply a still-image or text alternative and a sample-data disclosure when
relevant. Preserve the project's branding. Review supported target widths and
color themes through available tools. If a renderer or capture is unavailable,
state exactly which visual checks remain unverified rather than calling the demo
fully tested.
