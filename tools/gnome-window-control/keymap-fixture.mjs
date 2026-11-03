import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Exercise the actual Shell adapter, not a second key parser that can hide drift.
const source = readFileSync(new URL("./extension.js", import.meta.url), "utf8");
const constantsStart = source.indexOf("const MODIFIER_KEYVALS =");
const constantsEnd = source.indexOf("const CAPTURE_ERROR_NAMES =", constantsStart);
const methodStart = source.indexOf("    _resolveKeyval(name) {");
const methodEnd = source.indexOf("    _windowRecords() {", methodStart);
assert.ok(constantsStart >= 0 && constantsEnd > constantsStart && methodStart >= 0 && methodEnd > methodStart, "production key resolver boundaries must be present");
export const resolveKeyval = vm.runInNewContext(`${source.slice(constantsStart, constantsEnd)}\n({${source.slice(methodStart, methodEnd)}})._resolveKeyval`, Object.create(null), { timeout: 100, filename: "production-shell-keymap.js" });
