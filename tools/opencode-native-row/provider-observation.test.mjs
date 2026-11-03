import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFile, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const HERE = dirname(fileURLToPath(import.meta.url))
const PIN = "ba546ec1598a70db2570e9c6258028d955ba8f58"
const PATCH_SHA256 = "8982ae7988a3902c7ce586427672887f95349e7b7dd26de475f33ac81c5ca45d"
const TARGET = "packages/ai/src/protocols/open-responses.ts"
const SOURCE = process.env.NATIVE_ROW_SOURCE_CHECKOUT
const BUN = process.env.NATIVE_ROW_BUN
const hash = value => createHash("sha256").update(value).digest("hex")
const summary = value => ({
  passed: Number(value.match(/^\s*(\d+) pass$/mu)?.[1]),
  failed: Number(value.match(/^\s*(\d+) fail$/mu)?.[1]),
  tests: Number(value.match(/Ran (\d+) tests? across /u)?.[1]),
  outputSha256: hash(value),
})

test("response observation uses the pinned actual protocol with red/green native fixtures", {
  skip: !SOURCE || !BUN ? "requires explicit NATIVE_ROW_SOURCE_CHECKOUT and NATIVE_ROW_BUN; no runtime is installed automatically" : false,
  timeout: 120000,
}, async t => {
  assert.ok(isAbsolute(SOURCE) && isAbsolute(BUN), "source checkout and Bun binary must be explicit absolute paths")
  const root = await mkdtemp("/tmp/opencode/provider-observation-check-")
  t.after(() => rm(root, { recursive: true, force: true }))
  const env = {
    PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root, LANG: "C.UTF-8", CI: "true",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0",
    BUN_INSTALL_CACHE_DIR: join(root, "bun-cache"),
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(root, "transpiler-cache"),
  }
  const git = (cwd, ...args) => execFileSync("/usr/bin/git", ["-c", "core.hooksPath=/dev/null", ...args],
    { cwd, env, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024 })
  assert.equal(git(SOURCE, "rev-parse", "HEAD").trim(), PIN)
  assert.match(git(SOURCE, "config", "--get", "remote.origin.url").trim(), /^https:\/\/github\.com\/anomalyco\/opencode(?:\.git)?$/u)
  assert.equal(git(SOURCE, "status", "--porcelain", "--", TARGET), "", "native protocol source must remain at the pin")
  const original = await readFile(join(SOURCE, TARGET))
  assert.deepEqual(original, execFileSync("/usr/bin/git", ["-C", SOURCE, "show", `${PIN}:${TARGET}`], { env, timeout: 10000 }))
  const binary = await lstat(BUN)
  assert.ok(binary.isFile() && !binary.isSymbolicLink())
  assert.equal(execFileSync(BUN, ["--version"], { env, encoding: "utf8", timeout: 10000 }).trim(), "1.4.2")

  const checkout = join(root, "checkout")
  git(root, "clone", "--quiet", "--shared", "--no-checkout", "--no-recurse-submodules", SOURCE, checkout)
  git(checkout, "checkout", "--quiet", "--detach", PIN)
  for (const entry of await readdir(join(SOURCE, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dependencyRoot = join(SOURCE, "packages", entry.name, "node_modules")
    try {
      if ((await lstat(dependencyRoot)).isDirectory()) {
        await symlink(dependencyRoot, join(checkout, "packages", entry.name, "node_modules"), "dir")
      }
    } catch (error) { if (error.code !== "ENOENT") throw error }
  }
  const rootDependencies = join(SOURCE, "node_modules")
  if ((await lstat(rootDependencies)).isDirectory()) await symlink(rootDependencies, join(checkout, "node_modules"), "dir")
  const nativeTest = "test/provider/provider-observation.test.ts"
  await copyFile(join(HERE, "provider-observation.native.test.ts"), join(checkout, "packages/ai", nativeTest))
  const config = join(root, "bunfig.toml")
  await writeFile(config, "[install]\nauto = \"disable\"\n", { flag: "wx", mode: 0o600 })
  const runNative = (...files) => spawnSync(BUN,
    ["test", "--no-install", "--no-env-file", "--no-orphans", `--config=${config}`, "--timeout", "30000", ...files],
    { cwd: join(checkout, "packages/ai"), env, encoding: "utf8", timeout: 60000, maxBuffer: 2 * 1024 * 1024 })
  const before = runNative(nativeTest)
  const beforeText = `${before.stdout}\n${before.stderr}`
  assert.equal(before.signal, null, beforeText)
  assert.equal(before.status, 1, `unpatched protocol must fail the new observation regressions\n${beforeText}`)
  assert.match(beforeText, /\(fail\)/u)
  assert.deepEqual([summary(beforeText).passed, summary(beforeText).failed, summary(beforeText).tests], [3, 6, 9])
  assert.doesNotMatch(beforeText, /Cannot find (?:package|module)|error: Script not found|SyntaxError/u)

  const patchPath = join(HERE, "provider-observation.patch")
  const patch = await readFile(patchPath, "utf8")
  assert.equal(hash(patch), PATCH_SHA256, "only the reviewed provider-observation patch may be applied")
  assert.deepEqual([...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gmu)].map(match => [match[1], match[2]]), [[TARGET, TARGET]])
  git(checkout, "apply", "--check", "--whitespace=error-all", patchPath)
  git(checkout, "apply", "--whitespace=error-all", patchPath)
  const after = runNative(nativeTest, "test/provider/open-responses-finals.test.ts", "test/provider/open-responses-lifecycle.test.ts")
  const afterText = `${after.stdout}\n${after.stderr}`
  assert.equal(after.signal, null, afterText)
  assert.equal(after.status, 0, afterText)
  assert.match(afterText, /0 fail/u)
  assert.deepEqual([summary(afterText).passed, summary(afterText).failed, summary(afterText).tests], [33, 0, 33])
  assert.doesNotMatch(afterText, /[1-9]\d* skip/u)
  assert.deepEqual(await readFile(join(SOURCE, TARGET)), original)
  assert.equal(git(SOURCE, "status", "--porcelain", "--", TARGET), "")
  t.diagnostic(JSON.stringify({ pin: PIN, patchSha256: hash(patch), sourceUnchanged: true,
    unpatched: summary(beforeText), patched: summary(afterText), layer: "native protocol plus injected HTTP; no real provider or loaded session/UI" }))
})
