# Native live-frame diagnosis

## Incident evidence and limits

The quarantined run's permitted `recording.json` metadata says that the
recording ended with `context-refusal: Desktop locked, modal, or otherwise
unavailable`, and that `StopScreencast` was acknowledged. That establishes why
the helper stopped and quarantined the run. It does not establish why the
preceding frame request had no sufficiently fresh decoded sample.

The source video was not opened, decoded, exported, or used as live evidence.
Its `.mp4` name makes fragmented MP4 a useful test lead, not a verified cause
for that particular run. Native live acceptance therefore remains pending.

## Reproduced code defect

An offline synthetic GStreamer writer using `videotestsrc`, `x264enc`,
`h264parse`, and a live fragmented `mp4mux` reproduced the relevant live-edge
conditions: the file can exist before its first playable fragment is complete,
and a decoder can report EOS at the current end while the writer continues to
append fragments. Reusing the same decode pipeline after EOS was not reliable;
the synthetic run produced transient “no playable streams” and `qtdemux`
not-linked failures instead of reaching later PTS values.

`native_capture.py` now tears down that decoder and creates a fresh one after
append-only growth has settled briefly. It retries transient decode failures
only while the live source advances, bounds the retry by the existing 20-second
decode deadline, and refuses a source that shrinks during retries. The appsink
and RGB decode bounds are unchanged. The PTS acceptance condition is unchanged:
a live sample still must have a valid PTS at least as large as the helper-call
monotonic lower bound. A stale sample is never used as a fallback, and stopped
clips remain in the explicit `--final` archive-only path. The exact recorder
bus caller is checked before decoding and again before returning the frame.

The offline regression in `test_native_capture.py` writes and reads only a
synthetic fragmented MP4 under `/tmp/opencode`. It verifies that the extractor
can follow later fragments, that the accepted PTS meets the unchanged freshness
floor, and that the synthetic writer is still playing when the frame is
returned. It is not a native GNOME capture test and does not prove that the
quarantined file used this exact muxer behavior.

## Native acceptance still required

The parent session must run the documented workflow in
[`simultaneous-workflow.md`](simultaneous-workflow.md) with:

- an unlocked, non-modal GNOME session with the approved desktop
  window-control bridge and GNOME Shell Screencast D-Bus service available;
- a fresh public OpenCode session and signed-out demo browser/sample mailbox,
  with exact current compositor IDs, approved focus, and an isolated region;
- the user's approval for native `ScreencastArea` recording, plus the existing
  PyGObject, GStreamer, and Pillow prerequisites; no install or permission
  change was made here; and
- a fresh live-frame extraction after a real GUI mutation, while the same
  recorder caller still owns its D-Bus name, followed by visual review of that
  returned frame.

The metadata's lock/modal refusal must be resolved by preparing a fresh safe
desktop state, not by weakening the guard or reusing the quarantined run. Keep
the original recording and all other evidence untouched. Synthetic tests and
archive decoding are not native live acceptance.
