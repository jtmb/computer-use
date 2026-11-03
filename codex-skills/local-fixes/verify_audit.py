"""Verify the inert skill import and build a content-free recursive evidence index."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit

PIN = "177c32635c8884d36524ad404ef6c2acdab35f26"
REPOSITORY = Path(__file__).resolve().parents[2]
REDACTOR = "documents/scripts/redact_docx.py"
UPSTREAM_REDACTOR = "local-fixes/upstream/redact_docx.py.original"
DECISIONS = {"keep", "adapt", "merge", "defer", "exclude"}
LINK = re.compile(r"\[[^\]\n]+\]\(([^\s)]+)(?:\s+[^)]*)?\)")
SIGNALS = {
    "windows-sky": ("@oai/sky", "SendInput", "Windows.Graphics.Capture"),
    "codex-runtime": ("node_repl", "$CODEX_HOME", "load_workspace_dependencies"),
    "artifact-tool": ("@oai/artifact-tool", "artifact_session.js"),
    "artifact-marker": ("mark_artifact_operation_started",),
    "host-citation": (":codex-file-citation", "\ue200visualize"),
    "google-connected": ("mcp__codex_apps__", "gdrive://", "Google Drive plugin"),
    "hosted-pages": ("create_spaces_artifact", "window.openai", "Pages API"),
    "installation": ("pip install", "apt-get install", "npx skills add"),
    "publication": ("kubectl", "Flux", "publish", "upload"),
}


def blob_hash(content: bytes) -> str:
    """Calculate the Git blob identity, including its length header."""
    return hashlib.sha1(
        b"blob " + str(len(content)).encode() + b"\0" + content
    ).hexdigest()


def metadata(text: str) -> dict[str, str]:
    """Read the bundle's single-line name/description fields, not arbitrary YAML."""
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        raise ValueError("Missing skill frontmatter")
    result = {}
    for line in lines[1:]:
        if line == "---":
            break
        key, separator, value = line.partition(":")
        if separator and key in {"name", "description"}:
            result[key] = value.strip().strip("\"'")
    if not all(result.get(key) for key in ("name", "description")):
        raise ValueError("Missing skill name or description")
    return result


def relative_links(path: Path, text: str, bundle: Path) -> list[dict[str, object]]:
    """Inspect inline Markdown file links, excluding fenced illustrative examples."""
    links = []
    fence = ""
    for number, line in enumerate(text.splitlines(), 1):
        stripped = line.lstrip()
        if stripped.startswith(("```", "~~~")):
            marker = stripped[:3]
            if not fence:
                fence = marker
            elif fence == marker:
                fence = ""
            continue
        if fence:
            continue
        for match in LINK.finditer(line):
            target = unquote(match.group(1).strip("<>"))
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            resolved = (path.parent / parsed.path).resolve()
            links.append(
                {
                    "line": number,
                    "target": target,
                    "exists": resolved.exists(),
                    "insideBundle": resolved.is_relative_to(bundle.resolve()),
                }
            )
    return links


def inspect_file(bundle: Path, relative: str, expected_blob: str) -> dict[str, object]:
    """Hash and structurally inspect a file without importing or executing it."""
    path = bundle / relative
    if path.is_symlink() or path.resolve() != path.absolute() or not path.is_file():
        raise ValueError(f"Unsafe or missing imported file: {relative}")
    content = path.read_bytes()
    matches = blob_hash(content) == expected_blob
    if not matches:
        backup = bundle / UPSTREAM_REDACTOR
        if relative != REDACTOR or backup.is_symlink() or not backup.is_file():
            raise ValueError(f"Undocumented import modification: {relative}")
        if (
            backup.resolve() != backup.absolute()
            or blob_hash(backup.read_bytes()) != expected_blob
        ):
            raise ValueError("Redactor upstream copy does not match the pinned blob")
    record: dict[str, object] = {
        "path": relative,
        "pinnedBlob": expected_blob,
        "sha256": hashlib.sha256(content).hexdigest(),
        "bytes": len(content),
        "matchesPin": matches,
        "localDelta": UPSTREAM_REDACTOR if not matches else None,
    }
    if path.suffix.lower() == ".png":
        if content[:8] != b"\x89PNG\r\n\x1a\n" or content[12:16] != b"IHDR":
            raise ValueError(f"Invalid PNG header: {relative}")
        record["inspection"] = "PNG header/dimensions only; not rendered"
        record["dimensions"] = [
            int.from_bytes(content[16:20], "big"),
            int.from_bytes(content[20:24], "big"),
        ]
        return record
    text = content.decode("utf-8")
    record["inspection"] = "UTF-8 content read; lexical/structural scan, not execution"
    record["lines"] = len(text.splitlines())
    record["signals"] = {
        name: [
            number
            for number, line in enumerate(text.splitlines(), 1)
            if any(token in line for token in tokens)
        ]
        for name, tokens in SIGNALS.items()
        if any(token in text for token in tokens)
    }
    if path.suffix == ".py":
        ast.parse(text, filename=relative)
        record["pythonSyntax"] = "pass"
    if path.suffix == ".md":
        record["relativeLinks"] = relative_links(path, text, bundle)
    return record


