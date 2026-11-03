import assert from "node:assert/strict";
import test from "node:test";
import { resolveKeyval } from "./keymap-fixture.mjs";

test("production Shell key resolver preserves every printable ASCII character, including plus and uppercase", () => {
  for (let code = 0x20; code <= 0x7e; code++) {
    const actual = resolveKeyval(String.fromCharCode(code));
    assert.equal(actual?.keyval, code, `character ${code} must not be lowercased or parsed as a chord`);
    assert.deepEqual(Array.from(actual.modifiers), []);
  }
});

test("production Shell resolver supports modifier-only click options and case-insensitive named chords", () => {
  assert.equal(resolveKeyval("ctrl")?.keyval, 0xffe3);
  assert.equal(resolveKeyval("SHIFT")?.keyval, 0xffe1);
  assert.equal(resolveKeyval("Return")?.keyval, 0xff0d);
  const chord = resolveKeyval("CTRL+Shift+A");
  assert.equal(chord?.keyval, 97);
  assert.deepEqual(Array.from(chord.modifiers), [0xffe3, 0xffe1]);
});

test("production Shell resolver still rejects malformed, unsupported and control input", () => {
  for (const input of [null, 7, "", "\n", "é", "x".repeat(33), "ctrl+", "ctrl++a", "unknown+a", "constructor+a", "__proto__+a"])
    assert.equal(resolveKeyval(input), null, String(input));
});
