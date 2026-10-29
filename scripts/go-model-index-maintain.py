#!/usr/bin/env python3
"""Deterministic maintenance for opencode-go-model-index.yaml.

The checker is read-only and makes no model calls. It compares the official
Go docs source, the public Go models endpoint, the installed OpenCode CLI, and
models.dev, then writes a compact drift report. `apply` is proposal-based and
requires --apply; it never commits or pushes.
"""

from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

try:
    from ruamel.yaml import YAML
    from ruamel.yaml.comments import CommentedMap
except ImportError:  # pragma: no cover - covered by the shell wrapper
    sys.stderr.write(
        "go-model-index-maintain: ruamel.yaml is missing.\n"
        "Run scripts/go-model-index-maintain.sh (it bootstraps an isolated venv),\n"
        "or install requirements-go-model-index.txt into a private venv.\n"
    )
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INDEX = ROOT / "opencode-go-model-index.yaml"
DEFAULT_VARIANTS = ROOT / "config/go-model-index-variants.json"
DOCS_URL = (
    "https://raw.githubusercontent.com/anomalyco/opencode/dev/"
    "services/www/src/docs/content/console/go.mdx"
)
MODELS_URL = "https://opencode.ai/inference/go/v1/models"
MODELS_DEV_URL = "https://models.dev/api.json"
USER_AGENT = "computer-use-go-model-index/1.0"

EXIT_CLEAN = 0
EXIT_ERROR = 1
EXIT_DRIFT = 2
EXIT_PARTIAL = 3

ALLOWED_STATUS = {"verified_go", "provisional_unverified", "removed_unverified"}
REF_KEYS = {
    "ref",
    "fallback_ref",
    "builder",
    "planner",
    "builder_difficult",
    "planner_difficult",
    "go_ref",
    "closest_go_ref",
}


# ---------------------------------------------------------------------------
# Paths and YAML
# ---------------------------------------------------------------------------


def state_root() -> Path:
    base = os.environ.get("XDG_STATE_HOME") or str(Path.home() / ".local" / "state")
    return Path(base) / "opencode" / "go-model-index"


def ensure_state() -> Path:
    root = state_root()
    for name in ("cache", "backups"):
        (root / name).mkdir(parents=True, exist_ok=True)
    return root


def yaml_rt() -> YAML:
    y = YAML()
    y.preserve_quotes = True
    y.width = 1000
    y.indent(mapping=2, sequence=4, offset=2)

    def represent_none(representer, _data):
        return representer.represent_scalar("tag:yaml.org,2002:null", "null")

    y.representer.add_representer(type(None), represent_none)
    return y


def load_index(path: Path) -> CommentedMap:
    y = yaml_rt()
    data = y.load(path.read_text(encoding="utf-8"))
    if not isinstance(data, CommentedMap) or not isinstance(data.get("models"), CommentedMap):
        raise ValueError(f"invalid index structure: {path}")
    return data


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def dump_index(data: CommentedMap, path: Path) -> None:
    y = yaml_rt()
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", delete=False, dir=str(path.parent), prefix=path.name + "."
    ) as fh:
        tmp = Path(fh.name)
        try:
            y.dump(data, fh)
            fh.flush()
            os.fsync(fh.fileno())
        except Exception:
            tmp.unlink(missing_ok=True)
            raise
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Source fetching
# ---------------------------------------------------------------------------


def _cache_paths(state: Path, name: str) -> tuple[Path, Path]:
    return state / "cache" / name, state / "cache" / (name + ".meta.json")