def inventory_rows(text: str) -> dict[str, tuple[str, str]]:
    """Read only the complete-inventory section and reject duplicate skill rows."""
    section = text.split("## Complete skill inventory and decisions", 1)[1].split(
        "\n## ", 1
    )[0]
    rows = {}
    for line in section.splitlines():
        if not line.startswith("| `"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        directory = cells[0].strip("`")
        if directory in rows or len(cells) != 3 or not all(cells):
            raise ValueError(f"Malformed or duplicate inventory row: {directory}")
        decision(cells[2])
        rows[directory] = (cells[1], cells[2])
    return rows


def decision(text: str) -> str:
    """Require the normalized disposition and an explanation, not just a label."""
    if not text.startswith("**"):
        raise ValueError("Malformed decision")
    label, separator, reason = text[2:].partition("**")
    value = label.removesuffix(".").lower()
    if not separator or value not in DECISIONS or not reason.strip():
        raise ValueError("Malformed decision or missing reason")
    return value


def review_rows(text: str) -> dict[str, tuple[int, str]]:
    """Parse the human evidence report without treating scan counts as a review."""
    sections = re.split(
        r"^## `([^`\n]+)` — ([0-9]+) files?\n", text, flags=re.MULTILINE
    )
    rows = {}
    for index in range(1, len(sections), 3):
        directory, count, body = sections[index : index + 3]
        if directory in rows:
            raise ValueError(f"Duplicate review: {directory}")
        for field in ("Decision", "Evidence", "Fit and risks", "License"):
            marker = f"- **{field}:** "
            if marker not in body or not body.split(marker, 1)[1].strip():
                raise ValueError(f"Missing review {field}: {directory}")
        value = body.split("- **Decision:** ", 1)[1].split()[0].rstrip(".,")
        if value not in DECISIONS:
            raise ValueError(f"Invalid review decision: {directory}")
        rows[directory] = (int(count), value)
    return rows


def verify_deliverables(
    bundle: Path, skills: list[dict[str, object]], inventory: dict[str, tuple[str, str]]
) -> dict[str, object]:
    """Cross-check report coverage, selected roadmap sources and local file links."""
    review = review_rows((bundle / "SKILL-REVIEW.md").read_text())
    expected = {
        str(skill["directory"]): (
            skill["files"],
            decision(inventory[str(skill["directory"])][1]),
        )
        for skill in skills
    }
    if review != expected:
        raise ValueError("Review directory/count/decision mismatch")
    link_count = 0
    plan_sources = set()
    for name in ("AUDIT.md", "SKILL-REVIEW.md", "ADOPTION-PLAN.md"):
        path = bundle / name
        for link in relative_links(path, path.read_text(), bundle):
            link_count += 1
            if not link["exists"]:
                raise ValueError(
                    f"Missing report link: {name}:{link['line']} {link['target']}"
                )
            if name == "ADOPTION-PLAN.md":
                plan_sources.add(str(link["target"]).split("/", 1)[0])
    required_sources = {
        name for name, (_, value) in review.items() if value in {"adapt", "merge"}
    } | {"presentations"}
    if not required_sources <= plan_sources:
        raise ValueError("Roadmap omits selected skill source")
    return {
        "reviewSections": len(review),
        "closureFiles": sum(count for count, _ in review.values()),
        "decisions": dict(
            sorted(Counter(value for _, value in review.values()).items())
        ),
        "localDocumentLinks": link_count,
        "brokenLocalDocumentLinks": 0,
        "roadmapSources": sorted(required_sources),
        "scope": "report structure/path/count consistency; not semantic correctness, anchor checking or adoption acceptance",
    }


def build_index(repository: Path = REPOSITORY) -> dict[str, object]:
    """Bind every imported path to the local immutable Git commit and current bytes."""
    bundle = repository / "codex-skills"
    tree = subprocess.run(
        ["git", "ls-tree", "-r", "-z", PIN, "--", "codex-skills/"],
        cwd=repository,
        check=True,
        capture_output=True,
        timeout=15,
    ).stdout
    records = []
    for entry in tree.split(b"\0"):
        if not entry:
            continue
        attributes, path = entry.split(b"\t", 1)
        mode, kind, expected = attributes.decode().split()
        if mode != "100644" or kind != "blob":
            raise ValueError("Unexpected pinned file kind or mode")
        relative = path.decode().removeprefix("codex-skills/")
        records.append(inspect_file(bundle, relative, expected))
    if len(records) != 494:
        raise ValueError(f"Pinned inventory differs: {len(records)} files")
    directories = sorted({str(record["path"]).split("/")[0] for record in records})
    actual_directories = sorted(path.parent.name for path in bundle.glob("*/SKILL.md"))
    if directories != actual_directories or len(directories) != 30:
        raise ValueError("Pinned and actual skill folders differ")
    actual_paths = {
        str(path.relative_to(bundle))
        for directory in directories
        for path in (bundle / directory).rglob("*")
        if path.is_symlink() or path.is_file()
    }
    if actual_paths != {str(record["path"]) for record in records}:
        raise ValueError("Unexpected or missing file inside imported skill closures")
    skills = [
        {
            "directory": directory,
            "frontmatter": metadata((bundle / directory / "SKILL.md").read_text()),
            "files": sum(
                str(record["path"]).startswith(directory + "/") for record in records
            ),
        }
        for directory in directories
    ]
    rows = inventory_rows((bundle / "AUDIT.md").read_text())
    links = [link for record in records for link in record.get("relativeLinks", [])]
    errors = []
    if set(rows) != set(directories):
        errors.append(
            {
                "inventoryMissing": sorted(set(directories) - set(rows)),
                "inventoryExtra": sorted(set(rows) - set(directories)),
            }
        )
    deliverables = verify_deliverables(bundle, skills, rows) if not errors else None
    return {
        "schema": "codex-skill-audit-index-v1",
        "source": {
            "repository": "jtmb/computer-use",
            "pr": 6,
            "commit": PIN,
            "basis": "local immutable Git objects; no remote freshness claim",
        },
        "scope": "All pinned files hashed and structurally scanned; not a line-by-line security certification or live compatibility test",
        "summary": {
            "files": len(records),
            "skills": len(skills),
            "unchanged": sum(bool(record["matchesPin"]) for record in records),
            "localDeltas": [
                record["path"] for record in records if not record["matchesPin"]
            ],
            "extensions": dict(
                sorted(
                    Counter(
                        Path(str(record["path"])).suffix or "<none>"
                        for record in records
                    ).items()
                )
            ),
            "pythonSyntaxPassed": sum(
                record.get("pythonSyntax") == "pass" for record in records
            ),
            "relativeLinksOutsideFences": len(links),
            "missingRelativeLinks": sum(not bool(link["exists"]) for link in links),
        },
        "inventoryErrors": errors,
        "deliverables": deliverables,
        "skills": skills,
        "files": records,
    }


def main() -> None:
    """Print a read-only report or explicitly generate this audit's owned JSON index."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-index",
        action="store_true",
        help="Generate codex-skills/AUDIT-INDEX.json; no imported files are changed",
    )
    arguments = parser.parse_args()
    index = build_index()
    if arguments.write_index:
        output = REPOSITORY / "codex-skills/AUDIT-INDEX.json"
        if output.is_symlink():
            raise ValueError("Refusing a symlinked report destination")
        if (
            output.exists()
            and json.loads(output.read_text()).get("schema") != index["schema"]
        ):
            raise ValueError("Refusing to overwrite an unrelated report")
        output.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n")
    print(
        json.dumps(
            {
                "summary": index["summary"],
                "inventoryErrors": index["inventoryErrors"],
                "deliverables": index["deliverables"],
            },
            indent=2,
        )
    )
    if index["inventoryErrors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
