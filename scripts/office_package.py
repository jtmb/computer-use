"""Inspect bounded Office ZIP metadata without parsing XML or extracting files."""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import os
import stat
import struct
import sys
import time
import unicodedata
import zipfile
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO


class PackageRefused(ValueError):
    """The input exceeds this deliberately narrow ZIP inspection contract."""


@dataclass(frozen=True)
class Limits:
    """Declared small-document budgets; callers may select smaller job limits."""

    archive_bytes: int = 32 * 1024 * 1024
    directory_bytes: int = 512 * 1024
    entries: int = 5000
    member_bytes: int = 50 * 1024 * 1024
    total_bytes: int = 512 * 1024 * 1024
    ratio: int = 100
    read_bytes: int = 8 * 1024 * 1024
    seconds: float = 5.0


DEFAULT_LIMITS = Limits()
END = struct.Struct("<4s4H2IH")
CENTRAL = struct.Struct("<4s6H3I5H2I")
LOCAL = struct.Struct("<4s5H3I2H")


def _identity(info: os.stat_result) -> tuple[int, int, int, int, int]:
    """Include change timestamps so metadata drift cannot become success."""
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def _check_source(file: BinaryIO, path: Path, before: os.stat_result) -> None:
    """Check the held descriptor and selected path, without following a final link."""
    current = path.lstat()
    if not stat.S_ISREG(current.st_mode) or _identity(current) != _identity(before):
        raise PackageRefused("Source path changed during inspection")
    if _identity(os.fstat(file.fileno())) != _identity(before):
        raise PackageRefused("Source bytes or metadata changed during inspection")


def _deadline(until: float) -> None:
    """Bound cooperative work; this is not a subprocess or kernel I/O deadline."""
    if time.monotonic() > until:
        raise PackageRefused("Inspection deadline exceeded")


def _name_key(name: str) -> str:
    """Reject unsafe paths and comparison aliases before any member is opened."""
    normalized = unicodedata.normalize("NFKC", name)
    if (
        not name
        or len(name.encode("utf-8")) > 4096
        or "\\" in normalized
        or ":" in normalized
    ):
        raise PackageRefused("Unsafe member name")
    if any(unicodedata.category(char).startswith("C") for char in normalized):
        raise PackageRefused("Control character in member name")
    parts = normalized.removesuffix("/").split("/")
    if any(part in {"", ".", ".."} or part.endswith((" ", ".")) for part in parts):
        raise PackageRefused("Unsafe member path")
    return "/".join(parts).casefold()


