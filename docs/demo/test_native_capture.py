"""Test native capture boundaries without changing the desktop or starting capture."""

import importlib.util
import contextlib
import io
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location("native_capture", Path(__file__).with_name("native_capture.py"))
capture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(capture)


class NativeCaptureTests(unittest.TestCase):
    """Exercise isolated-region and approved-file boundaries independently of GNOME."""

    def state(self) -> dict:
        """Build a fractional-scale logical two-window scene."""
        return {"epoch": "epoch", "workspace": 0, "locked": False, "blockedReason": None,
                "focusedWindowId": "left", "windows": [
                    {"id": name, "pid": index + 100, "appId": "public-demo", "minimized": False,
                     "protected": False, "rect": {"x": index * 600, "y": 32, "width": 600, "height": 800}}
                    for index, name in enumerate(("left", "right"))]}

    def test_only_selected_window_pixels_are_covered(self) -> None:
        """Accept the inset joined scene, but never include gaps or outside pixels."""
        state = self.state()
        plan = capture.capture_plan(state, ["left", "right"], [16, 48, 1168, 768])
        self.assertEqual(plan["region"], [16, 48, 1168, 768])
        self.assertEqual(len(plan["windows"]), 2)
        for region in ([-1, 48, 1200, 700], [0, 0, 1200, 800], [16, 48, 1300, 768]):
            with self.assertRaises(ValueError):
                capture.capture_plan(state, ["left", "right"], region)
        state["windows"][1]["rect"]["x"] += 1
        with self.assertRaisesRegex(ValueError, "outside"):
            capture.capture_plan(state, ["left", "right"], [16, 48, 1168, 768])

    def test_context_identity_and_protected_states_fail_closed(self) -> None:
        """Do not capture an unapproved focus, identity, lock, or protected window."""
        for field, value in (("locked", True), ("blockedReason", "dialog-active"),
                             ("focusedWindowId", "unrelated")):
            state = self.state()
            state[field] = value
            with self.assertRaises(ValueError):
                capture.capture_plan(state, ["left", "right"], [16, 48, 1168, 768])
        for field in ("minimized", "protected"):
            state = self.state()
            state["windows"][0][field] = True
            with self.assertRaises(ValueError):
                capture.capture_plan(state, ["left", "right"], [16, 48, 1168, 768])
        for ids in (["left", "left"], ["missing"], []):
            with self.assertRaises(ValueError):
                capture.capture_plan(self.state(), ids, [16, 48, 1168, 768])

    def test_overlap_and_invalid_region_shapes_are_refused(self) -> None:
        """Prevent overlap from making area arithmetic falsely imply full coverage."""
        state = self.state()
        state["windows"][1]["rect"]["x"] = 500
        with self.assertRaisesRegex(ValueError, "overlap"):
            capture.capture_plan(state, ["left", "right"], [16, 48, 1068, 768])
        for region in ([0, 0, 10, 10], [0, 0, 600], [False, 32, 600, 800]):
            with self.assertRaises(ValueError):
                capture.capture_plan(self.state(), ["left"], region)

    def test_approved_paths_reject_symlinks_and_unapproved_locations(self) -> None:
        """A recorder must not follow a path into unrelated user data."""
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        self.assertEqual(capture.approved_path(root / "new-run"), root / "new-run")
        link = root / "linked"
        link.symlink_to(root, target_is_directory=True)
        for path in (link / "run", Path.home() / "private-capture", root / ".." / "elsewhere"):
            with self.assertRaises(ValueError):
                capture.approved_path(path)

    def test_existing_output_and_invalid_deadline_refuse_before_bus_access(self) -> None:
        """Never overwrite an existing recording or request unbounded capture."""
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        for seconds in (0, 601):
            with self.assertRaises(ValueError):
                capture.record(root / "new", ["left"], [0, 0, 600, 800], seconds, False)
        with self.assertRaisesRegex(ValueError, "unused"):
            capture.record(root, ["left"], [0, 0, 600, 800], 2, True)

    def test_frame_requires_an_owned_started_manifest_and_same_directory_video(self) -> None:
        """Never choose arbitrary user videos by recency or follow an unrelated path."""
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        manifest = root / "recording.json"
        for value in ({}, {"schema": capture.SCHEMA, "status": "starting"},
                      {"schema": capture.SCHEMA, "status": "stopped", "video": str(root / "missing.mp4")}):
            manifest.write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                capture.extract_frame(manifest, False)
        video = root / "owned.mp4"
        video.write_bytes(b"only the manifest boundary is tested, not decoding")
        manifest.write_text(json.dumps({"schema": capture.SCHEMA, "status": "stopped", "video": str(video)}))
        with self.assertRaisesRegex(ValueError, "live GUI"):
            capture.extract_frame(manifest, True)
        preview = capture.extract_frame(manifest, False, final=True)
        self.assertTrue(preview["dry_run"])
        self.assertEqual(preview["minimum_pts_seconds"], 0)
        self.assertEqual(sorted(path.name for path in root.iterdir()), ["owned.mp4", "recording.json"])

    def test_record_preview_reads_only_and_creates_no_output(self) -> None:
        """A validated dry-run must not activate the recorder or create files."""
        from gi.repository import Gio, GLib
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        connection = mock.Mock()
        connection.call_sync.return_value = GLib.Variant("(s)", [json.dumps(self.state())])
        with mock.patch.object(Gio, "bus_get_sync", return_value=connection):
            result = capture.record(root / "new", ["left", "right"], [16, 48, 1168, 768], 2, False)
        self.assertTrue(result["dry_run"])
        self.assertFalse((root / "new").exists())
        self.assertEqual(connection.call_sync.call_count, 1)
        self.assertEqual(connection.call_sync.call_args.args[3], "GetState")

    def test_record_stops_its_own_caller_on_marker_or_wait_failure(self) -> None:
        """The same connection finalizes a started clip even when its wait fails."""
        from gi.repository import Gio, GLib
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        for mode in ("marker", "failure", "context", "unconfirmed"):
            output = root / mode
            calls = []
            callbacks = []
            connection = mock.Mock()
            connection.get_unique_name.return_value = ":1.9999"
            loop = mock.Mock()

            def call(*args: object) -> object:
                """Model only fixed bus calls, never a real desktop service."""
                method = args[3]
                calls.append(method)
                if method == "GetState":
                    state = self.state()
                    if mode == "context" and len(calls) > 1: state["locked"] = True
                    return GLib.Variant("(s)", [json.dumps(state)])
                if method == "ScreencastArea": return GLib.Variant("(bs)", [True, str(output / "source.mp4")])
                if method == "StopScreencast": return GLib.Variant("(b)", [mode != "unconfirmed"])
                raise AssertionError(method)

            def run() -> None:
                """Trigger the owned stop marker, or fail while recording is active."""
                if mode == "failure": raise RuntimeError("test wait failure")
                if mode in ("marker", "unconfirmed"): (output / "stop.request").write_text("unit test only")
                self.assertFalse(callbacks[0]())

            connection.call_sync.side_effect = call
            loop.run.side_effect = run
            with mock.patch.object(Gio, "bus_get_sync", return_value=connection), \
                    mock.patch.object(GLib, "MainLoop", return_value=loop), \
                    mock.patch.object(GLib, "timeout_add_seconds"), \
                    mock.patch.object(GLib, "timeout_add", side_effect=lambda interval, callback: callbacks.append(callback)):
                if mode == "failure":
                    with self.assertRaisesRegex(RuntimeError, "test wait failure"):
                        capture.record(output, ["left", "right"], [16, 48, 1168, 768], 2, True)
                else:
                    result = capture.record(output, ["left", "right"], [16, 48, 1168, 768], 2, True)
                    if mode == "marker": self.assertEqual(result["stop_reason"], "owned-stop-request")
            expected = ["GetState", "ScreencastArea"] + (["GetState"] if mode == "context" else []) + ["StopScreencast"]
            self.assertEqual(calls, expected)
            saved = json.loads((output / "recording.json").read_text())
            self.assertEqual(saved["stop_acknowledged"], mode != "unconfirmed")
            self.assertEqual(saved["status"], "stopped" if mode == "marker" else "quarantined")
            if mode != "marker":
                with self.assertRaises(ValueError): capture.export_frames(output / "recording.json", True)

    def test_vanished_live_caller_cannot_supply_an_old_frame(self) -> None:
        """Server/process restarts must not turn an abandoned manifest into live proof."""
        from gi.repository import Gio, GLib
        import time
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        video = root / "source.mp4"; video.write_bytes(b"no decoder should read this")
        manifest = root / "recording.json"
        manifest.write_text(json.dumps({"schema": capture.SCHEMA, "status": "recording", "caller": ":1.9999",
                                       "video": str(video), "start_call_monotonic": time.monotonic()}))
        connection = mock.Mock(); connection.call_sync.return_value = GLib.Variant("(b)", [False])
        with mock.patch.object(Gio, "bus_get_sync", return_value=connection), self.assertRaisesRegex(RuntimeError, "vanished"):
            capture.extract_frame(manifest, True)
        self.assertFalse(list(root.glob("frame-check-*")))

    def test_live_caller_is_rechecked_before_returning_a_frame(self) -> None:
        """A recorder that exits during decode cannot produce a live verification result."""
        import gi
        gi.require_version("Gst", "1.0")
        from gi.repository import Gio, GLib, Gst
        from PIL import Image
        Gst.init(None)
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        video = root / "synthetic-owned-live.mp4"
        video.write_bytes(b"decoder fixture is mocked")
        started = time.monotonic() - 1
        manifest = root / "recording.json"
        manifest.write_text(json.dumps({
            "schema": capture.SCHEMA,
            "status": "recording",
            "caller": ":1.9999",
            "video": str(video),
            "start_call_monotonic": started,
        }))
        sample = mock.Mock()
        sample.get_buffer.return_value.pts = int((time.monotonic() - started + 1) * Gst.SECOND)
        sink = mock.Mock()
        sink.emit.return_value = sample
        pipeline = mock.Mock()
        pipeline.get_by_name.return_value = sink
        pipeline.get_bus.return_value.pop_filtered.return_value = None
        connection = mock.Mock()
        connection.call_sync.side_effect = [GLib.Variant("(b)", [True]), GLib.Variant("(b)", [False])]
        with mock.patch.object(Gio, "bus_get_sync", return_value=connection), \
                mock.patch.object(Gst, "parse_launch", return_value=pipeline), \
                mock.patch.object(capture, "sample_image", return_value=Image.new("RGB", (2, 2))), \
                self.assertRaisesRegex(RuntimeError, "vanished during extraction"):
            capture.extract_frame(manifest, True)
        self.assertEqual(connection.call_sync.call_count, 2)
        self.assertFalse(list(root.glob("frame-check-*")))

    def test_refused_start_does_not_stop_some_other_recording(self) -> None:
        """A false startup result grants no ownership of a recorder to stop."""
        from gi.repository import Gio, GLib
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        connection = mock.Mock()
        connection.call_sync.side_effect = [GLib.Variant("(s)", [json.dumps(self.state())]),
                                            GLib.Variant("(bs)", [False, ""])]
        with mock.patch.object(Gio, "bus_get_sync", return_value=connection), self.assertRaisesRegex(RuntimeError, "refused"):
            capture.record(root / "refused", ["left", "right"], [16, 48, 1168, 768], 2, True)
        self.assertEqual(connection.call_sync.call_count, 2)

    def test_stopped_video_extracts_the_last_frame_not_the_first(self) -> None:
        """A synthetic moving test pattern catches misleading first-frame acceptance."""
        import gi
        gi.require_version("Gst", "1.0")
        from gi.repository import Gst
        Gst.init(None)
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        video = root / "synthetic-test-only.webm"
        pipeline = Gst.parse_launch(f'videotestsrc num-buffers=20 pattern=ball ! video/x-raw,width=320,height=240,framerate=10/1 ! vp8enc deadline=1 ! webmmux ! filesink location="{video}"')
        pipeline.set_state(Gst.State.PLAYING)
        try:
            message = pipeline.get_bus().timed_pop_filtered(10 * Gst.SECOND, Gst.MessageType.EOS | Gst.MessageType.ERROR)
            self.assertIsNotNone(message)
            self.assertEqual(message.type, Gst.MessageType.EOS)
        finally:
            pipeline.set_state(Gst.State.NULL)
        manifest = root / "recording.json"
        manifest.write_text(json.dumps({"schema": capture.SCHEMA, "status": "stopped", "video": str(video)}))
        result = capture.extract_frame(manifest, True, final=True)
        self.assertGreaterEqual(result["pts_seconds"], 1.8)
        self.assertEqual(result["dimensions"], [320, 240])
        self.assertEqual(result["mode"], "finalized-last-frame")
        self.assertTrue(Path(result["image"]).is_file())
        preview = capture.export_frames(manifest, False)
        self.assertTrue(preview["dry_run"])
        self.assertFalse((root / "frames").exists())
        exported = capture.export_frames(manifest, True)
        index = json.loads(Path(exported["index"]).read_text())
        self.assertEqual(exported["frames"], 20)
        self.assertEqual(index["frames"][0]["pts_seconds"], 0)
        self.assertGreaterEqual(index["frames"][-1]["pts_seconds"], 1.8)
        with self.assertRaises(FileExistsError):
            capture.export_frames(manifest, True)

    def test_live_fragmented_mp4_reopens_decoder_after_eof(self) -> None:
        """A fresh decoder must follow appended fragments without weakening PTS freshness."""
        import gi
        gi.require_version("Gst", "1.0")
        gi.require_version("GstVideo", "1.0")
        from gi.repository import Gio, GLib, Gst
        Gst.init(None)
        if any(Gst.ElementFactory.find(name) is None for name in ("x264enc", "h264parse", "mp4mux")):
            self.skipTest("The installed GStreamer lacks the synthetic fragmented-MP4 elements")
        root = Path(tempfile.mkdtemp(prefix="native-live-mp4-test-", dir="/tmp/opencode"))
        video = root / "synthetic-live.mp4"
        writer = Gst.parse_launch(
            "videotestsrc is-live=true pattern=ball ! "
            "video/x-raw,format=I420,width=320,height=240,framerate=8/1 ! "
            "x264enc tune=zerolatency key-int-max=8 bitrate=256 ! "
            "h264parse config-interval=-1 ! "
            "mp4mux fragment-duration=500 fragment-mode=first-moov-then-finalise "
            f"streamable=true ! filesink location=\"{video}\" sync=false"
        )
        started = time.monotonic()
        connection = mock.Mock()
        connection.call_sync.return_value = GLib.Variant("(b)", [True])
        writer.set_state(Gst.State.PLAYING)
        try:
            state_result, state, _ = writer.get_state(3 * Gst.SECOND)
            self.assertEqual(state_result, Gst.StateChangeReturn.SUCCESS)
            self.assertEqual(state, Gst.State.PLAYING)
            manifest = root / "recording.json"
            manifest.write_text(json.dumps({
                "schema": capture.SCHEMA,
                "status": "recording",
                "caller": ":1.9999",
                "video": str(video),
                "start_call_monotonic": started,
            }))
            start_deadline = time.monotonic() + 5
            while (not video.exists() or video.stat().st_size == 0) and time.monotonic() < start_deadline:
                time.sleep(0.05)
            self.assertGreater(video.stat().st_size, 0, "the synthetic muxer never published a live fragment")
            size_before_extract = video.stat().st_size

            with mock.patch.object(Gio, "bus_get_sync", return_value=connection):
                result = capture.extract_frame(manifest, True)

            self.assertEqual(result["mode"], "live-verification")
            self.assertGreater(result["minimum_pts_seconds"], 0.5)
            self.assertGreaterEqual(result["pts_seconds"], result["minimum_pts_seconds"])
            self.assertGreater(video.stat().st_size, size_before_extract)
            self.assertTrue(Path(result["image"]).is_file())
            self.assertEqual(writer.get_state(0)[1], Gst.State.PLAYING)
            self.assertEqual(connection.call_sync.call_count, 2)
        finally:
            writer.set_state(Gst.State.NULL)

    def test_corrupt_video_never_produces_a_successful_frame(self) -> None:
        """Bad bytes must not be dressed up as a completed visual check."""
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        video = root / "corrupt.mp4"
        video.write_bytes(b"not media")
        manifest = root / "recording.json"
        manifest.write_text(json.dumps({"schema": capture.SCHEMA, "status": "stopped", "video": str(video)}))
        with self.assertRaises(RuntimeError):
            capture.extract_frame(manifest, True, final=True)
        self.assertFalse(list(root.glob("frame-check-*")))

    def test_sample_and_export_bounds_fail_before_writing_frames(self) -> None:
        """Reject oversized decoded media and an unstarted/non-owned source export."""
        import gi
        gi.require_version("Gst", "1.0")
        from gi.repository import Gst
        Gst.init(None)
        sample = mock.Mock()
        sample.get_caps.return_value = Gst.Caps.from_string("video/x-raw,format=RGB,width=5000,height=100,framerate=1/1")
        sample.get_buffer.return_value.get_size.return_value = 100
        with self.assertRaisesRegex(ValueError, "safety bound"):
            capture.sample_image(sample)
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        manifest = root / "recording.json"
        manifest.write_text(json.dumps({"schema": capture.SCHEMA, "status": "recording"}))
        with self.assertRaisesRegex(ValueError, "stopped"):
            capture.export_frames(manifest, True)
        self.assertFalse((root / "frames").exists())

    def test_cli_transport_failure_is_a_structured_refusal(self) -> None:
        """An absent bridge never prompts a recorder fallback or raw traceback."""
        from gi.repository import GLib
        root = Path(tempfile.mkdtemp(prefix="native-capture-test-", dir="/tmp/opencode"))
        argv = ["native_capture.py", "record", "--output-dir", str(root / "new"),
                "--window-id", "left", "--region", "0", "32", "600", "800", "--apply"]
        stream = io.StringIO()
        with mock.patch("sys.argv", argv), mock.patch.object(capture, "record", side_effect=GLib.Error("test missing bridge")), contextlib.redirect_stdout(stream):
            with self.assertRaises(SystemExit) as raised:
                capture.main()
        self.assertEqual(raised.exception.code, 1)
        result = json.loads(stream.getvalue())
        self.assertFalse(result["ok"])
        self.assertIn("test missing bridge", result["error"])
        self.assertFalse((root / "new").exists())


if __name__ == "__main__":
    unittest.main()
