#!/usr/bin/env python3
"""Replay real, isolated CLI output as a README GIF using optional Pillow."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SIZE = (1100, 620)
COMMANDS = (
    "find .opencode/skills -name SKILL.md | wc -l",
    "./scripts/deploy-global-config.sh --config-dir demo-config",
    "./scripts/deploy-global-config.sh --config-dir demo-config --only opencode.jsonc",
)
CAPTIONS = (
    ("Start with reusable skills", "Desktop, browser, GitHub, creative work, and more."),
    ("Preview before you apply", "See which configuration entries would change. Nothing is written."),
    ("Keep the scope small", "Preview only opencode.jsonc; leave agents and commands alone."),
)


def fingerprint(root: Path) -> dict[str, dict[str, int | str]]:
    """Return content, size, and modification-time evidence for regular files."""
    result = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise RuntimeError(f"Refusing symlink: {path}")
        if path.is_file():
            stat = path.stat()
            result[str(path.relative_to(root))] = {
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "bytes": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
            }
    return result


def prepare(source: Path, destination: Path) -> dict[str, dict[str, int | str]]:
    """Copy only public recording inputs, refusing symlinks before any copy."""
    files = [source / "scripts/deploy-global-config.sh"]
    files.extend(path for path in (source / "global").rglob("*") if path.is_file())
    files.extend((source / ".opencode/skills").glob("*/SKILL.md"))
    for path in files:
        if path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
            raise RuntimeError(f"Refusing symlinked input: {path}")
    destination.mkdir()
    for path in files:
        target = destination / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    return fingerprint(destination)


def capture(repository: Path, command: str, home: Path) -> dict[str, object]:
    """Execute one fixed read-only command without inherited auth/config state."""
    if command not in COMMANDS:
        raise RuntimeError("Command is not in the recording allowlist")
    result = subprocess.run(
        ["/bin/bash", "-o", "pipefail", "-c", command],
        cwd=repository,
        env={"PATH": "/usr/bin:/bin", "HOME": str(home), "LC_ALL": "C"},
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=30,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(f"Recording command failed ({result.returncode}): {result.stdout}")
    return {"command": command, "exit_code": result.returncode, "stdout": result.stdout}


def validate_capture(records: list[dict[str, object]], repository: Path) -> None:
    """Reject missing results, wrong update scopes, or any deployment write."""
    count = len(list((repository / ".opencode/skills").glob("*/SKILL.md")))
    if int(str(records[0]["stdout"]).strip()) != count:
        raise RuntimeError("Skill count does not match the actual source inputs")
    for record, expected in zip(records[1:], (4, 1), strict=True):
        output = str(record["stdout"])
        if output.count("\nupdate: ") != expected or "dry run only" not in output:
            raise RuntimeError("Dry-run output did not prove the expected update scope")
    if (repository / "demo-config").exists():
        raise RuntimeError("Dry run unexpectedly created a target configuration")


def render_frame(command: str, lines: list[str], scene: int) -> Image.Image:
    """Render a labeled transcript, with no fabricated app or assistant UI."""
    fonts = Path("/usr/share/fonts/truetype/dejavu")
    body = ImageFont.truetype(str(fonts / "DejaVuSansMono.ttf"), 17)
    title = ImageFont.truetype(str(fonts / "DejaVuSans-Bold.ttf"), 26)
    small = ImageFont.truetype(str(fonts / "DejaVuSans.ttf"), 16)
    heading = ImageFont.truetype(str(fonts / "DejaVuSans-Bold.ttf"), 22)
    image = Image.new("RGB", SIZE, "#f4f1ec")
    draw = ImageDraw.Draw(image)
    draw.text((30, 22), "computer-use", font=title, fill="#151518")
    draw.text((30, 60), "PREVIEW FIRST. STAY IN CONTROL.", font=small, fill="#6c6260")
    draw.rounded_rectangle((866, 28, 1070, 62), radius=8, fill="#e6d8d5")
    draw.text((881, 36), "REAL CLI / DRY RUN", font=small, fill="#8c292c")
    draw.rounded_rectangle((24, 104, 1076, 466), radius=16, fill="#141418")
    for column, color in enumerate(("#ba4449", "#756c69", "#49484b")):
        draw.ellipse((46 + column * 22, 124, 56 + column * 22, 134), fill=color)
    draw.text((130, 120), "ISOLATED COPY  /  TRANSCRIPT REPLAY", font=small, fill="#aaa2a1")
    rows = textwrap.wrap("$ " + command, width=96, subsequent_indent="  ")
    rows.extend(lines)
    if len(rows) > 12:
        raise RuntimeError("Transcript exceeds the visible terminal; do not clip output")
    for row, line in enumerate(rows):
        color = "#ec9a9b" if row < len(textwrap.wrap("$ " + command, width=96)) else "#eee9e3"
        draw.text((46, 166 + row * 23), line, font=body, fill=color)
    draw.rounded_rectangle((30, 494, 74, 538), radius=10, fill="#a6363d")
    draw.text((40, 502), f"{scene + 1:02}", font=heading, fill="#fff8f4")
    draw.text((90, 491), CAPTIONS[scene][0], font=heading, fill="#19191c")
    draw.text((90, 524), CAPTIONS[scene][1], font=small, fill="#645b59")
    draw.text((30, 577), "Paced stdout replay. Scratch paths shown as $DEMO_REPO. No live settings touched.",
              font=small, fill="#6c6260")
    for step in range(3):
        draw.rounded_rectangle((950 + step * 40, 580, 978 + step * 40, 585), radius=2,
                               fill="#a6363d" if step == scene else "#d5cdca")
    return image


def encode(records: list[dict[str, object]], repository: Path, output: Path, frames_dir: Path) -> dict[str, int]:
    """Encode complete real output with a shared palette and duration checks."""
    if output.exists() or output.with_suffix(".png").exists() or any(frames_dir.iterdir()):
        raise FileExistsError("Refusing an existing asset or stale frame directory")
    frames = []
    durations = []
    poster = None
    for scene, record in enumerate(records):
        output_lines = str(record["stdout"]).replace(str(repository), "$DEMO_REPO").splitlines()
        lines = [part for line in output_lines for part in (textwrap.wrap(line, 96) or [""])]
        for visible in range(len(lines) + 1):
            frame = render_frame(str(record["command"]), lines[:visible], scene)
            frame.save(frames_dir / f"{len(frames):04}.png")
            frames.append(frame)
            durations.append(800 if visible == 0 else 260)
        durations[-1] += (3800, 5400, 5400)[scene]
        if scene == 1:
            poster = frames[-1]
    atlas = Image.new("RGB", (SIZE[0], SIZE[1] * 3))
    for scene in range(3):
        atlas.paste(frames[(len(frames) - 1) * scene // 2], (0, scene * SIZE[1]))
    palette = atlas.quantize(colors=256)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    with output.open("xb") as stream:
        indexed[0].save(stream, format="GIF", save_all=True, append_images=indexed[1:],
                        duration=durations, loop=0, optimize=False, disposal=1)
    with output.with_suffix(".png").open("xb") as stream:
        poster.save(stream, format="PNG")
    decoded_duration = 0
    with Image.open(output) as image:
        if image.size != SIZE or image.info.get("loop") != 0:
            raise RuntimeError("Encoded GIF dimensions or loop metadata are incorrect")
        count = image.n_frames
        for index in range(count):
            image.seek(index)
            image.load()
            decoded_duration += image.info["duration"]
    if decoded_duration != sum(durations):
        raise RuntimeError("Encoded GIF did not preserve playback duration")
    return {"frames": count, "duration_ms": decoded_duration, "bytes": output.stat().st_size}


def main() -> None:
    """Capture, validate, and encode into unused, explicitly selected paths."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Unused .gif path inside this checkout")
    args = parser.parse_args()
    output = args.output.absolute()
    if any(parent.is_symlink() for parent in (output, *output.parents)):
        parser.error("Refusing a symlinked output path")
    output = output.resolve()
    if output.suffix != ".gif" or not output.is_relative_to(ROOT):
        parser.error("--output must be a .gif path inside this checkout")
    if any(path.exists() for path in (output, output.with_suffix(".png"))):
        parser.error("Refusing to replace an existing GIF or poster; select a new version")
    output.parent.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix="readme-demo-", dir="/tmp/opencode"))
    repository = scratch / "repo"
    manifest = prepare(ROOT, repository)
    (scratch / "home").mkdir()
    (scratch / "frames").mkdir()
    records = [capture(repository, command, scratch / "home") for command in COMMANDS]
    (scratch / "actions.json").write_text(json.dumps(records, indent=2) + "\n")
    validate_capture(records, repository)
    if fingerprint(repository) != manifest:
        raise RuntimeError("Recording inputs changed during the dry runs")
    (scratch / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    encoded = encode(records, repository, output, scratch / "frames")
    evidence = {"fixture_integrity": "unchanged", "target_created": False,
                "exit_codes": [record["exit_code"] for record in records], **encoded}
    (scratch / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"scratch": str(scratch), "output": str(output), **evidence}, indent=2))


if __name__ == "__main__":
    main()
