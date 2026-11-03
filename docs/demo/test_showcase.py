"""Check showcase encoding and refusal of unsafe/misleading frame inputs."""

import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image

SPEC = importlib.util.spec_from_file_location("showcase", Path(__file__).with_name("encode-showcase.py"))
showcase = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(showcase)


class ShowcaseTests(unittest.TestCase):
    """Synthetic images below are encoder tests only, never public demo footage."""

    def test_encoder_preserves_timing_and_refuses_replacement(self) -> None:
        """Decode a small test animation and preserve an existing output."""
        root = Path(tempfile.mkdtemp(prefix="showcase-test-", dir="/home/james/Downloads"))
        output = root / "test.gif"
        frames = [Image.new("RGB", (1200, 800), color) for color in ("red", "blue")]
        result = showcase.write_gif(frames, [400, 800], output)
        self.assertEqual(result["duration_ms"], 1200)
        self.assertEqual(result["frames"], 2)
        before = output.read_bytes()
        with self.assertRaises(FileExistsError):
            showcase.write_gif(frames, [400, 800], output)
        self.assertEqual(output.read_bytes(), before)
        with self.assertRaises(RuntimeError):
            showcase.write_gif(frames, [400], root / "invalid.gif")

    def test_composer_requires_real_capture_dimensions(self) -> None:
        """Render a correctly sized fixture, reject a mismatched source image."""
        root = Path(tempfile.mkdtemp(prefix="showcase-compose-test-", dir="/home/james/Downloads"))
        source = root / "test.jpg"
        Image.new("RGB", (1440, 924), "white").save(source)
        self.assertEqual(showcase.compose(source, "Title", "Detail").size, (1200, 800))
        wrong = root / "wrong.jpg"
        Image.new("RGB", (100, 100), "white").save(wrong)
        with self.assertRaises(RuntimeError):
            showcase.compose(wrong, "Title", "Detail")

    def test_cli_requires_positive_unused_version(self) -> None:
        """Reject invalid versions and preserve an existing versioned asset."""
        root = Path(tempfile.mkdtemp(prefix="showcase-cli-test-", dir="/home/james/Downloads"))
        command = [sys.executable, str(Path(__file__).with_name("encode-showcase.py")),
                   "--frames-root", str(root), "--output-dir", str(root)]
        result = subprocess.run(command + ["--version", "0"], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn("must be positive", result.stderr)
        existing = root / "computer-use-showcase-v3.gif"
        existing.write_bytes(b"preserve this asset")
        result = subprocess.run(command + ["--version", "3"], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn("Refusing to replace", result.stderr)
        self.assertEqual(existing.read_bytes(), b"preserve this asset")


if __name__ == "__main__":
    unittest.main()
