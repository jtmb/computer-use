"""Read-only preflight for the selected document-authoring Python stack.

The candidate JSON is a metadata-only declaration record: it is not a resolved
lock, a rights approval or installation evidence. This program observes the exact
interpreter invoked, its declared site roots, bounded selected distribution
headers and regular module paths. It never imports a third-party module, invokes
import finders, reads wheel or source bytes, resolves dependencies, installs,
repairs, or writes files.

The candidate file is opened read-only with no-follow and non-blocking flags and
must be a bounded regular file. Final symlinks, FIFOs, directories and changed
inputs refuse; parent-directory traversal is not sandboxed. Package discovery is
limited to direct children of the invoked interpreter's declared site roots, not
the working directory, PYTHONPATH extras or another interpreter's environment.

Distribution discovery reads selected ``*.dist-info/METADATA`` identity headers
only, under 16 roots, 4096 directory entries, 64 KiB per metadata file and one
cooperative deadline shared with candidate acquisition and module-path checks.
It does not read ``.egg-info``, ``RECORD``, wheel or source bytes, follow
symlinked roots or members, invoke import finders, or interrupt kernel I/O.

Exit statuses:
    0: inspection completed and every selected distribution/module is present at
       the declared version. License, transitive, import, runtime and format
       gates remain unverified, so document authoring is still not ready.
    1: inspection completed with at least one missing, ambiguous, wrong-version
       or metadata-only dependency, an interpreter mismatch, or a metadata scan
       error.
    2: refused input or usage; no inspection result was produced.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.machinery
import json
import math
import os
import platform
import re
import site
import stat
import sys
import sysconfig
import time
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import cast

EXIT_CLEAR = 0
EXIT_GATES_OPEN = 1
EXIT_REFUSED = 2

DEFAULT_CANDIDATES = (
    Path(__file__).resolve().parent.parent
    / "docs"
    / "document-authoring-candidates-2026-10-30.json"
)

# The selected 2026-10-30 stack, distribution -> top-level module. A candidate
# record may not substitute another package or module for this fixed selection.
KNOWN_CANDIDATES = {
    "python-docx": "docx",
    "lxml": "lxml",
    "defusedxml": "defusedxml",
    "pypdf": "pypdf",
    "pdfplumber": "pdfplumber",
    "reportlab": "reportlab",
    "openpyxl": "openpyxl",
    "xlsxwriter": "xlsxwriter",
    "pandas": "pandas",
}

TOP_LEVEL_KEYS = {
    "schemaVersion",
    "status",
    "checkedDate",
    "target",
    "parentAcquisition",
    "childReview",
    "limits",
    "packages",
}
TARGET_KEYS = {
    "interpreter",
    "versionObserved",
    "implementation",
    "machine",
    "soabiObserved",
    "allNineModuleSpecsAbsent",
}
PACKAGE_KEYS = {
    "distribution",
    "module",
    "version",
    "metadataURL",
    "metadataBytes",
    "requiresPython",
    "declaredLicense",
    "baseRequiresDist",
    "wheel",
}
WHEEL_KEYS = {
    "filename",
    "sha256Declared",
    "bytesDeclared",
    "yanked",
    "uploaded",
}
LIMIT_KEYS = {
    "installationAuthorizedByThisRecord",
    "installed",
    "artifactBytesVerified",
    "resolvedTransitiveClosure",
    "licenseFilesAudited",
    "vulnerabilityReviewComplete",
    "importsTested",
    "python314RuntimeAcceptance",
    "abiOrGlibcCompatibilityVerified",
    "authoringOrHardenedXmlReady",
    "latestVersionVerifiedByParent",
    "extrasSelected",
    "note",
}

_VERSION = re.compile(r"\d+(?:\.\d+){1,3}")
_SHA256 = re.compile(r"[0-9a-f]{64}")
_UPLOADED = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z")
_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_DISTRIBUTION = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


class PreflightRefused(ValueError):
    """The candidate record or acquisition request is outside this contract."""


class DeadlineExceeded(PreflightRefused):
    """A shared cooperative inspection deadline expired; work must stop."""


@dataclass(frozen=True)
class Limits:
    """Hard acquisition budgets; callers may reduce but not raise them."""

    candidate_bytes: int = 1024 * 1024
    seconds: float = 5.0


DEFAULT_LIMITS = Limits()
MAX_SCAN_ROOTS = 16
MAX_SITE_ENTRIES = 4096
MAX_METADATA_BYTES = 65536
MAX_CLI_OUTPUT_BYTES = 512 * 1024


def _normalize_distribution(name: str) -> str:
    """Normalize a distribution name using PEP 503 comparison rules."""
    return re.sub(r"[-_.]+", "-", name).lower()


def _identity(info: os.stat_result) -> tuple[int, int, int, int, int]:
    """Include change timestamps so metadata drift cannot become success."""
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def _checked_limits(limits: Limits) -> None:
    """Reject disabled, widened or non-finite acquisition budgets."""
    if not isinstance(limits, Limits):
        raise PreflightRefused("acquisition limits must be a Limits instance")
    byte_limit = limits.candidate_bytes
    seconds = limits.seconds
    if (
        type(byte_limit) is not int
        or not 0 < byte_limit <= DEFAULT_LIMITS.candidate_bytes
    ):
        raise PreflightRefused(
            "acquisition limits must be positive, finite and within defaults"
        )
    if (
        type(seconds) not in {int, float}
        or not math.isfinite(seconds)
        or not 0 < seconds <= DEFAULT_LIMITS.seconds
    ):
        raise PreflightRefused(
            "acquisition limits must be positive, finite and within defaults"
        )


def _deadline(until: float) -> None:
    """Bound cooperative acquisition; this is not a kernel I/O deadline."""
    if time.monotonic() > until:
        raise DeadlineExceeded("inspection deadline exceeded")


def _read_chunk(descriptor: int, size: int) -> bytes:
    """Keep one bounded read point so growth and replacement are testable."""
    return os.read(descriptor, size)


def _check_identity(descriptor: int, path: Path, before: os.stat_result) -> None:
    """Recheck the held descriptor and the selected path without following links."""
    try:
        current = path.lstat()
    except (OSError, ValueError) as error:
        raise PreflightRefused("candidate record changed during acquisition") from error
    if not stat.S_ISREG(current.st_mode) or _identity(current) != _identity(before):
        raise PreflightRefused("candidate record changed during acquisition")
    if _identity(os.fstat(descriptor)) != _identity(before):
        raise PreflightRefused("candidate record changed during acquisition")


def _acquire(
    path: Path,
    limits: Limits,
    *,
    until: float | None = None,
) -> tuple[bytes, str]:
    """Read one bounded file through a no-follow descriptor.

    Args:
        path: Exact regular file to acquire.
        limits: Byte budget and a fallback relative deadline.
        until: Absolute cooperative deadline shared with the caller. When
            omitted, a fresh deadline of ``limits.seconds`` is used.

    Returns:
        The acquired bytes and their SHA-256 digest.

    Raises:
        DeadlineExceeded: The shared deadline expired before or during reading.
        PreflightRefused: The file is not a bounded unchanged regular file.
    """
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except (OSError, ValueError) as error:
        raise PreflightRefused(
            "candidate record is not a readable regular file"
        ) from error
    try:
        before = os.fstat(descriptor)
        if (
            not stat.S_ISREG(before.st_mode)
            or not 0 < before.st_size <= limits.candidate_bytes
        ):
            raise PreflightRefused("candidate record is not a bounded regular file")
        if until is None:
            deadline = time.monotonic() + limits.seconds
        else:
            if type(until) not in {int, float} or not math.isfinite(until):
                raise PreflightRefused("inspection deadline is invalid")
            deadline = float(until)
        chunks: list[bytes] = []
        total = 0
        while True:
            _deadline(deadline)
            chunk = _read_chunk(
                descriptor, min(65536, limits.candidate_bytes + 1 - total)
            )
            if not chunk:
                break
            total += len(chunk)
            if total > limits.candidate_bytes:
                raise PreflightRefused("candidate record exceeds byte budget")
            chunks.append(chunk)
            _deadline(deadline)
        data = b"".join(chunks)
        if len(data) != before.st_size:
            raise PreflightRefused("candidate record changed during acquisition")
        _check_identity(descriptor, path, before)
    finally:
        os.close(descriptor)
    return data, hashlib.sha256(data).hexdigest()


def _require_mapping(value: object, label: str) -> dict[str, object]:
    """Require a JSON object at a named schema position."""
    if not isinstance(value, dict):
        raise PreflightRefused(f"{label} must be a JSON object")
    return cast(dict[str, object], value)


def _require_exact_keys(
    mapping: dict[str, object],
    required: set[str],
    optional: set[str],
    label: str,
) -> None:
    """Refuse missing, duplicate-by-alias or unexpected schema fields."""
    present = set(mapping)
    if present - required - optional:
        raise PreflightRefused(f"{label} has an unexpected field")
    if required - present:
        raise PreflightRefused(f"{label} is missing a required field")


def _require_text(value: object, label: str, maximum: int = 4000) -> str:
    """Require a bounded non-empty string."""
    if not isinstance(value, str) or not 0 < len(value) <= maximum:
        raise PreflightRefused(f"{label} must be a bounded non-empty string")
    return value


def _require_int(value: object, label: str, minimum: int = 1) -> int:
    """Require a real integer, excluding booleans and floats."""
    if type(value) is not int or value < minimum:
        raise PreflightRefused(f"{label} must be an integer >= {minimum}")
    return value


def _require_bool(value: object, label: str) -> bool:
    """Require a real boolean value."""
    if type(value) is not bool:
        raise PreflightRefused(f"{label} must be a boolean")
    return value


def _require_text_list(value: object, label: str) -> list[str]:
    """Require a bounded list of short strings without evaluating them."""
    if not isinstance(value, list) or len(value) > 64:
        raise PreflightRefused(f"{label} must be a bounded JSON string list")
    items: list[str] = []
    for item in value:
        items.append(_require_text(item, label, maximum=500))
    return items


def _parse_record(data: bytes) -> dict[str, object]:
    """Decode strict UTF-8 JSON while refusing duplicate object keys."""
    try:
        text = data.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise PreflightRefused("candidate record is not valid UTF-8 JSON") from error

    def unique_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
        """Build one object; a repeated JSON key is ambiguous input."""
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise PreflightRefused("candidate record has duplicate JSON keys")
            result[key] = value
        return result

    def finite_constant(value: str) -> object:
        """Refuse JSON extensions that Python would otherwise accept."""
        raise PreflightRefused(f"candidate record has a non-finite {value} value")

    try:
        parsed = json.loads(
            text,
            object_pairs_hook=unique_pairs,
            parse_constant=finite_constant,
        )
    except RecursionError as error:
        raise PreflightRefused("candidate record is too deeply nested") from error
    except json.JSONDecodeError as error:
        raise PreflightRefused("candidate record is not valid JSON") from error
    return _require_mapping(parsed, "record")


def _validate_target(target: object) -> dict[str, object]:
    """Validate the recorded interpreter observation fields."""
    mapping = _require_mapping(target, "target")
    _require_exact_keys(mapping, TARGET_KEYS, set(), "target")
    interpreter = _require_text(mapping["interpreter"], "target.interpreter", 500)
    if not os.path.isabs(interpreter):
        raise PreflightRefused("target.interpreter must be an absolute path")
    observed_version = _require_text(
        mapping["versionObserved"], "target.versionObserved", 40
    )
    if not _VERSION.fullmatch(observed_version):
        raise PreflightRefused("target.versionObserved is not a dotted version")
    implementation = _require_text(
        mapping["implementation"], "target.implementation", 80
    )
    machine = _require_text(mapping["machine"], "target.machine", 80)
    soabi = _require_text(mapping["soabiObserved"], "target.soabiObserved", 120)
    _require_bool(
        mapping["allNineModuleSpecsAbsent"], "target.allNineModuleSpecsAbsent"
    )
    return {
        "interpreter": interpreter,
        "version_observed": observed_version,
        "implementation": implementation,
        "machine": machine,
        "soabi_observed": soabi,
    }


def _validate_limits(limits: object) -> dict[str, object]:
    """Validate metadata-only claim fields without treating them as evidence."""
    mapping = _require_mapping(limits, "limits")
    if set(mapping) - LIMIT_KEYS:
        raise PreflightRefused("limits has an unexpected field")
    core = {"installationAuthorizedByThisRecord", "installed"}
    if core - set(mapping):
        raise PreflightRefused("limits is missing a required field")
    claims: dict[str, bool] = {}
    for key in LIMIT_KEYS - {"extrasSelected", "note"}:
        if key in mapping:
            claims[key] = _require_bool(mapping[key], f"limits.{key}")
    extras = mapping.get("extrasSelected", [])
    if _require_text_list(extras, "limits.extrasSelected"):
        raise PreflightRefused("candidate record selects extras; none are approved")
    if "note" in mapping:
        _require_text(mapping["note"], "limits.note", 4000)
    return claims


def _validate_provenance(record: dict[str, object]) -> tuple[int, int]:
    """Validate metadata acquisition caps and return per-response/aggregate limits."""
    acquisition = _require_mapping(
        record["parentAcquisition"], "parentAcquisition"
    )
    per_response = _require_int(
        acquisition.get("perResponseCapBytes"), "parentAcquisition.perResponseCapBytes"
    )
    aggregate = _require_int(
        acquisition.get("aggregateCapBytes"), "parentAcquisition.aggregateCapBytes"
    )
    if per_response > aggregate:
        raise PreflightRefused("acquisition caps are inconsistent")
    timeout = acquisition.get("socketTimeoutSeconds")
    if (
        type(timeout) not in {int, float}
        or not math.isfinite(timeout)
        or not 0 < timeout <= 600
    ):
        raise PreflightRefused(
            "parentAcquisition.socketTimeoutSeconds must be a bounded number"
        )
    downloads = acquisition.get("artifactDownloads", 0)
    if type(downloads) is not int or downloads < 0:
        raise PreflightRefused(
            "parentAcquisition.artifactDownloads must be a non-negative integer"
        )
    _require_mapping(record["childReview"], "childReview")
    return per_response, aggregate


def _validate_wheel(
    wheel: object, distribution: str, version: str, label: str
) -> dict[str, object]:
    """Validate declared wheel identity fields; no artifact bytes are read."""
    mapping = _require_mapping(wheel, f"{label}.wheel")
    _require_exact_keys(mapping, WHEEL_KEYS, set(), f"{label}.wheel")
    filename = _require_text(mapping["filename"], f"{label}.wheel.filename", 300)
    expected_prefix = f"{distribution.replace('-', '_')}-{version}-"
    if (
        not filename.startswith(expected_prefix)
        or not filename.endswith(".whl")
        or filename != os.path.basename(filename)
        or "/" in filename
        or "\\" in filename
    ):
        raise PreflightRefused(f"{label}.wheel.filename is not a safe exact wheel")
    digest = _require_text(
        mapping["sha256Declared"], f"{label}.wheel.sha256Declared", 64
    )
    if not _SHA256.fullmatch(digest):
        raise PreflightRefused(f"{label}.wheel.sha256Declared is not lowercase hex")
    size = _require_int(mapping["bytesDeclared"], f"{label}.wheel.bytesDeclared")
    if _require_bool(mapping["yanked"], f"{label}.wheel.yanked"):
        raise PreflightRefused(f"{label}.wheel is yanked")
    uploaded = _require_text(
        mapping["uploaded"], f"{label}.wheel.uploaded", 40
    )
    if not _UPLOADED.fullmatch(uploaded):
        raise PreflightRefused(f"{label}.wheel.uploaded is not an ISO timestamp")
    return {
        "filename": filename,
        "sha256_declared": digest,
        "bytes_declared": size,
        "uploaded": uploaded,
    }


def _validate_package(
    package: object, index: int, per_response: int
) -> dict[str, object]:
    """Validate one selected candidate and return its declaration-only view."""
    label = f"packages[{index}]"
    mapping = _require_mapping(package, label)
    _require_exact_keys(mapping, PACKAGE_KEYS, {"declaredExtras"}, label)
    distribution = _require_text(mapping["distribution"], f"{label}.distribution", 80)
    normalized = _normalize_distribution(distribution)
    if not _DISTRIBUTION.fullmatch(normalized) or normalized not in KNOWN_CANDIDATES:
        raise PreflightRefused(f"{label} is an unknown candidate distribution")
    module = _require_text(mapping["module"], f"{label}.module", 80)
    if not _IDENTIFIER.fullmatch(module):
        raise PreflightRefused(f"{label}.module is not a top-level identifier")
    if module != KNOWN_CANDIDATES[normalized]:
        raise PreflightRefused(
            f"{label}.module does not match the selected distribution"
        )
    version = _require_text(mapping["version"], f"{label}.version", 40)
    if not _VERSION.fullmatch(version):
        raise PreflightRefused(f"{label}.version is not an exact dotted version")
    url = _require_text(mapping["metadataURL"], f"{label}.metadataURL", 300)
    expected_url = f"https://pypi.org/pypi/{normalized}/{version}/json"
    if url != expected_url:
        raise PreflightRefused(
            f"{label}.metadataURL does not match the declared exact version"
        )
    metadata_bytes = _require_int(
        mapping["metadataBytes"], f"{label}.metadataBytes"
    )
    if metadata_bytes > per_response:
        raise PreflightRefused(f"{label}.metadataBytes exceeds the response cap")
    requires_python = _require_text(
        mapping["requiresPython"], f"{label}.requiresPython", 200
    )
    license_declared = _require_text(
        mapping["declaredLicense"], f"{label}.declaredLicense", 400
    )
    dependencies = _require_text_list(
        mapping["baseRequiresDist"], f"{label}.baseRequiresDist"
    )
    extras = _require_text_list(
        mapping.get("declaredExtras", []), f"{label}.declaredExtras"
    )
    wheel = _validate_wheel(mapping["wheel"], normalized, version, label)
    return {
        "distribution": normalized,
        "module": module,
        "version": version,
        "metadata_url": url,
        "metadata_bytes": metadata_bytes,
        "requires_python": requires_python,
        "declared_license": license_declared,
        "declared_dependencies": dependencies,
        "declared_extras": extras,
        "wheel": wheel,
    }


def _validate_record(
    record: dict[str, object],
) -> tuple[list[dict[str, object]], dict[str, object]]:
    """Validate the strict candidate schema and the complete selected stack."""
    _require_exact_keys(record, TOP_LEVEL_KEYS, set(), "record")
    if type(record["schemaVersion"]) is not int or record["schemaVersion"] != 1:
        raise PreflightRefused("record.schemaVersion must be 1")
    status = _require_text(record["status"], "record.status", 300).lower()
    if "metadata-only" not in status or "not approved" not in status:
        raise PreflightRefused("record.status must declare metadata-only candidates")
    checked = _require_text(record["checkedDate"], "record.checkedDate", 10)
    try:
        date.fromisoformat(checked)
    except ValueError as error:
        raise PreflightRefused("record.checkedDate is not an ISO date") from error
    target = _validate_target(record["target"])
    per_response, aggregate = _validate_provenance(record)
    _validate_limits(record["limits"])
    packages = record["packages"]
    if not isinstance(packages, list) or not packages:
        raise PreflightRefused("record.packages must be a non-empty JSON list")
    candidates: list[dict[str, object]] = []
    seen: set[str] = set()
    metadata_total = 0
    for index, package in enumerate(packages):
        candidate = _validate_package(package, index, per_response)
        normalized = cast(str, candidate["distribution"])
        if normalized in seen:
            raise PreflightRefused(
                f"packages[{index}] duplicates a selected distribution"
            )
        seen.add(normalized)
        metadata_total += cast(int, candidate["metadata_bytes"])
        candidates.append(candidate)
    if seen != set(KNOWN_CANDIDATES):
        raise PreflightRefused(
            "record.packages does not exactly match the selected distributions"
        )
    if metadata_total > aggregate:
        raise PreflightRefused("declared metadata bytes exceed the aggregate cap")
    return candidates, target


def _environment_roots() -> list[Path]:
    """Return only the current interpreter's declared site roots."""
    values: list[str] = []
    for key in ("purelib", "platlib"):
        value = sysconfig.get_path(key)
        if value:
            values.append(value)
    try:
        values.extend(site.getsitepackages())
    except (AttributeError, TypeError):
        pass
    if site.ENABLE_USER_SITE is True:
        try:
            user_site = site.getusersitepackages()
        except (AttributeError, TypeError):
            user_site = ""
        if isinstance(user_site, str):
            values.append(user_site)
        else:
            values.extend(user_site)
    roots: list[Path] = []
    seen: set[tuple[int, int]] = set()
    for value in values:
        if not value or not os.path.isabs(value):
            continue
        try:
            info = os.stat(value)
        except OSError:
            continue
        if not stat.S_ISDIR(info.st_mode):
            continue
        key = info.st_dev, info.st_ino
        if key in seen:
            continue
        seen.add(key)
        roots.append(Path(value))
    return roots


