"""Parse and edit bounded OpenCode JSONC without evaluating its values.

This is the pure helper expected by mcp_runtime.py, not a setup entrypoint.
Only comments and trailing commas extend JSON; ambiguous input is rejected.
"""

from __future__ import annotations

import json
import math


MAX_CHARACTERS = 1024 * 1024
MAX_DEPTH = 128
JSON_WHITESPACE = " \t\r\n"


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """Reject duplicate decoded keys at every nesting level without echoing keys."""
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON object key")
        result[key] = value
    return result


def _reject_constant(value: str) -> object:
    """Reject Python's non-JSON NaN and Infinity extensions."""
    raise ValueError("non-finite JSON number")


def _finite_float(value: str) -> float:
    """Reject exponent overflow as well as explicit non-finite constants."""
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("non-finite JSON number")
    return number


def parse_jsonc(text: str) -> object:
    """Parse JSON plus line/block comments and valid trailing commas.

    Comments become whitespace, never token concatenation. Strings are left
    intact for the standard JSON decoder. Errors never include input excerpts.
    The caller owns UTF-8, file-size, path safety and root-object validation.
    """
    if len(text) > MAX_CHARACTERS:
        raise ValueError("JSONC exceeds the character limit")
    output = list(text)
    comma_indices: list[int] = []
    index = 0
    depth = 0
    while index < len(text):
        character = text[index]
        if character == '"':
            index += 1
            while index < len(text):
                if text[index] == "\\":
                    index += 2
                elif text[index] == '"':
                    index += 1
                    break
                else:
                    index += 1
            continue
        if text.startswith("//", index):
            end = index + 2
            while end < len(text) and text[end] not in "\r\n":
                end += 1
            output[index:end] = " " * (end - index)
            index = end
            continue
        if text.startswith("/*", index):
            end = text.find("*/", index + 2)
            if end < 0:
                raise ValueError("unterminated JSONC comment")
            end += 2
            for position in range(index, end):
                if output[position] not in "\r\n":
                    output[position] = " "
            index = end
            continue
        if character in "[{":
            depth += 1
            if depth > MAX_DEPTH:
                raise ValueError("JSONC exceeds the nesting limit")
        elif character in "]}":
            depth -= 1
        elif character == ",":
            comma_indices.append(index)
        index += 1

    for position in comma_indices:
        following = position + 1
        while following < len(output) and output[following] in JSON_WHITESPACE:
            following += 1
        previous = position - 1
        while previous >= 0 and output[previous] in JSON_WHITESPACE:
            previous -= 1
        if (following < len(output) and output[following] in "]}" and previous >= 0
                and output[previous] not in "[{,:"):
            output[position] = " "
    try:
        return json.loads("".join(output), object_pairs_hook=_unique_object,
                          parse_constant=_reject_constant, parse_float=_finite_float)
    except (ValueError, RecursionError) as error:
        raise ValueError("invalid or ambiguous JSONC") from error


def _skip_trivia(text: str, index: int) -> int:
    """Skip validated JSON whitespace and comments."""
    while index < len(text):
        if text[index] in JSON_WHITESPACE:
            index += 1
        elif text.startswith("//", index):
            end = index + 2
            while end < len(text) and text[end] not in "\r\n":
                end += 1
            index = end
        elif text.startswith("/*", index):
            index = text.find("*/", index + 2) + 2
        else:
            break
    return index


def _string_end(text: str, start: int) -> int:
    """Return the end of a validated JSON string token."""
    index = start + 1
    while index < len(text):
        if text[index] == "\\":
            index += 2
        elif text[index] == '"':
            return index + 1
        else:
            index += 1
    raise ValueError("invalid or ambiguous JSONC")


