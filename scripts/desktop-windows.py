#!/usr/bin/env python3
"""Call only the bounded, separately enabled GNOME window-control bridge."""

from __future__ import annotations

import argparse
import base64
import binascii
from collections.abc import Callable
import hashlib
import json
import math
import re
import struct
import sys
import time
from typing import BinaryIO
import zlib

BUS = "org.gnome.Shell.Extensions.OpenCodeWindowControl"
OBJECT_PATH = "/org/gnome/Shell/Extensions/OpenCodeWindowControl"
MAX_REPLY_BYTES = 256 * 1024
MAX_REQUEST_BYTES = 16 * 1024
MAX_SERVE_FRAME_BYTES = MAX_REQUEST_BYTES + 1024
PNG_MAX_BYTES = 6_291_456
CAPTURE_MAX_PIXELS = 8_388_608
CAPTURE_CHUNK_BYTES = 49_152
CAPTURE_DEADLINE_MS = 15_000
CAPTURE_CALL_TIMEOUT_MS = 8_000
CAPTURE_CHUNK_DATA_BYTES = (CAPTURE_CHUNK_BYTES // 4) * 3
MAX_CAPTURE_STDOUT_BYTES = 8_912_896
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
WINDOW_ID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]+$", re.IGNORECASE)
DESKTOP_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
INPUT_METHODS = {
    "click": "InputClick",
    "drag": "InputDrag",
    "scroll": "InputScroll",
    "press_key": "InputPressKey",
    "type_text": "InputTypeText",
}
BRIDGE_METHOD_SIGNATURES = {
    "GetState": "",
    "Preview": "s",
    "Apply": "ss",
    "Begin": "s",
    "Chunk": "su",
    "End": "s",
    "Abort": "s",
    "InputBegin": "s",
    "InputClick": "ss",
    "InputDrag": "ss",
    "InputScroll": "ss",
    "InputPressKey": "ss",
    "InputTypeText": "ss",
    "InputReleaseAll": "",
    "Launch": "s",
    "ConfirmLaunch": "ss",
}
_SESSION_BUS_CONNECTION: object | None = None


class CaptureBridgeError(Exception):
    """Carry a bounded D-Bus refusal without exposing backend details as success data."""

    def __init__(self, available: bool, detail: str, unavailable: bool = False) -> None:
        super().__init__(detail)
        self.available = available
        self.detail = detail[:1000]
        self.unavailable = unavailable


class BridgeTransportError(Exception):
    """Carry a bounded D-Bus refusal through a multi-call bridge operation."""

    def __init__(self, available: bool, detail: str, unavailable: bool = False) -> None:
        super().__init__(detail)
        self.available = available
        self.detail = detail[:1000]
        self.unavailable = unavailable