def _checked_roots(roots: list[Path]) -> list[Path]:
    """Validate scan scope before metadata or module-path observation."""
    if len(roots) > MAX_SCAN_ROOTS:
        raise PreflightRefused("too many interpreter scan roots")
    checked: list[Path] = []
    seen: set[tuple[int, int]] = set()
    for root in roots:
        path = Path(root)
        if not path.is_absolute():
            raise PreflightRefused("scan roots must be absolute")
        try:
            info = path.lstat()
        except (OSError, ValueError) as error:
            raise PreflightRefused("scan root is not a readable directory") from error
        # A symlinked root can silently redirect discovery to another environment.
        if stat.S_ISLNK(info.st_mode):
            raise PreflightRefused("scan root must not be a symbolic link")
        if not stat.S_ISDIR(info.st_mode):
            raise PreflightRefused("scan root is not a directory")
        identity = info.st_dev, info.st_ino
        if identity not in seen:
            checked.append(path)
            seen.add(identity)
    return checked


def _metadata_version(data: bytes, distribution: str) -> str:
    """Read two unique bounded headers, never execute metadata providers."""
    headers: dict[str, str] = {}
    previous = ""
    for line in data.decode("utf-8", errors="strict").splitlines():
        if not line:
            break
        if line.startswith((" ", "\t")):
            if previous in {"name", "version"}:
                raise PreflightRefused("folded distribution identity header")
            continue
        key, separator, value = line.partition(":")
        previous = key.lower()
        if separator and previous in {"name", "version"}:
            if previous in headers:
                raise PreflightRefused("duplicate distribution identity header")
            headers[previous] = _require_text(
                value.strip(), "distribution identity", 128
            )
    if set(headers) != {"name", "version"}:
        raise PreflightRefused("missing distribution identity header")
    if _normalize_distribution(headers["name"]) != distribution:
        raise PreflightRefused("distribution directory and identity disagree")
    if not _VERSION.fullmatch(headers["version"]):
        raise PreflightRefused("invalid distribution version header")
    return headers["version"]