def _directory(file: BinaryIO, size: int, limits: Limits, until: float) -> list[str]:
    """Validate the acquisition budget before ZipFile allocates its directory."""
    file.seek(max(0, size - 65557))
    tail = file.read(65557)
    offset = tail.rfind(b"PK\x05\x06")
    if offset < 0 or len(tail) - offset < END.size:
        raise PackageRefused("Missing ZIP end record")
    _, disk, directory_disk, disk_count, count, length, start, comment = (
        END.unpack_from(tail, offset)
    )
    end_offset = size - len(tail) + offset
    if offset + END.size + comment != len(tail):
        raise PackageRefused("Ambiguous or trailing ZIP data")
    if disk or directory_disk or disk_count != count:
        raise PackageRefused("Multi-disk ZIP is unsupported")
    if count == 65535 or length == 0xFFFFFFFF or start == 0xFFFFFFFF:
        raise PackageRefused("ZIP64 is unsupported")
    # A maximum comment puts the locator outside the end-record search window.
    if end_offset >= 20:
        file.seek(end_offset - 20)
        if file.read(4) == b"PK\x06\x07":
            raise PackageRefused("ZIP64 is unsupported")
    if not 0 < count <= limits.entries or length > limits.directory_bytes:
        raise PackageRefused("ZIP directory budget exceeded")
    if start + length != end_offset:
        raise PackageRefused("Unexpected ZIP directory layout")
    file.seek(start)
    directory = file.read(length + 1)
    if len(directory) != length + 1:
        raise PackageRefused("Truncated ZIP directory")
    position = 0
    names: list[str] = []
    destinations: dict[str, bool] = {}
    spans: list[tuple[int, int]] = []
    total = 0
    while position < length:
        _deadline(until)
        if len(names) >= limits.entries or position + CENTRAL.size > length:
            raise PackageRefused("Invalid ZIP directory count")
        fields = CENTRAL.unpack_from(directory, position)
        if fields[0] != b"PK\x01\x02":
            raise PackageRefused("Invalid ZIP directory record")
        flags, method = fields[3:5]
        compressed, expanded = fields[8:10]
        name_length, extra_length, comment_length = fields[10:13]
        next_position = (
            position + CENTRAL.size + name_length + extra_length + comment_length
        )
        if (
            next_position > length
            or fields[13]
            or max(compressed, expanded, fields[16]) == 0xFFFFFFFF
        ):
            raise PackageRefused("Invalid or unsupported ZIP entry")
        if flags & 0x41 or method not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
            raise PackageRefused("Encrypted or unsupported compression")
        if fields[2] > 20:
            raise PackageRefused("ZIP64 or unsupported extractor version")
        raw_name = directory[
            position + CENTRAL.size : position + CENTRAL.size + name_length
        ]
        try:
            name = raw_name.decode("utf-8" if flags & 0x800 else "cp437")
        except UnicodeError as error:
            raise PackageRefused("Invalid member name encoding") from error
        key = _name_key(name)
        is_directory = name.endswith("/")
        if key in destinations:
            raise PackageRefused("Duplicate or normalized member collision")
        mode = stat.S_IFMT(fields[15] >> 16)
        if (
            mode not in {0, stat.S_IFREG, stat.S_IFDIR}
            or (mode == stat.S_IFDIR and not is_directory)
            or (mode == stat.S_IFREG and is_directory)
        ):
            raise PackageRefused("Symlink or special-file member")
        if is_directory and expanded:
            raise PackageRefused("Directory member contains data")
        if (
            expanded > limits.member_bytes
            or expanded > max(1, compressed) * limits.ratio
        ):
            raise PackageRefused("Member expansion budget exceeded")
        total += expanded
        if total > limits.total_bytes:
            raise PackageRefused("Total expansion budget exceeded")
        local_start = fields[16]
        if local_start + LOCAL.size > start:
            raise PackageRefused("Invalid local member offset")
        file.seek(local_start)
        header = file.read(LOCAL.size)
        if len(header) != LOCAL.size:
            raise PackageRefused("Truncated local member header")
        local = LOCAL.unpack(header)
        if local[1] > 20 or 0xFFFFFFFF in local[7:9]:
            raise PackageRefused("ZIP64 or unsupported local extractor version")
        if (
            local[0] != b"PK\x03\x04"
            or local[2:4] != (flags, method)
            or local[9] != name_length
        ):
            raise PackageRefused("Local and central member metadata disagree")
        if not flags & 8 and local[6:9] != (fields[7], compressed, expanded):
            raise PackageRefused("Local and central member sizes or CRC disagree")
        data_start = local_start + LOCAL.size + local[9] + local[10]
        if data_start + compressed > start or file.read(name_length) != raw_name:
            raise PackageRefused("Invalid local member range or name")
        spans.append((local_start, data_start + compressed))
        destinations[key] = is_directory
        names.append(name)
        position = next_position
    if position != length or len(names) != count:
        raise PackageRefused("ZIP directory count mismatch")
    spans.sort()
    for previous, current in itertools.pairwise(spans):
        if previous[1] > current[0]:
            raise PackageRefused("Overlapping ZIP members")
    for key in destinations:
        parts = key.split("/")
        if any(
            destinations.get("/".join(parts[:index])) is False
            for index in range(1, len(parts))
        ):
            raise PackageRefused("Member file/directory collision")
    return names


