#!/usr/bin/env python3
"""Validate demo staging inputs and review media without starting a capture."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import re
import selectors
import signal
import shutil
import stat
import subprocess
import sys
import time
from typing import Any, Iterator


MAX_OBSERVATION_AGE = dt.timedelta(minutes=2)
MAX_VIDEO_BYTES = 1024 * 1024 * 1024
MAX_PREVIEW_BYTES = 128 * 1024 * 1024
MAX_EVIDENCE_BYTES = 16 * 1024 * 1024
MAX_IMAGE_DIMENSION = 4096
MAX_IMAGE_PIXELS = 16_000_000
MAX_TOTAL_PREVIEW_PIXELS = 250_000_000
MAX_PREVIEW_FRAMES = 500
MAX_FFPROBE_STDOUT_BYTES = 1024 * 1024
MAX_FFPROBE_STDERR_BYTES = 64 * 1024
FFPROBE_TIMEOUT_SECONDS = 30
FILE_READ_CHUNK_BYTES = 64 * 1024
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
WINDOW_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,200}$")


class PreflightError(ValueError):
    """Raised when a static demo input is unsafe or incomplete."""


def _approved_roots() -> tuple[Path, ...]:
    """Return existing non-checkout roots allowed for transient demo artifacts."""
    candidates = (
        Path.home() / "Downloads",
        Path.home() / "Documents",
        Path("/tmp/opencode"),
    )
    roots = []
    for candidate in candidates:
        if candidate.is_dir() and not candidate.is_symlink():
            roots.append(candidate.resolve(strict=True))
    return tuple(roots)


def _absolute_path(value: str | Path, label: str) -> Path:
    """Require an absolute path without traversal components."""
    path = Path(value).expanduser()
    if not path.is_absolute() or ".." in path.parts:
        raise PreflightError(f"{label} must be absolute and contain no '..' component")
    return path


def _reject_symlink_components(path: Path, label: str) -> None:
    """Refuse a path if any existing component is a symlink."""
    for component in (path, *path.parents):
        if component.is_symlink():
            raise PreflightError(f"{label} contains a symlink component")


def _inside(path: Path, root: Path, label: str) -> Path:
    """Resolve a non-symlink path and require it to stay below root."""
    _reject_symlink_components(path, label)
    resolved = path.resolve(strict=False)
    if resolved == root or not resolved.is_relative_to(root):
        raise PreflightError(f"{label} must be a child of the approved root")
    return resolved


def _approved_root(value: str | Path) -> Path:
    """Require one of the output roots allowed by the native recording helper."""
    path = _absolute_path(value, "Approved root")
    _reject_symlink_components(path, "Approved root")
    if not path.is_dir():
        raise PreflightError("Approved root must already exist as a directory")
    resolved = path.resolve(strict=True)
    if resolved not in _approved_roots():
        raise PreflightError("Approved root is not an existing native-recorder output root")
    return resolved


def _stat_identity(info: os.stat_result) -> tuple[int, int, int, int, int, int]:
    """Return identity and mutable-content metadata that is stable across reads."""
    return (
        info.st_dev, info.st_ino, stat.S_IFMT(info.st_mode), info.st_size,
        info.st_mtime_ns, info.st_ctime_ns,
    )


def _same_node(first: os.stat_result, second: os.stat_result) -> bool:
    """Compare filesystem identity without treating directory contents as file data."""
    return (first.st_dev, first.st_ino, stat.S_IFMT(first.st_mode)) == (
        second.st_dev, second.st_ino, stat.S_IFMT(second.st_mode)
    )


class _OpenedRegularFile:
    """Describe a regular file pinned beneath its approved root."""

    def __init__(
        self,
        descriptor: int,
        size: int,
        identity: tuple[int, int, int, int, int, int],
        root_descriptor: int,
        root_identity: tuple[int, int, int],
        parent_descriptor: int,
        name: str,
        directory_chain: tuple[tuple[int, str, tuple[int, int, int]], ...],
        root: Path,
    ) -> None:
        """Store the identities needed to recheck a bounded read."""
        self.descriptor = descriptor
        self.size = size
        self.identity = identity
        self.root_descriptor = root_descriptor
        self.root_identity = root_identity
        self.parent_descriptor = parent_descriptor
        self.name = name
        self.directory_chain = directory_chain
        self.root = root


@contextmanager
def _open_regular_file(
    path: Path, root: Path, label: str, maximum_bytes: int
) -> Iterator[_OpenedRegularFile]:
    """Open a bounded regular file without following links or blocking on special files."""
    resolved = _inside(path, root, label)
    try:
        relative = resolved.relative_to(root)
    except ValueError as error:
        raise PreflightError(f"{label} must remain below the approved root") from error
    if not relative.parts or any(part in (".", "..") for part in relative.parts):
        raise PreflightError(f"{label} must be a child of the approved root")

    required_flags = ("O_CLOEXEC", "O_DIRECTORY", "O_NOFOLLOW", "O_NONBLOCK")
    if any(not hasattr(os, name) for name in required_flags):
        raise PreflightError("This platform cannot safely open bounded demo inputs")
    directory_flags = (
        os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK
    )
    file_flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
    descriptors: list[int] = []
    directory_chain: list[tuple[int, str, tuple[int, int, int]]] = []
    try:
        root_descriptor = os.open(root, directory_flags)
        descriptors.append(root_descriptor)
        root_info = os.fstat(root_descriptor)
        root_path_info = os.stat(root, follow_symlinks=False)
        if not stat.S_ISDIR(root_info.st_mode) or not _same_node(root_info, root_path_info):
            raise PreflightError("Approved root changed while opening the input")
        root_identity = (root_info.st_dev, root_info.st_ino, stat.S_IFMT(root_info.st_mode))
        parent_descriptor = root_descriptor

        for component in relative.parts[:-1]:
            child_descriptor = os.open(component, directory_flags, dir_fd=parent_descriptor)
            descriptors.append(child_descriptor)
            child_info = os.fstat(child_descriptor)
            named_info = os.stat(component, dir_fd=parent_descriptor, follow_symlinks=False)
            if not stat.S_ISDIR(child_info.st_mode) or not _same_node(child_info, named_info):
                raise PreflightError(f"{label} path changed while opening")
            directory_chain.append((
                parent_descriptor,
                component,
                (child_info.st_dev, child_info.st_ino, stat.S_IFMT(child_info.st_mode)),
            ))
            parent_descriptor = child_descriptor

        name = relative.parts[-1]
        descriptor = os.open(name, file_flags, dir_fd=parent_descriptor)
        descriptors.append(descriptor)
        info = os.fstat(descriptor)
        named_info = os.stat(name, dir_fd=parent_descriptor, follow_symlinks=False)
        if not stat.S_ISREG(info.st_mode):
            raise PreflightError(f"{label} must be a non-symlink regular file")
        if not _same_node(info, named_info):
            raise PreflightError(f"{label} changed while opening")
        if info.st_size <= 0 or info.st_size > maximum_bytes:
            raise PreflightError(f"{label} is empty or exceeds its byte bound")

        opened = _OpenedRegularFile(
            descriptor=descriptor,
            size=info.st_size,
            identity=_stat_identity(info),
            root_descriptor=root_descriptor,
            root_identity=root_identity,
            parent_descriptor=parent_descriptor,
            name=name,
            directory_chain=tuple(directory_chain),
            root=root,
        )
        yield opened

        final_info = os.fstat(descriptor)
        named_final_info = os.stat(name, dir_fd=parent_descriptor, follow_symlinks=False)
        if (_stat_identity(final_info) != opened.identity
                or _stat_identity(named_final_info) != opened.identity):
            raise PreflightError(f"{label} changed while it was being read")
        for parent, component, identity in directory_chain:
            current = os.stat(component, dir_fd=parent, follow_symlinks=False)
            if (current.st_dev, current.st_ino, stat.S_IFMT(current.st_mode)) != identity:
                raise PreflightError(f"{label} path changed while it was being read")
        current_root = os.fstat(root_descriptor)
        named_root = os.stat(root, follow_symlinks=False)
        if (not _same_node(current_root, named_root)
                or (current_root.st_dev, current_root.st_ino, stat.S_IFMT(current_root.st_mode))
                != opened.root_identity):
            raise PreflightError("Approved root changed while the input was being read")
    except OSError as error:
        raise PreflightError(f"{label} could not be opened as a bounded regular file") from error
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


def _read_bounded_bytes(opened: _OpenedRegularFile, maximum_bytes: int, label: str) -> bytes:
    """Read at most the declared byte limit plus one growth-detection byte."""
    chunks: list[bytes] = []
    total = 0
    while total <= maximum_bytes:
        chunk = os.read(
            opened.descriptor,
            min(FILE_READ_CHUNK_BYTES, maximum_bytes + 1 - total),
        )
        if not chunk:
            break
        total += len(chunk)
        if total > maximum_bytes:
            raise PreflightError(f"{label} grew beyond its byte bound while being read")
        chunks.append(chunk)
    if total != opened.size:
        raise PreflightError(f"{label} size changed while it was being read")
    return b"".join(chunks)


def _read_regular_bytes(path: Path, root: Path, label: str, maximum_bytes: int) -> bytes:
    """Return bytes acquired through the checked, bounded regular-file reader."""
    with _open_regular_file(path, root, label, maximum_bytes) as opened:
        return _read_bounded_bytes(opened, maximum_bytes, label)


def _read_json_file(path: Path, root: Path, label: str, maximum_bytes: int) -> Any:
    """Read and decode bounded UTF-8 JSON from a checked regular-file descriptor."""
    try:
        content = _read_regular_bytes(path, root, label, maximum_bytes)
        return json.loads(content.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PreflightError(f"{label} is not readable UTF-8 JSON") from error


def _object(value: object, label: str) -> dict[str, Any]:
    """Narrow a decoded JSON value to an object at the JSON boundary."""
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise PreflightError(f"{label} must be a JSON object")
    return value


def _rect(value: object, label: str, minimum_size: bool = False) -> tuple[int, int, int, int]:
    """Validate a logical rectangle with integer coordinates and positive size."""
    if not isinstance(value, list) or len(value) != 4 or any(type(item) is not int for item in value):
        raise PreflightError(f"{label} must contain four integer coordinates")
    x, y, width, height = value
    if width <= 0 or height <= 0 or width > 16384 or height > 16384:
        raise PreflightError(f"{label} has invalid dimensions")
    if minimum_size and (width < 160 or height < 100):
        raise PreflightError(f"{label} is smaller than the recorder's minimum region")
    return x, y, width, height


def _area_intersection(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> int:
    """Return the pixel area shared by two axis-aligned logical rectangles."""
    first_x, first_y, first_width, first_height = first
    second_x, second_y, second_width, second_height = second
    width = min(first_x + first_width, second_x + second_width) - max(first_x, second_x)
    height = min(first_y + first_height, second_y + second_height) - max(first_y, second_y)
    return max(0, width) * max(0, height)


def validate_plan(plan: object, now: dt.datetime | None = None) -> dict[str, object]:
    """Validate fresh operator-supplied geometry and signed-out/sample assertions.

    This validates the declaration only. It cannot inspect compositor state,
    application contents, account state, focus, stacking, or recording authority.
    """
    data = _object(plan, "Plan")
    required = {
        "schema", "observed_at_utc", "screen_rect", "region", "windows",
        "focused_window_id", "privacy_assertions",
    }
    if set(data) != required or data.get("schema") != "computer-use.demo-preflight.v1":
        raise PreflightError("Plan must use the exact computer-use.demo-preflight.v1 schema")

    timestamp = data["observed_at_utc"]
    if not isinstance(timestamp, str):
        raise PreflightError("observed_at_utc must be a UTC ISO-8601 timestamp")
    try:
        observed = dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as error:
        raise PreflightError("observed_at_utc must be a UTC ISO-8601 timestamp") from error
    if observed.tzinfo is None or observed.utcoffset() != dt.timedelta(0):
        raise PreflightError("observed_at_utc must include a UTC offset")
    current = now or dt.datetime.now(dt.timezone.utc)
    age = current - observed
    if age < dt.timedelta(seconds=-30) or age > MAX_OBSERVATION_AGE:
        raise PreflightError("Window geometry observation must be no more than two minutes old")

    screen = _rect(data["screen_rect"], "screen_rect")
    region = _rect(data["region"], "region", minimum_size=True)
    if _area_intersection(screen, region) != region[2] * region[3]:
        raise PreflightError("Capture region extends beyond the observed screen rectangle")

    windows_value = data["windows"]
    if not isinstance(windows_value, list) or len(windows_value) != 2:
        raise PreflightError("Select exactly the OpenCode and browser windows")
    windows: list[tuple[str, str, tuple[int, int, int, int]]] = []
    for entry in windows_value:
        window = _object(entry, "Window")
        if set(window) != {"role", "id", "rect", "visible"}:
            raise PreflightError("Each window needs only role, id, rect, and visible")
        role = window["role"]
        identifier = window["id"]
        if role not in ("opencode", "browser"):
            raise PreflightError("Window roles must be opencode and browser")
        if not isinstance(identifier, str) or not WINDOW_ID_PATTERN.fullmatch(identifier):
            raise PreflightError("Window id must be a fresh, exact compositor ID")
        if window["visible"] is not True:
            raise PreflightError("Both selected windows must be visibly unobstructed")
        rectangle = _rect(window["rect"], f"{role} rect")
        if _area_intersection(screen, rectangle) != rectangle[2] * rectangle[3]:
            raise PreflightError(f"{role} window extends beyond the observed screen")
        windows.append((role, identifier, rectangle))

    if {role for role, _, _ in windows} != {"opencode", "browser"}:
        raise PreflightError("Plan needs one OpenCode window and one browser window")
    identifiers = [identifier for _, identifier, _ in windows]
    if len(set(identifiers)) != 2:
        raise PreflightError("Selected compositor IDs must be distinct")
    if data["focused_window_id"] not in identifiers:
        raise PreflightError("Focus must remain inside one of the selected demo windows")

    intersections: list[tuple[int, int, int, int]] = []
    covered_area = 0
    region_x, region_y, region_width, region_height = region
    for _, _, rectangle in windows:
        left = max(region_x, rectangle[0])
        top = max(region_y, rectangle[1])
        right = min(region_x + region_width, rectangle[0] + rectangle[2])
        bottom = min(region_y + region_height, rectangle[1] + rectangle[3])
        if right <= left or bottom <= top:
            raise PreflightError("Both selected windows must intersect the exact capture region")
        intersection = (left, top, right - left, bottom - top)
        if any(_area_intersection(intersection, previous) for previous in intersections):
            raise PreflightError("Selected window pixels overlap inside the capture region")
        intersections.append(intersection)
        covered_area += intersection[2] * intersection[3]
    if covered_area != region_width * region_height:
        raise PreflightError("Capture region contains pixels outside selected windows or a gap")

    privacy = _object(data["privacy_assertions"], "privacy_assertions")
    expected_assertions = {
        "public_opencode_session",
        "fresh_signed_out_browser_profile",
        "public_or_sample_task_data",
        "no_private_tabs_or_notifications",
        "no_auth_payment_or_credential_surface",
        "both_windows_visible_and_unoccluded",
    }
    if set(privacy) != expected_assertions or any(value is not True for value in privacy.values()):
        raise PreflightError("All six explicit signed-out/sample/privacy assertions must be true")

    return {
        "observed_at_utc": observed.astimezone(dt.timezone.utc).isoformat(),
        "observation_age_seconds": max(0, round(age.total_seconds())),
        "screen_rect": list(screen),
        "region": list(region),
        "window_roles": sorted(role for role, _, _ in windows),
        "operator_assertions": "declared true; not independently verified",
    }


def _module_available(name: str) -> bool:
    """Check whether a Python module can be located without importing it."""
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def _availability() -> dict[str, bool]:
    """Report file/tool availability without contacting a desktop or session bus."""
    return {
        "pygobject_module": _module_available("gi"),
        "gstreamer_inspect_executable": shutil.which("gst-inspect-1.0") is not None,
        "ffprobe_executable": shutil.which("ffprobe") is not None,
        "pillow_module": _module_available("PIL"),
    }


def prepare(plan_path: str | Path, approved_root: str | Path, run_dir: str | Path) -> dict[str, object]:
    """Check an unused run path and fresh, operator-supplied capture geometry."""
    root = _approved_root(approved_root)
    plan_file = _inside(_absolute_path(plan_path, "Plan"), root, "Plan")
    plan_value = _read_json_file(plan_file, root, "Plan", 1024 * 1024)
    geometry = validate_plan(plan_value)

    output = _inside(_absolute_path(run_dir, "Run directory"), root, "Run directory")
    if not output.parent.is_dir():
        raise PreflightError("Run directory parent must already exist")
    if output.exists():
        raise PreflightError("Run directory must be new and unused")

    available = _availability()
    missing = [name for name, found in available.items() if not found]
    return {
        "ok": True,
        "status": "static-inputs-valid" if not missing else "static-inputs-valid-with-tool-gaps",
        "geometry": geometry,
        "available_tools": available,
        "missing_tools": missing,
        "capture_authorized": False,
        "capture_started": False,
        "capture_backend_invoked": False,
        "desktop_or_browser_actions_performed": False,
        "runtime_service_checked": False,
        "manual_review_required": [
            "confirm supplied IDs, focus, visibility, and geometry against a fresh compositor read",
            "visually inspect every source and preview frame for private content",
            "independently verify the real task result and its visible app state",
        ],
    }


def _sha256(path: Path, root: Path, label: str, maximum_bytes: int) -> str:
    """Hash at most the declared bytes from a checked, stable regular file."""
    with _open_regular_file(path, root, label, maximum_bytes) as opened:
        digest = hashlib.sha256()
        total = 0
        while total <= maximum_bytes:
            chunk = os.read(
                opened.descriptor,
                min(FILE_READ_CHUNK_BYTES, maximum_bytes + 1 - total),
            )
            if not chunk:
                break
            total += len(chunk)
            if total > maximum_bytes:
                raise PreflightError(f"{label} grew beyond its byte bound while being hashed")
            digest.update(chunk)
        if total != opened.size:
            raise PreflightError(f"{label} size changed while it was being hashed")
        return digest.hexdigest()


@contextmanager
def _video_snapshot(
    path: Path, root: Path, label: str, maximum_bytes: int
) -> Iterator[tuple[int, str]]:
    """Copy bounded video bytes into a sealed anonymous file for stable probing."""
    if not hasattr(os, "memfd_create") or not hasattr(os, "MFD_ALLOW_SEALING"):
        raise PreflightError("Anonymous bounded media snapshots are unavailable on this platform")
    try:
        with _open_regular_file(path, root, label, maximum_bytes) as opened:
            snapshot = os.memfd_create(
                "demo-preflight-video", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING
            )
            try:
                digest = hashlib.sha256()
                copied = 0
                while copied < opened.size:
                    chunk = os.read(
                        opened.descriptor,
                        min(FILE_READ_CHUNK_BYTES, opened.size - copied),
                    )
                    if not chunk:
                        raise PreflightError(f"{label} was truncated while being snapshotted")
                    copied += len(chunk)
                    digest.update(chunk)
                    view = memoryview(chunk)
                    while view:
                        written = os.write(snapshot, view)
                        if written <= 0:
                            raise OSError("short write to anonymous media snapshot")
                        view = view[written:]
                if os.read(opened.descriptor, 1):
                    raise PreflightError(f"{label} grew beyond its byte bound while being read")
                if copied != opened.size:
                    raise PreflightError(f"{label} size changed while being snapshotted")
                seals = (
                    fcntl.F_SEAL_SEAL | fcntl.F_SEAL_SHRINK
                    | fcntl.F_SEAL_GROW | fcntl.F_SEAL_WRITE
                )
                fcntl.fcntl(snapshot, fcntl.F_ADD_SEALS, seals)
                os.lseek(snapshot, 0, os.SEEK_SET)
                yield snapshot, digest.hexdigest()
            finally:
                os.close(snapshot)
    except OSError as error:
        raise PreflightError(f"{label} could not be safely snapshotted for media review") from error


def _kill_process_group(process: subprocess.Popen[bytes]) -> None:
    """Stop the ffprobe process group so inherited pipe holders cannot outlive it."""
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        pass


def _run_bounded_process(
    command: list[str],
    *,
    timeout_seconds: float,
    stdout_limit: int,
    stderr_limit: int,
    pass_fds: tuple[int, ...] = (),
) -> subprocess.CompletedProcess[bytes]:
    """Capture bounded subprocess output and enforce a deadline on its whole group."""
    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            close_fds=True,
            pass_fds=pass_fds,
            start_new_session=True,
            env={"PATH": os.defpath, "LC_ALL": "C"},
        )
    except OSError as error:
        raise PreflightError("ffprobe could not be started for bounded source-media inspection") from error

    selector = selectors.DefaultSelector()
    captured: dict[int, bytearray] = {}
    limits: dict[int, int] = {}
    streams = (process.stdout, process.stderr)
    output_descriptors = tuple(stream.fileno() if stream is not None else -1 for stream in streams)
    deadline = time.monotonic() + timeout_seconds
    try:
        for stream, limit in zip(streams, (stdout_limit, stderr_limit), strict=True):
            if stream is None:
                raise PreflightError("ffprobe output pipes were not created")
            descriptor = stream.fileno()
            os.set_blocking(descriptor, False)
            selector.register(stream, selectors.EVENT_READ)
            captured[descriptor] = bytearray()
            limits[descriptor] = limit

        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError
            for key, _ in selector.select(remaining):
                stream = key.fileobj
                descriptor = stream.fileno()
                remaining_capacity = limits[descriptor] + 1 - len(captured[descriptor])
                chunk = os.read(descriptor, min(FILE_READ_CHUNK_BYTES, remaining_capacity))
                if not chunk:
                    selector.unregister(stream)
                    stream.close()
                    continue
                captured[descriptor].extend(chunk)
                if len(captured[descriptor]) > limits[descriptor]:
                    raise OverflowError("ffprobe output exceeded its byte bound")

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError
        try:
            return_code = process.wait(timeout=remaining)
        except subprocess.TimeoutExpired as error:
            raise TimeoutError from error
        return subprocess.CompletedProcess(
            command,
            return_code,
            bytes(captured[output_descriptors[0]]),
            bytes(captured[output_descriptors[1]]),
        )
    except TimeoutError as error:
        _kill_process_group(process)
        raise PreflightError("ffprobe exceeded its bounded process deadline") from error
    except OverflowError as error:
        _kill_process_group(process)
        raise PreflightError("ffprobe output exceeded its byte bound") from error
    except PreflightError:
        _kill_process_group(process)
        raise
    except OSError as error:
        _kill_process_group(process)
        raise PreflightError("ffprobe output could not be read safely") from error
    finally:
        selector.close()
        for stream in streams:
            if stream is not None and not stream.closed:
                stream.close()


def _probe_source_video(snapshot: int, executable: str) -> dict[str, object]:
    """Decode-count an immutable bounded MP4 snapshot using ffprobe only."""
    command = [
        executable, "-v", "error", "-protocol_whitelist", "file,pipe", "-count_frames",
        "-select_streams", "v:0", "-show_entries",
        "format=format_name,duration:stream=codec_name,width,height,nb_read_frames",
        "-of", "json", f"/proc/self/fd/{snapshot}",
    ]
    result = _run_bounded_process(
        command,
        timeout_seconds=FFPROBE_TIMEOUT_SECONDS,
        stdout_limit=MAX_FFPROBE_STDOUT_BYTES,
        stderr_limit=MAX_FFPROBE_STDERR_BYTES,
        pass_fds=(snapshot,),
    )
    if result.returncode != 0:
        raise PreflightError("ffprobe could not decode the source video")
    try:
        metadata = _object(json.loads(result.stdout.decode("utf-8")), "ffprobe result")
        format_info = _object(metadata.get("format"), "ffprobe format")
        streams = metadata.get("streams")
        if not isinstance(streams, list) or len(streams) != 1:
            raise PreflightError("Source must contain exactly one selected video stream")
        stream = _object(streams[0], "ffprobe video stream")
        format_name = format_info.get("format_name")
        duration = float(format_info.get("duration", "nan"))
        width = stream.get("width")
        height = stream.get("height")
        frames = int(stream.get("nb_read_frames", "0"))
    except (UnicodeDecodeError, ValueError, TypeError, json.JSONDecodeError) as error:
        raise PreflightError("ffprobe returned incomplete or invalid source-video metadata") from error
    if not isinstance(format_name, str) or "mp4" not in format_name.split(","):
        raise PreflightError("Source file metadata does not identify an MP4 container")
    if not math.isfinite(duration) or not 0 < duration <= 600:
        raise PreflightError("Source-video duration must be between zero and ten minutes")
    if type(width) is not int or type(height) is not int:
        raise PreflightError("Source-video dimensions are unavailable")
    if not 160 <= width <= MAX_IMAGE_DIMENSION or not 100 <= height <= MAX_IMAGE_DIMENSION:
        raise PreflightError("Source-video dimensions are outside the supported bounds")
    if frames <= 0:
        raise PreflightError("ffprobe did not decode any source-video frames")
    return {
        "container": "mp4",
        "codec": str(stream.get("codec_name", "unknown")),
        "dimensions": [width, height],
        "duration_seconds": round(duration, 3),
        "decoded_frames": frames,
    }


def _inspect_gif(path: Path, root: Path) -> tuple[dict[str, object], int]:
    """Decode every GIF frame and check dimensions, motion, timing, and loop seam."""
    try:
        from PIL import Image
    except ImportError as error:
        raise PreflightError("Pillow is unavailable; GIF decoding was not checked") from error
    content = _read_regular_bytes(path, root, "Preview GIF", MAX_PREVIEW_BYTES)
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format != "GIF" or image.n_frames < 2 or image.n_frames > MAX_PREVIEW_FRAMES:
                raise PreflightError("Preview must be a bounded animated GIF with at least two frames")
            width, height = image.size
            if not (480 <= width <= 1920 and 320 <= height <= 1440):
                raise PreflightError("GIF dimensions are outside the motion editor's canvas bounds")
            if (width * height > MAX_IMAGE_PIXELS
                    or width * height * image.n_frames > MAX_TOTAL_PREVIEW_PIXELS):
                raise PreflightError("GIF decoded-pixel budget is exceeded")
            loop = image.info.get("loop")
            if loop != 0:
                raise PreflightError("Preview GIF must declare an infinite loop (loop=0)")
            frame_hashes: list[str] = []
            total_duration = 0
            for index in range(image.n_frames):
                image.seek(index)
                image.load()
                if image.size != (width, height):
                    raise PreflightError("GIF contains inconsistent frame dimensions")
                duration = image.info.get("duration")
                if type(duration) is not int or duration <= 0:
                    raise PreflightError("Every GIF frame must have a positive decoded duration")
                total_duration += duration
                frame_hashes.append(hashlib.sha256(image.convert("RGB").tobytes()).hexdigest())
    except PreflightError:
        raise
    except (OSError, EOFError, ValueError, Image.DecompressionBombError) as error:
        raise PreflightError("Preview GIF did not fully decode") from error
    if not 500 <= total_duration <= 60_000:
        raise PreflightError("Decoded GIF duration must be between 0.5 and 60 seconds")
    if len(set(frame_hashes)) < 2:
        raise PreflightError("GIF does not contain visible motion")
    if frame_hashes[0] != frame_hashes[-1]:
        raise PreflightError("First and last decoded GIF frames do not match at the loop seam")
    return {
        "dimensions": [width, height],
        "frames": len(frame_hashes),
        "duration_ms": total_duration,
        "loop": loop,
        "distinct_frames": len(set(frame_hashes)),
        "loop_seam_matches": True,
    }, len(content)


def _inspect_still(path: Path, root: Path, expected_size: list[int]) -> dict[str, object]:
    """Decode a still PNG and require it to match the animation canvas."""
    try:
        from PIL import Image
    except ImportError as error:
        raise PreflightError("Pillow is unavailable; still-image decoding was not checked") from error
    content = _read_regular_bytes(path, root, "Still image", MAX_PREVIEW_BYTES)
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format != "PNG" or list(image.size) != expected_size:
                raise PreflightError("Still must be a PNG matching the preview dimensions")
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise PreflightError("Still-image pixel budget is exceeded")
            image.verify()
        with Image.open(io.BytesIO(content)) as decoded:
            decoded.load()
    except PreflightError:
        raise
    except (OSError, EOFError, ValueError, Image.DecompressionBombError) as error:
        raise PreflightError("Still PNG did not fully decode") from error
    return {"format": "png", "dimensions": expected_size, "decoded": True}


def review(run_dir: str | Path, preview_dir: str | Path) -> dict[str, object]:
    """Review owned action-preview evidence and bounded media without altering it."""
    run_path = _absolute_path(run_dir, "Run directory")
    _reject_symlink_components(run_path, "Run directory")
    if not run_path.is_dir():
        raise PreflightError("Run directory must already exist")
    run_root = run_path.resolve(strict=True)
    approved_root = next(
        (root for root in sorted(_approved_roots(), key=lambda item: len(item.parts), reverse=True)
         if run_root.is_relative_to(root)),
        None,
    )
    if approved_root is None or run_root == approved_root:
        raise PreflightError("Run directory must be below an existing approved output root")
    preview_path = _inside(_absolute_path(preview_dir, "Preview directory"), run_root, "Preview directory")
    if not preview_path.is_dir():
        raise PreflightError("Preview directory must already exist inside the owned run")

    evidence_path = _inside(preview_path / "evidence.json", run_root, "Preview evidence")
    evidence_value = _read_json_file(evidence_path, run_root, "Preview evidence", 2 * 1024 * 1024)
    evidence = _object(evidence_value, "Preview evidence")
    if evidence.get("purpose") != "action-preview":
        raise PreflightError(
            "Only a real action-preview can pass this review; tooling preflights are not task demos"
        )
    if evidence.get("accepted_main_demo") is not False or evidence.get("manual_review_required") is not True:
        raise PreflightError("Preview evidence must remain unaccepted and require independent review")

    video_value = evidence.get("video")
    video_path = None
    if isinstance(video_value, str):
        video_path = _inside(_absolute_path(video_value, "Source video"), run_root, "Source video")
    if video_path is None or video_path.suffix.lower() != ".mp4":
        raise PreflightError("Action-preview evidence must name its owned MP4 source")
    video_hash = evidence.get("video_sha256")
    if not isinstance(video_hash, str) or not SHA256_PATTERN.fullmatch(video_hash):
        raise PreflightError("Motion-edit evidence is missing its source-video hash")

    index_hash = evidence.get("index_sha256")
    if not isinstance(index_hash, str) or not SHA256_PATTERN.fullmatch(index_hash):
        raise PreflightError("Motion-edit evidence is missing its source-index hash")
    execution_evidence = evidence.get("execution_evidence")
    if not isinstance(execution_evidence, list) or not 1 <= len(execution_evidence) <= 20:
        raise PreflightError("Action preview needs one to twenty real execution-evidence files")
    for record_value in execution_evidence:
        record = _object(record_value, "Execution evidence")
        record_path = record.get("path")
        expected_hash = record.get("sha256")
        if (not isinstance(record_path, str) or not isinstance(expected_hash, str)
                or not SHA256_PATTERN.fullmatch(expected_hash)):
            raise PreflightError("Execution evidence needs a path and SHA-256")
        action_file = _inside(
            _absolute_path(record_path, "Execution evidence"), run_root, "Execution evidence"
        )
        if _sha256(action_file, run_root, "Execution evidence", MAX_EVIDENCE_BYTES) != expected_hash:
            raise PreflightError("Execution evidence changed after the action preview was encoded")

    gif_path = _inside(preview_path / "preview.gif", run_root, "Preview GIF")
    still_path = _inside(preview_path / "still.png", run_root, "Still image")
    output = _object(evidence.get("output"), "Motion-edit output")
    output_gif = output.get("gif")
    if (not isinstance(output_gif, str)
            or _absolute_path(output_gif, "Evidence GIF path").resolve(strict=False) != gif_path):
        raise PreflightError("Motion-edit evidence does not point to this preview GIF")

    gif, gif_bytes = _inspect_gif(gif_path, run_root)
    if output.get("frames") != gif["frames"] or output.get("duration_ms") != gif["duration_ms"]:
        raise PreflightError("Decoded GIF frame count or duration differs from motion-edit evidence")
    if output.get("bytes") != gif_bytes:
        raise PreflightError("Preview GIF byte count differs from motion-edit evidence")
    still = _inspect_still(still_path, run_root, gif["dimensions"])
    ffprobe = shutil.which("ffprobe")
    if ffprobe is None:
        raise PreflightError("ffprobe is unavailable; source-video metadata was not checked")
    with _video_snapshot(video_path, run_root, "Source video", MAX_VIDEO_BYTES) as (
        snapshot, actual_video_hash
    ):
        if actual_video_hash != video_hash:
            raise PreflightError("Original source-video hash differs from the motion-edit evidence")
        source = _probe_source_video(snapshot, ffprobe)

    return {
        "ok": True,
        "status": "media-structure-valid-manual-review-required",
        "source_video": source | {"sha256": video_hash},
        "preview_gif": gif,
        "still_image": still,
        "execution_evidence_files": len(execution_evidence),
        "preview_purpose": "action-preview",
        "accepted_main_demo": False,
        "capture_authorized": False,
        "capture_started": False,
        "capture_backend_invoked": False,
        "assets_or_readme_modified": False,
        "manual_review_required": [
            "watch the complete loop and confirm the actual tool-to-app result remains understandable",
            "inspect every decoded frame and still for private content, readability, and misleading edits",
            "confirm the task outcome against genuine OpenCode actions and visible app state",
            "obtain user preview approval before any separately authorized main-asset replacement",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    """Run a read-only staging or media check and emit machine-readable results."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    staging = commands.add_parser("prepare", help="validate fresh geometry and an unused run path")
    staging.add_argument("--plan", required=True, type=Path)
    staging.add_argument("--approved-root", required=True, type=Path)
    staging.add_argument("--run-dir", required=True, type=Path)
    media = commands.add_parser("review", help="decode and validate an existing action preview")
    media.add_argument("--run-dir", required=True, type=Path)
    media.add_argument("--preview-dir", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "prepare":
            result = prepare(args.plan, args.approved_root, args.run_dir)
        else:
            result = review(args.run_dir, args.preview_dir)
    except (PreflightError, OSError) as error:
        sys.stdout.write(json.dumps({
            "ok": False,
            "status": "blocked",
            "error": str(error),
            "capture_authorized": False,
            "capture_started": False,
            "capture_backend_invoked": False,
        }, indent=2) + "\n")
        return 2
    sys.stdout.write(json.dumps(result, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
