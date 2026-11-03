"""Exercise actual dry-run capture, preserved inputs, and honest GIF output."""

import importlib.util
from pathlib import Path
import tempfile
import unittest

from PIL import Image


SPEC = importlib.util.spec_from_file_location("record", Path(__file__).with_name("record.py"))
record = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(record)


class RecordingTests(unittest.TestCase):
    """Use retained, isolated scratch fixtures rather than live user config."""

    def test_real_preview_is_scoped_and_preserves_every_input(self) -> None:
        """Verify real shell output and fingerprint evidence, then decode the GIF."""
        scratch = Path(tempfile.mkdtemp(prefix="readme-demo-test-", dir="/tmp/opencode"))
        repository = scratch / "repo"
        manifest = record.prepare(record.ROOT, repository)
        records = [record.capture(repository, command, scratch) for command in record.COMMANDS]
        record.validate_capture(records, repository)
        self.assertEqual(record.fingerprint(repository), manifest)
        self.assertFalse((repository / "demo-config").exists())
        self.assertNotIn("update: agents", records[2]["stdout"])
        frames = scratch / "frames"
        frames.mkdir()
        output = scratch / "demo.gif"
        evidence = record.encode(records, repository, output, frames)
        self.assertGreater(evidence["duration_ms"], 15000)
        self.assertLess(evidence["bytes"], 2 * 1024 * 1024)
        with Image.open(output) as image:
            self.assertEqual(image.size, record.SIZE)
            self.assertGreater(image.n_frames, 3)
        self.assertTrue(output.with_suffix(".png").is_file())
        with self.assertRaises(FileExistsError):
            record.encode(records, repository, output, frames)

    def test_failed_assertions_unknown_commands_and_symlinks_are_rejected(self) -> None:
        """Do not turn failed choreography or unsafe inputs into success footage."""
        scratch = Path(tempfile.mkdtemp(prefix="readme-demo-error-", dir="/tmp/opencode"))
        repository = scratch / "repo"
        record.prepare(record.ROOT, repository)
        records = [record.capture(repository, command, scratch) for command in record.COMMANDS]
        records[1]["stdout"] = "preview failed\n"
        with self.assertRaises(RuntimeError):
            record.validate_capture(records, repository)
        with self.assertRaises(RuntimeError):
            record.capture(repository, "echo fabricated-success", scratch)
        (repository / "unsafe-link").symlink_to(repository / "global")
        with self.assertRaises(RuntimeError):
            record.fingerprint(repository)
        with self.assertRaises(RuntimeError):
            record.render_frame("command", ["overflow"] * 20, 0)


if __name__ == "__main__":
    unittest.main()
