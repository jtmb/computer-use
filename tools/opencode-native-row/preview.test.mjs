import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { pin, patchPaths, preview } from "./preview.mjs"

const patch = fileURLToPath(new URL("./native-row.patch", import.meta.url))
const source = process.env.NATIVE_ROW_SOURCE_CHECKOUT
let temporary
let checkout
const git = (...args) =>
  execFileSync("git", ["-C", checkout, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()

before(() => {
  if (!source) return
  temporary = mkdtempSync("/tmp/opencode/native-row-preview-")
  checkout = join(temporary, "checkout")
  execFileSync("git", ["clone", "--shared", "--no-checkout", source, checkout], { stdio: "pipe" })
  git("-c", "core.hooksPath=/dev/null", "checkout", "--detach", pin)
  git("remote", "set-url", "origin", "https://github.com/anomalyco/opencode.git")
})
after(() => {
  if (temporary) rmSync(temporary, { recursive: true, force: true })
})

test("preview requires an explicit absolute source path", () => {
  assert.throws(() => preview(), /absolute source checkout/)
  assert.throws(() => preview("."), /absolute source checkout/)
})

test("artifact scope contains only the four authorized upstream files", () => {
  const bytes = readFileSync(patch, "utf8")
  assert.equal(patchPaths(bytes).length, 4)
  assert.throws(() => patchPaths(bytes + "\ndiff --git a/package.json b/package.json\n"), /scope/)
  assert.throws(() => patchPaths(bytes.replace("b/packages/tui/test/subagent-row.test.ts", "b/other.ts")), /Renames/)
})

test("preview checks applicability without changing the pristine pinned checkout", { skip: !source }, () => {
  const before = readFileSync(join(checkout, "packages/tui/src/routes/session/composer/subagents-tab.tsx"))
  assert.equal(preview(checkout).readOnly, true)
  assert.equal(git("status", "--porcelain"), "")
  assert.deepEqual(readFileSync(join(checkout, "packages/tui/src/routes/session/composer/subagents-tab.tsx")), before)
})

test("preview rejects subdirectories and a nonofficial origin", { skip: !source }, () => {
  assert.throws(() => preview(join(checkout, "packages/tui")), /checkout root/)
  git("remote", "set-url", "origin", "https://example.invalid/not-upstream.git")
  try {
    assert.throws(() => preview(checkout), /origin/)
  } finally {
    git("remote", "set-url", "origin", "https://github.com/anomalyco/opencode.git")
  }
})

test("preview rejects dirty work and altered patch bytes", { skip: !source }, () => {
  const dirty = join(checkout, "untracked-user-work.txt")
  writeFileSync(dirty, "Preserve this work")
  try {
    assert.throws(() => preview(checkout), /must be clean/)
    assert.equal(readFileSync(dirty, "utf8"), "Preserve this work")
  } finally {
    rmSync(dirty)
  }
  const altered = join(temporary, "altered.patch")
  writeFileSync(altered, readFileSync(patch, "utf8") + "\n")
  assert.throws(() => preview(checkout, altered), /SHA-256/)
})

test("preview rejects a checkout with no pinned HEAD", { skip: !source }, () => {
  git("symbolic-ref", "HEAD", "refs/heads/not-the-pin")
  try {
    assert.throws(() => preview(checkout), /HEAD|unknown revision/)
  } finally {
    git("checkout", "--detach", pin)
  }
})