def _distribution_index(
    roots: list[Path], until: float, seconds: float
) -> tuple[dict[str, list[str]], list[str]]:
    """Scan selected headers under shared entry/byte/deadline budgets."""
    index: dict[str, list[str]] = {}
    errors: list[str] = []
    entries = 0
    for root in roots:
        try:
            with os.scandir(root) as children:
                for entry in children:
                    _deadline(until)
                    entries += 1
                    if entries > MAX_SITE_ENTRIES:
                        return index, errors + ["site-entry-budget"]
                    if not entry.name.endswith(".dist-info"):
                        continue
                    stem = entry.name.removesuffix(".dist-info")
                    name = _normalize_distribution(stem.rsplit("-", 1)[0])
                    if name not in KNOWN_CANDIDATES:
                        continue
                    try:
                        if not entry.is_dir(follow_symlinks=False):
                            raise PreflightRefused(
                                "distribution is not a regular directory"
                            )
                        data, _ = _acquire(
                            Path(entry.path) / "METADATA",
                            Limits(
                                candidate_bytes=MAX_METADATA_BYTES,
                                seconds=seconds,
                            ),
                            until=until,
                        )
                    except DeadlineExceeded:
                        raise
                    except (OSError, PreflightRefused):
                        errors.append("unreadable-metadata")
                        continue
                    _deadline(until)
                    try:
                        version = _metadata_version(data, name)
                    except (UnicodeError, PreflightRefused):
                        errors.append("malformed-metadata-header")
                        continue
                    index.setdefault(name, []).append(version)
        except OSError:
            errors.append("unreadable-site-root")
    return index, errors