def build_call(command: str, request: str | None, apply: bool, token: str | None) -> tuple[str, tuple[str, ...]]:
    """Validate the CLI boundary before opening a session-bus connection."""
    if command == "list":
        if request is not None or apply or token is not None:
            raise ValueError("list does not accept mutation fields")
        return "GetState", ()
    if command != "act" or request is None or len(request.encode("utf-8")) > 16384:
        raise ValueError("act requires a JSON request no larger than 16 KiB")
    decoded = json.loads(request)
    if not isinstance(decoded, dict):
        raise ValueError("request must be a JSON object")
    if apply != (token is not None):
        raise ValueError("--apply and --expect-token must be supplied together")
    encoded = json.dumps(decoded, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    if token is not None:
        if not 16 <= len(token) <= 128:
            raise ValueError("Invalid preview token length")
        return "Apply", (encoded, token)
    return "Preview", (encoded,)


def decode_reply(text: str) -> dict[str, object]:
    """Reject oversized or non-object responses without evaluating bus output."""
    if len(text.encode("utf-8")) > MAX_REPLY_BYTES:
        raise ValueError("Window bridge reply exceeds 256 KiB")
    decoded = json.loads(text)
    if not isinstance(decoded, dict):
        raise ValueError("Window bridge reply must be a JSON object")
    return decoded


def build_capture_request(request_text: str | None, apply: bool = False, token: str | None = None) -> str:
    """Validate the exact target-only capture request before connecting to D-Bus."""
    if apply or token is not None or request_text is None:
        raise ValueError("capture requires only a JSON request")
    if len(request_text.encode("utf-8")) > MAX_REQUEST_BYTES:
        raise ValueError("capture request exceeds 16 KiB")
    request = json.loads(request_text)
    if not isinstance(request, dict) or not {"windowId"} <= set(request) or not set(request) <= {"windowId", "maxBytes"}:
        raise ValueError("capture request must contain windowId and optional maxBytes")
    window_id = request["windowId"]
    if not isinstance(window_id, str) or not WINDOW_ID_PATTERN.fullmatch(window_id):
        raise ValueError("windowId must have epoch:stable_sequence form")
    if "maxBytes" in request and (
        not isinstance(request["maxBytes"], int)
        or isinstance(request["maxBytes"], bool)
        or not 1 <= request["maxBytes"] <= PNG_MAX_BYTES
    ):
        raise ValueError(f"maxBytes must be an integer from 1 to {PNG_MAX_BYTES}")
    return json.dumps({"windowId": window_id}, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _json_object(text: str, label: str) -> dict[str, object]:
    if not isinstance(text, str):
        raise ValueError(f"{label} must be text")
    if len(text.encode("utf-8")) > MAX_REPLY_BYTES:
        raise ValueError("Capture bridge reply exceeds 256 KiB")
    decoded = json.loads(text)
    if not isinstance(decoded, dict):
        raise ValueError(f"{label} must be a JSON object")
    return decoded


def _validated_request(request_text: str | None, label: str) -> dict[str, object]:
    if request_text is None or len(request_text.encode("utf-8")) > MAX_REQUEST_BYTES:
        raise ValueError(f"{label} request is required and must not exceed 16 KiB")
    decoded = json.loads(request_text)
    if not isinstance(decoded, dict):
        raise ValueError(f"{label} request must be a JSON object")
    return decoded


def _valid_coordinate(request: dict[str, object], field: str) -> bool:
    value = request.get(field)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _valid_duration(request: dict[str, object]) -> bool:
    value = request.get("durationMs", 0)
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 2000


def build_input_request(request_text: str | None) -> dict[str, object]:
    """Validate one bounded observation-bound input action before bus access."""
    request = _validated_request(request_text, "input")
    action = request.get("action")
    if not isinstance(action, str) or action not in INPUT_METHODS:
        raise ValueError("action must be click, drag, scroll, press_key, or type_text")
    observation_id = request.get("observationId")
    if not isinstance(observation_id, str) or not 1 <= len(observation_id) <= 128:
        raise ValueError("observationId must be a non-empty string of at most 128 characters")

    action_fields = {
        "click": {"x", "y", "button", "clickCount", "durationMs", "keyChord"},
        "drag": {"fromX", "fromY", "toX", "toY", "durationMs"},
        "scroll": {"x", "y", "direction", "amount"},
        "press_key": {"key", "durationMs"},
        "type_text": {"text"},
    }
    fields = action_fields[action]
    if set(request) - {"observationId", "action"} - fields:
        raise ValueError("input request contains fields unsupported by its action")
    required_fields = {
        "click": {"x", "y"},
        "drag": {"fromX", "fromY", "toX", "toY"},
        "scroll": {"x", "y", "direction"},
        "press_key": {"key"},
        "type_text": {"text"},
    }[action]
    if not required_fields <= set(request):
        raise ValueError(f"{action} is missing required fields")

    coordinates = {
        "click": ("x", "y"),
        "drag": ("fromX", "fromY", "toX", "toY"),
        "scroll": ("x", "y"),
    }.get(action, ())
    if not all(_valid_coordinate(request, field) for field in coordinates):
        raise ValueError("input coordinates must be finite numbers")
    if action in ("click", "drag", "press_key") and not _valid_duration(request):
        raise ValueError("durationMs must be an integer from 0 to 2000")
    if action == "click":
        button = request.get("button", 1)
        click_count = request.get("clickCount", 1)
        if not isinstance(button, int) or isinstance(button, bool) or not 1 <= button <= 32:
            raise ValueError("button must be an integer from 1 to 32")
        if not isinstance(click_count, int) or isinstance(click_count, bool) or not 1 <= click_count <= 10:
            raise ValueError("clickCount must be an integer from 1 to 10")
        key_chord = request.get("keyChord")
        if key_chord is not None and not (
            isinstance(key_chord, str) and len(key_chord) <= 256
            or isinstance(key_chord, list) and len(key_chord) <= 8
            and all(isinstance(key, str) and len(key) <= 64 for key in key_chord)
        ):
            raise ValueError("keyChord must be a short string or list of strings")
    elif action == "scroll":
        if not isinstance(request["direction"], str) or request["direction"] not in {"up", "down", "left", "right"}:
            raise ValueError("direction must be up, down, left, or right")
        amount = request.get("amount", 1)
        if not isinstance(amount, int) or isinstance(amount, bool) or not 1 <= amount <= 100:
            raise ValueError("amount must be an integer from 1 to 100")
    elif action == "press_key":
        if not isinstance(request["key"], str) or not 1 <= len(request["key"]) <= 128:
            raise ValueError("key must be a non-empty string of at most 128 characters")
    elif action == "type_text":
        text = request["text"]
        if not isinstance(text, str) or len(text) > 1024 or any(not 32 <= ord(char) <= 126 for char in text):
            raise ValueError("text must contain at most 1024 printable ASCII characters")
    return request


def _desktop_id(value: object) -> str:
    if (
        not isinstance(value, str)
        or not DESKTOP_ID_PATTERN.fullmatch(value)
        or "." not in value
        or value.startswith("org.gnome.Shell")
    ):
        raise ValueError("desktopId must be a valid application desktop ID")
    return value


def build_launch_request(request_text: str | None) -> dict[str, object]:
    """Validate one application ID before issuing the fixed Launch method."""
    request = _validated_request(request_text, "launch")
    if set(request) != {"desktopId"}:
        raise ValueError("launch request must contain only desktopId")
    return {"desktopId": _desktop_id(request["desktopId"])}


CONFIRM_MAX_TIMEOUT_MS = 5000


def build_confirm_request(request_text: str | None) -> dict[str, object]:
    """Validate a launch-confirmation capability request.

    The launch token is the capability: the bridge already knows the desktop ID and the
    pre-launch window set it belongs to, so the caller cannot fabricate an "appeared"
    result or confirm another sender's launch. The token is single-use, which is why the
    wait has to happen in the bridge and not by polling here.
    """
    request = _validated_request(request_text, "confirm")
    if "launchToken" not in request or not set(request) <= {"launchToken", "timeoutMs"}:
        raise ValueError("confirm request must contain launchToken and optional timeoutMs")
    token = request["launchToken"]
    if not isinstance(token, str) or not 1 <= len(token) <= 128:
        raise ValueError("launchToken must be a non-empty string of at most 128 characters")
    timeout_ms = request.get("timeoutMs", CONFIRM_MAX_TIMEOUT_MS)
    if not isinstance(timeout_ms, int) or isinstance(timeout_ms, bool) or timeout_ms < 0:
        raise ValueError("timeoutMs must be a non-negative integer")
    return {"launchToken": token, "timeoutMs": min(timeout_ms, CONFIRM_MAX_TIMEOUT_MS)}


def _rect(value: object, label: str) -> dict[str, int]:
    if not isinstance(value, dict) or set(value) != {"x", "y", "width", "height"}:
        raise ValueError(f"{label} is invalid")
    if not all(isinstance(value[key], int) and not isinstance(value[key], bool) for key in value):
        raise ValueError(f"{label} is invalid")
    result = {key: value[key] for key in ("x", "y", "width", "height")}
    if result["width"] <= 0 or result["height"] <= 0:
        raise ValueError(f"{label} is invalid")
    return result


def _capture_metadata(
    begin: dict[str, object],
    window_id: str,
) -> tuple[str, int, int, int, float, dict[str, int], dict[str, int]]:
    handle = begin.get("handle")
    size = begin.get("size")
    width = begin.get("width")
    height = begin.get("height")
    chunk_count = begin.get("chunkCount")
    resource_scale = begin.get("resourceScale")
    buffer_rect = _rect(begin.get("bufferRect"), "Begin bufferRect")
    frame_rect = _rect(begin.get("frameRect"), "Begin frameRect")
    if not isinstance(handle, str) or not 16 <= len(handle) <= 128:
        raise ValueError("Begin returned an invalid capture handle")
    if not all(isinstance(value, int) and not isinstance(value, bool) for value in (size, width, height, chunk_count)):
        raise ValueError("Begin returned invalid capture dimensions")
    if size <= 0 or size > PNG_MAX_BYTES or width <= 0 or height <= 0 or width * height > CAPTURE_MAX_PIXELS:
        raise ValueError("Begin exceeded PNG or pixel limits")
    if not isinstance(resource_scale, (int, float)) or isinstance(resource_scale, bool) or not math.isfinite(resource_scale) or resource_scale <= 0:
        raise ValueError("Begin returned an invalid resource scale")
    expected_chunks = math.ceil(size / CAPTURE_CHUNK_DATA_BYTES)
    if chunk_count != expected_chunks:
        raise ValueError("Begin returned an inconsistent chunk count")
    if begin.get("windowId") != window_id:
        raise ValueError("Begin target does not match the requested window")
    return handle, size, width, height, float(resource_scale), buffer_rect, frame_rect


def _expected_png_layout(width: int, height: int, bit_depth: int, color_type: int, interlace: int) -> tuple[int, list[tuple[int, int]]]:
    channels_by_color = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
    valid_depths = {0: {1, 2, 4, 8, 16}, 2: {8, 16}, 3: {1, 2, 4, 8}, 4: {8, 16}, 6: {8, 16}}
    if color_type not in channels_by_color or bit_depth not in valid_depths[color_type]:
        raise ValueError("PNG IHDR uses an unsupported color type or bit depth")
    bits_per_pixel = channels_by_color[color_type] * bit_depth
    passes = [(0, 0, 1, 1)] if interlace == 0 else [
        (0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4),
        (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2),
    ]
    layout: list[tuple[int, int]] = []
    total = 0
    for start_x, start_y, step_x, step_y in passes:
        pass_width = 0 if width <= start_x else (width - start_x + step_x - 1) // step_x
        pass_height = 0 if height <= start_y else (height - start_y + step_y - 1) // step_y
        if pass_width == 0 or pass_height == 0:
            continue
        row_bytes = (pass_width * bits_per_pixel + 7) // 8
        layout.append((row_bytes, pass_height))
        total += (row_bytes + 1) * pass_height
    return total, layout


def decode_png_dimensions(data: bytes) -> tuple[int, int]:
    """Validate PNG chunk framing, checksums, complete IDAT decompression, and scanline size."""
    if len(data) < len(PNG_SIGNATURE) + 25 or len(data) > PNG_MAX_BYTES or not data.startswith(PNG_SIGNATURE):
        raise ValueError("Capture is not a complete bounded PNG")
    offset = len(PNG_SIGNATURE)
    width = height = bit_depth = color_type = interlace = None
    seen_idat = False
    ended_idat = False
    seen_iend = False
    seen_plte = False
    idat_parts: list[bytes] = []
    critical_chunks = {b"IHDR", b"PLTE", b"IDAT", b"IEND"}
    while offset < len(data):
        if offset + 12 > len(data):
            raise ValueError("PNG chunk header or checksum is truncated")
        chunk_length = struct.unpack_from(">I", data, offset)[0]
        chunk_type = data[offset + 4:offset + 8]
        chunk_end = offset + 12 + chunk_length
        if chunk_end > len(data):
            raise ValueError("PNG chunk data is truncated")
        payload_start = offset + 8
        payload_end = payload_start + chunk_length
        payload = data[payload_start:payload_end]
        expected_crc = struct.unpack_from(">I", data, payload_end)[0]
        actual_crc = zlib.crc32(chunk_type)
        actual_crc = zlib.crc32(payload, actual_crc) & 0xFFFFFFFF
        if expected_crc != actual_crc:
            raise ValueError("PNG chunk checksum does not match")
        if not all(65 <= byte <= 90 or 97 <= byte <= 122 for byte in chunk_type):
            raise ValueError("PNG chunk type is malformed")
        if chunk_type == b"IHDR":
            if offset != len(PNG_SIGNATURE) or width is not None or chunk_length != 13:
                raise ValueError("PNG IHDR must occur exactly once at the start")
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if width <= 0 or height <= 0 or width * height > CAPTURE_MAX_PIXELS:
                raise ValueError("PNG IHDR dimensions exceed the capture limit")
            if compression != 0 or filtering != 0 or interlace not in (0, 1):
                raise ValueError("PNG IHDR uses an unsupported method")
        elif width is None:
            raise ValueError("PNG data appeared before IHDR")
        elif chunk_type == b"PLTE":
            if seen_plte or seen_idat or chunk_length == 0 or chunk_length > 768 or chunk_length % 3:
                raise ValueError("PNG PLTE structure is invalid")
            if color_type in (0, 4):
                raise ValueError("PNG PLTE is forbidden for this color type")
            if color_type == 3 and chunk_length // 3 > 1 << bit_depth:
                raise ValueError("PNG indexed palette exceeds its bit depth")
            seen_plte = True
        elif chunk_type == b"IDAT":
            if ended_idat:
                raise ValueError("PNG IDAT chunks must be consecutive")
            if color_type == 3 and not seen_plte:
                raise ValueError("Indexed PNG is missing PLTE")
            seen_idat = True
            idat_parts.append(payload)
        elif chunk_type == b"IEND":
            if not seen_idat or seen_iend or chunk_length != 0:
                raise ValueError("PNG IEND structure is invalid")
            seen_iend = True
            offset = chunk_end
            if offset != len(data):
                raise ValueError("PNG contains data after IEND")
            break
        else:
            if seen_idat:
                ended_idat = True
            if chunk_type[0] & 0x20 == 0 and chunk_type not in critical_chunks:
                raise ValueError("PNG contains an unknown critical chunk")
        if chunk_type != b"IDAT" and seen_idat and chunk_type != b"IEND":
            ended_idat = True
        offset = chunk_end
    if not seen_iend or width is None or height is None or bit_depth is None or color_type is None or interlace is None:
        raise ValueError("PNG is missing required chunks")
    expected_length, layout = _expected_png_layout(width, height, bit_depth, color_type, interlace)
    compressed = b"".join(idat_parts)
    decoder = zlib.decompressobj()
    try:
        decoded = decoder.decompress(compressed, expected_length + 1)
    except zlib.error as error:
        raise ValueError("PNG IDAT stream cannot be decoded") from error
    if len(decoded) > expected_length or decoder.unconsumed_tail or decoder.unused_data or not decoder.eof:
        raise ValueError("PNG IDAT stream is incomplete or exceeds its decoded size")
    try:
        decoded += decoder.flush()
    except zlib.error as error:
        raise ValueError("PNG IDAT stream cannot be finalized") from error
    if len(decoded) != expected_length:
        raise ValueError("PNG decoded scanline length does not match IHDR")
    position = 0
    for row_bytes, row_count in layout:
        for _ in range(row_count):
            if decoded[position] > 4:
                raise ValueError("PNG scanline uses an invalid filter")
            position += row_bytes + 1
    return width, height


def capture_via_bridge(
    request_text: str,
    call_method: Callable[[str, tuple[object, ...], int], str],
) -> dict[str, object]:
    """Assemble one sender-bound in-memory capture and validate it before returning base64."""
    request = build_capture_request(request_text)
    window_id = json.loads(request)["windowId"]
    max_bytes = json.loads(request_text).get("maxBytes", PNG_MAX_BYTES)
    deadline = time.monotonic() + CAPTURE_DEADLINE_MS / 1000
    handle: str | None = None
    end_returned = False

    def invoke(method: str, arguments: tuple[object, ...]) -> str:
        remaining_ms = int((deadline - time.monotonic()) * 1000)
        if remaining_ms <= 0:
            raise ValueError("Capture deadline exceeded")
        return call_method(method, arguments, min(CAPTURE_CALL_TIMEOUT_MS, remaining_ms))

    try:
        begin = _json_object(invoke("Begin", (request,)), "Begin reply")
        if isinstance(begin.get("handle"), str):
            handle = begin["handle"]
        handle, size, width, height, resource_scale, buffer_rect, frame_rect = _capture_metadata(begin, window_id)
        if size > max_bytes:
            raise ValueError("Capture exceeds the requested maxBytes limit")
        chunks: list[bytes] = []
        assembled_size = 0
        for index in range(begin["chunkCount"]):
            encoded = invoke("Chunk", (handle, index))
            if not isinstance(encoded, str) or len(encoded.encode("ascii", errors="ignore")) != len(encoded) or len(encoded) > CAPTURE_CHUNK_BYTES:
                raise ValueError("Chunk reply exceeds the base64 chunk limit")
            expected_size = min(CAPTURE_CHUNK_DATA_BYTES, size - assembled_size)
            if len(encoded) != math.ceil(expected_size / 3) * 4:
                raise ValueError("Chunk reply has an unexpected length")
            try:
                chunk = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error) as error:
                raise ValueError("Chunk reply is not valid base64") from error
            if len(chunk) != expected_size:
                raise ValueError("Chunk reply decoded to an unexpected size")
            assembled_size += len(chunk)
            if assembled_size > PNG_MAX_BYTES:
                raise ValueError("Assembled PNG exceeds the byte limit")
            chunks.append(chunk)
        if assembled_size != size:
            raise ValueError("Capture is missing PNG bytes")
        end = _json_object(invoke("End", (handle,)), "End reply")
        end_returned = True
        png = b"".join(chunks)
        actual_sha256 = hashlib.sha256(png).hexdigest()
        end_size = end.get("size")
        if end.get("sha256") != actual_sha256 or not isinstance(end_size, int) or isinstance(end_size, bool) or end_size != size:
            raise ValueError("Capture digest or size does not match assembled bytes")
        if end.get("windowId") != window_id or end.get("width") != width or end.get("height") != height:
            raise ValueError("End metadata does not match Begin")
        if end.get("resourceScale") != resource_scale:
            raise ValueError("End resource scale does not match Begin")
        if end.get("epoch") != window_id.split(":", maxsplit=1)[0]:
            raise ValueError("End epoch does not match the requested window")
        observation_id = end.get("observationId")
        if not isinstance(observation_id, str) or not 1 <= len(observation_id) <= 128:
            raise ValueError("End returned an invalid observation ID")
        end_buffer_rect = _rect(end.get("bufferRect"), "End bufferRect")
        end_frame_rect = _rect(end.get("frameRect"), "End frameRect")
        if end_buffer_rect != buffer_rect or end_frame_rect != frame_rect:
            raise ValueError("End geometry does not match Begin")
        png_width, png_height = decode_png_dimensions(png)
        if png_width != width or png_height != height:
            raise ValueError("PNG IHDR dimensions do not match the capture metadata")
        result = {
            "pngBase64": base64.b64encode(png).decode("ascii"),
            "sha256": actual_sha256,
            "width": width,
            "height": height,
            "windowId": window_id,
            "observationId": observation_id,
            "resourceScale": resource_scale,
            "bufferRect": end_buffer_rect,
        }
        if len(json.dumps(result, ensure_ascii=True, separators=(",", ":")).encode("utf-8")) > MAX_CAPTURE_STDOUT_BYTES:
            raise ValueError("Capture JSON output exceeds 8.5 MiB")
        return result
    except Exception:
        if handle is not None and not end_returned:
            try:
                invoke("Abort", (handle,))
            except Exception:
                pass
        raise


def _session_bus_connection(gio: object) -> object:
    """Return the one session-bus connection retained for this process."""
    global _SESSION_BUS_CONNECTION
    if _SESSION_BUS_CONNECTION is None:
        bus_type = getattr(gio, "BusType")
        _SESSION_BUS_CONNECTION = getattr(gio, "bus_get_sync")(bus_type.SESSION, None)
    return _SESSION_BUS_CONNECTION


def call_capture_bridge(request_text: str, connection: object | None = None) -> dict[str, object]:
    """Run a complete capture over one non-activating session-bus connection."""
    try:
        request = build_capture_request(request_text)
    except (ValueError, json.JSONDecodeError) as error:
        return {"available": False, "ok": False, "error": "invalid-request-or-missing-dependency", "detail": str(error)}
    from gi.repository import Gio, GLib

    try:
        if connection is None:
            connection = _session_bus_connection(Gio)
    except GLib.Error as error:
        return {
            "available": False,
            "ok": False,
            "error": "bridge-unavailable",
            "detail": str(error)[:1000],
            "nextStep": "Request approval before installing/enabling the bridge; do not bypass GNOME restrictions",
        }

    signatures = {
        "Begin": ("(s)", 1),
        "Chunk": ("(su)", 2),
        "End": ("(s)", 1),
        "Abort": ("(s)", 1),
    }

    def call_method(method: str, arguments: tuple[object, ...], timeout_ms: int) -> str:
        signature = signatures.get(method)
        if signature is None or len(arguments) != signature[1]:
            raise ValueError("Unsupported capture bridge method or arguments")
        parameters = GLib.Variant(signature[0], arguments)
        try:
            reply = connection.call_sync(
                BUS,
                OBJECT_PATH,
                BUS,
                method,
                parameters,
                GLib.VariantType.new("(s)"),
                Gio.DBusCallFlags.NO_AUTO_START,
                timeout_ms,
                None,
            )
        except GLib.Error as error:
            unavailable = any(error.matches(Gio.dbus_error_quark(), code) for code in (
                Gio.DBusError.SERVICE_UNKNOWN,
                Gio.DBusError.NAME_HAS_NO_OWNER,
            ))
            raise CaptureBridgeError(connection is not None and not unavailable, str(error), unavailable) from error
        return reply.unpack()[0]

    try:
        result = capture_via_bridge(request_text, call_method)
    except CaptureBridgeError as error:
        return {
            "available": error.available,
            "ok": False,
            "error": "bridge-unavailable" if error.unavailable else "bridge-rejected",
            "detail": error.detail,
            "nextStep": "Request approval before installing/enabling the bridge; do not bypass GNOME restrictions"
            if error.unavailable else "Inspect fresh state; do not reuse a failed capture handle",
        }
    except (ValueError, json.JSONDecodeError) as error:
        return {"available": True, "ok": False, "error": "capture-invalid", "detail": str(error)[:1000]}
    return {"available": True, "ok": True, **result}


def input_via_bridge(
    request_text: str,
    call_method: Callable[[str, tuple[object, ...]], str],
) -> dict[str, object]:
    """Begin one observation-bound operation and release any held input on failure."""
    request = build_input_request(request_text)
    observation_id = request["observationId"]
    begin_request = json.dumps({"observationId": observation_id}, separators=(",", ":"))
    begin = _json_object(call_method("InputBegin", (begin_request,)), "InputBegin reply")
    operation_id = begin.get("operationId")
    if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 128:
        raise ValueError("InputBegin returned an invalid operation ID")
    try:
        if begin.get("observationId") != observation_id:
            raise ValueError("InputBegin observation does not match the request")
        method = INPUT_METHODS[request["action"]]
        payload = {key: value for key, value in request.items() if key not in {"observationId", "action"}}
        encoded_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        return _json_object(call_method(method, (operation_id, encoded_payload)), f"{method} reply")
    except Exception:
        try:
            call_method("InputReleaseAll", ())
        except Exception:
            pass
        raise


def release_via_bridge(call_method: Callable[[str, tuple[object, ...]], str]) -> dict[str, object]:
    """Release all held virtual input without requiring an observation token."""
    return _json_object(call_method("InputReleaseAll", ()), "InputReleaseAll reply")


def launch_via_bridge(
    request_text: str,
    call_method: Callable[[str, tuple[object, ...]], str],
) -> dict[str, object]:
    """Launch one named application through the fixed bridge method."""
    request = build_launch_request(request_text)
    result = _json_object(call_method("Launch", (request["desktopId"],)), "Launch reply")
    if result.get("desktopId") != request["desktopId"]:
        raise ValueError("Launch reply desktopId does not match the request")
    before_ids = result.get("beforeWindowIds")
    if not isinstance(before_ids, list) or len(before_ids) > 256 or any(
        not isinstance(window_id, str) or not 1 <= len(window_id) <= 128 for window_id in before_ids
    ):
        raise ValueError("Launch reply returned invalid beforeWindowIds")
    return result


def confirm_via_bridge(
    request_text: str,
    call_method: Callable[[str, tuple[object, ...]], str],
) -> dict[str, object]:
    """Ask the bridge to wait for the launched window and report what appeared."""
    request = build_confirm_request(request_text)
    options_json = json.dumps({"timeoutMs": request["timeoutMs"]}, separators=(",", ":"))
    return _json_object(
        call_method("ConfirmLaunch", (request["launchToken"], options_json)),
        "ConfirmLaunch reply",
    )


def _invoke_fixed_bridge(
    connection: object,
    gio: object,
    glib: object,
    method: str,
    arguments: tuple[object, ...],
    timeout_ms: int = 8000,
) -> str:
    signature = BRIDGE_METHOD_SIGNATURES.get(method)
    if signature is None or len(arguments) != len(signature):
        raise ValueError("Unsupported window bridge method or arguments")
    parameters = glib.Variant(f"({signature})", arguments) if signature else None
    try:
        reply = connection.call_sync(
            BUS,
            OBJECT_PATH,
            BUS,
            method,
            parameters,
            glib.VariantType.new("(s)"),
            gio.DBusCallFlags.NO_AUTO_START,
            timeout_ms,
            None,
        )
    except glib.Error as error:
        unavailable = any(error.matches(gio.dbus_error_quark(), code) for code in (
            gio.DBusError.SERVICE_UNKNOWN,
            gio.DBusError.NAME_HAS_NO_OWNER,
        ))
        raise BridgeTransportError(not unavailable, str(error), unavailable) from error
    return reply.unpack()[0]


def _run_bridge_operation(
    operation: Callable[[object, object, object], dict[str, object]],
    connection: object | None = None,
) -> dict[str, object]:
    try:
        from gi.repository import Gio, GLib
    except ImportError as error:
        return {"available": False, "ok": False, "error": "invalid-request-or-missing-dependency", "detail": str(error)[:1000]}
    try:
        if connection is None:
            connection = _session_bus_connection(Gio)
    except GLib.Error as error:
        return {
            "available": False,
            "ok": False,
            "error": "bridge-unavailable",
            "detail": str(error)[:1000],
            "nextStep": "Request approval before installing/enabling the bridge; do not bypass GNOME restrictions",
        }
    try:
        return {"available": True, "ok": True, **operation(connection, Gio, GLib)}
    except BridgeTransportError as error:
        return {
            "available": error.available,
            "ok": False,
            "error": "bridge-unavailable" if error.unavailable else "bridge-rejected",
            "detail": error.detail,
            "nextStep": "Request approval before installing/enabling the bridge; do not bypass GNOME restrictions"
            if error.unavailable else "Inspect fresh desktop state; do not blindly retry a failed action",
        }
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return {"available": True, "ok": False, "error": "bridge-invalid", "detail": str(error)[:1000]}


def _invalid_request(error: Exception) -> dict[str, object]:
    return {"available": False, "ok": False, "error": "invalid-request-or-missing-dependency", "detail": str(error)[:1000]}


def call_input_bridge(request_text: str | None, connection: object | None = None) -> dict[str, object]:
    try:
        request = build_input_request(request_text)
        normalized = json.dumps(request, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return _invalid_request(error)
    return _run_bridge_operation(lambda connection, gio, glib: input_via_bridge(
        normalized, lambda method, arguments: _invoke_fixed_bridge(connection, gio, glib, method, arguments),
    ), connection)


def call_release_bridge(connection: object | None = None) -> dict[str, object]:
    return _run_bridge_operation(lambda connection, gio, glib: release_via_bridge(
        lambda method, arguments: _invoke_fixed_bridge(connection, gio, glib, method, arguments),
    ), connection)


def call_launch_bridge(request_text: str | None, connection: object | None = None) -> dict[str, object]:
    try:
        request = build_launch_request(request_text)
        normalized = json.dumps(request, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return _invalid_request(error)
    return _run_bridge_operation(lambda connection, gio, glib: launch_via_bridge(
        normalized, lambda method, arguments: _invoke_fixed_bridge(connection, gio, glib, method, arguments),
    ), connection)


def call_confirm_bridge(request_text: str | None, connection: object | None = None) -> dict[str, object]:
    try:
        request = build_confirm_request(request_text)
        normalized = json.dumps(request, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return _invalid_request(error)
    deadline = time.monotonic() + request["timeoutMs"] / 1000

    def invoke(connection: object, gio: object, glib: object, method: str, arguments: tuple[object, ...]) -> str:
        remaining_ms = max(1, int((deadline - time.monotonic()) * 1000))
        return _invoke_fixed_bridge(connection, gio, glib, method, arguments, min(8000, remaining_ms))

    return _run_bridge_operation(lambda connection, gio, glib: confirm_via_bridge(
        normalized,
        lambda method, arguments: invoke(connection, gio, glib, method, arguments),
    ), connection)


def call_bridge(
    method: str,
    arguments: tuple[str, ...],
    connection: object | None = None,
) -> dict[str, object]:
    """Invoke a fixed method with no service activation or fallback mechanism."""
    sizes = {"GetState": 0, "Preview": 1, "Apply": 2}
    if method not in sizes or len(arguments) != sizes[method]:
        raise ValueError("Unsupported window bridge method or arguments")
    from gi.repository import Gio, GLib

    parameters = GLib.Variant("(" + "s" * len(arguments) + ")", arguments) if arguments else None
    try:
        if connection is None:
            connection = _session_bus_connection(Gio)
        reply = connection.call_sync(
            BUS, OBJECT_PATH, BUS, method, parameters, GLib.VariantType.new("(s)"),
            Gio.DBusCallFlags.NO_AUTO_START, 8000, None,
        )
    except GLib.Error as error:
        unavailable = connection is None or any(error.matches(Gio.dbus_error_quark(), code) for code in (
            Gio.DBusError.SERVICE_UNKNOWN, Gio.DBusError.NAME_HAS_NO_OWNER,
        ))
        return {
            "available": not unavailable, "ok": False,
            "error": "bridge-unavailable" if unavailable else "bridge-rejected",
            "detail": str(error)[:1000],
            "nextStep": "Request approval before installing/enabling the bridge; do not bypass GNOME restrictions"
            if unavailable else "Inspect fresh state and request a new preview; do not retry an apply token",
        }
    result = decode_reply(reply.unpack()[0])
    return {"available": True, "ok": True, **result}


def _serve_failure(detail: str, *, error: str = "invalid-request-or-missing-dependency") -> dict[str, object]:
    return {"available": False, "ok": False, "error": error, "detail": detail[:1000]}


def _dispatch_serve_command(
    command: str,
    request: dict[str, object],
    connection: object | None,
) -> dict[str, object]:
    """Dispatch one already-framed request over the retained bus connection."""
    request_text = json.dumps(request, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    if len(request_text.encode("utf-8")) > MAX_REQUEST_BYTES:
        return _serve_failure("request exceeds 16 KiB")
    if command == "capture":
        return call_capture_bridge(request_text, connection)
    if command == "input":
        return call_input_bridge(request_text, connection)
    if command == "release":
        if request:
            return _serve_failure("release request must be empty")
        return call_release_bridge(connection)
    if command == "launch":
        return call_launch_bridge(request_text, connection)
    if command == "confirm":
        return call_confirm_bridge(request_text, connection)
    if command == "list":
        if request:
            return _serve_failure("list request must be empty")
        return call_bridge("GetState", (), connection)
    return _serve_failure("unsupported command")


def _decode_serve_frame(frame: bytes) -> tuple[int | None, str | None, dict[str, object] | None, str | None]:
    """Decode a bounded serve frame without returning any part of its contents."""
    try:
        value = json.loads(frame.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError):
        return None, None, None, "request must be newline-delimited JSON"
    if not isinstance(value, dict):
        return None, None, None, "request must be a JSON object"
    request_id = value.get("id")
    safe_id = request_id if isinstance(request_id, int) and not isinstance(request_id, bool) else None
    if set(value) != {"id", "command", "request"} or safe_id is None:
        return safe_id, None, None, "request must contain an integer id, command, and request"
    command = value.get("command")
    request = value.get("request")
    if not isinstance(command, str) or not isinstance(request, dict):
        return safe_id, None, None, "command must be text and request must be an object"
    return safe_id, command, request, None


def serve_stream(reader: BinaryIO, writer: BinaryIO, connection: object | None = None) -> int:
    """Serve one bounded JSON request at a time until EOF."""
    if connection is None:
        connection = _SESSION_BUS_CONNECTION
    while True:
        frame = reader.readline(MAX_SERVE_FRAME_BYTES + 1)
        if not frame:
            return 0
        oversized = len(frame) > MAX_SERVE_FRAME_BYTES
        if oversized and not frame.endswith(b"\n"):
            while True:
                remainder = reader.readline(4096)
                if not remainder or remainder.endswith(b"\n"):
                    break
        if frame.endswith(b"\n"):
            frame = frame[:-1]
        if frame.endswith(b"\r"):
            frame = frame[:-1]

        request_id: int | None = None
        if oversized:
            result = _serve_failure("request frame exceeds the protocol limit")
        else:
            request_id, command, request, invalid = _decode_serve_frame(frame)
            if invalid is not None:
                result = _serve_failure(invalid)
            else:
                try:
                    result = _dispatch_serve_command(command or "", request or {}, connection)
                    if connection is None:
                        connection = _SESSION_BUS_CONNECTION
                except (ValueError, ImportError, TypeError, json.JSONDecodeError, UnicodeError) as error:
                    result = _serve_failure(str(error))
                except Exception:
                    result = _serve_failure("window bridge operation failed", error="bridge-invalid")

        if result.get("ok") is False and connection is not None:
            is_closed = getattr(connection, "is_closed", None)
            if callable(is_closed) and is_closed() is True:
                result["transportClosed"] = True

        reply_limit = MAX_CAPTURE_STDOUT_BYTES if not oversized and command == "capture" else MAX_REPLY_BYTES
        try:
            encoded_result = json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            if len(encoded_result.encode("utf-8")) > reply_limit:
                detail = "Capture JSON output exceeds 8.5 MiB" if reply_limit == MAX_CAPTURE_STDOUT_BYTES else "Window bridge reply exceeds 256 KiB"
                result = _serve_failure(detail, error="capture-invalid" if reply_limit == MAX_CAPTURE_STDOUT_BYTES else "bridge-invalid")
            response = json.dumps(
                {"id": request_id, **result}, ensure_ascii=False, separators=(",", ":"), allow_nan=False,
            )
            writer.write(response.encode("utf-8") + b"\n")
            writer.flush()
        except (TypeError, ValueError, UnicodeError, RecursionError):
            fallback = {"id": request_id, **_serve_failure("window bridge reply could not be encoded", error="bridge-invalid")}
            writer.write(json.dumps(fallback, separators=(",", ":")).encode("utf-8") + b"\n")
            writer.flush()


def serve() -> int:
    """Run the persistent protocol over stdin and stdout."""
    return serve_stream(sys.stdin.buffer, sys.stdout.buffer)


def main() -> int:
    """Expose bounded GNOME window, capture, input, and launch bridge calls as JSON."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("list", "act", "capture", "input", "release", "launch", "confirm", "serve"))
    parser.add_argument("--request")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expect-token")
    args = parser.parse_args()
    if args.command == "serve":
        return serve()
    try:
        if args.command == "capture":
            if args.apply or args.expect_token is not None:
                raise ValueError("capture does not accept mutation fields")
            result = call_capture_bridge(args.request)
        elif args.command == "input":
            if args.apply or args.expect_token is not None:
                raise ValueError("input does not accept mutation fields")
            result = call_input_bridge(args.request)
        elif args.command == "release":
            if args.request is not None or args.apply or args.expect_token is not None:
                raise ValueError("release does not accept request or mutation fields")
            result = call_release_bridge()
        elif args.command == "launch":
            if args.apply or args.expect_token is not None:
                raise ValueError("launch does not accept mutation fields")
            result = call_launch_bridge(args.request)
        elif args.command == "confirm":
            if args.apply or args.expect_token is not None:
                raise ValueError("confirm does not accept mutation fields")
            result = call_confirm_bridge(args.request)
        else:
            method, arguments = build_call(args.command, args.request, args.apply, args.expect_token)
            result = call_bridge(method, arguments)
    except (ValueError, ImportError, TypeError, json.JSONDecodeError) as error:
        result = {"available": False, "ok": False, "error": "invalid-request-or-missing-dependency", "detail": str(error)}
    if args.command == "capture":
        encoded = json.dumps(result, ensure_ascii=True, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > MAX_CAPTURE_STDOUT_BYTES:
            encoded = json.dumps({"available": True, "ok": False, "error": "capture-invalid", "detail": "Capture JSON output exceeds 8.5 MiB"}, separators=(",", ":"))
        sys.stdout.write(encoded + "\n")
        return 0 if result.get("ok") else 1
    if args.command in {"input", "release", "launch", "confirm"}:
        encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > MAX_REPLY_BYTES:
            encoded = json.dumps({"available": True, "ok": False, "error": "bridge-invalid", "detail": "Window bridge reply exceeds 256 KiB"}, separators=(",", ":"))
        sys.stdout.write(encoded + "\n")
    else:
        json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
