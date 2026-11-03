#!/usr/bin/env python3
"""Expose one harmless bridge method only on an explicitly private test bus."""

from __future__ import annotations

import argparse
import json

from gi.repository import Gio, GLib


def main() -> None:
    """Serve fixture replies without contacting a desktop or the operator bus."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--address", required=True)
    parser.add_argument("--stage", required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--registry", action="store_true")
    mode.add_argument("--accessibility-address")
    arguments = parser.parse_args()
    if not arguments.address.startswith("unix:path=/tmp/opencode/bridge-session-test-") or not arguments.address.endswith("/bus"):
        raise ValueError("A dedicated private bridge test bus is required")
    connection = Gio.DBusConnection.new_for_address_sync(
        arguments.address,
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
        None, None,
    )
    connection.set_exit_on_close(False)
    name = "org.gnome.Shell.Extensions.OpenCodeWindowControl"
    object_path = "/org/gnome/Shell/Extensions/OpenCodeWindowControl"
    interface_name = name
    xml = '<method name="InputReleaseAll"><arg name="result" direction="out" type="s"/></method>'
    if arguments.registry:
        name = "org.a11y.atspi.Registry"
        object_path = "/org/a11y/atspi/accessible/root"
        interface_name = "org.a11y.atspi.Accessible"
        xml = '<property name="ChildCount" type="i" access="read"/><method name="GetChildren"><arg direction="out" type="a(so)"/></method>'
    elif arguments.accessibility_address:
        if not arguments.accessibility_address.startswith("unix:path=/tmp/opencode/bridge-session-test-"):
            raise ValueError("A private accessibility fixture address is required")
        name = "org.a11y.Bus"
        object_path = "/org/a11y/bus"
        interface_name = name
        xml = '<method name="GetAddress"><arg direction="out" type="s"/></method>'
    interface = Gio.DBusNodeInfo.new_for_xml('<node><interface name="' + interface_name + '">' + xml + '</interface></node>').interfaces[0]
    calls = 0

    def handle_call(
        bus: object, sender: str, object_path: str, interface_name: str,
        method: str, parameters: object, invocation: object,
    ) -> None:
        """Return a counted fixture value; never implement actual input."""
        nonlocal calls
        if method == "GetAddress" and arguments.accessibility_address:
            invocation.return_value(GLib.Variant("(s)", (arguments.accessibility_address,)))
            return
        if method == "GetChildren" and arguments.registry:
            invocation.return_value(GLib.Variant("(a(so))", ([],)))
            return
        if method != "InputReleaseAll" or arguments.registry or arguments.accessibility_address:
            invocation.return_dbus_error("org.example.NotSupported", "Fixture method only")
            return
        calls += 1
        print("call", flush=True)
        invocation.return_value(GLib.Variant("(s)", (json.dumps({"stage": arguments.stage, "calls": calls}),)))

    def get_property(*unused: object) -> object:
        """Expose an empty fixture desktop without reading actual applications."""
        return GLib.Variant("i", 0)

    connection.register_object(object_path, interface, handle_call, get_property if arguments.registry else None, None)
    connection.call_sync(
        "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
        "RequestName", GLib.Variant("(su)", (name, 0)), GLib.VariantType.new("(u)"),
        Gio.DBusCallFlags.NONE, 3000, None,
    )
    loop = GLib.MainLoop()
    connection.connect("closed", lambda *_: loop.quit())
    print("ready", flush=True)
    loop.run()


if __name__ == "__main__":
    main()
