import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { buildReceipt } from "./verification-receipt.mjs"

const git = (cwd, ...args) => execFileSync("git", args, { cwd }).toString().trim()

async function fixture(t) {
  const directory = await mkdtemp("/tmp/opencode/verification-receipt-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  git(directory, "init", "--quiet")
  git(directory, "config", "user.email", "fixture@example.invalid")
  git(directory, "config", "user.name", "Fixture")
  await writeFile(path.join(directory, "tracked.txt"), "one\n")
  git(directory, "add", "tracked.txt")
  git(directory, "commit", "--quiet", "-m", "fixture commit")
  return directory
}

test("receipt records head, staged bytes and dirty count without claiming acceptance", async t => {
  const directory = await fixture(t)
  await writeFile(path.join(directory, "staged.txt"), "two\n")
  git(directory, "add", "staged.txt")
  await writeFile(path.join(directory, "untracked.txt"), "three\n")

  const receipt = buildReceipt({
    root: directory,
    nativeRoot: directory,
    voiceRoot: null,
    checks: { health: "not run", offlineCI: "not run" },
    date: "2026-11-02",
  })

  assert.equal(receipt.repository.head, git(directory, "rev-parse", "HEAD"))
  assert.equal(receipt.repository.headSubject, "fixture commit")
  assert.ok(receipt.repository.stagedDiffBytes > 0, "staged changes are measured, not assumed absent")
  assert.match(receipt.repository.stagedDiffSha256, /^[a-f0-9]{64}$/)
  assert.ok(receipt.repository.dirtyEntries >= 2, "staged and untracked entries both count")
  assert.equal(receipt.frozenNative.head, receipt.repository.head)
  assert.equal(receipt.voiceRepository, null)
  assert.match(receipt.limits.join(" "), /not runtime/)
})

test("receipt reflects an empty index instead of inventing staged bytes", async t => {
  const directory = await fixture(t)
  const receipt = buildReceipt({
    root: directory,
    nativeRoot: directory,
    voiceRoot: null,
    checks: {},
    date: "2026-11-02",
  })
  assert.equal(receipt.repository.stagedDiffBytes, 0)
  assert.equal(receipt.repository.stagedDiffSha256, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  assert.equal(receipt.repository.dirtyEntries, 0)
})
