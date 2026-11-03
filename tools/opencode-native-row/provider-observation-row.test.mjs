import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { lstat, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const HERE = dirname(fileURLToPath(import.meta.url))
const PIN = "ba546ec1598a70db2570e9c6258028d955ba8f58"
const BASE_SHA256 = "2825d876035054ee46f71f7d9c6815918bad32569242832e31174325633f86fe"
const ROW_SHA256 = "5f61c02073c192d3f05c33053f736b0b213e5b7ac7d5c77f9eaf8b65ed25f43d"
const SOURCE = process.env.NATIVE_ROW_SOURCE_CHECKOUT
const BUN = process.env.NATIVE_ROW_BUN
const hash = value => createHash("sha256").update(value).digest("hex")
const targets = ["packages/tui/src/routes/session/composer/subagent-row.ts", "packages/tui/src/routes/session/composer/subagents-tab.tsx"]
const additions = ["packages/tui/test/subagent-row-observation.test.ts", "packages/tui/test/subagent-row-observation.view.test.tsx"]
const preserved = [...targets, "packages/tui/test/subagent-row.test.ts", "packages/tui/test/subagent-row.view.test.tsx"]
const summary = value => ({
  passed: Number(value.match(/^\s*(\d+) pass$/mu)?.[1]),
  failed: Number(value.match(/^\s*(\d+) fail$/mu)?.[1]),
  tests: Number(value.match(/Ran (\d+) tests? across /u)?.[1]),
  outputSha256: hash(value),
})

test("response-reported rows use the actual pinned native composer and preserve the base patch", {
  skip: !SOURCE || !BUN ? "requires explicit NATIVE_ROW_SOURCE_CHECKOUT and NATIVE_ROW_BUN; no installation or live TUI is started" : false,
  timeout: 180000,
}, async t => {
  assert.ok(isAbsolute(SOURCE) && isAbsolute(BUN))
  const root = await mkdtemp("/tmp/opencode/provider-row-check-")
  t.after(() => rm(root, { recursive: true, force: true }))
  const env = {
    PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root, LANG: "C.UTF-8", CI: "true",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0",
    BUN_INSTALL_CACHE_DIR: join(root, "bun-cache"), BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(root, "transpiler-cache"),
  }
  const git = (cwd, ...args) => execFileSync("/usr/bin/git", ["-c", "core.hooksPath=/dev/null", ...args],
    { cwd, env, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024 })
  assert.equal(git(SOURCE, "rev-parse", "HEAD").trim(), PIN)
  assert.match(git(SOURCE, "config", "--get", "remote.origin.url").trim(), /^https:\/\/github\.com\/anomalyco\/opencode(?:\.git)?$/u)
  const original = await Promise.all(preserved.map(async path => hash(await readFile(join(SOURCE, path)))))
  const status = git(SOURCE, "status", "--porcelain")
  const binary = await lstat(BUN)
  assert.ok(binary.isFile() && !binary.isSymbolicLink())
  assert.equal(execFileSync(BUN, ["--version"], { env, encoding: "utf8", timeout: 10000 }).trim(), "1.4.2")
  const basePath = join(HERE, "native-row.patch"), rowPath = join(HERE, "provider-observation-row.patch")
  assert.equal(hash(await readFile(basePath)), BASE_SHA256)
  const patch = await readFile(rowPath, "utf8")
  assert.equal(hash(patch), ROW_SHA256)
  assert.deepEqual([...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gmu)].map(match => [match[1], match[2]]).sort(),
    [...targets, ...additions].map(path => [path, path]).sort())
  const checkout = join(root, "checkout")
  git(root, "clone", "--quiet", "--shared", "--no-checkout", "--no-recurse-submodules", SOURCE, checkout)
  git(checkout, "checkout", "--quiet", "--detach", PIN)
  for (const entry of await readdir(join(SOURCE, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(SOURCE, "packages", entry.name, "node_modules")
    try {
      if ((await lstat(path)).isDirectory()) await symlink(path, join(checkout, "packages", entry.name, "node_modules"), "dir")
    } catch (error) { if (error.code !== "ENOENT") throw error }
  }
  const dependencies = join(SOURCE, "node_modules")
  if ((await lstat(dependencies)).isDirectory()) await symlink(dependencies, join(checkout, "node_modules"), "dir")
  git(checkout, "apply", "--check", "--whitespace=error-all", basePath)
  git(checkout, "apply", "--whitespace=error-all", basePath)
  const includeTests = additions.map(path => `--include=${path}`)
  git(checkout, "apply", "--check", "--whitespace=error-all", ...includeTests, rowPath)
  git(checkout, "apply", "--whitespace=error-all", ...includeTests, rowPath)
  const runNative = (...files) => spawnSync(BUN, ["test", "--no-install", "--no-env-file", "--no-orphans", "--timeout", "30000", ...files],
    { cwd: join(checkout, "packages/tui"), env, encoding: "utf8", timeout: 75000, maxBuffer: 2 * 1024 * 1024 })
  const files = additions.map(path => path.slice("packages/tui/".length))
  const before = runNative(...files), beforeText = `${before.stdout}\n${before.stderr}`
  assert.equal(before.signal, null, beforeText)
  assert.equal(before.status, 1, beforeText)
  assert.match(beforeText, /\(fail\)/u)
  assert.equal(summary(beforeText).tests, 47, "every new native case must execute before source application")
  assert.doesNotMatch(beforeText, /Cannot find (?:package|module)|SyntaxError/u)
  const excludeTests = additions.map(path => `--exclude=${path}`)
  git(checkout, "apply", "--check", "--whitespace=error-all", ...excludeTests, rowPath)
  git(checkout, "apply", "--whitespace=error-all", ...excludeTests, rowPath)
  const after = runNative(...files, "test/subagent-row.test.ts", "test/subagent-row.view.test.tsx", "test/cli/tui/composer-keymap.test.tsx")
  const afterText = `${after.stdout}\n${after.stderr}`
  assert.equal(after.signal, null, afterText)
  assert.equal(after.status, 0, afterText)
  assert.match(afterText, /0 fail/u)
  assert.doesNotMatch(afterText, /[1-9]\d* skip/u)
  assert.deepEqual([summary(afterText).passed, summary(afterText).failed, summary(afterText).tests], [82, 0, 82])
  assert.deepEqual(await Promise.all(preserved.map(async path => hash(await readFile(join(SOURCE, path))))), original)
  assert.equal(git(SOURCE, "status", "--porcelain"), status)
  t.diagnostic(JSON.stringify({ pin: PIN, basePatchSha256: BASE_SHA256, rowPatchSha256: ROW_SHA256,
    unpatched: summary(beforeText), patched: summary(afterText), sourceUnchanged: true,
    layer: "native helper/production renderer with injected fetch/events; not a loaded user TUI or real provider" }))
})
