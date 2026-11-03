#!/usr/bin/env python3
"""Encode eased camera motion over one genuine native recording's indexed frames."""

from __future__ import annotations

import argparse
import bisect
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from native_capture import SCHEMA, approved_path


def digest(path: Path, maximum_bytes: int) -> str:
    """Hash bounded files without loading entire videos or evidence logs into memory."""
    if not path.is_file() or path.stat().st_size > maximum_bytes:
        raise ValueError("Source file is missing or exceeds its byte bound")
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def number(value: object, label: str, minimum: float, maximum: float) -> float:
    """Reject non-finite or out-of-bound edit coordinates and times."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number")
    if not minimum <= value <= maximum:
        raise ValueError(f"{label} is outside its bounds")
    return float(value)


def validate_plan(plan: dict, size: tuple[int, int], source_range: tuple[float, float]) -> float:
    """Keep source chronology, crop bounds, readable timing and memory explicit."""
    if plan.get("purpose") not in ("tooling-preflight", "action-preview", "final-demo"):
        raise ValueError("Declare tooling-preflight, action-preview or final-demo")
    canvas = plan.get("canvas", [])
    if len(canvas) != 2 or any(type(value) is not int for value in canvas):
        raise ValueError("Canvas needs two integer dimensions")
    number(canvas[0], "canvas width", 480, 1920)
    number(canvas[1], "canvas height", 320, 1440)
    fps = plan.get("fps")
    if type(fps) is not int or not 1 <= fps <= 30:
        raise ValueError("fps must be an integer from 1 to 30")
    segments = plan.get("segments", [])
    if not 1 <= len(segments) <= 20:
        raise ValueError("Choose one to twenty real chronological source segments")
    end = source_range[0]
    duration = 0.0
    for item in segments:
        start = number(item["source_start"], "source_start", source_range[0], source_range[1])
        finish = number(item["source_end"], "source_end", start, source_range[1])
        if start < end:
            raise ValueError("Source segments must not reverse or replay chronology")
        end = finish
        duration += number(item["duration"], "segment duration", 0.1, 60)
    number(duration, "playback duration", 0.5, 60)
    if "poster_time" in plan:
        number(plan["poster_time"], "poster time", 0.25, duration - 0.25)
    count = round(duration * fps)
    if abs(duration * fps - count) > 0.00001 or count * canvas[0] * canvas[1] > 250_000_000:
        raise ValueError("Use frame-aligned timing within the 250-million indexed-pixel budget")
    keys = plan.get("keyframes", [])
    if len(keys) < 2 or keys[0]["at"] != 0 or keys[-1]["at"] != duration:
        raise ValueError("Camera keys must cover the complete playback interval")
    previous = -1.0
    for key in keys:
        at = number(key["at"], "camera time", 0, duration)
        if at <= previous:
            raise ValueError("Camera times must increase strictly")
        previous = at
        crop = key["crop"]
        if len(crop) != 4:
            raise ValueError("Camera crop needs left, top, right, bottom")
        left, top, right, bottom = crop
        number(left, "left", 0, size[0]); number(right, "right", 0, size[0])
        number(top, "top", 0, size[1]); number(bottom, "bottom", 0, size[1])
        if right - left < 160 or bottom - top < 100:
            raise ValueError("Camera crop is too small or reversed")
    return duration


def source_time(segments: list[dict], at: float) -> float:
    """Map edited playback to a single chronological source timeline."""
    elapsed = 0.0
    for item in segments:
        if at <= elapsed + item["duration"]:
            fraction = max(0, (at - elapsed) / item["duration"])
            return item["source_start"] + fraction * (item["source_end"] - item["source_start"])
        elapsed += item["duration"]
    return segments[-1]["source_end"]


def camera_crop(keys: list[dict], at: float) -> tuple[float, ...]:
    """Use smoothstep push-ins/pans with zero velocity at each camera key."""
    for first, second in zip(keys, keys[1:]):
        if at <= second["at"]:
            fraction = max(0, (at - first["at"]) / (second["at"] - first["at"]))
            eased = fraction * fraction * (3 - 2 * fraction)
            return tuple(a + (b - a) * eased for a, b in zip(first["crop"], second["crop"]))
    return tuple(keys[-1]["crop"])


def gif_delays(count: int, fps: int) -> list[int]:
    """Quantize GIF centiseconds without accumulating frame-rate rounding drift."""
    if count < 1 or not 1 <= fps <= 30:
        raise ValueError("Positive frame count and fps1-30 required")
    return [(round((index + 1) * 100 / fps) - round(index * 100 / fps)) * 10 for index in range(count)]


def encode(index_path: Path, plan: dict, output: Path, apply: bool) -> dict:
    """Write a versioned GIF, still and per-frame edit evidence without replacing assets."""
    index_checksum = digest(index_path, 5 * 1024 * 1024)
    index = json.loads(index_path.read_text())
    if index.get("schema") != "computer-use.native-frames.v1" or not index.get("frames"):
        raise ValueError("Use a complete dense export from the native recorder")
    video = approved_path(index["video"])
    if digest(video, 1024 * 1024 * 1024) != index["video_sha256"]:
        raise ValueError("Original video no longer matches the frame export")
    capture_path = approved_path(index["capture_manifest"])
    digest(capture_path, 1024 * 1024)
    capture = json.loads(capture_path.read_text())
    if capture.get("schema") != SCHEMA or capture.get("status") != "stopped" or capture.get("video") != str(video):
        raise ValueError("Frame export must match one stopped owned capture")
    if index_path.parent != capture_path.parent / "frames":
        raise ValueError("Use the frame directory owned by that capture")
    records = index["frames"]
    if len(records) > 5000:
        raise ValueError("Source export exceeds the frame bound")
    times = []
    paths = []
    size = tuple(records[0]["size"])
    if len(size) != 2 or any(type(value) is not int or not 0 < value <= 4096 for value in size):
        raise ValueError("Invalid or excessive source image dimensions")
    total_source_bytes = 0
    for item in records:
        path = approved_path(index_path.parent / item["path"])
        if path.parent != index_path.parent or tuple(item["size"]) != size:
            raise ValueError("Mixed source dimensions or frame directories are refused")
        if digest(path, 16 * 1024 * 1024) != item["sha256"]:
            raise ValueError("Source frame changed after export")
        total_source_bytes += path.stat().st_size
        if total_source_bytes > 512 * 1024 * 1024:
            raise ValueError("Source frame set exceeds 512 MiB")
        timestamp = number(item["pts_seconds"], "source PTS", 0, 3600)
        if times and timestamp < times[-1]:
            raise ValueError("Source frame timestamps are reversed")
        times.append(timestamp); paths.append(path)
    duration = validate_plan(plan, size, (times[0], times[-1]))
    if output.exists() or not output.parent.is_dir():
        raise FileExistsError("Output must be an unused directory with an existing parent")
    evidence_files = []
    for value in plan.get("evidence", []):
        path = approved_path(value)
        if len(evidence_files) >= 20:
            raise ValueError("Execution evidence list exceeds its bound")
        evidence_files.append({"path": str(path), "sha256": digest(path, 16 * 1024 * 1024)})
    if plan["purpose"] != "tooling-preflight" and not evidence_files:
        raise ValueError("Action/final cuts require real execution evidence plus independent human review")
    count = round(duration * plan["fps"])
    delays = gif_delays(count, plan["fps"])
    if not apply:
        return {"dry_run": True, "frames": count, "duration_ms": sum(delays),
                "purpose": plan["purpose"], "manual_review_required": True}
    fonts = Path("/usr/share/fonts/truetype/dejavu")
    font_path = fonts / "DejaVuSans.ttf"
    if not font_path.is_file():
        raise ValueError("Expected font is unavailable; no dependency was installed")
    font = ImageFont.truetype(str(font_path), max(14, plan["canvas"][0] // 60))
    width, height = plan["canvas"]
    preflight = plan["purpose"] == "tooling-preflight"
    caption = "MOTION TOOLING PREFLIGHT - NO TASK ACTIONS" if preflight else "Sample tasks / Real tools and apps / Edited pacing"

    @lru_cache(maxsize=6)
    def source(position: int) -> Image.Image:
        """Bound decoded source memory and preserve the original source pixels."""
        with Image.open(paths[position]) as image:
            if image.size != size:
                raise ValueError("Decoded source dimensions disagree with the export")
            image.load()
            return image.convert("RGB")

    def render(position: int) -> tuple[Image.Image, dict]:
        """Apply only a camera crop, letterboxing, honest margin captions and whole-frame fades."""
        at = position / plan["fps"]
        timestamp = source_time(plan["segments"], at)
        selected = max(0, bisect.bisect_right(times, timestamp) - 1)
        crop = camera_crop(plan["keyframes"], at)
        image = Image.new("RGB", (width, height), "#f4f1ec")
        content = ImageOps.contain(source(selected).crop(crop), (width - 24, height - 76), Image.Resampling.LANCZOS)
        image.paste(content, ((width - content.width) // 2, 36 + (height - 76 - content.height) // 2))
        draw = ImageDraw.Draw(image)
        draw.text((14, 8), "computer-use", font=font, fill="#8e3036")
        draw.text((14, height - 30), caption, font=font, fill="#28282c")
        fade = min(1, at / 0.25, max(0, duration - at - delays[position] / 1000) / 0.25)
        if fade < 1:
            image = Image.blend(Image.new("RGB", image.size, "#f4f1ec"), image, fade)
        return image, {"playback_ms": round(at * 1000), "duration_ms": delays[position],
                       "source_pts_seconds": times[selected], "source_sha256": records[selected]["sha256"],
                       "crop": list(crop), "fade": fade}

    output.mkdir()
    sample_positions = sorted({round((count - 1) * value / 7) for value in range(8)})
    atlas = Image.new("RGB", (width, height * len(sample_positions)))
    for row, position in enumerate(sample_positions):
        atlas.paste(render(position)[0], (0, row * height))
    palette = atlas.quantize(colors=256)
    indexed = []
    edits = []
    for position in range(count):
        image, edit = render(position)
        indexed.append(image.quantize(palette=palette, dither=Image.Dither.NONE)); edits.append(edit)
    gif = output / "preview.gif"
    with gif.open("xb") as stream:
        indexed[0].save(stream, format="GIF", save_all=True, append_images=indexed[1:],
                        duration=delays, loop=0, disposal=1, optimize=True)
    poster_time = plan.get("poster_time", max(0.25, duration - 0.5))
    render(min(count - 1, round(poster_time * plan["fps"])))[0].save(output / "still.png")
    total = 0
    with Image.open(gif) as decoded:
        if decoded.size != (width, height) or decoded.info.get("loop") != 0:
            raise RuntimeError("Encoded dimensions or loop metadata failed")
        decoded_count = decoded.n_frames
        for position in range(decoded_count):
            decoded.seek(position); decoded.load(); total += decoded.info["duration"]
    if total != sum(delays):
        raise RuntimeError("Encoded playback duration differs from the edit")
    result = {"purpose": plan["purpose"], "video": str(video), "video_sha256": index["video_sha256"],
              "index_sha256": index_checksum, "plan": plan,
              "execution_evidence": evidence_files, "edits": edits,
              "output": {"gif": str(gif), "frames": decoded_count, "duration_ms": total, "bytes": gif.stat().st_size},
              "manual_review_required": True, "accepted_main_demo": False,
              "disclosure": "One source timeline; real frames only; eased camera crops; margins and fades; edited playback is not measured execution latency"}
    (output / "evidence.json").write_text(json.dumps(result, indent=2) + "\n")
    return result["output"] | {"purpose": plan["purpose"], "accepted_main_demo": False}


def main() -> None:
    """Preview by default; never publish, replace a main asset, or approve its contents."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    result = encode(approved_path(args.index), json.loads(approved_path(args.plan).read_text()),
                    approved_path(args.output_dir), args.apply)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
