# Simultaneous OpenCode/app capture and motion

This workflow is not execution evidence or blanket permission to capture. Use it
only after the user approves native recording of the isolated public/sample
region. Preserve source media and rejected drafts; do not touch another session's
screenshot backend, global CLI settings, extensions, or unsaved windows.

## Before recording

1. The user must finish unlocking/sign-in. Never capture or inspect credentials.
   Refresh compositor IDs after unlock: bridge enable epochs can change IDs.
2. Use a real new public OpenCode session and signed-out browser/sample mailbox.
   A new session can still restore private tab titles. Inspect an idle composition;
   use documented per-process CLI presentation overrides rather than closing other
   sessions or editing global config. Never use `--auto` for the demo.
3. Arrange only the selected demo IDs with fresh preview/apply tokens. Confirm
   actual geometry, raise the selected apps with exact focus as needed, and verify
   visibility; rectangles alone do not prove stacking order.
4. Derive logical capture coordinates from the actual selected window frames.
   Keep every captured pixel inside the isolated region. Check rounded corners,
   system notifications, tooltips, tabs, and overlays too. Metadata guards cannot
   identify every embedded password/payment form or private notification.
5. Prepare the [public actor brief](public-demo-brief.md), filling runtime fields
   only from fresh observations. Do not submit the task until capture has started.

## Recorder and fresh visual checks

`native_capture.py` uses the supported GNOME `ScreencastArea` service, not the
flagged screenshot backend. It holds one D-Bus caller until that caller's
`StopScreencast`, with a hard duration limit and an owned stop marker. Normal
D-Bus service activation is permitted only as part of the approved recording;
the helper does not change capture permissions or security settings.

Set the variables below from the approved fresh composition. `$RUN` must be a
new unused directory under an approved location, with an existing parent.

```sh
python3 docs/demo/native_capture.py record --output-dir "$RUN" \
  --window-id "$PUBLIC_OPENCODE_ID" --window-id "$DEMO_BROWSER_ID" \
  --region "$X" "$Y" "$WIDTH" "$HEIGHT" --seconds 300
```

This is a read-only plan; it does not create a recording directory. After review,
repeat with `--apply` and keep that process running. Wait for its actual
`recording_started` result before submitting a real task prompt. Do not infer
startup from process existence. The default deadline is 300 seconds; 600 is the
hard maximum. Short verification clips can use 1-2 seconds.

After each actual GUI mutation, while the same recording remains active:

```sh
python3 docs/demo/native_capture.py frame --manifest "$RUN/recording.json" --apply
```

Read the returned PNG and verify the result. A live check verifies its recorder
caller still owns its bus name and requires a source PTS at least as new as the
helper call's conservative time bound. It refuses a stopped, abandoned, or
quarantined source rather than silently supplying an old frame. Live fragmented
MP4 extraction still requires real acceptance on the running recorder; unit tests
and archive decoding do not establish that lifecycle.

The guard stops on changed identities/geometry, outside focus, lock/modal refusal,
or an owned stop marker. Context/abnormal stops and unconfirmed finalization are
quarantined; do not decode/export them as accepted evidence. A metadata guard is
not a complete privacy detector. Never open sensitive forms during capture, and
stop immediately on unexpected private content.

When the real result is visibly verified, request stop using only this run's
control file:

```sh
touch "$RUN/stop.request"
```

Do not call `StopScreencast` from another connection or stop another recording.
The acknowledgement is not proof the media decodes. Inspect the final owned
manifest, source filename, stop reason and actual file; preserve every failure.

## Archive and dense source frames

For a completed safe clip, `frame --final` explicitly reviews its **last decoded
frame**, not current desktop state. It cannot satisfy live GUI verification.

```sh
python3 docs/demo/native_capture.py frame --manifest "$RUN/recording.json" --final --apply
python3 docs/demo/native_capture.py export --manifest "$RUN/recording.json" --apply
```

Dense export retains original PTS and per-frame hashes in `frames/index.json`.
It verifies the source hash before/after export and bounds dimensions, decode time,
frame count (5000), and JPEG storage (512 MiB). It never overwrites an export.
`index.partial.json` is progress/failure evidence, never a completed export.
There is no deletion or automatic cleanup command.

## Camera plan and GIF

`motion_edit.py` consumes one capture's complete dense index. The JSON plan has:

- `purpose`: `tooling-preflight`, `action-preview`, or `final-demo`.
- `canvas`: output width/height; `fps`: 1-30, within the memory/pixel budget.
- `segments`: chronological `source_start`, `source_end` (real PTS seconds), and
  edited playback `duration` seconds. Reversed/replayed source intervals refuse.
- `keyframes`: increasing `at` playback times, each with a source-pixel `crop`
  `[left, top, right, bottom]`, from time zero through the full playback duration.
- Optional `poster_time`: a readable hold for the still alternative, not a fade.
- `evidence`: real execution-log paths for an action/final cut. Their existence
  and hashes do not prove semantic success; independent real-outcome review remains
  mandatory.

```sh
python3 docs/demo/motion_edit.py --index "$RUN/frames/index.json" \
  --plan "$PLAN" --output-dir "$NEW_OUTPUT"
```

Review the no-write plan, then add `--apply`. It produces a new `preview.gif`,
`still.png`, and per-frame source/crop/timing evidence. It uses eased camera motion,
aspect-preserving letterboxing, margin captions, shared palette and whole-frame
fades. It does not draw chat, invent clicks, interpolate app states, composite
unrelated panes, replace a main asset, edit the README, or publish anything.
Tooling preflights have a mandatory **NO TASK ACTIONS** label and never count as
the requested real action/motion preview.

Decode every output frame; check timing, loop seam, bytes, readability, privacy
and completed actions, then watch the actual playback. Obtain user approval of
the short real action/motion preview before main replacement. The final README
needs a still/text alternative and desktop/narrow light/dark review, retaining
branding and fewer than 170 physical root-README lines.

## Verification

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s docs/demo -p 'test_native_capture.py' -v
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s docs/demo -p 'test_motion_edit.py' -v
git diff --check
```

Tests use mocked recorder boundaries and explicitly synthetic images/video where
needed. They are not evidence that the public task ran. No dependencies are
installed by either helper. Native capture needs the already approved GNOME
session/bridge and existing PyGObject/GStreamer; encoding needs existing Pillow
and the checked DejaVu font. Report missing prerequisites rather than bypassing
restrictions or silently changing the machine.