def _value_end(text: str, start: int) -> int:
    """Return a JSON value's end without consuming surrounding comments."""
    if text[start] == '"':
        return _string_end(text, start)
    if text[start] not in "[{":
        index = start
        while index < len(text):
            if (text[index] in JSON_WHITESPACE or text[index] in ",]}"
                    or text.startswith(("//", "/*"), index)):
                break
            index += 1
        return index

    closers = ["]" if text[start] == "[" else "}"]
    index = start + 1
    while closers:
        if text[index] == '"':
            index = _string_end(text, index)
        elif text.startswith("//", index):
            index = _skip_trivia(text, index)
        elif text.startswith("/*", index):
            index = _skip_trivia(text, index)
        elif text[index] in "[{":
            closers.append("]" if text[index] == "[" else "}")
            index += 1
        elif text[index] in "]}":
            if text[index] != closers[-1]:
                raise ValueError("invalid or ambiguous JSONC")
            closers.pop()
            index += 1
        else:
            index += 1
    return index


def _top_level_properties(text: str) -> tuple[list[tuple[str, int, int]], int]:
    """Locate top-level keys and value spans in already-validated JSONC."""
    index = _skip_trivia(text, 0)
    if index >= len(text) or text[index] != "{":
        raise ValueError("JSONC root must be an object")
    index = _skip_trivia(text, index + 1)
    properties: list[tuple[str, int, int]] = []
    if text[index] == "}":
        return properties, index

    while True:
        key_end = _string_end(text, index)
        key = json.loads(text[index:key_end])
        index = _skip_trivia(text, key_end)
        index = _skip_trivia(text, index + 1)  # validated colon
        value_start = index
        value_end = _value_end(text, value_start)
        properties.append((key, value_start, value_end))
        index = _skip_trivia(text, value_end)
        if text[index] == "}":
            return properties, index
        index = _skip_trivia(text, index + 1)  # validated comma
        if text[index] == "}":
            return properties, index


def _json_values_equal(first: object, second: object) -> bool:
    """Compare JSON values without treating booleans as numbers."""
    if isinstance(first, bool) or isinstance(second, bool):
        return type(first) is type(second) and first == second
    if isinstance(first, dict) and isinstance(second, dict):
        return (first.keys() == second.keys()
                and all(_json_values_equal(first[key], second[key]) for key in first))
    if isinstance(first, list) and isinstance(second, list):
        return (len(first) == len(second)
                and all(_json_values_equal(left, right) for left, right in zip(first, second)))
    if isinstance(first, (int, float)) and isinstance(second, (int, float)):
        return first == second
    return type(first) is type(second) and first == second


def replace_top_level(text: str, key: str, value: object) -> str:
    """Replace or add one root property while preserving all other source bytes.

    The complete source is validated before span discovery. Existing values are
    replaced only across their JSON token span; an equivalent JSON value returns
    the original source exactly. New values use compact JSON serialization.

    Args:
        text: The complete bounded JSONC source.
        key: The decoded top-level property name to replace or add.
        value: A JSON-serializable value within the same source limits.

    Returns:
        The updated JSONC source, or the original string for a semantic no-op.

    Raises:
        TypeError: If the key is not a string or the value is not JSON-serializable.
        ValueError: If the source or resulting document is invalid or exceeds limits.
    """
    parsed = parse_jsonc(text)
    if not isinstance(parsed, dict):
        raise ValueError("JSONC root must be an object")
    if not isinstance(key, str):
        raise TypeError("JSONC property key must be a string")

    try:
        serialized = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    except RecursionError as error:
        raise ValueError("JSON value exceeds the nesting limit") from error
    replacement = parse_jsonc(serialized)
    if key in parsed and _json_values_equal(parsed[key], replacement):
        return text

    properties, closing_brace = _top_level_properties(text)
    for property_key, value_start, value_end in properties:
        if property_key == key:
            updated = text[:value_start] + serialized + text[value_end:]
            parse_jsonc(updated)
            return updated

    encoded_key = json.dumps(key, ensure_ascii=False)
    if properties:
        insertion = f', {encoded_key}: {serialized}'
        insertion_index = properties[-1][2]
    else:
        insertion = f' {encoded_key}: {serialized}'
        insertion_index = closing_brace
    updated = text[:insertion_index] + insertion + text[insertion_index:]
    parse_jsonc(updated)
    return updated
