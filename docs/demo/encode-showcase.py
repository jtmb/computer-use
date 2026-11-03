#!/usr/bin/env python3
"""Edit verified native-recording frames into the computer-use feature showcase."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SCENES = (
    ("mail", "Find and flag important email", "Thunderbird | Four sample messages -> one invoice -> opened and starred",
     [70, 76, 124, 130, *range(193, 210, 2), 244, 250, *range(258, 267, 2), 292, 304, *range(314, 323, 2), 354]),
    ("youtube", "Find something worth watching", "YouTube | OpenCode focuses search, enters a query, and opens the results",
     [78, 80, *range(88, 98), *range(128, 135), 160, 170, 176]),
    ("amazon", "Research before you buy", "Amazon | Search USB-C hubs, review prices, and inspect a product - no purchase",
     [30, *range(272, 298, 2), 332, 334, 336]),
    ("details", "Check the details, not just the listing", "Amazon | Inspect ports, ratings, and price in the real product page",
     list(range(92, 127, 2))),
)


def compose(path: Path, title: str, detail: str) -> Image.Image:
    """Caption real recorded pixels, cropping only browser chrome/dock/blank edge."""
    with Image.open(path) as source:
        if source.size != (1440, 924):
            raise RuntimeError(f"Unexpected source dimensions: {path}: {source.size}")
        content = source.convert("RGB").crop((65, 85, 1440, 865)).resize((1160, 658))
    image = Image.new("RGB", (1200, 800), "#f4f1ec")
    image.paste(content, (20, 56))
    draw = ImageDraw.Draw(image)
    fonts = Path("/usr/share/fonts/truetype/dejavu")
    heading = ImageFont.truetype(str(fonts / "DejaVuSans-Bold.ttf"), 24)
    small = ImageFont.truetype(str(fonts / "DejaVuSans.ttf"), 16)
    draw.text((20, 14), "computer-use", font=heading, fill="#17171a")
    draw.text((520, 20), "OpenCode desktop tools  /  Real apps  /  Edited pacing", font=small, fill="#8e3036")
    draw.text((24, 726), title, font=heading, fill="#17171a")
    draw.text((24, 766), detail, font=small, fill="#615a58")
    return image


def write_gif(frames: list[Image.Image], durations: list[int], output: Path) -> dict[str, int]:
    """Write a new animation and verify decoded timing, size, and infinite loop."""
    if not frames or len(frames) != len(durations):
        raise RuntimeError("Every real frame needs a playback duration")
    if output.exists():
        raise FileExistsError(output)
    atlas = Image.new("RGB", (1200, 800 * 5))
    for row in range(5):
        atlas.paste(frames[(len(frames) - 1) * row // 4], (0, row * 800))
    palette = atlas.quantize(colors=256)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    with output.open("xb") as stream:
        indexed[0].save(stream, format="GIF", save_all=True, append_images=indexed[1:],
                        duration=durations, loop=0, disposal=1, optimize=True)
    total = 0
    with Image.open(output) as image:
        if image.size != (1200, 800) or image.info.get("loop") != 0:
            raise RuntimeError("GIF dimensions or loop metadata failed verification")
        count = image.n_frames
        for index in range(count):
            image.seek(index)
            image.load()
            total += image.info["duration"]
    if total != sum(durations):
        raise RuntimeError("GIF playback duration changed during encoding")
    return {"frames": count, "duration_ms": total, "bytes": output.stat().st_size}


def main() -> None:
    """Encode inspected source selections without inventing any app states."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frames-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--version", type=int, default=2, help="Unused positive asset version (default: 2)")
    args = parser.parse_args()
    if not args.frames_root.is_dir() or not args.output_dir.is_dir():
        parser.error("Both directories must already exist")
    if args.version < 1:
        parser.error("--version must be positive")
    suffix = f"v{args.version}"
    names = [f"computer-use-showcase-{suffix}.gif", f"email-demo-{suffix}.gif", f"youtube-demo-{suffix}.gif", f"shopping-demo-{suffix}.gif"]
    for name in names + [f"computer-use-showcase-{suffix}.png", f"showcase-evidence-{suffix}.json"]:
        if (args.output_dir / name).exists():
            parser.error(f"Refusing to replace {name}")
    all_frames = []
    all_durations = []
    clips = {}
    selected = []
    for prefix, title, detail, indices in SCENES:
        frames = []
        for index in indices:
            path = args.frames_root / f"{prefix}-{index:04}.jpg"
            frames.append(compose(path, title, detail))
            selected.append({"source": path.name, "source_seconds": index / 2,
                             "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        durations = [180] * len(frames)
        durations[0] = 900
        durations[-1] = 1800
        clips[prefix] = (frames, durations)
        all_frames.extend(frames)
        all_durations.extend(durations)
    results = {names[0]: write_gif(all_frames, all_durations, args.output_dir / names[0])}
    for prefix, name in (("mail", names[1]), ("youtube", names[2])):
        results[name] = write_gif(*clips[prefix], args.output_dir / name)
    frames = clips["amazon"][0] + clips["details"][0]
    durations = clips["amazon"][1] + clips["details"][1]
    results[names[3]] = write_gif(frames, durations, args.output_dir / names[3])
    clips["mail"][0][-1].save(args.output_dir / f"computer-use-showcase-{suffix}.png")
    evidence = {"capture": "Native GNOME screencast; real OpenCode desktop tool actions",
                "editing": "Pauses shortened; real frames only; dock/browser chrome cropped; captions outside app",
                "privacy": "Separate signed-out Chrome profile; isolated Thunderbird local sample mailbox",
                "selections": selected, "outputs": results}
    (args.output_dir / f"showcase-evidence-{suffix}.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
