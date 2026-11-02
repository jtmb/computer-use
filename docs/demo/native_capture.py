#!/usr/bin/env python3
"""Record an approved isolated GNOME region and extract fresh frames from it."""

from __future__ import annotations

import argparse
import datetime
import hashlib
import io
import json
from pathlib import Path
import tempfile
import time
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from PIL import Image

SCHEMA = "computer-use.native-demo.v1"
WINDOW_BUS = "org.gnome.Shell.Extensions.OpenCodeWindowControl"
WINDOW_PATH = "/org/gnome/Shell/Extensions/OpenCodeWindowControl"
RECORDER_BUS = "org.gnome.Shell.Screencast"
RECORDER_PATH = "/org/gnome/Shell/Screencast"
LIVE_FRAME_TIMEOUT_SECONDS = 20
LIVE_FILE_POLL_SECONDS = 0.05
LIVE_FILE_SETTLE_SECONDS = 0.1


def approved_path(value: str | Path) -> Path:
    """Refuse symlinked paths and output outside the owner's approved folders."""
    path = Path(value).expanduser().absolute()
    for item in (path, *path.parents):
        if item.is_symlink():
            raise ValueError(f"Symlink path refused: {item}")
    roots = (Path.home() / "Downloads", Path.home() / "Documents",
             Path("/tmp/opencode"))
    if not any(path.is_relative_to(root) and path != root for root in roots):
        raise ValueError("Use an unused child of an approved output folder")
    if ".." in path.parts:
        raise ValueError("Parent traversal is not accepted")
    return path


def capture_plan(state: dict, ids: list[str], region: list[int]) -> dict:
    """Validate metadata and require every recorded pixel inside selected frames."""
    if state.get("locked") or state.get("blockedReason"):
        raise ValueError("Desktop locked, modal, or otherwise unavailable")
    if not 1 <= len(ids) <= 4 or len(set(ids)) != len(ids):
        raise ValueError("Select one to four distinct exact compositor IDs")
    if len(region) != 4 or any(type(value) is not int for value in region):
        raise ValueError("Region needs four integer logical-desktop coordinates")
    x, y, width, height = region
    if width < 160 or height < 100:
        raise ValueError("Region is too small")
    selected = []
    covered = 0
    intersections = []
    for identifier in ids:
        matches = [window for window in state["windows"] if window["id"] == identifier]
        if len(matches) != 1 or matches[0]["minimized"] or matches[0]["protected"]:
            raise ValueError("Selected window is missing, ambiguous, minimized or protected")
        window = matches[0]
        selected.append(window)
        rect = window["rect"]
        left, top = max(x, rect["x"]), max(y, rect["y"])
        right = min(x + width, rect["x"] + rect["width"])
        bottom = min(y + height, rect["y"] + rect["height"])
        if right <= left or bottom <= top:
            raise ValueError("Every selected window must intersect the region")
        for old_left, old_top, old_right, old_bottom in intersections:
            if left < old_right and old_left < right and top < old_bottom and old_top < bottom:
                raise ValueError("Selected frame intersections must not overlap")
        intersections.append((left, top, right, bottom))
        covered += (right - left) * (bottom - top)
    if covered != width * height:
        raise ValueError("Region includes space outside the selected windows")
    if state["focusedWindowId"] not in ids:
        raise ValueError("Focus is outside the isolated demo windows")
    return {"epoch": state["epoch"], "workspace": state["workspace"],
            "region": region, "windows": selected}


def save_json(path: Path, value: dict) -> None:
    """Persist only this run's owned metadata, never unrelated desktop inventory."""
    path.write_text(json.dumps(value, indent=2) + "\n")


