"""Run demo preflight tests without opening apps or invoking capture."""

from __future__ import annotations

import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock


SPEC = importlib.util.spec_from_file_location(
    "demo_preflight", Path(__file__).with_name("demo-preflight.py")
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load demo-preflight.py")
preflight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preflight)


class DemoPreflightTests(unittest.TestCase):
    """Exercise staging, path, privacy, and decoded-media boundaries offline."""

    def setUp(self) -> None:
        """Create only a bounded scratch fixture under the approved test root."""
        self.temporary = tempfile.TemporaryDirectory(prefix="demo-preflight-test-", dir="/tmp/opencode")
        self.root = Path(self.temporary.name)
        self.run_dir = self.root / "new-run"
        self.plan_path = self.root / "plan.json"
        self.review_count = 0

    def tearDown(self) -> None:
        """Remove only this test's temporary directory."""
        self.temporary.cleanup()

    def plan(self) -> dict[str, object]:
        """Build fresh, adjacent-window operator declarations for a unit test."""
        now = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
        return {
            "schema": "computer-use.demo-preflight.v1",
            "observed_at_utc": now,
            "screen_rect": [0, 0, 400, 200],
            "region": [0, 0, 400, 200],
            "windows": [
                {"role": "opencode", "id": "open:1", "rect": [0, 0, 200, 200], "visible": True},
                {"role": "browser", "id": "browser:2", "rect": [200, 0, 200, 200], "visible": True},
            ],
            "focused_window_id": "open:1",
            "privacy_assertions": {
                "public_opencode_session": True,
                "fresh_signed_out_browser_profile": True,
                "public_or_sample_task_data": True,
                "no_private_tabs_or_notifications": True,
                "no_auth_payment_or_credential_surface": True,
                "both_windows_visible_and_unoccluded": True,
            },
        }

    def write_plan(self, value: dict[str, object] | None = None) -> Path:
        """Write one test-owned JSON declaration beneath its temporary root."""
        self.plan_path.write_text(json.dumps(value or self.plan()), encoding="utf-8")
        return self.plan_path

    def test_prepare_validates_region_and_never_creates_or_records(self) -> None:
        """Static preparation validates exact coverage but does not touch desktop or media APIs."""
        plan_path = self.write_plan()
        with mock.patch.object(preflight.subprocess, "run") as process:
            result = preflight.prepare(plan_path, "/tmp/opencode", self.run_dir)
        process.assert_not_called()
        self.assertFalse(self.run_dir.exists())
        self.assertIn(result["status"], ("static-inputs-valid", "static-inputs-valid-with-tool-gaps"))
        self.assertFalse(result["capture_authorized"])
        self.assertFalse(result["capture_started"])
        self.assertFalse(result["capture_backend_invoked"])
        self.assertEqual(result["geometry"]["region"], [0, 0, 400, 200])

    def test_prepare_rejects_stale_geometry_gap_overlap_and_bad_privacy_assertions(self) -> None:
        """Stale or incomplete operator declarations cannot pass as a clean composition."""
        changes = []
        stale = self.plan()
        stale["observed_at_utc"] = "2020-01-01T00:00:00Z"
        changes.append(stale)
        gap = self.plan()
        gap["windows"][1]["rect"] = [201, 0, 199, 200]
        changes.append(gap)
        overlap = self.plan()
        overlap["windows"][1]["rect"] = [199, 0, 201, 200]
        changes.append(overlap)
        private = self.plan()
        private["privacy_assertions"]["no_private_tabs_or_notifications"] = False
        changes.append(private)
        for value in changes:
            with self.subTest(value=value):
                with self.assertRaises(preflight.PreflightError):
                    preflight.validate_plan(value)

    def test_prepare_rejects_wrong_screen_focus_ids_and_existing_run(self) -> None:
        """Reject out-of-bounds pixels, stale target identity, and reused output names."""
        cases = []
        outside = self.plan()
        outside["region"] = [0, 0, 401, 200]
        cases.append(outside)
        outside_focus = self.plan()
        outside_focus["focused_window_id"] = "other:3"
        cases.append(outside_focus)
        duplicate = self.plan()
        duplicate["windows"][1]["id"] = duplicate["windows"][0]["id"]
        cases.append(duplicate)
        for value in cases:
            with self.subTest(value=value):
                with self.assertRaises(preflight.PreflightError):
                    preflight.validate_plan(value)
        self.run_dir.mkdir()
        with self.assertRaisesRegex(preflight.PreflightError, "new and unused"):
            preflight.prepare(self.write_plan(), "/tmp/opencode", self.run_dir)

    def test_prepare_rejects_symlinked_and_unapproved_paths(self) -> None:
        """Never follow a symlink or use a user-selected private output root."""
        plan_path = self.write_plan()
        link = self.root / "plan-link.json"
        link.symlink_to(plan_path)
        with self.assertRaises(preflight.PreflightError):
            preflight.prepare(link, "/tmp/opencode", self.run_dir)
        with self.assertRaises(preflight.PreflightError):
            preflight.prepare(plan_path, str(self.root), self.run_dir)
        with self.assertRaises(preflight.PreflightError):
            preflight._approved_root(Path(__file__).resolve().parents[1])

    def _review_fixture(self, purpose: str = "action-preview") -> tuple[Path, Path, Path, Path]:
        """Create synthetic pixels and evidence only for offline verifier tests."""
        from PIL import Image, ImageDraw

        run_dir = self.root / f"review-run-{self.review_count}"
        self.review_count += 1
        run_dir.mkdir()
        preview_dir = run_dir / "action-preview-v1"
        preview_dir.mkdir()
        video_path = run_dir / "source.mp4"
        video_path.write_bytes(b"synthetic video bytes; ffprobe is mocked in this test")
        action_log = run_dir / "actions.json"
        action_log.write_text('{"fixture":"synthetic unit test only"}\n', encoding="utf-8")

        first = Image.new("RGB", (480, 320), "#f4f1ec")
        second = first.copy()
        ImageDraw.Draw(second).rectangle((40, 50, 200, 220), fill="#a6363d")
        gif_path = preview_dir / "preview.gif"
        first.save(gif_path, format="GIF", save_all=True, append_images=[second, first.copy()],
                   duration=[300, 300, 300], loop=0, optimize=False)
        still_path = preview_dir / "still.png"
        first.save(still_path, format="PNG")

        with Image.open(gif_path) as decoded:
            frame_count = decoded.n_frames
            duration_ms = 0
            for index in range(frame_count):
                decoded.seek(index)
                duration_ms += decoded.info["duration"]
        evidence = {
            "purpose": purpose,
            "video": str(video_path),
            "video_sha256": hashlib.sha256(video_path.read_bytes()).hexdigest(),
            "index_sha256": "a" * 64,
            "execution_evidence": [{
                "path": str(action_log),
                "sha256": hashlib.sha256(action_log.read_bytes()).hexdigest(),
            }],
            "output": {
                "gif": str(gif_path),
                "frames": frame_count,
                "duration_ms": duration_ms,
                "bytes": gif_path.stat().st_size,
            },
            "manual_review_required": True,
            "accepted_main_demo": False,
        }
        (preview_dir / "evidence.json").write_text(json.dumps(evidence), encoding="utf-8")
        return run_dir, preview_dir, video_path, action_log

    def _fake_ffprobe(self, behavior: str) -> Path:
        """Create a scratch-only executable that simulates ffprobe behavior."""
        output = {
            "format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2", "duration": "3.0"},
            "streams": [{
                "codec_name": "h264", "width": 480, "height": 320, "nb_read_frames": "24",
            }],
        }
        marker = Path(f"{self.root}/fake-ffprobe-child-marker")
        child_pid = Path(f"{self.root}/fake-ffprobe-child-pid")
        source = f'''#!{sys.executable}
import json
from pathlib import Path
import subprocess
import sys
import time

behavior = {behavior!r}
metadata = {json.dumps(output)!r}
if behavior == "valid":
    sys.stdout.write(metadata)
elif behavior == "stdout-overflow":
    sys.stdout.write(metadata + " " * ({preflight.MAX_FFPROBE_STDOUT_BYTES} + 1))
elif behavior == "stderr-overflow":
    sys.stderr.write("x" * ({preflight.MAX_FFPROBE_STDERR_BYTES} + 1))
    sys.stdout.write(metadata)
elif behavior == "failure":
    sys.stderr.write("synthetic ffprobe failure")
    raise SystemExit(1)
elif behavior == "hang-with-child":
    child_source = (
        "import pathlib,time; time.sleep(1.25); "
        f"pathlib.Path({str(marker)!r}).write_text('survived')"
    )
    child = subprocess.Popen([sys.executable, "-c", child_source])
    Path({str(child_pid)!r}).write_text(str(child.pid))
    time.sleep(10)
'''
        path = self.root / f"fake-ffprobe-{behavior}"
        path.write_text(source, encoding="utf-8")
        path.chmod(0o700)
        return path

    def test_review_decodes_media_checks_hashes_and_keeps_preview_unaccepted(self) -> None:
        """Review probes only a bounded snapshot and fully decodes synthetic outputs."""
        run_dir, preview_dir, _, _ = self._review_fixture()
        fake = self._fake_ffprobe("valid")
        with mock.patch.object(preflight.shutil, "which", return_value=str(fake)), \
                mock.patch.object(
                    preflight, "_run_bounded_process", wraps=preflight._run_bounded_process
                ) as process:
            result = preflight.review(run_dir, preview_dir)
        command = process.call_args.args[0]
        self.assertEqual(Path(command[0]), fake)
        self.assertRegex(command[-1], r"^/proc/self/fd/[0-9]+$")
        self.assertNotIn("ScreencastArea", command)
        self.assertNotIn("desktop", command)
        self.assertLessEqual(len(process.call_args.kwargs["pass_fds"]), 1)
        self.assertEqual(result["source_video"]["decoded_frames"], 24)
        self.assertEqual(result["preview_gif"]["loop"], 0)
        self.assertTrue(result["preview_gif"]["loop_seam_matches"])
        self.assertTrue(result["still_image"]["decoded"])
        self.assertFalse(result["accepted_main_demo"])
        self.assertFalse(result["capture_backend_invoked"])

    def test_review_rejects_tooling_preflight_changed_evidence_and_missing_ffprobe(self) -> None:
        """A no-task tooling clip or altered action log cannot pass action-preview review."""
        run_dir, preview_dir, _, action_log = self._review_fixture(purpose="tooling-preflight")
        with self.assertRaisesRegex(preflight.PreflightError, "real action-preview"):
            preflight.review(run_dir, preview_dir)

        evidence_path = preview_dir / "evidence.json"
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        evidence["purpose"] = "action-preview"
        evidence_path.write_text(json.dumps(evidence), encoding="utf-8")
        action_log.write_text("changed after encoding", encoding="utf-8")
        with self.assertRaisesRegex(preflight.PreflightError, "changed after"):
            preflight.review(run_dir, preview_dir)

        run_dir, preview_dir, _, _ = self._review_fixture()
        with mock.patch.object(preflight.shutil, "which", return_value=None), \
                mock.patch.object(preflight.subprocess, "run") as process:
            with self.assertRaisesRegex(preflight.PreflightError, "ffprobe is unavailable"):
                preflight.review(run_dir, preview_dir)
        process.assert_not_called()

    def test_review_rejects_bad_loop_metadata_and_probe_failure(self) -> None:
        """Broken animation loops and decode failures remain explicit blockers."""
        from PIL import Image

        run_dir, preview_dir, _, _ = self._review_fixture()
        gif_path = preview_dir / "preview.gif"
        with Image.open(gif_path) as image:
            frames = [image.seek(index) or image.convert("RGB").copy() for index in range(image.n_frames)]
        frames[0].save(gif_path, format="GIF", save_all=True, append_images=frames[1:],
                       duration=[300, 300, 300], loop=1, optimize=False)
        with self.assertRaisesRegex(preflight.PreflightError, "loop=0"):
            preflight.review(run_dir, preview_dir)

        run_dir, preview_dir, _, _ = self._review_fixture()
        fake = self._fake_ffprobe("failure")
        with mock.patch.object(preflight.shutil, "which", return_value=str(fake)):
            with self.assertRaisesRegex(preflight.PreflightError, "could not decode"):
                preflight.review(run_dir, preview_dir)

    def test_read_json_rejects_replaced_growing_and_nonregular_inputs(self) -> None:
        """Identity checks and actual bounded reads reject races and special files."""
        self.write_plan()
        replacement = self.root / "replacement.json"
        replacement.write_text(json.dumps(self.plan()), encoding="utf-8")
        real_open = os.open
        replaced = False

        def replace_after_open(path: str | Path, flags: int, *args: object, **kwargs: object) -> int:
            nonlocal replaced
            descriptor = real_open(path, flags, *args, **kwargs)
            if path == self.plan_path.name and kwargs.get("dir_fd") is not None and not replaced:
                os.replace(replacement, self.plan_path)
                replaced = True
            return descriptor

        with mock.patch.object(preflight.os, "open", side_effect=replace_after_open):
            with self.assertRaisesRegex(preflight.PreflightError, "changed while opening"):
                preflight._read_json_file(self.plan_path, self.root, "Plan", 4096)
        self.assertTrue(replaced)

        self.write_plan()
        original_size = self.plan_path.stat().st_size
        real_read = os.read
        grew = False

        def grow_before_read(descriptor: int, amount: int) -> bytes:
            nonlocal grew
            if not grew:
                with self.plan_path.open("ab") as stream:
                    stream.write(b" " * 64)
                grew = True
            return real_read(descriptor, amount)

        with mock.patch.object(preflight.os, "read", side_effect=grow_before_read):
            with self.assertRaisesRegex(preflight.PreflightError, "size changed"):
                preflight._read_json_file(
                    self.plan_path, self.root, "Plan", original_size + 128
                )
        self.assertTrue(grew)

        fifo = self.root / "plan-fifo.json"
        os.mkfifo(fifo)
        started = time.monotonic()
        with self.assertRaises(preflight.PreflightError):
            preflight._read_json_file(fifo, self.root, "Plan", 4096)
        self.assertLess(time.monotonic() - started, 1.0)

    def test_hash_reader_rejects_growth_past_the_declared_limit(self) -> None:
        """Hashing reads at most one byte beyond the cap and rejects file growth."""
        target = self.root / "evidence.json"
        target.write_bytes(b"small")
        real_read = os.read
        grew = False

        def grow_before_hash(descriptor: int, amount: int) -> bytes:
            nonlocal grew
            if not grew:
                with target.open("ab") as stream:
                    stream.write(b"x" * 4096)
                grew = True
            return real_read(descriptor, amount)

        with mock.patch.object(preflight.os, "read", side_effect=grow_before_hash):
            with self.assertRaisesRegex(preflight.PreflightError, "byte bound"):
                preflight._sha256(target, self.root, "Evidence", 128)
        self.assertTrue(grew)

    def test_video_snapshot_rejects_growth_after_open(self) -> None:
        """ffprobe receives only a fixed-size snapshot from a stable source file."""
        target = self.root / "source.mp4"
        target.write_bytes(b"synthetic video")
        real_read = os.read
        grew = False

        def grow_before_snapshot(descriptor: int, amount: int) -> bytes:
            nonlocal grew
            if not grew:
                with target.open("ab") as stream:
                    stream.write(b"changed")
                grew = True
            return real_read(descriptor, amount)

        with mock.patch.object(preflight.os, "read", side_effect=grow_before_snapshot):
            with self.assertRaisesRegex(preflight.PreflightError, "grew beyond its byte bound"):
                with preflight._video_snapshot(target, self.root, "Source video", 1024):
                    self.fail("a growing source must not yield a probeable snapshot")
        self.assertTrue(grew)

    def test_review_rejects_oversized_ffprobe_stdout_and_stderr(self) -> None:
        """Synthetic ffprobe output is capped separately for both captured streams."""
        for behavior in ("stdout-overflow", "stderr-overflow"):
            with self.subTest(stream=behavior):
                run_dir, preview_dir, _, _ = self._review_fixture()
                fake = self._fake_ffprobe(behavior)
                with mock.patch.object(preflight.shutil, "which", return_value=str(fake)):
                    with self.assertRaisesRegex(preflight.PreflightError, "output exceeded its byte bound"):
                        preflight.review(run_dir, preview_dir)

    def test_review_kills_hanging_ffprobe_process_group(self) -> None:
        """A hanging fake probe and its inherited-pipe child are killed by the deadline."""
        run_dir, preview_dir, _, _ = self._review_fixture()
        fake = self._fake_ffprobe("hang-with-child")
        marker = Path(f"{self.root}/fake-ffprobe-child-marker")
        child_pid = Path(f"{self.root}/fake-ffprobe-child-pid")
        started = time.monotonic()
        with mock.patch.object(preflight.shutil, "which", return_value=str(fake)), \
                mock.patch.object(preflight, "FFPROBE_TIMEOUT_SECONDS", 0.5, create=True), \
                mock.patch.object(
                    preflight.subprocess, "run",
                    side_effect=AssertionError("unbounded subprocess.run must not be used"),
                ):
            with self.assertRaisesRegex(preflight.PreflightError, "bounded process deadline"):
                preflight.review(run_dir, preview_dir)
        self.assertLess(time.monotonic() - started, 2.0)
        self.assertTrue(child_pid.is_file(), "fake ffprobe should have started its child")
        time.sleep(1.0)
        self.assertFalse(marker.exists(), "the ffprobe process group must not survive timeout")


if __name__ == "__main__":
    unittest.main()