@contextmanager
def _package(
    path: Path, limits: Limits
) -> Iterator[tuple[BinaryIO, zipfile.ZipFile, float]]:
    """Hold one read-only descriptor through metadata checks and selected reads."""
    for name, value in vars(limits).items():
        if name == "seconds":
            valid = type(value) in {int, float} and math.isfinite(value)
        else:
            valid = type(value) is int
        if not valid or not 0 < value <= getattr(DEFAULT_LIMITS, name):
            raise PackageRefused(
                "Inspection limits must be positive, finite and within defaults"
            )
    until = time.monotonic() + limits.seconds
    with ExitStack() as cleanup:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        cleanup.callback(os.close, descriptor)
        file = cleanup.enter_context(
            os.fdopen(descriptor, "rb", buffering=0, closefd=False)
        )
        before = os.fstat(file.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > limits.archive_bytes:
            raise PackageRefused("Source is not a bounded regular file")
        names = _directory(file, before.st_size, limits, until)
        _check_source(file, path, before)
        with zipfile.ZipFile(file) as archive:
            if archive.namelist() != names:
                raise PackageRefused("ZIP parser directory mismatch")
            yield file, archive, until
        _deadline(until)
        _check_source(file, path, before)


def inspect_package(path: Path, limits: Limits = DEFAULT_LIMITS) -> dict[str, object]:
    """Return source identity and metadata only, never edit/render readiness.

    Args:
        path: Exact selected local ZIP, DOCX or XLSX file; final symlinks refuse.
        limits: Declared job budgets, checked before directory acquisition.

    Returns:
        A summary containing hashes/counts and explicit uninspected boundaries.
    """
    with _package(path, limits) as (file, archive, until):
        members = archive.infolist()
        names = {member.filename for member in members}
        kind = (
            "docx"
            if "word/document.xml" in names
            else "xlsx"
            if "xl/workbook.xml" in names
            else "zip"
        )
        if "word/document.xml" in names and "xl/workbook.xml" in names:
            raise PackageRefused("Ambiguous Office main parts")
        if path.suffix.lower() in {".docx", ".xlsx"} and (
            kind != path.suffix.lower()[1:]
            or not {"[Content_Types].xml", "_rels/.rels"} <= names
        ):
            raise PackageRefused("Office package main parts missing or mismatched")
        file.seek(0)
        digest = hashlib.sha256()
        acquired = 0
        while chunk := file.read(min(65536, limits.archive_bytes + 1 - acquired)):
            _deadline(until)
            acquired += len(chunk)
            if acquired > limits.archive_bytes:
                raise PackageRefused("Source exceeds hard source read budget")
            digest.update(chunk)
        inventory = [
            (member.filename, member.CRC, member.file_size, member.compress_size)
            for member in members
        ]
        features = {
            "macros": any(name.lower().endswith("vbaproject.bin") for name in names),
            "embeddings": any("/embeddings/" in name for name in names),
            "signatures": any(name.startswith("_xmlsignatures/") for name in names),
            "relationships": sum(name.endswith(".rels") for name in names),
            "comments": any("comments" in name.lower() for name in names),
            "footnotes": "word/footnotes.xml" in names,
            "external_link_parts": any(
                name.startswith("xl/externalLinks/") for name in names
            ),
        }
        return {
            "status": "inspected",
            "kind": kind,
            "source_sha256": digest.hexdigest(),
            "inventory_sha256": hashlib.sha256(
                json.dumps(inventory, ensure_ascii=True).encode()
            ).hexdigest(),
            "entries": len(members),
            "declared_expanded_bytes": sum(member.file_size for member in members),
            "features": features,
            "inspection_only": True,
            "xml_inspected": False,
            "payloads_verified": False,
            "external_relationships": "not_inspected",
            "safe_to_render": False,
            "authoring_ready": False,
        }


def read_member(
    path: Path,
    name: str,
    *,
    max_bytes: int = DEFAULT_LIMITS.read_bytes,
    limits: Limits = DEFAULT_LIMITS,
) -> bytes:
    """Read one exact validated member under an acquisition bound, without parsing it."""
    _name_key(name)
    if type(max_bytes) is not int or not 0 < max_bytes <= limits.read_bytes:
        raise PackageRefused("Member read budget is invalid")
    with _package(path, limits) as (_, archive, until):
        try:
            member = archive.getinfo(name)
        except KeyError as error:
            raise PackageRefused("Exact member is absent") from error
        if member.is_dir() or member.file_size > max_bytes:
            raise PackageRefused(
                "Selected member exceeds read budget or is a directory"
            )
        result = bytearray()
        with archive.open(member) as stream:
            while True:
                _deadline(until)
                chunk = stream.read(min(32768, max_bytes + 1 - len(result)))
                if not chunk:
                    break
                result.extend(chunk)
                if len(result) > max_bytes:
                    raise PackageRefused(
                        "Member exceeds hard decompression read budget"
                    )
        if len(result) != member.file_size:
            raise PackageRefused("Member size does not match its directory")
        return bytes(result)


def main() -> int:
    """Emit a non-quoting JSON summary; never extract, parse XML or write a file."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    arguments = parser.parse_args()
    try:
        result = inspect_package(arguments.source)
    except (PackageRefused, OSError, zipfile.BadZipFile, NotImplementedError) as error:
        reason = (
            str(error) if isinstance(error, PackageRefused) else type(error).__name__
        )
        json.dump({"status": "refused", "reason": reason}, sys.stdout)
        sys.stdout.write("\n")
        return 2
    json.dump(result, sys.stdout, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
