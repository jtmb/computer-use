"""Check process-local accessibility binding without contacting a live desktop."""

from __future__ import annotations

import os
from pathlib import Path
import socket
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import accessibility_bus


class AccessibilityBusTests(unittest.TestCase):
    """Address discovery preserves identity and refuses unsafe endpoints."""

    def setUp(self) -> None:
        """Create one owned private socket, never the operator's bus."""
        self.directory = tempfile.TemporaryDirectory(prefix="atspi-address-test-", dir="/tmp/opencode")
        self.addCleanup(self.directory.cleanup)
        self.socket = socket.socket(socket.AF_UNIX)
        self.addCleanup(self.socket.close)
        self.filename = Path(self.directory.name) / "bus"
        self.socket.bind(str(self.filename))
        self.address = f"unix:path={self.filename},guid=" + "a" * 32

    def test_complete_owned_address_round_trips_without_stripping_guid(self) -> None:
        """All address bytes survive the validator and process-local binding."""
        self.assertEqual(accessibility_bus.validate_accessibility_address(self.address, os.getuid()), self.address)
        environment = {"DBUS_SESSION_BUS_ADDRESS": "unchanged-original-identity"}
        with patch.object(accessibility_bus, "discover_accessibility_address", return_value=self.address):
            self.assertEqual(accessibility_bus.prepare_accessibility_bus(environment), self.address)
        self.assertEqual(environment, {"DBUS_SESSION_BUS_ADDRESS": "unchanged-original-identity", "AT_SPI_BUS_ADDRESS": self.address})

    def test_explicit_binding_is_not_replaced_or_rediscovered(self) -> None:
        """An explicit valid binding keeps its exact identity."""
        environment = {"AT_SPI_BUS_ADDRESS": self.address}
        with patch.object(accessibility_bus, "discover_accessibility_address") as discover:
            self.assertEqual(accessibility_bus.prepare_accessibility_bus(environment), self.address)
            discover.assert_not_called()

    def test_missing_guid_remote_multiple_alias_and_wrong_owner_refuse(self) -> None:
        """Never switch to another transport, alias or user's endpoint."""
        alias = self.filename.with_name("alias")
        alias.symlink_to(self.filename)
        for address in [self.address.split(",guid=")[0], "tcp:host=localhost,port=1", self.address + ";" + self.address,
                        self.address + ",guid=" + "b" * 32, self.address.replace(str(self.filename), str(alias))]:
            with self.subTest(address=address), self.assertRaises((ValueError, OSError)):
                accessibility_bus.validate_accessibility_address(address, os.getuid())
        with self.assertRaises(ValueError):
            accessibility_bus.validate_accessibility_address(self.address, os.getuid() + 1)

    def test_writable_parent_and_regular_file_refuse(self) -> None:
        """Only a socket in an owned protected parent is accepted."""
        parent = self.filename.parent
        original_stat = Path.stat

        def writable_parent(filename: Path, *args: object, **kwargs: object) -> object:
            """Model unsafe metadata without weakening any real directory."""
            result = original_stat(filename, *args, **kwargs)
            return SimpleNamespace(st_mode=result.st_mode | 0o022, st_uid=result.st_uid) if filename == parent else result

        with patch.object(Path, "stat", writable_parent):
            with self.assertRaises(ValueError):
                accessibility_bus.validate_accessibility_address(self.address, os.getuid())
        regular = parent / "regular"
        regular.write_text("not a socket", encoding="utf-8")
        with self.assertRaises(ValueError):
            accessibility_bus.validate_accessibility_address(self.address.replace(str(self.filename), str(regular)), os.getuid())

    def test_discovery_failure_leaves_environment_unchanged(self) -> None:
        """No fallback connection or partial environment update follows refusal."""
        environment = {"DBUS_SESSION_BUS_ADDRESS": "original"}
        with patch.object(accessibility_bus, "discover_accessibility_address", side_effect=ValueError("refused")):
            with self.assertRaises(ValueError):
                accessibility_bus.prepare_accessibility_bus(environment)
        self.assertEqual(environment, {"DBUS_SESSION_BUS_ADDRESS": "original"})

    def test_provider_ownership_is_checked_and_get_address_binds_unique_owner(self) -> None:
        """A foreign provider is refused before its endpoint is requested."""
        from gi.repository import Gio

        for uid in [os.getuid() + 1, os.getuid()]:
            calls: list[tuple[object, ...]] = []
            replies = iter([":1.99", uid, self.address])

            def call(*arguments: object) -> object:
                """Model only the read-only D-Bus boundary, not validation."""
                calls.append(arguments)
                return SimpleNamespace(unpack=lambda: [next(replies)])

            connection = SimpleNamespace(call_sync=call)
            with patch.dict(os.environ, {"DBUS_SESSION_BUS_ADDRESS": "private-test-only"}), patch.object(Gio, "bus_get_sync", return_value=connection):
                if uid != os.getuid():
                    with self.assertRaisesRegex(ValueError, "another user"):
                        accessibility_bus.discover_accessibility_address()
                    self.assertEqual(len(calls), 2)
                else:
                    self.assertEqual(accessibility_bus.discover_accessibility_address(), self.address)
                    self.assertEqual(calls[2][0], ":1.99")
            self.assertTrue(all(arguments[6] == Gio.DBusCallFlags.NO_AUTO_START and arguments[7] == 2000 for arguments in calls))

    def test_missing_session_address_does_not_autolaunch_a_bus(self) -> None:
        """Missing context fails closed before contacting any service."""
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "autolaunch is refused"):
                accessibility_bus.discover_accessibility_address()


if __name__ == "__main__":
    unittest.main()
