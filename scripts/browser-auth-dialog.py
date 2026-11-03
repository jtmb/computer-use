#!/usr/bin/env python3
"""Collect one secret in a masked GTK dialog and return it through fd 3."""

from __future__ import annotations

import ctypes
import json
import os
import re
import signal
import struct
import sys
from typing import Any


MAX_SECRET_BYTES = 4_096
MAX_SPEC_BYTES = 16_384
CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Build a JSON object only when each key is unique."""
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def read_spec(path: str) -> dict[str, Any]:
    """Read and strictly validate non-secret dialog labels and bounds."""
    with open(path, "rb") as spec_file:
        raw = spec_file.read(MAX_SPEC_BYTES + 1)
    if len(raw) > MAX_SPEC_BYTES:
        raise ValueError("spec too large")
    spec = json.loads(raw.decode("utf-8"), object_pairs_hook=_reject_duplicate_keys)
    if (
        not isinstance(spec, dict)
        or not {"title", "label"}.issubset(spec)
        or set(spec) - {
        "title",
        "label",
        "description",
        "minLength",
        "maxLength",
        }
    ):
        raise ValueError("invalid spec fields")
    for name in ("title", "label"):
        value = spec.get(name)
        if (
            not isinstance(value, str)
            or not value
            or len(value) > 200
            or CONTROL_CHARACTERS.search(value)
        ):
            raise ValueError("invalid label")
    description = spec.get("description", "")
    if (
        not isinstance(description, str)
        or len(description) > 1_000
        or CONTROL_CHARACTERS.search(description)
    ):
        raise ValueError("invalid description")
    minimum = spec.get("minLength", 0)
    maximum = spec.get("maxLength", MAX_SECRET_BYTES)
    if (
        type(minimum) is not int
        or type(maximum) is not int
        or minimum < 0
        or maximum < 1
        or minimum > maximum
        or maximum > MAX_SECRET_BYTES
    ):
        raise ValueError("invalid length bounds")
    return {
        "title": spec["title"],
        "label": spec["label"],
        "description": description,
        "minLength": minimum,
        "maxLength": maximum,
    }


def _write_payload(secret: str) -> None:
    """Transfer one UTF-8 value to the parent through the private pipe."""
    encoded = secret.encode("utf-8")
    payload = struct.pack(">I", len(encoded)) + encoded
    view = memoryview(payload)
    while view:
        written = os.write(3, view)
        view = view[written:]
    os.close(3)


def _arm_parent_death_signal() -> None:
    """Make the dialog exit if its staging parent disappears."""
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0:
        raise OSError("could not set parent-death signal")


def main() -> int:
    """Render the masked entry dialog and return a status-only exit code."""
    if os.environ.get("GTK_A11Y") != "none":
        print("browser-auth-dialog: GTK_A11Y=none is required", file=sys.stderr)
        return 3
    if len(sys.argv) != 2:
        print("browser-auth-dialog: expected one spec file", file=sys.stderr)
        return 1
    try:
        spec = read_spec(sys.argv[1])
        parent_pid = os.getppid()
        _arm_parent_death_signal()
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
        print("browser-auth-dialog: invalid dialog specification", file=sys.stderr)
        return 1

    if os.getppid() != parent_pid:
        return 1
    try:
        import gi

        gi.require_version("Gtk", "4.0")
        from gi.repository import GLib, Gtk
    except (ImportError, ValueError):
        print("browser-auth-dialog: GTK 4 is unavailable", file=sys.stderr)
        return 1

    signal_state: dict[str, object] = {"received": False}

    def on_signal(_signum: int, _frame: object) -> None:
        """Schedule cancellation after a termination signal."""
        signal_state["received"] = True
        cancel = signal_state.get("cancel")
        if callable(cancel):
            GLib.idle_add(cancel)

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGHUP, on_signal)

    try:
        Gtk.init()
    except Exception:
        print("browser-auth-dialog: could not initialize the GTK display", file=sys.stderr)
        # The stager discards stderr; publish an explicit category instead.
        print("failed:display")
        return 1
    loop = GLib.MainLoop()
    window = Gtk.Window(title=spec["title"])
    window.set_modal(True)
    window.set_resizable(False)
    window.set_default_size(460, -1)

    content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
    content.set_margin_top(18)
    content.set_margin_bottom(18)
    content.set_margin_start(18)
    content.set_margin_end(18)
    window.set_child(content)

    label = Gtk.Label(label=spec["label"])
    label.set_xalign(0)
    label.set_wrap(True)
    content.append(label)
    if spec["description"]:
        description = Gtk.Label(label=spec["description"])
        description.set_xalign(0)
        description.set_wrap(True)
        content.append(description)

    entry = Gtk.PasswordEntry()
    entry.set_show_peek_icon(False)
    # GtkPasswordEntry implements GtkEditable, but PyGObject does not expose the
    # interface setter as a bound method, so call it through the interface.
    try:
        Gtk.Editable.set_placeholder_text(entry, "Enter secret")
    except (AttributeError, TypeError):
        # A placeholder is cosmetic; never fail the dialog for it.
        pass
    content.append(entry)
    validation = Gtk.Label()
    validation.set_xalign(0)
    validation.add_css_class("error")
    content.append(validation)

    buttons = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
    buttons.set_halign(Gtk.Align.END)
    content.append(buttons)
    cancel_button = Gtk.Button(label="Cancel")
    continue_button = Gtk.Button(label="Continue")
    continue_button.add_css_class("suggested-action")
    buttons.append(cancel_button)
    buttons.append(continue_button)
    window.set_default_widget(continue_button)

    result = 2
    finished = False

    def clear_and_quit(status: int) -> None:
        """Clear the widget and stop the dialog loop."""
        nonlocal result, finished
        if finished:
            return
        finished = True
        result = status
        entry.set_text("")
        window.destroy()
        loop.quit()

    def on_continue(_button: object) -> None:
        """Validate then hand off the user-entered value privately."""
        secret = entry.get_text()
        encoded = secret.encode("utf-8")
        character_count = len(secret)
        if (
            character_count < spec["minLength"]
            or character_count > spec["maxLength"]
            or len(encoded) > MAX_SECRET_BYTES
        ):
            validation.set_text("The value does not meet the length requirements.")
            return
        try:
            _write_payload(secret)
        except OSError:
            clear_and_quit(1)
            return
        clear_and_quit(0)

    def on_cancel(_button: object) -> None:
        """Close the private pipe without sending a value."""
        try:
            os.close(3)
        except OSError:
            pass
        clear_and_quit(2)

    def on_close(_window: object) -> bool:
        """Treat closing the window as explicit cancellation."""
        on_cancel(cancel_button)
        return True

    cancel_button.connect("clicked", on_cancel)
    continue_button.connect("clicked", on_continue)
    window.connect("close-request", on_close)
    signal_state["cancel"] = lambda: on_cancel(cancel_button)
    if signal_state["received"]:
        on_cancel(cancel_button)
    else:
        window.present()
        loop.run()
    if result == 0:
        print("ok")
    elif result == 2:
        print("cancelled")
    else:
        # Internal construction/validation failures land here; the stager maps the
        # category and never reads stderr.
        print("failed:internal")
    return result


if __name__ == "__main__":
    raise SystemExit(main())
