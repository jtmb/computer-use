"""Bind one helper to the complete authenticated, same-user accessibility address."""

from __future__ import annotations

from collections.abc import MutableMapping
import os
from pathlib import Path
import stat
from urllib.parse import unquote


def validate_accessibility_address(address: str, owner_uid: int) -> str:
    """Validate a single owned Unix socket while preserving every address byte."""
    if not isinstance(address, str) or not 1 <= len(address) <= 4096 or not address.startswith("unix:") or ";" in address:
        raise ValueError("Accessibility address must be one bounded Unix transport")
    fields: dict[str, str] = {}
    for item in address[5:].split(","):
        key, separator, value = item.partition("=")
        if not separator or key in fields:
            raise ValueError("Accessibility address fields are invalid")
        fields[key] = value
    if set(fields) != {"path", "guid"} or len(fields["guid"]) != 32 or any(character not in "0123456789abcdefABCDEF" for character in fields["guid"]):
        raise ValueError("Accessibility address requires an intact GUID and socket path")
    filename = Path(unquote(fields["path"], errors="strict"))
    if not filename.is_absolute() or filename.resolve(strict=True) != filename:
        raise ValueError("Accessibility socket path must be absolute and unaliased")
    endpoint = filename.lstat()
    parent = filename.parent.stat()
    if not stat.S_ISSOCK(endpoint.st_mode) or endpoint.st_uid != owner_uid or parent.st_uid != owner_uid or parent.st_mode & 0o022:
        raise ValueError("Accessibility socket and protected parent must belong to this user")
    return address


def discover_accessibility_address() -> str:
    """Read GetAddress from one verified same-user owner without activating it."""
    if not os.environ.get("DBUS_SESSION_BUS_ADDRESS"):
        raise ValueError("An explicit session bus address is required; autolaunch is refused")
    from gi.repository import Gio, GLib

    connection = Gio.bus_get_sync(Gio.BusType.SESSION, None)

    def call(destination: str, object_path: str, interface: str, method: str, parameters: object, reply_type: str) -> object:
        """Issue a fixed, bounded read on this process's existing session bus."""
        return connection.call_sync(destination, object_path, interface, method, parameters,
                                    GLib.VariantType.new(reply_type), Gio.DBusCallFlags.NO_AUTO_START, 2000, None).unpack()[0]

    owner = call("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "GetNameOwner", GLib.Variant("(s)", ("org.a11y.Bus",)), "(s)")
    uid = call("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "GetConnectionUnixUser", GLib.Variant("(s)", (owner,)), "(u)")
    if uid != os.getuid():
        raise ValueError("Accessibility address provider belongs to another user")
    address = call(owner, "/org/a11y/bus", "org.a11y.Bus", "GetAddress", None, "(s)")
    return validate_accessibility_address(address, os.getuid())


def prepare_accessibility_bus(environment: MutableMapping[str, str] | None = None) -> str:
    """Set only this fresh helper's supported AT_SPI_BUS_ADDRESS, never its parent."""
    environment = os.environ if environment is None else environment
    explicit = environment.get("AT_SPI_BUS_ADDRESS")
    if explicit:
        return validate_accessibility_address(explicit, os.getuid())
    address = discover_accessibility_address()
    environment["AT_SPI_BUS_ADDRESS"] = address
    return address
