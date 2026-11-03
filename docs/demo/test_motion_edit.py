"""Verify truthful single-timeline camera editing with clearly synthetic test images."""

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw

SPEC = importlib.util.spec_from_file_location("motion_edit", Path(__file__).with_name("motion_edit.py"))
motion = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(motion)


class MotionEditTests(unittest.TestCase):
    """Test chronology, camera motion, GIF timing and refusal of misleading inputs."""

    def plan(self) -> dict:
        """Use a two-second synthetic camera test, never a fake application demo."""
        return {"purpose": "tooling-preflight", "canvas": [480, 320], "fps": 10,
                "segments": [{"source_start": 0, "source_end": 1, "duration": 2}],
                "keyframes": [{"at": 0, "crop": [0, 0, 640, 400]},
                              {"at": 1, "crop": [160, 100, 480, 300]},
                              {"at": 2, "crop": [0, 0, 640, 400]}]}

    def fixture(self) -> tuple[Path, Path]:
        """Write bounded, labeled synthetic pixels and an index only for encoder tests."""
        root = Path(tempfile.mkdtemp(prefix="motion-edit-test-", dir="/tmp/opencode"))
        video = root / "synthetic-test-not-video.bin"; video.write_bytes(b"synthetic source identity test")
        source = root / "frames"; source.mkdir()
        capture = root / "recording.json"
        capture.write_text(json.dumps({"schema": "computer-use.native-demo.v1", "status": "stopped",
                                       "video": str(video), "purpose": "synthetic unit test only"}))
        frames = []
        for index in range(3):
            image = Image.new("RGB", (640, 400), "#223344")
            draw = ImageDraw.Draw(image)
            draw.rectangle((40 + index * 80, 80, 180 + index * 80, 260), fill="#aa3344")
            draw.text((20, 20), "SYNTHETIC UNIT TEST - NOT AN APP", fill="white")
            path = source / f"frame-{index}.png"; image.save(path)
            frames.append({"path": path.name, "pts_seconds": index / 2, "size": [640, 400],
                           "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        manifest = {"schema": "computer-use.native-frames.v1", "video": str(video),
                    "capture_manifest": str(capture),
                    "video_sha256": hashlib.sha256(video.read_bytes()).hexdigest(), "frames": frames}
        path = source / "index.json"; path.write_text(json.dumps(manifest))
        return root, path

    def test_eased_camera_and_source_mapping_have_exact_endpoints(self) -> None:
        """Camera geometry eases between keys; cuts never invent intermediate app states."""
        plan = self.plan()
        self.assertEqual(motion.validate_plan(plan, (640, 400), (0, 1)), 2)
        self.assertEqual(motion.camera_crop(plan["keyframes"], 0), (0, 0, 640, 400))
        self.assertEqual(motion.camera_crop(plan["keyframes"], 1), (160, 100, 480, 300))
        self.assertEqual(motion.camera_crop(plan["keyframes"], 2), (0, 0, 640, 400))
        self.assertEqual(motion.source_time(plan["segments"], 1), 0.5)
        self.assertLess(motion.camera_crop(plan["keyframes"], 0.1)[0], 16)

    def test_reverse_time_offscreen_crops_nonfinite_and_unbounded_edits_refuse(self) -> None:
        """Reject plans that reverse evidence, leave source bounds, or exhaust memory."""
        for change in ("reverse", "crop", "nan", "budget", "purpose"):
            plan = self.plan()
            if change == "reverse": plan["segments"] += [{"source_start": 0, "source_end": 1, "duration": 2}]
            if change == "crop": plan["keyframes"][1]["crop"][0] = -1
            if change == "nan": plan["keyframes"][1]["crop"][0] = float("nan")
            if change == "budget": plan["canvas"] = [1920, 1440]; plan["fps"] = 30; plan["segments"][0]["duration"] = 60; plan["keyframes"][-1]["at"] = 60
            if change == "purpose": plan["purpose"] = "pretend-success"
            with self.assertRaises(ValueError): motion.validate_plan(plan, (640, 400), (0, 1))

    def test_gif_time_units_do_not_drift(self) -> None:
        """Fifteen fps uses alternating centisecond delays while preserving total time."""
        delays = motion.gif_delays(120, 15)
        self.assertEqual(sum(delays), 8000)
        self.assertEqual(set(delays), {60, 70})
        with self.assertRaises(ValueError): motion.gif_delays(0, 15)

    def test_actual_encoded_preflight_decodes_loops_and_preserves_evidence(self) -> None:
        """Inspect encoded frames/timing, not only requested encoder options."""
        root, index = self.fixture()
        output = root / "encoded"
        self.assertTrue(motion.encode(index, self.plan(), output, False)["dry_run"])
        self.assertFalse(output.exists())
        result = motion.encode(index, self.plan(), output, True)
        self.assertEqual(result["duration_ms"], 2000)
        self.assertFalse(result["accepted_main_demo"])
        evidence = json.loads((output / "evidence.json").read_text())
        self.assertEqual(len(evidence["edits"]), 20)
        self.assertTrue(evidence["manual_review_required"])
        with Image.open(output / "preview.gif") as image:
            self.assertEqual(image.info["loop"], 0)
            image.seek(0); first = image.convert("RGB")
            image.seek(image.n_frames - 1); final = image.convert("RGB")
            self.assertEqual(first.tobytes(), final.tobytes())
        with self.assertRaises(FileExistsError): motion.encode(index, self.plan(), output, True)

    def test_changed_source_and_unsupported_action_claims_refuse(self) -> None:
        """A preflight cannot silently become an approved action showcase."""
        root, index = self.fixture()
        plan = self.plan(); plan["purpose"] = "action-preview"
        with self.assertRaisesRegex(ValueError, "execution evidence"):
            motion.encode(index, plan, root / "action", True)
        data = json.loads(index.read_text())
        (index.parent / data["frames"][0]["path"]).write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "changed"):
            motion.encode(index, self.plan(), root / "changed", True)
        self.assertFalse((root / "action").exists())

    def test_hash_and_capture_identity_bounds_fail_closed(self) -> None:
        """Do not load oversized sources or silently mix a different recording."""
        root, index = self.fixture()
        with self.assertRaisesRegex(ValueError, "byte bound"):
            motion.digest(index, 1)
        data = json.loads(index.read_text())
        capture = Path(data["capture_manifest"])
        record = json.loads(capture.read_text()); record["video"] = "different-source.mp4"
        capture.write_text(json.dumps(record))
        with self.assertRaisesRegex(ValueError, "one stopped"):
            motion.encode(index, self.plan(), root / "mixed", True)
        self.assertFalse((root / "mixed").exists())


if __name__ == "__main__":
    unittest.main()