def _module_state(module: str, roots: list[Path], until: float) -> dict[str, object]:
    """Observe bounded regular module paths without invoking import finders/hooks."""
    suffixes = tuple(
        dict.fromkeys(
            importlib.machinery.SOURCE_SUFFIXES
            + importlib.machinery.BYTECODE_SUFFIXES
            + importlib.machinery.EXTENSION_SUFFIXES
        )
    )
    namespace = False
    for root in roots:
        _deadline(until)
        package = root / module
        candidates = [root / f"{module}{suffix}" for suffix in suffixes]
        try:
            info = package.lstat()
        except FileNotFoundError:
            pass
        except OSError as error:
            return {"status": "error", "detail": type(error).__name__}
        else:
            if stat.S_ISDIR(info.st_mode):
                namespace = True
                candidates = [
                    package / f"__init__{suffix}" for suffix in suffixes
                ] + candidates
            else:
                # Do not follow a symlink or claim a later root's path is what
                # the import system would actually select.
                return {"status": "unverified"}
        for candidate in candidates:
            _deadline(until)
            try:
                info = candidate.lstat()
            except FileNotFoundError:
                continue
            except OSError as error:
                return {"status": "error", "detail": type(error).__name__}
            if stat.S_ISREG(info.st_mode):
                return {
                    "status": "pass",
                    "origin": candidate.relative_to(root).as_posix(),
                    "basis": (
                        "regular module path only; no finder, import or code "
                        "validation"
                    ),
                }
            return {"status": "unverified"}
    return {"status": "namespace-only" if namespace else "missing"}


