"""Exercise AT-SPI process identity without reading or changing the desktop."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

# The identity logic uses only transport fields and procfs, not a live AT-SPI bus.
with patch.dict(sys.modules, {"pyatspi": SimpleNamespace()}):
    spec = importlib.util.spec_from_file_location("identity_desktop_control", Path(__file__).with_name("desktop-control.py"))
    assert spec and spec.loader
    desktop = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = desktop
    spec.loader.exec_module(desktop)


def app(connection: str, process_id: int = os.getpid()) -> SimpleNamespace:
    """Make a synthetic accessible application with a real process incarnation."""
    return SimpleNamespace(app=SimpleNamespace(bus_name=connection), path="/app", get_process_id=lambda: process_id)


class DesktopIdentityTests(unittest.TestCase):
    """Persistent identity must not follow list positions, names or PID reuse."""

    def test_reordering_and_removal_do_not_retarget(self) -> None:
        """A saved identity selects the same object or refuses after its removal."""
        first, second = app(":1.10"), app(":1.11")
        identity = desktop.application_identity(second)
        self.assertRegex(identity, r"^app:[a-f0-9]{64}$")
        with patch.object(desktop, "applications", return_value=[second, first]):
            self.assertIs(desktop.select_application(None, app_id=identity), second)
        with patch.object(desktop, "applications", return_value=[first]):
            with self.assertRaisesRegex(SystemExit, "stale"):
                desktop.select_application(None, app_id=identity)

    def test_transport_and_process_identity_are_required(self) -> None:
        """Unavailable or changed identity never falls back to an app name."""
        first = app(":1.10")
        self.assertNotEqual(desktop.application_identity(first), desktop.application_identity(app(":1.11")))
        self.assertIsNone(desktop.application_identity(app("well-known-name")))
        self.assertIsNone(desktop.application_identity(app(":1.10", -1)))
        self.assertIsNone(desktop.application_identity(app(":1.10", 999_999_999)))

    def test_process_start_time_is_part_of_identity(self) -> None:
        """The same PID and connection with a different start time is different."""
        first = app(":1.10")
        real_open = Path.open

        def proc_data(filename: Path, *args: object, **kwargs: object):
            """Replace only this process stat with a different valid start field."""
            from io import StringIO
            if str(filename) == f"/proc/{os.getpid()}/stat":
                return StringIO(f"{os.getpid()} (fake (app)) S " + "0 " * 18 + "987654321 0")
            return real_open(filename, *args, **kwargs)

        before = desktop.application_identity(first)
        with patch.object(Path, "open", proc_data):
            after = desktop.application_identity(first)
        self.assertIsNotNone(after)
        self.assertNotEqual(before, after)

    def test_cli_has_exclusive_identity_selector(self) -> None:
        """The exact app ID reaches the request; mixed selectors refuse."""
        value = "app:" + "a" * 64
        args = desktop.parser().parse_args(["tree", "--app-id", value])
        self.assertEqual(args.app_id, value)
        with self.assertRaises(SystemExit):
            desktop.parser().parse_args(["tree", "--app-id", value, "--app", "other"])

    def test_preview_fingerprint_cannot_cross_application_incarnations(self) -> None:
        """Identical controls in another app cannot reuse a target preview token."""
        first, second = app(":1.10"), app(":1.11")
        node = SimpleNamespace(name="Save", path="/app/button", get_application=lambda: first)
        match = desktop.Match(node=node, path="0/1", depth=1)
        with patch.object(desktop, "node_role", return_value="push button"), patch.object(desktop, "node_bounds", return_value=[1, 2, 3, 4]):
            original = desktop.target_fingerprint(match, "click")
            node.get_application = lambda: second
            self.assertNotEqual(original, desktop.target_fingerprint(match, "click"))
            node.get_application = lambda: None
            with self.assertRaisesRegex(SystemExit, "mutation refused"):
                desktop.target_fingerprint(match, "click")


if __name__ == "__main__":
    unittest.main()