def record(output: Path, ids: list[str], region: list[int], seconds: int, apply: bool) -> dict:
    """Keep one recorder bus caller alive until its own stop request or deadline."""
    from gi.repository import Gio, GLib

    if not 1 <= seconds <= 600:
        raise ValueError("Recording deadline must be 1-600 seconds")
    if output.exists() or not output.parent.is_dir():
        raise ValueError("Output must be an unused directory with an existing parent")
    connection = Gio.bus_get_sync(Gio.BusType.SESSION, None)

    def snapshot() -> dict:
        """Read the bounded bridge without activating a missing bridge."""
        reply = connection.call_sync(WINDOW_BUS, WINDOW_PATH, WINDOW_BUS, "GetState", None,
                                     GLib.VariantType.new("(s)"), Gio.DBusCallFlags.NO_AUTO_START, 3000, None)
        return json.loads(reply.unpack()[0])

    plan = capture_plan(snapshot(), ids, region)
    manifest = {"schema": SCHEMA, "status": "preview", "plan": plan,
                "deadline_seconds": seconds, "fps": 8, "dry_run": not apply}
    if not apply:
        return manifest
    output.mkdir()
    manifest_path = output / "recording.json"
    manifest.update({"status": "starting", "start_call_monotonic": time.monotonic(),
                     "started_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()})
    save_json(manifest_path, manifest)
    options = {"framerate": GLib.Variant("i", 8), "draw-cursor": GLib.Variant("b", False)}
    ok, filename = connection.call_sync(
        RECORDER_BUS, RECORDER_PATH, RECORDER_BUS, "ScreencastArea",
        GLib.Variant("(iiiisa{sv})", (*region, str(output / "source"), options)),
        GLib.VariantType.new("(bs)"), Gio.DBusCallFlags.NONE, 20000, None,
    ).unpack()
    if not ok:
        raise RuntimeError("Native recorder refused the requested region")
    video = Path(filename)
    loop = GLib.MainLoop()
    try:
        if video.parent != output:
            raise RuntimeError("Recorder returned a path outside this owned run")
        manifest.update({"status": "recording", "video": str(video),
                         "caller": connection.get_unique_name(),
                         "privacy_guard": "metadata only; never open sensitive forms during capture"})
        save_json(manifest_path, manifest)
        print(json.dumps({"recording_started": True, "manifest": str(manifest_path)}), flush=True)

        def deadline() -> bool:
            """Stop this caller's recording at its hard duration bound."""
            manifest["stop_reason"] = "deadline"
            loop.quit()
            return GLib.SOURCE_REMOVE

        def guard() -> bool:
            """Stop on an owned stop marker or a changed/sensitive desktop context."""
            if (output / "stop.request").exists():
                manifest["stop_reason"] = "owned-stop-request"
                loop.quit()
                return GLib.SOURCE_REMOVE
            try:
                current = capture_plan(snapshot(), ids, region)
                stable = current["epoch"] == plan["epoch"] and current["workspace"] == plan["workspace"]
                for old, new in zip(plan["windows"], current["windows"]):
                    stable = stable and all(old[field] == new[field] for field in ("id", "pid", "appId", "rect"))
                if not stable:
                    raise ValueError("Selected window identity or geometry changed")
            except (ValueError, KeyError, GLib.Error) as error:
                manifest["stop_reason"] = f"context-refusal: {error}"
                loop.quit()
                return GLib.SOURCE_REMOVE
            return GLib.SOURCE_CONTINUE

        GLib.timeout_add_seconds(seconds, deadline)
        GLib.timeout_add(250, guard)
        loop.run()
    finally:
        acknowledged = connection.call_sync(
            RECORDER_BUS, RECORDER_PATH, RECORDER_BUS, "StopScreencast", None,
            GLib.VariantType.new("(b)"), Gio.DBusCallFlags.NONE, 20000, None,
        ).unpack()[0]
        quarantine = not acknowledged or not manifest.get("stop_reason") or manifest["stop_reason"].startswith("context-refusal:")
        manifest.update({"status": "quarantined" if quarantine else "stopped", "stop_acknowledged": acknowledged,
                         "privacy_review_required": quarantine,
                         "ended_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()})
        save_json(manifest_path, manifest)
    return manifest


def sample_image(sample: Any) -> Image.Image:
    """Decode a bounded GStreamer RGB sample without assuming packed row stride."""
    import gi
    gi.require_version("GstVideo", "1.0")
    from gi.repository import GstVideo
    from PIL import Image
    buffer = sample.get_buffer()
    info = GstVideo.VideoInfo.new_from_caps(sample.get_caps())
    if not 0 < info.width <= 4096 or not 0 < info.height <= 4096 or buffer.get_size() > 64 * 1024 * 1024:
        raise ValueError("Decoded frame exceeds the safety bound")
    data = buffer.extract_dup(0, buffer.get_size())
    return Image.frombytes("RGB", (info.width, info.height), data, "raw", "RGB", info.stride[0], 1)


def wait_for_live_growth(video: Path, previous_size: int, deadline: float) -> bool:
    """Wait for append-only live media to grow and finish its current write."""
    last_size = video.stat().st_size
    if last_size < previous_size:
        raise RuntimeError("Live video changed or shrank; no frame accepted")
    grew = last_size > previous_size
    stable_since = time.monotonic() if grew else None
    while time.monotonic() < deadline:
        size = video.stat().st_size
        if size < previous_size:
            raise RuntimeError("Live video changed or shrank; no frame accepted")
        if size != last_size:
            if size < last_size:
                raise RuntimeError("Live video changed or shrank; no frame accepted")
            last_size = size
            grew = True
            stable_since = time.monotonic()
        elif grew and stable_since is not None and time.monotonic() - stable_since >= LIVE_FILE_SETTLE_SECONDS:
            return True
        time.sleep(LIVE_FILE_POLL_SECONDS)
    return False


def extract_frame(manifest_path: Path, apply: bool, final: bool = False) -> dict:
    """Read a fresh, timestamped frame from this run's own live or finalized video."""
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("schema") != SCHEMA or manifest.get("status") not in ("recording", "stopped"):
        raise ValueError("A started, owned native-demo recording manifest is required")
    if (manifest["status"] == "stopped") != final:
        raise ValueError("Stopped clips require explicit --final archive review; live GUI checks require an active recording")
    video = approved_path(manifest["video"])
    if video.parent != manifest_path.parent or not video.is_file():
        raise ValueError("Video must be the regular file in this manifest's owned directory")
    minimum = max(0, time.monotonic() - manifest["start_call_monotonic"]) if manifest["status"] == "recording" else 0
    if not final:
        from gi.repository import Gio, GLib
        caller = manifest.get("caller")
        if not isinstance(caller, str) or not caller.startswith(":") or len(caller) > 255:
            raise ValueError("A valid owned recorder bus caller is required for live verification")
        connection = Gio.bus_get_sync(Gio.BusType.SESSION, None)

        def caller_alive() -> bool:
            """Confirm the exact recorder connection still owns its unique bus name."""
            return connection.call_sync(
                "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "NameHasOwner",
                GLib.Variant("(s)", [caller]), GLib.VariantType.new("(b)"),
                Gio.DBusCallFlags.NO_AUTO_START, 3000, None,
            ).unpack()[0]

        if not caller_alive():
            raise RuntimeError("Recording caller has vanished; no live frame accepted")
    if not apply:
        return {"dry_run": True, "video": str(video), "minimum_pts_seconds": minimum}
    import gi
    gi.require_version("Gst", "1.0")
    gi.require_version("GstVideo", "1.0")
    from gi.repository import Gst
    from PIL import Image

    Gst.init(None)
    pipeline = None
    sink = None
    latest = None
    pts = -1
    end_seen = False
    sample = None
    decode_error = None
    deadline = time.monotonic() + LIVE_FRAME_TIMEOUT_SECONDS
    try:
        while time.monotonic() < deadline:
            if pipeline is None:
                attempt_size = video.stat().st_size
                pipeline = Gst.parse_launch(
                    f'uridecodebin uri="{video.as_uri()}" ! videoconvert ! video/x-raw,format=RGB ! '
                    'appsink name=frame max-buffers=2 drop=true sync=false')
                sink = pipeline.get_by_name("frame")
                pipeline.set_state(Gst.State.PLAYING)
                end_seen = False
            sample = sink.emit("try-pull-sample", Gst.SECOND // 5)
            if sample is not None:
                buffer = sample.get_buffer()
                latest = sample_image(sample)
                pts = buffer.pts
                if manifest["status"] == "recording" and pts != Gst.CLOCK_TIME_NONE and pts / Gst.SECOND >= minimum:
                    break
            message = pipeline.get_bus().pop_filtered(Gst.MessageType.EOS | Gst.MessageType.ERROR)
            if message is not None:
                if message.type == Gst.MessageType.ERROR:
                    error, _ = message.parse_error()
                    if manifest["status"] != "recording":
                        raise RuntimeError(f"Video decode failed: {error}")
                    decode_error = str(error)
                    pipeline.set_state(Gst.State.NULL)
                    pipeline = None
                    sink = None
                    if not wait_for_live_growth(video, attempt_size, deadline):
                        raise RuntimeError(f"Video decode failed while live source did not advance: {decode_error}")
                    continue
                end_seen = True
            if end_seen and sample is None:
                if manifest["status"] != "recording":
                    break
                pipeline.set_state(Gst.State.NULL)
                pipeline = None
                sink = None
                if not wait_for_live_growth(video, attempt_size, deadline):
                    break
                end_seen = False
        if latest is None or pts == Gst.CLOCK_TIME_NONE or pts / Gst.SECOND < minimum:
            if latest is None and decode_error is not None:
                raise RuntimeError(f"Video decode failed while live source did not yield a frame: {decode_error}")
            raise RuntimeError("No sufficiently fresh decoded frame; do not infer visual success")
        if manifest["status"] == "stopped" and not (end_seen and sample is None):
            raise RuntimeError("Final video did not fully decode within the bound; no final-frame claim")
    finally:
        if pipeline is not None:
            pipeline.set_state(Gst.State.NULL)
    if not final:
        if json.loads(manifest_path.read_text()).get("status") != "recording":
            raise RuntimeError("Recording ended during extraction; no live verification frame accepted")
        if not caller_alive():
            raise RuntimeError("Recording caller vanished during extraction; no live frame accepted")
    directory = Path(tempfile.mkdtemp(prefix="frame-check-", dir=manifest_path.parent))
    image_path = directory / "frame.png"
    latest.save(image_path)
    with Image.open(image_path) as decoded:
        decoded.verify()
    result = {"image": str(image_path), "video": str(video), "pts_seconds": pts / Gst.SECOND,
              "minimum_pts_seconds": minimum, "dimensions": list(latest.size),
              "mode": "finalized-last-frame" if final else "live-verification",
              "purpose": "archive review, not current desktop state" if final else "fresh verification from the genuine simultaneous native recording"}
    save_json(directory / "frame.json", result)
    return result


def export_frames(manifest_path: Path, apply: bool) -> dict:
    """Export a stopped owned clip at its real PTS, with bounded storage and time."""
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("schema") != SCHEMA or manifest.get("status") != "stopped":
        raise ValueError("Dense export requires a stopped owned recording")
    video = approved_path(manifest["video"])
    if video.parent != manifest_path.parent or not video.is_file():
        raise ValueError("Video must be in its own manifest directory")
    output = manifest_path.parent / "frames"
    if output.exists():
        raise FileExistsError("Preserve existing frame exports; choose a new owned run")
    if not apply:
        return {"dry_run": True, "video": str(video), "output": str(output)}
    import gi
    gi.require_version("Gst", "1.0")
    from gi.repository import Gst
    Gst.init(None)
    with video.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    output.mkdir()
    pipeline = Gst.parse_launch(
        f'uridecodebin uri="{video.as_uri()}" ! videoconvert ! video/x-raw,format=RGB ! '
        'appsink name=frame max-buffers=2 drop=false sync=false')
    sink = pipeline.get_by_name("frame")
    frames = []
    total_bytes = 0
    end_seen = False
    deadline = time.monotonic() + 120
    pipeline.set_state(Gst.State.PLAYING)
    try:
        while time.monotonic() < deadline:
            sample = sink.emit("try-pull-sample", Gst.SECOND // 5)
            if sample is not None:
                pts = sample.get_buffer().pts
                if pts == Gst.CLOCK_TIME_NONE or (frames and pts / Gst.SECOND < frames[-1]["pts_seconds"]):
                    raise ValueError("Source timestamps are missing or reversed")
                if len(frames) >= 5000:
                    raise ValueError("Export exceeds 5000 frames")
                image = sample_image(sample)
                encoded = io.BytesIO()
                image.save(encoded, format="JPEG", quality=90)
                data = encoded.getvalue()
                if total_bytes + len(data) > 512 * 1024 * 1024:
                    raise ValueError("Export exceeds 512 MiB; preserve partial evidence and revise the cut")
                name = f"frame-{len(frames):05d}.jpg"
                with (output / name).open("xb") as stream:
                    stream.write(data)
                total_bytes += len(data)
                frames.append({"path": name, "pts_seconds": pts / Gst.SECOND,
                               "sha256": hashlib.sha256(data).hexdigest(), "size": list(image.size)})
            message = pipeline.get_bus().pop_filtered(Gst.MessageType.EOS | Gst.MessageType.ERROR)
            if message is not None:
                if message.type == Gst.MessageType.ERROR:
                    error, _ = message.parse_error()
                    raise RuntimeError(f"Video decode failed: {error}")
                end_seen = True
            if end_seen and sample is None:
                break
        if not frames or not (end_seen and sample is None):
            raise RuntimeError("Video export did not fully decode within its bound")
        with video.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != checksum:
                raise RuntimeError("Source changed during export")
    finally:
        pipeline.set_state(Gst.State.NULL)
        save_json(output / "index.partial.json", {"frames": frames, "bytes": total_bytes,
                                                  "note": "partial progress only, not acceptance evidence"})
    result = {"schema": "computer-use.native-frames.v1", "capture_manifest": str(manifest_path),
              "video": str(video), "video_sha256": checksum, "frames": frames,
              "bytes": total_bytes, "encoding": "Real decoded frames; JPEG quality90; original timestamps retained"}
    save_json(output / "index.json", result)
    return {"index": str(output / "index.json"), "frames": len(frames), "bytes": total_bytes}


def main() -> None:
    """Require explicit recording/extraction intent and never delete source evidence."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    capture = commands.add_parser("record")
    capture.add_argument("--output-dir", required=True)
    capture.add_argument("--window-id", action="append", required=True)
    capture.add_argument("--region", type=int, nargs=4, required=True)
    capture.add_argument("--seconds", type=int, default=300)
    capture.add_argument("--apply", action="store_true")
    frame = commands.add_parser("frame")
    frame.add_argument("--manifest", required=True)
    frame.add_argument("--apply", action="store_true")
    frame.add_argument("--final", action="store_true", help="Review a stopped clip's final frame, not live desktop state")
    export = commands.add_parser("export")
    export.add_argument("--manifest", required=True)
    export.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    from gi.repository import GLib
    try:
        if args.command == "record":
            result = record(approved_path(args.output_dir), args.window_id, args.region, args.seconds, args.apply)
        elif args.command == "frame":
            result = extract_frame(approved_path(args.manifest), args.apply, args.final)
        else:
            result = export_frames(approved_path(args.manifest), args.apply)
    except (ValueError, RuntimeError, OSError, ImportError, GLib.Error) as error:
        print(json.dumps({"ok": False, "error": str(error),
                          "nextStep": "Inspect retained evidence and current safety state; no alternate capture or cleanup was attempted"}))
        raise SystemExit(1) from error
    print(json.dumps(result, indent=2))
    if result.get("status") == "quarantined":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
