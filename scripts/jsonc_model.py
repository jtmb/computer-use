#!/usr/bin/env python3
"""Read or replace the top-level "model" value in an OpenCode JSONC file.

OpenCode configuration allows comments, and nested agents also have "model"
keys. This helper scans for the depth-1 key so a guided model change never
rewrites an agent model by accident.

Usage:
    jsonc_model.py get FILE
    jsonc_model.py set FILE MODEL
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


class ConfigError(Exception):
    pass


def skip_string(text: str, index: int) -> int:
    if index >= len(text) or text[index] != '"':
        raise ConfigError("expected a string")
    i = index + 1
    while i < len(text):
        char = text[i]
        if char == "\\":
            i += 2
            continue
        if char == '"':
            return i + 1
        i += 1
    raise ConfigError("unterminated string")


def skip_ignored(text: str, index: int) -> int:
    """Skip whitespace, line comments, and block comments."""
    i = index
    length = len(text)
    while i < length:
        char = text[i]
        if char in " \t\r\n":
            i += 1
            continue
        if char == "/" and i + 1 < length and text[i + 1] == "/":
            newline = text.find("\n", i + 2)
            i = length if newline == -1 else newline + 1
            continue
        if char == "/" and i + 1 < length and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            if end == -1:
                raise ConfigError("unterminated block comment")
            i = end + 2
            continue
        break
    return i


def skip_value(text: str, index: int) -> int:
    """Return the index just past a JSON value starting at index."""
    start = skip_ignored(text, index)
    if start >= len(text):
        raise ConfigError("missing value")
    char = text[start]
    if char == '"':
        return skip_string(text, start)
    if char in "{[":
        closing = "}" if char == "{" else "]"
        depth = 0
        i = start
        while i < len(text):
            current = text[i]
            if current == '"':
                i = skip_string(text, i)
                continue
            if current == "/" and i + 1 < len(text) and text[i + 1] in "/*":
                i = skip_ignored(text, i)
                continue
            if current == char:
                depth += 1
            elif current == closing:
                depth -= 1
                if depth == 0:
                    return i + 1
            i += 1
        raise ConfigError("unterminated object or array")
    i = start
    while i < len(text) and text[i] not in ",}]":
        i += 1
    return i


def find_model(text: str) -> tuple[int, int]:
    """Return (value_start, value_end) for the depth-1 "model" key."""
    depth = 0
    i = 0
    last_significant = ""
    length = len(text)
    while i < length:
        char = text[i]
        if char in " \t\r\n":
            i += 1
            continue
        if char == "/" and i + 1 < length and text[i + 1] in "/*":
            i = skip_ignored(text, i)
            continue
        if char == '"':
            is_key = depth == 1 and last_significant in "{,"
            end = skip_string(text, i)
            if is_key:
                key = text[i:end]
                try:
                    if json.loads(key) == "model":
                        colon = skip_ignored(text, end)
                        if colon >= length or text[colon] != ":":
                            raise ConfigError('top-level "model" has no value')
                        value_start = skip_ignored(text, colon + 1)
                        value_end = skip_value(text, value_start)
                        return value_start, value_end
                except json.JSONDecodeError:
                    pass
            last_significant = '"'
            i = end
            continue
        if char in "{[,":
            depth += 1 if char in "{[" else 0
            last_significant = char
            i += 1
            continue
        if char in "}]":
            depth -= 1
            last_significant = char
            i += 1
            continue
        last_significant = char
        i += 1
    raise ConfigError('no top-level "model" field found')


def get(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    start, end = find_model(text)
    value = json.loads(text[start:end])
    if isinstance(value, dict):
        provider = value.get("providerID", "")
        model = value.get("model", "")
        return f"{provider}/{model}".strip("/")
    return value if isinstance(value, str) else ""


def set_model(path: Path, model: str) -> None:
    text = path.read_text(encoding="utf-8")
    start, end = find_model(text)
    raw = text[start:end]
    if not raw.startswith('"'):
        raise ConfigError('top-level "model" is not a string; edit it manually')
    updated = text[:start] + json.dumps(model) + text[end:]
    temporary = path.with_name(f".{path.name}.tmp")
    try:
        temporary.write_text(updated, encoding="utf-8")
        temporary.chmod(path.stat().st_mode)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[0] not in {"get", "set"}:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    path = Path(argv[1])
    try:
        if argv[0] == "get":
            print(get(path))
        else:
            if len(argv) != 3:
                print(__doc__.strip(), file=sys.stderr)
                return 2
            set_model(path, argv[2])
    except (ConfigError, OSError, json.JSONDecodeError) as error:
        print(f"jsonc_model: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