def _install_state(
    versions: list[str], module_status: str, candidate_version: str
) -> str:
    """Name the strongest contradiction in metadata and regular paths."""
    unique = sorted(set(versions))
    if not unique:
        return "module-only" if module_status == "pass" else "missing"
    if len(versions) > 1:
        return "ambiguous"
    if unique[0] != candidate_version:
        return "wrong-version"
    if module_status != "pass":
        return "metadata-only"
    return "installed"


def _unaudited_gates(candidate: dict[str, object]) -> dict[str, object]:
    """Describe checks this tool deliberately does not perform or accept."""
    wheel = cast(dict[str, object], candidate["wheel"])
    return {
        "license": {
            "status": "unverified",
            "basis": "candidate declaration only; license files were not audited",
            "declared": candidate["declared_license"],
        },
        "transitive": {
            "status": "unverified",
            "basis": (
                "no resolver or transitive closure audit; declarations not evaluated"
            ),
            "declared_direct": candidate["declared_dependencies"],
        },
        "artifact": {
            "status": "unverified",
            "basis": "no local artifact bytes were supplied or read",
            "declared_filename": wheel["filename"],
            "declared_sha256": wheel["sha256_declared"],
        },
        "import": {
            "status": "unverified",
            "basis": (
                "regular module paths were observed; no finder, import or code "
                "validation was performed"
            ),
        },
        "runtime": {
            "status": "unverified",
            "basis": "no runtime, ABI or glibc execution evidence was supplied",
        },
        "format": {
            "status": "unverified",
            "basis": "no document authoring or parsing test was supplied",
        },
    }