def _read_cache(cache: Path, meta: Path) -> tuple[bytes, dict[str, Any]]:
    if not cache.is_file():
        raise FileNotFoundError(cache)
    metadata = {}
    if meta.is_file():
        try:
            metadata = json.loads(meta.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            metadata = {}
    return cache.read_bytes(), metadata


def fetch(url: str, cache_name: str, *, offline: bool, refresh: bool, state: Path) -> tuple[bytes, dict[str, Any]]:
    cache, meta = _cache_paths(state, cache_name)
    if offline:
        body, metadata = _read_cache(cache, meta)
        return body, {"url": url, "cached": True, "sha256": hashlib.sha256(body).hexdigest(), **metadata}

    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    cached_meta: dict[str, Any] = {}
    if cache.is_file() and not refresh:
        _, cached_meta = _read_cache(cache, meta)
        if cached_meta.get("etag"):
            headers["If-None-Match"] = str(cached_meta["etag"])
        if cached_meta.get("last_modified"):
            headers["If-Modified-Since"] = str(cached_meta["last_modified"])

    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            body = response.read()
            metadata = {
                "url": url,
                "etag": response.headers.get("ETag"),
                "last_modified": response.headers.get("Last-Modified"),
                "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "sha256": hashlib.sha256(body).hexdigest(),
            }
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(body)
            meta.write_text(json.dumps(metadata, indent=1) + "\n", encoding="utf-8")
            return body, metadata
    except urllib.error.HTTPError as exc:
        if exc.code == 304 and cache.is_file():
            body = cache.read_bytes()
            cached_meta["checked_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
            cached_meta["sha256"] = hashlib.sha256(body).hexdigest()
            meta.write_text(json.dumps(cached_meta, indent=1) + "\n", encoding="utf-8")
            return body, cached_meta
        raise


def opencode_version() -> str:
    result = subprocess.run(
        ["opencode", "--version"], check=True, capture_output=True, text=True, timeout=20
    )
    match = re.search(r"v?(\d+\.\d+\.\d+)", result.stdout)
    return match.group(1) if match else result.stdout.strip()


def installed_models() -> set[str]:
    result = subprocess.run(
        ["opencode", "models"], check=True, capture_output=True, text=True, timeout=30
    )
    return {
        line.strip()
        for line in result.stdout.splitlines()
        if line.strip().startswith("opencode-go/")
    }


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def norm_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def model_id_name(model_id: str) -> str:
    return model_id.split("/", 1)[1]


def strip_parenthetical(value: str) -> tuple[str, str]:
    match = re.search(r"\s*\(([^)]*)\)\s*$", value)
    if not match:
        return value.strip(), ""
    return value[: match.start()].strip(), match.group(1).strip()


def parse_docs_models(text: str) -> list[str]:
    marker = "The current list of models includes:"
    end = "The list of models may change"
    if marker not in text or end not in text:
        raise ValueError("docs model-list anchors not found")
    block = text.split(marker, 1)[1].split(end, 1)[0]
    raw_names = re.findall(r"^-\s+\*\*(.+?)\*\*", block, flags=re.MULTILINE)
    names = [re.sub(r"\s*\(.*$", "", name).strip() for name in raw_names]
    if len(names) < 20:
        raise ValueError(f"implausibly short docs model list: {len(names)}")
    return names


def parse_money(value: str) -> float | None:
    value = value.replace("**", "").replace("<br />", "").strip()
    value = re.sub(r"<small>.*?</small>", "", value).strip()
    if not value or value == "-":
        return None
    value = re.sub(r"~~.*?~~", "", value).strip()
    if value.lower() == "free":
        return 0.0
    value = value.replace("$", "").replace(",", "").strip()
    try:
        return float(value)
    except ValueError:
        return None


def parse_threshold(suffix: str) -> int | None:
    match = re.search(r"([<>≤])\s*(\d+(?:\.\d+)?)\s*K\s*tokens?", suffix, re.IGNORECASE)
    if not match:
        return None
    return int(float(match.group(2)) * 1000)


def summarize_pricing(rows: list[dict[str, Any]]) -> dict[str, Any]:
    monthly_values = [r["monthly"] for r in rows if r["monthly"] is not None]
    monthly = monthly_values[0] if monthly_values else None
    suffixes = " ".join(r["suffix"].lower() for r in rows)
    if len(rows) == 1:
        row = rows[0]
        result: dict[str, Any] = {
            "input": row["input"],
            "output": row["output"],
            "cache_read": row["cache_read"],
            "cache_write": row["cache_write"],
        }
        if row["free"]:
            result["free"] = True
        if "50% off" in row["suffix"].lower():
            result["promo_discount"] = "50%"
        return result
    if "off-peak" in suffixes and "peak" in suffixes:
        result = {"monthly_allowance_usd": monthly}
        for row in rows:
            key = "off_peak" if "off-peak" in row["suffix"].lower() else "peak"
            result[key] = {
                "input": row["input"],
                "output": row["output"],
                "cache_read": row["cache_read"],
                "cache_write": row["cache_write"],
            }
        return result
    thresholds = [parse_threshold(r["suffix"]) for r in rows]
    if any(t is not None for t in thresholds):
        ordered = sorted(rows, key=lambda r: parse_threshold(r["suffix"]) or 0)
        base = ordered[0]
        long_row = ordered[-1]
        return {
            "standard": {
                "input": base["input"],
                "output": base["output"],
                "cache_read": base["cache_read"],
                "cache_write": base["cache_write"],
            },
            "long_context": {
                "threshold": parse_threshold(long_row["suffix"]),
                "input": long_row["input"],
                "output": long_row["output"],
                "cache_read": long_row["cache_read"],
                "cache_write": long_row["cache_write"],
            },
            "monthly_allowance_usd": monthly,
        }
    return {"rows": rows, "monthly_allowance_usd": monthly}


def parse_go_pricing(text: str) -> dict[str, dict[str, Any]]:
    if '<div slot="go">' not in text:
        raise ValueError("Go pricing slot not found")
    block = text.split('<div slot="go">', 1)[1].split("</div>", 1)[0]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for line in block.splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6 or cells[0].lower() == "model":
            continue
        if set(cells[0]) <= {"-", " "}:
            continue
        raw_name = cells[0].replace("**", "").strip()
        base, suffix = strip_parenthetical(raw_name)
        row = {
            "raw_name": raw_name,
            "name": base,
            "suffix": suffix,
            "input": parse_money(cells[1]),
            "output": parse_money(cells[2]),
            "cache_read": parse_money(cells[3]),
            "cache_write": parse_money(cells[4]),
            "monthly": parse_money(cells[5]),
            "free": cells[1].strip().lower() == "free",
        }
        grouped.setdefault(base, []).append(row)
    if len(grouped) < 20:
        raise ValueError(f"implausibly short Go pricing table: {len(grouped)} models")
    return {name: summarize_pricing(rows) for name, rows in grouped.items()}


def parse_models_dev(body: bytes) -> dict[str, dict[str, Any]]:
    data = json.loads(body)
    provider = data.get("opencode-go")
    if not isinstance(provider, dict) or not isinstance(provider.get("models"), dict):
        raise ValueError("models.dev opencode-go provider missing")
    return {f"opencode-go/{model_id}": value for model_id, value in provider["models"].items()}


def model_id_index(ids: set[str]) -> dict[str, str]:
    return {norm_name(model_id_name(model_id)): model_id for model_id in ids}


def map_docs_names(names: list[str], endpoint_ids: set[str], models_dev: dict[str, dict[str, Any]]) -> tuple[dict[str, str], list[str]]:
    by_id = model_id_index(endpoint_ids | set(models_dev))
    by_dev_name = {norm_name(v.get("name", "")): k for k, v in models_dev.items()}
    mapped: dict[str, str] = {}
    unmapped: list[str] = []
    for name in names:
        key = norm_name(name)
        model_id = by_id.get(key)
        if model_id is None:
            model_id = by_dev_name.get(key)
        if model_id is None:
            candidates = [
                mid for norm, mid in by_id.items() if norm.startswith(key) or key.startswith(norm)
            ]
            if len(candidates) == 1:
                model_id = candidates[0]
        if model_id is None:
            unmapped.append(name)
        else:
            mapped[name] = model_id
    return mapped, unmapped


# ---------------------------------------------------------------------------
# Drift computation
# ---------------------------------------------------------------------------


def normalize_price_dict(value: Any) -> Any:
    ignore = {
        "promo",
        "promo_discount",
        "until",
        "peak_hours",
        "note",
        "monthly_allowance_usd",
        "free",
        "rows",
    }
    if isinstance(value, dict):
        return {
            k: normalize_price_dict(v)
            for k, v in value.items()
            if k not in ignore and v is not None
        }
    if isinstance(value, float):
        return round(value, 6)
    return value


def pricing_equal(left: Any, right: Any) -> bool:
    return normalize_price_dict(left) == normalize_price_dict(right)


def limits_close(left: int | float, right: int | float) -> bool:
    if left == right:
        return True
    return abs(float(left) - float(right)) / max(float(left), float(right), 1.0) <= 0.05


def sentence_count(text: str) -> int:
    return len(re.split(r"(?<=[.!?])\s+(?=[A-Z])", text.strip()))


def load_previous_report(state: Path) -> dict[str, Any] | None:
    path = state / "last-check.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def compute_drift(
    *,
    index: CommentedMap,
    docs_names: list[str],
    docs_pricing: dict[str, dict[str, Any]],
    endpoint_ids: set[str],
    installed_ids: set[str],
    models_dev: dict[str, dict[str, Any]],
    variants: dict[str, Any] | None,
    current_version: str,
    previous: dict[str, Any] | None,
) -> dict[str, Any]:
    models = index["models"]
    by_id = {record["id"]: key for key, record in models.items()}
    index_ids = set(by_id)
    docs_map, unmapped_docs = map_docs_names(docs_names, endpoint_ids, models_dev)
    docs_ids = set(docs_map.values())
    eligible = docs_ids & endpoint_ids
    source_disagreement: dict[str, list[str]] = {}
    if docs_ids - endpoint_ids:
        source_disagreement["docs_only"] = sorted(docs_ids - endpoint_ids)
    if endpoint_ids - docs_ids:
        source_disagreement["endpoint_only"] = sorted(endpoint_ids - docs_ids)
    if unmapped_docs:
        source_disagreement["unmapped_docs_names"] = sorted(unmapped_docs)

    local_unavailable = sorted(eligible - installed_ids)
    metadata_only = sorted(set(models_dev) - eligible)
    added = sorted(eligible - index_ids)
    removed_ids = index_ids - eligible
    removed = sorted(removed_ids)

    previous_removed = set()
    if previous:
        previous_removed = set(previous.get("drift", {}).get("removed_pending", []))
    removed_confirmed = sorted(removed_ids & previous_removed)
    removed_pending = sorted(removed_ids - previous_removed)

    changed: list[dict[str, Any]] = []
    pricing_review: list[dict[str, Any]] = []
    metadata_changes: list[dict[str, Any]] = []
    metadata_missing: list[str] = []
    variant_changes: list[dict[str, Any]] = []
    variant_gap: list[str] = []

    snapshot_models = (variants or {}).get("models", {})
    snapshot_version = (variants or {}).get("opencode_version")
    stale_variants = bool(variants) and snapshot_version != current_version
    if variants is None:
        variant_gap = sorted(eligible)

    # Pricing names are grouped by display name; map them through docs names.
    docs_name_to_id = {norm_name(name): model_id for name, model_id in docs_map.items()}
    pricing_by_id: dict[str, dict[str, Any]] = {}
    for name, price in docs_pricing.items():
        model_id = docs_name_to_id.get(norm_name(name))
        if model_id:
            pricing_by_id[model_id] = price

    for model_id in sorted(eligible & index_ids):
        key = by_id[model_id]
        record = models[key]
        fields: list[str] = []

        price = pricing_by_id.get(model_id)
        if price is None:
            pricing_review.append({"id": model_id, "issue": "no pricing row"})
        else:
            allowance = price.get("monthly_allowance_usd")
            if allowance is not None and record.get("monthly_allowance_usd") != allowance:
                fields.append("monthly_allowance_usd")
            record_pricing = record.get("pricing")
            if "rows" in price:
                pricing_review.append({"id": model_id, "issue": "unrecognized pricing shape", "parsed": price})
            elif record_pricing is not None:
                if (
                    isinstance(record_pricing, dict)
                    and "promo" in record_pricing
                    and price.get("promo_discount")
                ):
                    equal = pricing_equal(record_pricing["promo"], price)
                else:
                    equal = pricing_equal(record_pricing, price)
                if not equal:
                    pricing_review.append(
                        {"id": model_id, "issue": "pricing differs", "parsed": price, "index": record_pricing}
                    )

        dev = models_dev.get(model_id)
        if dev:
            limit = dev.get("limit", {}) if isinstance(dev.get("limit"), dict) else {}
            ctx = limit.get("context")
            out = limit.get("output")
            if (
                ctx is not None
                and record.get("context_tokens") is not None
                and not limits_close(record["context_tokens"], ctx)
            ):
                metadata_changes.append({"id": model_id, "field": "context_tokens", "index": record.get("context_tokens"), "models_dev": ctx})
            if (
                out is not None
                and record.get("max_output_tokens") is not None
                and record["max_output_tokens"] < out
            ):
                metadata_changes.append({"id": model_id, "field": "max_output_tokens", "index": record.get("max_output_tokens"), "models_dev": out})
            if record.get("context_tokens") is None and ctx is not None:
                metadata_missing.append(model_id)

        effort = record.get("effort") or {}
        record_values = list(effort.get("values") or [])
        snapshot_values = snapshot_models.get(model_id)
        if variants is not None and not stale_variants:
            if snapshot_values is not None and record_values != snapshot_values:
                fields.append("effort.values")
                variant_changes.append(
                    {"id": model_id, "index": record_values, "snapshot": snapshot_values}
                )
        elif variants is None or stale_variants:
            variant_gap.append(model_id)

        if fields:
            changed.append({"id": model_id, "fields": fields})

    if stale_variants:
        variant_gap = sorted(set(variant_gap) | eligible)

    drift = {
        "added": added,
        "removed_pending": removed_pending,
        "removed_confirmed": removed_confirmed,
        "changed": changed,
        "source_disagreement": source_disagreement,
        "local_unavailable": local_unavailable,
        "metadata_only": metadata_only,
        "metadata_changes": metadata_changes,
        "metadata_missing": sorted(set(metadata_missing)),
        "pricing_review": pricing_review,
        "variant_gap": sorted(set(variant_gap)),
        "variant_changes": variant_changes,
    }
    hard_drift = bool(added or removed_confirmed or changed or source_disagreement or pricing_review)
    warnings = bool(removed_pending or local_unavailable or metadata_changes or variant_gap or variant_changes)
    if hard_drift:
        status = "drift"
    elif warnings:
        status = "partial"
    else:
        status = "clean"
    return {
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "opencode_version": current_version,
        "counts": {
            "docs": len(docs_names),
            "endpoint": len(endpoint_ids),
            "installed": len(installed_ids),
            "eligible": len(eligible),
            "index": len(index_ids),
            "models_dev": len(models_dev),
        },
        "variant_snapshot": {
            "version": snapshot_version,
            "stale": stale_variants,
        },
        "drift": drift,
        "status": status,
    }


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def markdown_report(report: dict[str, Any]) -> str:
    drift = report["drift"]
    lines = [
        "# OpenCode Go model index check",
        "",
        f"- Status: **{report['status']}**",
        f"- Checked: {report['checked_at']}",
        f"- OpenCode: {report['opencode_version']}",
        f"- Eligible models: {report['counts']['eligible']}",
        f"- Index records: {report['counts']['index']}",
        "",
        "## Drift",
        "",
    ]
    for key in (
        "added",
        "removed_pending",
        "removed_confirmed",
        "local_unavailable",
        "metadata_only",
        "variant_gap",
        "metadata_missing",
    ):
        values = drift.get(key) or []
        lines.append(f"- {key}: {len(values)}" + (f" — {', '.join(values)}" if values else ""))
    for key in ("changed", "metadata_changes", "variant_changes", "pricing_review"):
        values = drift.get(key) or []
        lines.append(f"- {key}: {len(values)}")
    if drift.get("source_disagreement"):
        lines.append("")
        lines.append("## Source disagreement")
        for key, values in drift["source_disagreement"].items():
            lines.append(f"- {key}: {', '.join(values) if values else 'none'}")
    return "\n".join(lines) + "\n"


def write_report(report: dict[str, Any], state: Path) -> None:
    atomic_write(state / "last-check.json", json.dumps(report, indent=1, sort_keys=False) + "\n")
    atomic_write(state / "last-check.md", markdown_report(report))
    cleanup_state(state)


def cleanup_state(state: Path) -> None:
    backups = sorted(
        (state / "backups").glob("*.yaml"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    now = dt.datetime.now(dt.timezone.utc).timestamp()
    for index, path in enumerate(backups):
        if index >= 10 or now - path.stat().st_mtime > 90 * 86400:
            path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------


def iter_refs(value: Any, path: str = "") -> list[tuple[str, str]]:
    refs: list[tuple[str, str]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else str(key)
            if key in REF_KEYS and isinstance(child, str):
                refs.append((child_path, child))
            refs.extend(iter_refs(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            refs.extend(iter_refs(child, f"{path}[{index}]"))
    return refs


def validate_index(index: CommentedMap, variants: dict[str, Any] | None = None) -> list[str]:
    errors: list[str] = []
    models = index.get("models")
    if not isinstance(models, CommentedMap) or not models:
        return ["models map is missing or empty"]
    ids: dict[str, str] = {}
    for key, record in models.items():
        if not isinstance(record, dict):
            errors.append(f"{key}: record is not a mapping")
            continue
        model_id = record.get("id")
        if not isinstance(model_id, str) or not model_id.startswith("opencode-go/"):
            errors.append(f"{key}: invalid id")
            continue
        if model_id in ids:
            errors.append(f"{model_id}: duplicate id ({ids[model_id]} and {key})")
        ids[model_id] = key
        if record.get("status") not in ALLOWED_STATUS:
            errors.append(f"{key}: invalid status")
        guidance = record.get("guidance")
        if not isinstance(guidance, str) or sentence_count(guidance) > 2:
            errors.append(f"{key}: guidance exceeds two sentences or is missing")
        effort = record.get("effort") or {}
        values = effort.get("values")
        if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
            errors.append(f"{key}: effort.values must be a string list")
        else:
            if effort.get("control") != "none" and effort.get("default") not in values:
                errors.append(f"{key}: default effort not in effort.values")
        if not isinstance(record.get("sources"), list) or not record.get("sources"):
            errors.append(f"{key}: sources missing")
        else:
            sources = index.get("sources") or {}
            for source in record["sources"]:
                if source not in sources:
                    errors.append(f"{key}: unknown source {source}")
        if not isinstance(record.get("tags"), list) or not record.get("tags"):
            errors.append(f"{key}: tags missing")
        if not isinstance(record.get("pricing"), dict):
            errors.append(f"{key}: pricing must be a mapping")

    change_log = index.get("change_log")
    if change_log is not None:
        if not isinstance(change_log, list):
            errors.append("change_log must be a list")
        else:
            for position, entry in enumerate(change_log):
                if not isinstance(entry, dict):
                    errors.append(f"change_log[{position}] must be a mapping")
                    continue
                for field in ("date", "action", "models", "reason"):
                    if field not in entry:
                        errors.append(f"change_log[{position}] missing {field}")

    routing = index.get("routing") or {}
    for path, ref in iter_refs(routing):
        if ref not in models:
            errors.append(f"{path}: unresolved model reference {ref}")
        elif models[ref].get("status") == "removed_unverified":
            errors.append(f"{path}: routing points at removed model {ref}")
    for path, ref in iter_refs(index.get("reference_tiers") or {}):
        if ref not in models:
            errors.append(f"{path}: unresolved model reference {ref}")
    for role, route in (routing.get("builders") or {}).items():
        if not isinstance(route, dict):
            continue
        fallback = route.get("fallback") or {}
        if route.get("ref") and fallback.get("ref") == route.get("ref"):
            errors.append(f"routing.builders.{role}: fallback must differ from primary")
    for key, value in (routing.get("defaults") or {}).items():
        if value not in models:
            errors.append(f"routing.defaults.{key}: unresolved model reference {value}")

    if index.get("schema_version") not in {"1.0", "1.1"}:
        errors.append("schema_version must be 1.0 or 1.1")
    metadata = index.get("metadata") or {}
    if metadata.get("plan") != "go":
        errors.append("metadata.plan must be go")
    catalogue = metadata.get("catalogue") or {}
    verified_count = sum(
        1 for record in models.values() if record.get("status") == "verified_go"
    )
    if catalogue.get("go_models") != verified_count:
        errors.append(
            f"metadata.catalogue.go_models must equal verified count ({verified_count})"
        )

    if variants:
        snapshot = variants.get("models") or {}
        version = variants.get("opencode_version")
        for key, record in models.items():
            model_id = record.get("id")
            if version and snapshot.get(model_id) is not None:
                actual = list((record.get("effort") or {}).get("values") or [])
                expected = list(snapshot[model_id])
                if actual != expected:
                    errors.append(f"{key}: effort.values do not match variant snapshot")
    return errors


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_check(args: argparse.Namespace) -> int:
    state = ensure_state()
    lock_path = state / ".lock"
    with lock_path.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("go-model-index-maintain: another check is running", file=sys.stderr)
            return EXIT_ERROR

        try:
            docs_body, docs_meta = fetch(
                args.docs_url, "go-docs.mdx", offline=args.offline, refresh=args.refresh, state=state
            )
            endpoint_body, endpoint_meta = fetch(
                args.models_url, "go-models.json", offline=args.offline, refresh=args.refresh, state=state
            )
            dev_body, dev_meta = fetch(
                MODELS_DEV_URL, "models-dev.json", offline=args.offline, refresh=args.refresh, state=state
            )
            docs_text = docs_body.decode("utf-8")
            docs_names = parse_docs_models(docs_text)
            docs_pricing = parse_go_pricing(docs_text)
            endpoint_ids = {
                "opencode-go/" + item["id"]
                for item in json.loads(endpoint_body).get("data", [])
                if isinstance(item, dict) and item.get("id")
            }
            if not endpoint_ids:
                raise ValueError("Go models endpoint returned no models")
            installed_ids = installed_models()
            version = opencode_version()
            models_dev = parse_models_dev(dev_body)
            variants = None
            if args.variants.is_file():
                variants = json.loads(args.variants.read_text(encoding="utf-8"))
            index = load_index(args.index)
            previous = load_previous_report(state)
            report = compute_drift(
                index=index,
                docs_names=docs_names,
                docs_pricing=docs_pricing,
                endpoint_ids=endpoint_ids,
                installed_ids=installed_ids,
                models_dev=models_dev,
                variants=variants,
                current_version=version,
                previous=previous,
            )
            report["sources"] = {
                "docs": docs_meta,
                "endpoint": endpoint_meta,
                "models_dev": dev_meta,
                "installed": {"command": "opencode models", "count": len(installed_ids)},
                "variant_snapshot": str(args.variants) if variants else None,
            }
            write_report(report, state)
            if args.json:
                print(json.dumps(report, indent=1))
            else:
                print(markdown_report(report), end="")
            if report["status"] == "clean":
                return EXIT_CLEAN
            if report["status"] == "drift":
                return EXIT_DRIFT
            return EXIT_PARTIAL
        except Exception as exc:
            print(f"go-model-index-maintain: check failed: {exc}", file=sys.stderr)
            return EXIT_ERROR


def cmd_status(_args: argparse.Namespace) -> int:
    state = state_root()
    report_path = state / "last-check.json"
    print(f"state: {state}")
    print(f"variants: {DEFAULT_VARIANTS}")
    if not report_path.is_file():
        print("last check: never")
        return EXIT_CLEAN
    report = json.loads(report_path.read_text(encoding="utf-8"))
    print(f"last check: {report.get('checked_at')} ({report.get('status')})")
    print(f"opencode: {report.get('opencode_version')}")
    counts = report.get("counts", {})
    print(f"eligible: {counts.get('eligible')}  index: {counts.get('index')}")
    drift = report.get("drift", {})
    for key in ("added", "removed_pending", "removed_confirmed", "changed", "local_unavailable", "variant_gap"):
        values = drift.get(key) or []
        print(f"{key}: {len(values)}")
    snapshot = report.get("variant_snapshot", {})
    print(f"variant snapshot: {snapshot.get('version')} stale={snapshot.get('stale')}")
    return EXIT_CLEAN


def cmd_verify(args: argparse.Namespace) -> int:
    index = load_index(args.index)
    variants = None
    if args.variants.is_file():
        variants = json.loads(args.variants.read_text(encoding="utf-8"))
    errors = validate_index(index, variants)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return EXIT_ERROR
    print(f"verify: PASS ({len(index['models'])} models)")
    return EXIT_CLEAN


def cmd_research(args: argparse.Namespace) -> int:
    state = ensure_state()
    report_path = state / "last-check.json"
    if not report_path.is_file():
        print("research: no check report; run check first", file=sys.stderr)
        return EXIT_ERROR
    report = json.loads(report_path.read_text(encoding="utf-8"))
    drift = report.get("drift", {})
    candidates: list[tuple[str, str]] = []
    for action in ("added", "removed_pending", "removed_confirmed"):
        for model_id in drift.get(action) or []:
            candidates.append((action, model_id))
    for item in drift.get("changed") or []:
        candidates.append(("changed", item["id"]))
    if not candidates:
        print("research: nothing changed")
        return EXIT_CLEAN
    limit = max(1, min(args.limit, 10))
    selected = candidates[:limit]
    index = load_index(args.index)
    by_id = {record["id"]: record for record in index["models"].values()}
    lines = [
        "# Bounded model-index research",
        "",
        "Return a JSON proposal only. Do not rewrite the index. Do not invent benchmarks.",
        "Use the official source plus at most one independent benchmark source per model.",
        "",
        "## Token guards",
        "",
        f"- At most {limit} models in this packet.",
        "- One model call per model; one escalation maximum.",
        "- Do not read the full model index or parent conversation.",
        "",
        "## Models",
        "",
    ]
    for action, model_id in selected:
        record = by_id.get(model_id, {})
        lines.extend(
            [
                f"### {model_id} ({action})",
                "",
                "Current record:",
                "```json",
                json.dumps(record, indent=1)[:4000],
                "```",
                "",
                "Official sources:",
                f"- {DOCS_URL}",
                "- Provider model card or official model documentation",
                "",
                "Required proposal fields:",
                "- guidance (max two sentences), tags, role or why, limitations, confidence",
                "- pricing, allowance, context/output limits, effort values/default where changed",
                "- benchmarks, output tokens, cost per task, output speed",
                "- sources with URLs and checked dates",
                "",
            ]
        )
    prompt = "\n".join(lines)
    path = state / "research-prompt.md"
    atomic_write(path, prompt)
    print(f"research: wrote {path} ({len(selected)} models)")
    return EXIT_CLEAN


def _find_key(index: CommentedMap, model_id: str) -> str | None:
    for key, record in index["models"].items():
        if record.get("id") == model_id:
            return key
    return None


def _replace_routing_refs(value: Any, old: str, new: str) -> Any:
    if isinstance(value, dict):
        return {k: _replace_routing_refs(v, old, new) for k, v in value.items()}
    if isinstance(value, list):
        return [_replace_routing_refs(v, old, new) for v in value]
    if isinstance(value, str) and value == old:
        return new
    return value


def cmd_apply(args: argparse.Namespace) -> int:
    state = ensure_state()
    lock_handle = (state / ".lock").open("w")
    try:
        fcntl.flock(lock_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("apply: another maintenance run is in progress", file=sys.stderr)
        lock_handle.close()
        return EXIT_ERROR
    proposal = json.loads(args.proposal.read_text(encoding="utf-8"))
    if not isinstance(proposal, dict) or not isinstance(proposal.get("models"), dict):
        print("apply: proposal must contain a models object", file=sys.stderr)
        return EXIT_ERROR
    if not proposal.get("reason"):
        print("apply: proposal.reason is required", file=sys.stderr)
        return EXIT_ERROR
    index = load_index(args.index)
    models = index["models"]
    variants = None
    if args.variants.is_file():
        variants = json.loads(args.variants.read_text(encoding="utf-8"))
    actions: list[str] = []
    for model_id, change in proposal["models"].items():
        if not isinstance(change, dict):
            print(f"apply: {model_id}: change must be an object", file=sys.stderr)
            return EXIT_ERROR
        action = change.get("action", "update")
        key = _find_key(index, model_id)
        if action == "add":
            if key is not None:
                print(f"apply: {model_id}: already exists", file=sys.stderr)
                return EXIT_ERROR
            if not change.get("guidance") or not change.get("tags"):
                print(f"apply: {model_id}: new models need guidance and tags", file=sys.stderr)
                return EXIT_ERROR
            record = dict(change.get("record") or {})
            record["id"] = model_id
            record.setdefault("name", change.get("name", model_id))
            record.setdefault("provider", "opencode-go")
            record["status"] = "provisional_unverified"
            record.setdefault("role", "not_shortlisted")
            record.setdefault("why", "provisional; pending review")
            record.setdefault("guidance", change.get("guidance"))
            record.setdefault("effort", change.get("effort", {"control": "none", "values": [], "default": "provider_default", "escalate": "not_configurable"}))
            record.setdefault("pricing", change.get("pricing", {}))
            record.setdefault("limitations", change.get("limitations", ["provisional"]))
            record.setdefault("confidence", change.get("confidence", "low"))
            record.setdefault("sources", change.get("sources", ["go_docs"]))
            record.setdefault("tags", change.get("tags", []))
            models[model_id.split("/", 1)[1]] = record
            actions.append(f"add {model_id}")
            continue
        if key is None:
            print(f"apply: {model_id}: not found", file=sys.stderr)
            return EXIT_ERROR
        record = models[key]
        if action == "remove":
            replacement = change.get("replacement_ref")
            replacement_key = None
            if replacement:
                replacement_key = replacement.split("/", 1)[1] if replacement.startswith("opencode-go/") else replacement
                if replacement_key not in models or replacement_key == key:
                    print(f"apply: {model_id}: replacement_ref is not a distinct existing model", file=sys.stderr)
                    return EXIT_ERROR
            refs_before = [ref for _, ref in iter_refs(index.get("routing") or {})]
            if key in refs_before and not replacement_key:
                print(f"apply: {model_id}: routed model removal needs replacement_ref", file=sys.stderr)
                return EXIT_ERROR
            if replacement_key:
                index["routing"] = _replace_routing_refs(index.get("routing") or {}, key, replacement_key)
                if "reference_tiers" in index:
                    index["reference_tiers"] = _replace_routing_refs(index["reference_tiers"], key, replacement_key)
            record["status"] = "removed_unverified"
            record["removed_on"] = dt.date.today().isoformat()
            if replacement_key:
                record["replacement_ref"] = replacement_key
            actions.append(f"remove {model_id}")
            continue
        fields = change.get("fields") or {}
        if not isinstance(fields, dict):
            print(f"apply: {model_id}: fields must be an object", file=sys.stderr)
            return EXIT_ERROR
        if fields.get("status") == "removed_unverified":
            replacement = change.get("replacement_ref")
            replacement_key = None
            if replacement:
                replacement_key = replacement.split("/", 1)[1] if replacement.startswith("opencode-go/") else replacement
                if replacement_key not in models or replacement_key == key:
                    print(f"apply: {model_id}: replacement_ref is not a distinct existing model", file=sys.stderr)
                    return EXIT_ERROR
            refs_before = [ref for _, ref in iter_refs(index.get("routing") or {})]
            if key in refs_before and not replacement_key:
                print(f"apply: {model_id}: routed status removal needs replacement_ref", file=sys.stderr)
                return EXIT_ERROR
            if replacement_key:
                index["routing"] = _replace_routing_refs(index.get("routing") or {}, key, replacement_key)
                if "reference_tiers" in index:
                    index["reference_tiers"] = _replace_routing_refs(index["reference_tiers"], key, replacement_key)
                record["replacement_ref"] = replacement_key
            record["removed_on"] = dt.date.today().isoformat()
        for field, value in fields.items():
            if field in {"id", "provider"}:
                print(f"apply: {model_id}: refusing to change {field}", file=sys.stderr)
                return EXIT_ERROR
            record[field] = value
        for field in ("guidance", "tags", "role", "why", "limitations", "benchmarks", "confidence", "sources"):
            if field in change:
                record[field] = change[field]
        actions.append(f"update {model_id}: {', '.join(sorted(fields)) or 'reviewed fields'}")

    if not actions:
        print("apply: nothing to do")
        return EXIT_CLEAN
    metadata = index.setdefault("metadata", {})
    metadata.setdefault("catalogue", {})["go_models"] = sum(
        1 for record in index["models"].values() if record.get("status") == "verified_go"
    )
    errors = validate_index(index, variants)
    if errors:
        for error in errors:
            print(f"apply: validation failed: {error}", file=sys.stderr)
        return EXIT_ERROR

    if not args.apply:
        print("apply: dry run (rerun with --apply to write)")
        for action in actions:
            print(f"  {action}")
        return EXIT_CLEAN

    backup = state / "backups" / f"opencode-go-model-index-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.yaml"
    shutil.copy2(args.index, backup)
    index.setdefault("change_log", [])
    index["change_log"].append(
        {
            "date": dt.date.today().isoformat(),
            "action": "proposal",
            "actions": actions,
            "models": sorted(proposal["models"].keys()),
            "reason": proposal["reason"],
        }
    )
    metadata = index.setdefault("metadata", {})
    metadata["verification_date"] = dt.date.today().isoformat()
    metadata["catalogue"] = metadata.get("catalogue", {})
    metadata["catalogue"]["go_models"] = sum(
        1 for record in index["models"].values() if record.get("status") == "verified_go"
    )
    metadata["change_summary"] = f"Maintenance apply: {proposal['reason']}"
    try:
        dump_index(index, args.index)
        check = load_index(args.index)
        errors = validate_index(check, variants)
        if errors:
            raise ValueError("; ".join(errors))
    except Exception as exc:
        shutil.copy2(backup, args.index)
        print(f"apply: failed and restored backup: {exc}", file=sys.stderr)
        return EXIT_ERROR
    print(f"apply: wrote {args.index}; backup {backup}")
    for action in actions:
        print(f"  {action}")
    return EXIT_CLEAN


def _selftest() -> int:
    base_index = {
        "schema_version": "1.1",
        "metadata": {"plan": "go"},
        "sources": {"go_docs": {"url": "x"}},
        "routing": {"defaults": {"builder": "a", "planner": "a"}},
        "models": {
            "a": {
                "id": "opencode-go/a",
                "status": "verified_go",
                "guidance": "Use A. It works.",
                "effort": {"control": "variant", "values": ["low", "high"], "default": "low"},
                "tags": ["coding"],
                "sources": ["go_docs"],
                "pricing": {"input": 1.0, "output": 2.0, "cache_read": 0.1, "cache_write": 0.2},
                "monthly_allowance_usd": 10,
            }
        },
    }
    variants = {
        "opencode_version": "1.0",
        "models": {"opencode-go/a": ["low", "high"]},
    }
    base = dict(
        index=base_index,
        docs_names=["A"],
        docs_pricing={"A": {"input": 1.0, "output": 2.0, "cache_read": 0.1, "cache_write": 0.2, "monthly_allowance_usd": 10}},
        endpoint_ids={"opencode-go/a"},
        installed_ids={"opencode-go/a"},
        models_dev={"opencode-go/a": {"name": "A", "limit": {"context": 1000, "output": 100}}},
        variants=variants,
        current_version="1.0",
        previous=None,
    )
    clean = compute_drift(**base)
    assert clean["status"] == "clean", clean
    added = compute_drift(**{**base, "endpoint_ids": {"opencode-go/a", "opencode-go/b"}, "docs_names": ["A", "B"], "docs_pricing": {"A": base["docs_pricing"]["A"], "B": {"input": 1, "output": 2, "cache_read": 0, "cache_write": 0, "monthly_allowance_usd": 5}}, "models_dev": {"opencode-go/a": {"name": "A"}, "opencode-go/b": {"name": "B"}}})
    assert added["drift"]["added"] == ["opencode-go/b"], added
    removed = compute_drift(**{**base, "endpoint_ids": set(), "docs_names": [], "docs_pricing": {}, "models_dev": {}})
    assert "opencode-go/a" in removed["drift"]["removed_pending"], removed
    changed = compute_drift(**{**base, "docs_pricing": {"A": {**base["docs_pricing"]["A"], "monthly_allowance_usd": 99}}})
    assert any(x["id"] == "opencode-go/a" for x in changed["drift"]["changed"]), changed
    local = compute_drift(**{**base, "installed_ids": set()})
    assert local["drift"]["local_unavailable"] == ["opencode-go/a"], local
    assert not local["drift"]["removed_pending"], local
    gap = compute_drift(**{**base, "variants": {**variants, "opencode_version": "0.9"}})
    assert gap["drift"]["variant_gap"], gap
    disagreement = compute_drift(
        **{
            **base,
            "docs_names": ["A", "B"],
            "docs_pricing": {
                "A": base["docs_pricing"]["A"],
                "B": {"input": 1, "output": 2, "cache_read": 0, "cache_write": 0, "monthly_allowance_usd": 5},
            },
            "models_dev": {
                "opencode-go/a": {"name": "A"},
                "opencode-go/b": {"name": "B"},
            },
        }
    )
    assert "opencode-go/b" in disagreement["drift"]["source_disagreement"]["docs_only"], disagreement
    print("selftest: PASS")
    return EXIT_CLEAN


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--variants", type=Path, default=DEFAULT_VARIANTS)
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check", help="read-only drift check")
    check.add_argument("--offline", action="store_true")
    check.add_argument("--refresh", action="store_true")
    check.add_argument("--json", action="store_true")
    check.add_argument("--docs-url", default=DOCS_URL)
    check.add_argument("--models-url", default=MODELS_URL)
    check.set_defaults(func=cmd_check)

    status = sub.add_parser("status", help="show last check")
    status.set_defaults(func=cmd_status)

    verify = sub.add_parser("verify", help="validate the index")
    verify.set_defaults(func=cmd_verify)

    research = sub.add_parser("research", help="emit a bounded research packet")
    research.add_argument("--limit", type=int, default=3)
    research.set_defaults(func=cmd_research)

    apply = sub.add_parser("apply", help="apply a reviewed proposal")
    apply.add_argument("--proposal", type=Path, required=True)
    apply.add_argument("--apply", action="store_true")
    apply.set_defaults(func=cmd_apply)

    sub.add_parser("selftest", help="run offline drift fixtures").set_defaults(func=lambda _a: _selftest())
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.command in {"check", "verify", "research", "apply"} and not args.index.is_file():
        print(f"go-model-index-maintain: index not found: {args.index}", file=sys.stderr)
        return EXIT_ERROR
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