def _package_report(
    candidate: dict[str, object],
    index: dict[str, list[str]],
    roots: list[Path],
    until: float,
) -> dict[str, object]:
    """Combine observed presence with explicit unverified downstream gates."""
    distribution = cast(str, candidate["distribution"])
    module = cast(str, candidate["module"])
    version = cast(str, candidate["version"])
    versions = index.get(distribution, [])
    unique = sorted(set(versions))
    module_state = _module_state(module, roots, until)
    state = _install_state(versions, cast(str, module_state["status"]), version)
    distribution_gate = (
        "missing" if not versions else "ambiguous" if len(versions) > 1 else "pass"
    )
    version_gate = (
        "missing"
        if not versions
        else "ambiguous"
        if len(versions) > 1
        else "pass"
        if unique[0] == version
        else "wrong-version"
    )
    gates: dict[str, object] = {
        "distribution": {
            "status": distribution_gate,
            "basis": (
                "local metadata only; file manifest and distribution bytes not audited"
            ),
            "observed_versions": unique,
            "metadata_records": len(versions),
        },
        "version": {
            "status": version_gate,
            "declared": version,
            "observed": unique,
        },
        "module": module_state,
    }
    gates.update(_unaudited_gates(candidate))
    return {
        "distribution": distribution,
        "module": module,
        "candidate_version": version,
        "install_state": state,
        "observed": {"distribution_versions": unique, "module": module_state},
        "gates": gates,
        "authoring_ready": False,
        "hardened_xml_ready": False,
    }


def _interpreter_observation() -> dict[str, object]:
    """Record the exact invoked interpreter without executing foreign code."""
    return {
        "executable": sys.executable,
        "implementation": platform.python_implementation(),
        "version": platform.python_version(),
        "soabi": sysconfig.get_config_var("SOABI"),
        "machine": platform.machine(),
        "cache_tag": sys.implementation.cache_tag,
    }


def _interpreter_gate(
    observed: dict[str, object], target: dict[str, object]
) -> dict[str, object]:
    """Compare the recorded target with this exact invocation."""
    mismatches: list[str] = []
    if str(observed["implementation"]).casefold() != str(
        target["implementation"]
    ).casefold():
        mismatches.append("implementation")
    if observed["version"] != target["version_observed"]:
        mismatches.append("version")
    if observed["soabi"] != target["soabi_observed"]:
        mismatches.append("soabi")
    if observed["machine"] != target["machine"]:
        mismatches.append("machine")
    try:
        same_executable = Path(sys.executable).resolve() == Path(
            cast(str, target["interpreter"])
        ).resolve()
    except (OSError, RuntimeError):
        same_executable = False
    if not same_executable:
        mismatches.append("interpreter")
    return {
        "status": "pass" if not mismatches else "mismatch",
        "mismatched_fields": mismatches,
        "target": target,
    }


def inspect_candidates(
    path: Path,
    *,
    limits: Limits = DEFAULT_LIMITS,
    scan_roots: list[Path] | None = None,
) -> dict[str, object]:
    """Inspect the selected stack and report presence separately from readiness.

    Args:
        path: Candidate JSON to acquire read-only as a bounded regular file.
        limits: Acquisition budgets; their time limit is shared by candidate
            acquisition, selected METADATA reads and module-path checks.
        scan_roots: Diagnostic override for isolated tests. The CLI never passes
            it, so production inspection uses only this interpreter's site roots.

    Returns:
        A JSON-ready report whose ``exit_status`` matches the documented statuses.

    Raises:
        DeadlineExceeded: The shared cooperative inspection deadline expired.
        PreflightRefused: The record is unsafe, invalid or outside the selection.
    """
    _checked_limits(limits)
    until = time.monotonic() + limits.seconds
    data, digest = _acquire(path, limits, until=until)
    record = _parse_record(data)
    candidates, target = _validate_record(record)
    explicit = scan_roots is not None
    roots = _checked_roots(
        list(scan_roots) if explicit else _environment_roots()
    )
    index, scan_errors = _distribution_index(roots, until, limits.seconds)
    observed = _interpreter_observation()
    interpreter_gate = _interpreter_gate(observed, target)
    packages = [
        _package_report(candidate, index, roots, until) for candidate in candidates
    ]
    packages.sort(key=lambda package: cast(str, package["distribution"]))
    states = Counter(cast(str, package["install_state"]) for package in packages)
    open_gates = [
        f"{package['distribution']}:{package['install_state']}"
        for package in packages
        if package["install_state"] != "installed"
    ]
    if interpreter_gate["status"] != "pass":
        open_gates.append("interpreter:mismatch")
    if scan_errors:
        open_gates.append("environment:metadata-scan-error")
    complete = not open_gates
    return {
        "status": "inspected",
        "mode": "inspect-only",
        "record": {
            "path": str(path),
            "sha256": digest,
            "schema_version": record["schemaVersion"],
            "declared_status": record["status"],
            "checked_date": record["checkedDate"],
            "interpretation": (
                "declaration-only metadata; not pins, a resolved lock, rights "
                "approval or installation evidence"
            ),
        },
        "interpreter": observed,
        "interpreter_gate": interpreter_gate,
        "acquisition": {
            "candidate_bytes_limit": limits.candidate_bytes,
            "deadline_seconds_limit": limits.seconds,
            "metadata_bytes_limit": MAX_METADATA_BYTES,
            "site_entries_limit": MAX_SITE_ENTRIES,
            "scan_roots_limit": MAX_SCAN_ROOTS,
            "cli_output_bytes_limit": MAX_CLI_OUTPUT_BYTES,
            "scan_deadline_seconds_limit": limits.seconds,
            "deadline_scope": (
                "one cooperative deadline shared by candidate acquisition, "
                "selected METADATA reads and module-path checks; kernel I/O is "
                "not interrupted"
            ),
            "no_follow_final_path": True,
            "nonblocking_open": True,
        },
        "environment": {
            "scan_roots": [str(root) for root in roots],
            "scope": (
                "explicit diagnostic roots"
                if explicit
                else "exact interpreter declared site roots"
            ),
            "distribution_discovery": (
                "direct *.dist-info children; selected METADATA identity headers "
                "only; .egg-info, RECORD, wheel/source bytes and symlinked members "
                "are not read"
            ),
            "symlink_policy": (
                "symbolic-link scan roots refuse; symlinked dist-info, METADATA "
                "and module paths are not followed"
            ),
            "excluded": [
                "working directory",
                "PYTHONPATH extras",
                "other interpreters and virtual environments",
                ".egg-info and wheel/RECORD/source bytes",
            ],
            "metadata_scan_errors": scan_errors,
        },
        "packages": packages,
        "summary": {
            "dependency_presence": "complete" if complete else "incomplete",
            "install_states": dict(sorted(states.items())),
            "open_gates": open_gates,
        },
        "authoring_ready": False,
        "hardened_xml_ready": False,
        "evidence": {
            "third_party_modules_imported": False,
            "wheel_or_source_bytes_read": False,
            "dependencies_resolved": False,
            "installation_or_repair_attempted": False,
            "files_written": False,
            "caller_declarations_used_as_evidence": False,
        },
        "exit_status": EXIT_CLEAR if complete else EXIT_GATES_OPEN,
    }


def _write_json(payload: dict[str, object], *, bounded: bool = False) -> bool:
    """Write one deterministic JSON document, optionally under the CLI cap."""
    encoded = json.dumps(payload, sort_keys=True)
    if bounded and len(encoded.encode("utf-8")) + 1 > MAX_CLI_OUTPUT_BYTES:
        fallback = {
            "status": "refused",
            "reason": "inspection output exceeds byte budget",
            "mode": "inspect-only",
        }
        sys.stdout.write(json.dumps(fallback, sort_keys=True) + "\n")
        return False
    sys.stdout.write(encoded + "\n")
    return True


def main(argv: list[str] | None = None) -> int:
    """Emit a bounded non-quoting JSON report; never install or import."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--candidates",
        type=Path,
        default=DEFAULT_CANDIDATES,
        help="selected candidate JSON record (read-only)",
    )
    arguments = parser.parse_args(argv)
    try:
        result = inspect_candidates(arguments.candidates)
    except PreflightRefused as error:
        _write_json(
            {"status": "refused", "reason": str(error), "mode": "inspect-only"}
        )
        return EXIT_REFUSED
    except OSError:
        _write_json(
            {
                "status": "refused",
                "reason": "candidate record is not readable",
                "mode": "inspect-only",
            }
        )
        return EXIT_REFUSED
    if not _write_json(result, bounded=True):
        return EXIT_REFUSED
    return cast(int, result["exit_status"])


if __name__ == "__main__":
    raise SystemExit(main())
