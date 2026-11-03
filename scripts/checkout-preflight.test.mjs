import assert from "node:assert/strict"
import { execFileSync, spawn, spawnSync } from "node:child_process"
import {
  accessSync,
  appendFileSync,
  chmodSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { evaluatePreflight } from "./checkout-preflight.mjs"

const script = fileURLToPath(new URL("./checkout-preflight.mjs", import.meta.url))
const scratchRoot = "/tmp/opencode"
const MAX_JSON_BYTES = 1024 * 1024
const MAX_GIT_STDOUT_BYTES = 8 * 1024 * 1024
const MAX_GIT_STDERR_BYTES = 64 * 1024

function git(directory, ...args) {
  return execFileSync("git", args, {
    cwd: directory,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
    },
    stdio: "pipe",
  })
}

function fixture() {
  const scratchStat = lstatSync(scratchRoot)
  assert.ok(scratchStat.isDirectory() && !scratchStat.isSymbolicLink(), "approved scratch root must be a real directory")
  const base = mkdtempSync(path.join(scratchRoot, "checkout-preflight-"))
  const approvedRoot = path.join(base, "repos")
  const source = path.join(approvedRoot, "fixture-repo")
  mkdirSync(source, { recursive: true })
  git(source, "init", "--quiet", "--initial-branch=main")
  git(source, "config", "user.name", "Checkout Fixture")
  git(source, "config", "user.email", "checkout-fixture@example.invalid")
  writeFileSync(path.join(source, "tracked.txt"), "committed fixture\n")
  writeFileSync(path.join(source, "opencode.json"), "{}\n")
  git(source, "add", "tracked.txt", "opencode.json")
  git(source, "commit", "--quiet", "-m", "fixture baseline")

  writeFileSync(path.join(source, "tracked.txt"), "unstaged fixture change\n")
  writeFileSync(path.join(source, "staged.bin"), Buffer.from([0, 255, 1, 128]))
  writeFileSync(path.join(source, "private-fixture-name"), "UNTRACKED-CONTENT-MUST-NOT-LEAK")
  git(source, "add", "staged.bin")

  const data = {
    base,
    approvedRoot,
    source,
    parent: approvedRoot,
    name: "fixture-repo-checkout",
    audit: {
      schema: "checkout-runtime-audit/v1",
      project: {
        id: "1".repeat(40),
        canonical: source,
        startupCommand: null,
      },
      configuration: {
        sources: [path.join(source, "opencode.json")],
        worktreeDirectory: null,
      },
      strategy: {
        id: "git",
        origin: "bundled",
        sourceReviewed: true,
        customRegistrations: [],
      },
      savedWorktrees: [{ directory: source, strategy: null }],
    },
  }
  data.auditPath = path.join(base, "runtime-audit.json")
  writeFileSync(data.auditPath, JSON.stringify(data.audit))
  return data
}

function cleanUp(t, data) {
  t.after(() => rmSync(data.base, { recursive: true, force: true }))
}

async function run(data, overrides = {}) {
  return evaluatePreflight({
    source: data.source,
    parent: data.parent,
    approvedRoot: data.approvedRoot,
    name: data.name,
    runtimeAudit: data.audit,
    ...overrides,
  })
}

test("fixture setup strips inherited Git config injection before its private commits", t => {
  const data = fixture()
  cleanUp(t, data)
  const hooks = path.join(data.base, "injected-hooks")
  const marker = path.join(data.base, "injected-hook-ran")
  mkdirSync(hooks)
  const hook = path.join(hooks, "pre-commit")
  writeFileSync(hook, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')\n`)
  chmodSync(hook, 0o755)
  const names = ["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"]
  const previous = names.map(name => process.env[name])
  try {
    process.env.GIT_CONFIG_COUNT = "1"
    process.env.GIT_CONFIG_KEY_0 = "core.hooksPath"
    process.env.GIT_CONFIG_VALUE_0 = hooks
    const isolated = fixture()
    cleanUp(t, isolated)
    assert.equal(existsSync(marker), false, "inherited Git settings must not execute even a fixture-owned hook")
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name]
      else process.env[name] = previous[index]
    })
  }
})

function findRealGit() {
  for (const directory of process.env.PATH.split(path.delimiter)) {
    const candidate = path.join(directory, "git")
    try {
      accessSync(candidate, fsConstants.X_OK)
      return candidate
    } catch {
      continue
    }
  }
  throw new Error("Git executable is unavailable to the test")
}

function installFakeGit(data) {
  const directory = path.join(data.base, "fake-bin")
  mkdirSync(directory)
  const executable = path.join(directory, "git")
  const marker = path.join(data.base, "fake-git-pids.json")
  const source = `#!${process.execPath}
const { execFileSync, spawn } = require("node:child_process")
const fs = require("node:fs")
const args = process.argv.slice(2)
const mode = process.env.CHECKOUT_PREFLIGHT_FAKE_GIT_MODE
const marker = process.env.CHECKOUT_PREFLIGHT_FAKE_GIT_MARKER
const stdoutLimit = Number(process.env.CHECKOUT_PREFLIGHT_TEST_STDOUT_LIMIT)
const stderrLimit = Number(process.env.CHECKOUT_PREFLIGHT_TEST_STDERR_LIMIT)

function streamForever(stream, byteLimit) {
  const chunk = Buffer.alloc(64 * 1024, 0x78)
  let written = 0
  function write() {
    while (written <= byteLimit) {
      written += chunk.length
      if (!stream.write(chunk)) {
        stream.once("drain", write)
        return
      }
    }
    stream.end()
  }
  stream.on("error", () => process.exit(0))
  write()
}

if (mode === "sleep" && args.includes("--show-toplevel")) {
  const descendant = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" })
  fs.writeFileSync(marker, JSON.stringify({ gitPid: process.pid, descendantPid: descendant.pid }))
  setInterval(() => {}, 1000)
} else if (mode === "stdout" && args.includes("--show-toplevel")) {
  streamForever(process.stdout, stdoutLimit)
} else if (mode === "stderr" && args.includes("--show-toplevel")) {
  streamForever(process.stderr, stderrLimit)
} else if (mode === "digest" && args.includes("diff")) {
  streamForever(process.stdout, stdoutLimit)
} else {
  try {
    execFileSync(process.env.CHECKOUT_PREFLIGHT_REAL_GIT, args, { stdio: "inherit" })
  } catch (error) {
    process.exit(error.status ?? 1)
  }
}
`
  writeFileSync(executable, source)
  chmodSync(executable, 0o755)
  return { directory, executable, marker, realGit: findRealGit() }
}

async function withFakeGit(fake, mode, callback) {
  const names = [
    "PATH",
    "CHECKOUT_PREFLIGHT_FAKE_GIT_MODE",
    "CHECKOUT_PREFLIGHT_FAKE_GIT_MARKER",
    "CHECKOUT_PREFLIGHT_REAL_GIT",
    "CHECKOUT_PREFLIGHT_TEST_STDOUT_LIMIT",
    "CHECKOUT_PREFLIGHT_TEST_STDERR_LIMIT",
  ]
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]))
  process.env.PATH = `${fake.directory}${path.delimiter}${previous.PATH ?? ""}`
  process.env.CHECKOUT_PREFLIGHT_FAKE_GIT_MODE = mode
  process.env.CHECKOUT_PREFLIGHT_FAKE_GIT_MARKER = fake.marker
  process.env.CHECKOUT_PREFLIGHT_REAL_GIT = fake.realGit
  process.env.CHECKOUT_PREFLIGHT_TEST_STDOUT_LIMIT = String(MAX_GIT_STDOUT_BYTES)
  process.env.CHECKOUT_PREFLIGHT_TEST_STDERR_LIMIT = String(MAX_GIT_STDERR_BYTES)
  try {
    return await callback()
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
}

function killOwnedFakeGit(fake) {
  let pids
  try {
    pids = JSON.parse(readFileSync(fake.marker, "utf8"))
  } catch {
    return
  }
  for (const pid of [pids.gitPid, pids.descendantPid]) {
    if (!Number.isInteger(pid) || pid <= 1) continue
    try {
      process.kill(pid, "SIGKILL")
    } catch (error) {
      if (error.code !== "ESRCH") throw error
    }
  }
}

function isProcessRunning(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/stat`, "utf8")
    const processState = status.slice(status.lastIndexOf(")") + 2, status.lastIndexOf(")") + 3)
    return processState !== "Z" && processState !== "X"
  } catch {
    return false
  }
}

function startCli(data, { runtimeAudit = data.auditPath, input, env = {}, keepStdinOpen = false, watchdogMs = 5000 } = {}) {
  const child = spawn(process.execPath, [
    script,
    "--source", data.source,
    "--parent", data.parent,
    "--name", data.name,
    "--runtime-audit", runtimeAudit,
  ], {
    detached: true,
    env: { ...process.env, HOME: data.base, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  })
  const stdout = []
  const stderr = []
  let timedOut = false
  const result = new Promise((resolve, reject) => {
    const watchdog = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch (error) {
        if (error.code !== "ESRCH") reject(error)
      }
    }, watchdogMs)
    child.once("error", error => {
      clearTimeout(watchdog)
      reject(error)
    })
    child.stdout.on("data", chunk => stdout.push(chunk))
    child.stderr.on("data", chunk => stderr.push(chunk))
    child.once("close", (code, signal) => {
      clearTimeout(watchdog)
      resolve({ code, signal, timedOut, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") })
    })
  })
  if (input !== undefined) child.stdin.end(input)
  else if (!keepStdinOpen) child.stdin.end()
  return { child, result }
}

async function waitForOpenFile(child, filename) {
  for (let attempt = 0; attempt < 5000 && child.exitCode === null; attempt += 1) {
    try {
      for (const descriptor of readdirSync(`/proc/${child.pid}/fd`)) {
        if (readlinkSync(`/proc/${child.pid}/fd/${descriptor}`) === filename) return
      }
    } catch {
      if (child.exitCode !== null) break
    }
    await new Promise(resolve => setImmediate(resolve))
  }
  throw new Error(`CLI did not open ${path.basename(filename)} for bounded acquisition`)
}

test("read-only preflight binds dirty, staged, index and branch state without returning source content", async t => {
  const data = fixture()
  cleanUp(t, data)
  const indexPath = path.join(data.source, ".git", "index")
  const indexBefore = readFileSync(indexPath)
  const trackedBefore = readFileSync(path.join(data.source, "tracked.txt"))
  const untrackedBefore = readFileSync(path.join(data.source, "private-fixture-name"))

  const report = await run(data)

  assert.equal(report.ready, true, JSON.stringify(report.blockers))
  assert.equal(report.readOnly, true)
  assert.equal(report.worktreeCreated, false)
  assert.equal(report.sourceSnapshot.symbolicRef, "refs/heads/main")
  assert.equal(report.sourceSnapshot.detached, false)
  assert.ok(report.sourceSnapshot.status.entries >= 3)
  assert.ok(report.sourceSnapshot.status.untracked >= 1)
  assert.ok(report.sourceSnapshot.stagedDiff.bytes > 0)
  assert.ok(report.sourceSnapshot.index.entries > 0)
  assert.equal(report.destination.target, path.join(data.parent, data.name))
  assert.ok(!JSON.stringify(report).includes("UNTRACKED-CONTENT-MUST-NOT-LEAK"))
  assert.ok(!JSON.stringify(report).includes("private-fixture-name"))
  assert.deepEqual(readFileSync(indexPath), indexBefore)
  assert.deepEqual(readFileSync(path.join(data.source, "tracked.txt")), trackedBefore)
  assert.deepEqual(readFileSync(path.join(data.source, "private-fixture-name")), untrackedBefore)
})

test("read-only preflight preserves raw index bytes when a clean tracked file has stale stat metadata", async t => {
  const data = fixture()
  cleanUp(t, data)
  const clean = path.join(data.source, "opencode.json")
  const index = path.join(data.source, ".git", "index")
  utimesSync(clean, 946684800, 946684800)
  const indexBefore = readFileSync(index)
  const cleanBefore = readFileSync(clean)
  const stageBefore = git(data.source, "ls-files", "--stage", "-z")
  const report = await run(data)
  assert.equal(report.ready, true, JSON.stringify(report.blockers))
  assert.deepEqual(readFileSync(index), indexBefore, "optional index refresh must not be written during inspection")
  assert.deepEqual(readFileSync(clean), cleanBefore)
  assert.deepEqual(git(data.source, "ls-files", "--stage", "-z"), stageBefore)
})

test("unguarded Git status can refresh raw index bytes without changing staged entries or worktree bytes", t => {
  const data = fixture()
  cleanUp(t, data)
  utimesSync(path.join(data.source, "opencode.json"), 946684800, 946684800)
  const index = path.join(data.source, ".git", "index")
  const before = readFileSync(index)
  const stageBefore = git(data.source, "ls-files", "--stage", "-z")
  const files = ["opencode.json", "tracked.txt", "staged.bin", "private-fixture-name"]
  const worktreeBefore = files.map(name => readFileSync(path.join(data.source, name)))
  // This positive control intentionally removes the optional-lock suppression only in its new fixture.
  execFileSync("git", ["-c", "core.fsmonitor=false", "status", "--porcelain=v2"], {
    cwd: data.source,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
    timeout: 3_000,
    maxBuffer: 65_536,
    stdio: "pipe",
  })
  assert.notDeepEqual(readFileSync(index), before, "a semantic-only check would miss this raw index mutation")
  assert.deepEqual(git(data.source, "ls-files", "--stage", "-z"), stageBefore)
  assert.deepEqual(files.map(name => readFileSync(path.join(data.source, name))), worktreeBefore)
})

test("checkout effects guard refuses executable repository hooks without running them", async t => {
  const data = fixture()
  cleanUp(t, data)
  const marker = path.join(data.base, "hook-ran")
  const hook = path.join(data.source, ".git", "hooks", "post-checkout")
  writeFileSync(hook, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')\n`)
  chmodSync(hook, 0o755)
  const report = await run(data)
  assert.equal(existsSync(marker), false)
  assert.equal(report.ready, false)
  assert.equal(report.sourceSnapshot, null)
  assert.ok(report.blockers.some(item => item.includes("repository Git hooks")), JSON.stringify(report.blockers))
  assert.equal(existsSync(path.join(data.parent, data.name)), false)
})

test("checkout effects guard blocks a real clean filter before status or diff can execute it", async t => {
  const data = fixture()
  cleanUp(t, data)
  const marker = path.join(data.base, "filter-ran")
  const filter = path.join(data.base, "filter.cjs")
  writeFileSync(filter, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.stdin.pipe(process.stdout)\n`)
  writeFileSync(path.join(data.source, ".gitattributes"), "tracked.txt filter=fixture\n")
  git(data.source, "config", "filter.fixture.clean", `${process.execPath} ${filter}`)
  const report = await run(data)
  assert.equal(existsSync(marker), false, "preflight must not execute the configured filter while collecting its baseline")
  assert.equal(report.ready, false)
  assert.equal(report.sourceSnapshot, null)
  assert.ok(report.blockers.some(item => item.includes("repository Git execution configuration")), JSON.stringify(report.blockers))
})

test("private info attributes can select a filter without a root attributes file; the local guard still refuses", async t => {
  const data = fixture()
  cleanUp(t, data)
  const marker = path.join(data.base, "private-attributes-filter-ran")
  const filter = path.join(data.base, "private-filter.cjs")
  writeFileSync(filter, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.stdin.pipe(process.stdout)\n`)
  writeFileSync(path.join(data.source, ".git", "info", "attributes"), "tracked.txt filter=fixture\n")
  git(data.source, "config", "filter.fixture.clean", `${process.execPath} ${filter}`)
  assert.equal(existsSync(path.join(data.source, ".gitattributes")), false)
  assert.deepEqual(git(data.source, "check-attr", "-z", "filter", "--", "tracked.txt").toString().split("\0"),
    ["tracked.txt", "filter", "fixture", ""])
  assert.equal(existsSync(marker), false, "attribute inspection must not run the filter")
  const report = await run(data)
  assert.equal(report.ready, false)
  assert.equal(report.sourceSnapshot, null)
  assert.equal(report.worktreeCreated, false)
  assert.ok(report.blockers.some(item => item.includes("repository Git execution configuration")))
  assert.equal(existsSync(marker), false, "the production guard must refuse before source collection")
})

function inspectFixtureAttributes(data, commit, names, extraEnvironment = {}) {
  return execFileSync(findRealGit(), ["--no-optional-locks", "check-attr", `--source=${commit}`, "--all", "--stdin", "-z"], {
    cwd: data.source,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_ATTR_NOSYSTEM: "1",
      HOME: data.base,
      XDG_CONFIG_HOME: path.join(data.base, "fixture-xdg"),
      ...extraEnvironment,
    },
    input: Buffer.from(names.join("\0") + "\0"),
    timeout: 5000,
    maxBuffer: 64 * 1024,
  })
}

test("exact-commit attribute observation ignores staged and dirty overrides and retains literal unspecified values", t => {
  const data = fixture()
  cleanUp(t, data)
  const attributes = path.join(data.source, ".gitattributes")
  writeFileSync(attributes, "tracked.txt filter=unspecified\n")
  git(data.source, "add", ".gitattributes")
  git(data.source, "commit", "--quiet", "-m", "fixture attribute epoch")
  const commit = git(data.source, "rev-parse", "HEAD").toString().trim()
  writeFileSync(attributes, "tracked.txt filter=index-only\n")
  git(data.source, "add", ".gitattributes")
  writeFileSync(attributes, "tracked.txt filter=dirty-only\n")
  const output = inspectFixtureAttributes(data, commit, ["tracked.txt", "not-covered.txt"])
  assert.deepEqual(output.toString().split("\0"), ["tracked.txt", "filter", "unspecified", ""])
  // --all retains a literal value named 'unspecified'; an absent attribute emits no record.
  assert.equal(inspectFixtureAttributes(data, commit, ["not-covered.txt"]).length, 0)
})

test("exact-commit attribute observation includes default global and private info sources without executing a filter", t => {
  const data = fixture()
  cleanUp(t, data)
  const home = path.join(data.base, "isolated-home")
  const xdg = path.join(data.base, "isolated-config")
  mkdirSync(home)
  mkdirSync(path.join(xdg, "git"), { recursive: true })
  writeFileSync(path.join(xdg, "git", "attributes"), "tracked.txt filter=fixture\n")
  const commit = git(data.source, "rev-parse", "HEAD").toString().trim()
  const marker = path.join(data.base, "attribute-observation-filter-ran")
  const filter = path.join(data.base, "attribute-observation-filter.cjs")
  writeFileSync(filter, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.stdin.pipe(process.stdout)\n`)
  git(data.source, "config", "filter.fixture.clean", `${process.execPath} ${filter}`)
  git(data.source, "config", "filter.fixture.smudge", `${process.execPath} ${filter}`)
  const environment = { HOME: home, XDG_CONFIG_HOME: xdg }
  assert.equal(existsSync(path.join(data.source, ".gitattributes")), false)
  assert.deepEqual(inspectFixtureAttributes(data, commit, ["tracked.txt"], environment).toString().split("\0"),
    ["tracked.txt", "filter", "fixture", ""])
  writeFileSync(path.join(data.source, ".git", "info", "attributes"), "tracked.txt filter=private-override\n")
  assert.deepEqual(inspectFixtureAttributes(data, commit, ["tracked.txt"], environment).toString().split("\0"),
    ["tracked.txt", "filter", "private-override", ""])
  assert.equal(existsSync(marker), false)
})

test("checkout effects guard refuses configured hooks, includes, filters, fsmonitor and per-worktree config", async t => {
  for (const [key, value] of [
    ["core.hooksPath", "hooks"],
    ["include.path", "missing-fixture-config"],
    ["includeIf.gitdir:fixture.path", "missing-fixture-config"],
    ["filter.fixture.smudge", "fixture-command-not-to-run"],
    ["filter.fixture.process", "fixture-command-not-to-run"],
    ["core.fsmonitor", "false"],
    ["extensions.worktreeConfig", "true"],
  ]) await t.test(key, async t => {
    const data = fixture()
    cleanUp(t, data)
    git(data.source, "config", key, value)
    const report = await run(data)
    assert.equal(report.ready, false, key)
    assert.equal(report.sourceSnapshot, null, key)
    assert.ok(report.blockers.some(item => item.includes("repository Git execution configuration")), JSON.stringify(report.blockers))
    assert.ok(!report.blockers.join("\n").includes(value), "do not echo configuration values in diagnostics")
  })
})

test("checkout effects guard refuses hook symlinks and special files without following or blocking", async t => {
  for (const kind of ["directory-link", "hook-link", "fifo"]) await t.test(kind, async t => {
    const data = fixture()
    cleanUp(t, data)
    const hooks = path.join(data.source, ".git", "hooks")
    if (kind === "directory-link") {
      renameSync(hooks, hooks + ".saved")
      symlinkSync(hooks + ".saved", hooks)
    } else if (kind === "hook-link") symlinkSync(path.join(data.source, "tracked.txt"), path.join(hooks, "post-checkout"))
    else execFileSync("mkfifo", [path.join(hooks, "post-checkout")])
    const report = await run(data)
    assert.equal(report.ready, false)
    assert.equal(report.sourceSnapshot, null)
    assert.ok(report.blockers.some(item => item.includes("repository Git hooks")), JSON.stringify(report.blockers))
  })
})

test("checkout effects guard keeps a normal repository with an inactive hook usable", async t => {
  const data = fixture()
  cleanUp(t, data)
  const hook = path.join(data.source, ".git", "hooks", "post-checkout")
  writeFileSync(hook, "INACTIVE-HOOK-CONTENT-MUST-NOT-LEAK\n")
  chmodSync(hook, 0o644)
  const report = await run(data)
  assert.equal(report.ready, true, JSON.stringify(report.blockers))
  assert.ok(!JSON.stringify(report).includes("INACTIVE-HOOK-CONTENT-MUST-NOT-LEAK"))
})

test("checkout effects guard accepts absent hooks and refuses oversized metadata scans", async t => {
  for (const kind of ["absent", "at-limit", "over-limit"]) await t.test(kind, async t => {
    const data = fixture()
    cleanUp(t, data)
    const hooks = path.join(data.source, ".git", "hooks")
    renameSync(hooks, hooks + ".saved")
    if (kind !== "absent") {
      mkdirSync(hooks)
      const count = kind === "at-limit" ? 128 : 129
      for (let i = 0; i < count; i++) writeFileSync(path.join(hooks, `fixture-${i}.sample`), "")
    }
    const report = await run(data)
    assert.equal(report.ready, kind !== "over-limit", JSON.stringify(report.blockers))
    if (kind === "over-limit") assert.ok(report.blockers.some(item => item.includes("bounded metadata limit")))
  })
})

function nestedFixture(data, { separate = false, name = "nested" } = {}) {
  const nested = path.join(data.source, name)
  mkdirSync(nested)
  git(nested, "init", "-q", ...(separate ? ["--separate-git-dir", path.join(data.base, "nested-metadata")] : []))
  git(nested, "config", "user.name", "Fixture")
  git(nested, "config", "user.email", "fixture@example.invalid")
  writeFileSync(path.join(nested, "tracked.txt"), "nested fixture\n")
  git(nested, "add", "tracked.txt")
  git(nested, "commit", "-qm", "nested fixture")
  const head = git(nested, "rev-parse", "HEAD").toString().trim()
  git(data.source, "update-index", "--add", "--cacheinfo", `160000,${head},${name}`)
  return nested
}

test("checkout effects guard recursively audits initialized gitlinks before parent status", async t => {
  for (const kind of ["safe", "separate-git-dir", "filter", "hook", "marker-link", "marker-fifo", "marker-oversize", "path-link", "uninitialized", "missing"]) await t.test(kind, async t => {
    const data = fixture()
    cleanUp(t, data)
    const nested = nestedFixture(data, { separate: kind === "separate-git-dir" })
    const marker = path.join(data.base, "nested-filter-ran")
    if (kind === "filter") {
      const filter = path.join(data.base, "nested-filter.cjs")
      writeFileSync(filter, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.stdin.pipe(process.stdout)\n`)
      writeFileSync(path.join(nested, ".gitattributes"), "tracked.txt filter=fixture\n")
      git(nested, "config", "filter.fixture.clean", `${process.execPath} ${filter}`)
    } else if (kind === "hook") {
      const hook = path.join(nested, ".git", "hooks", "post-checkout")
      writeFileSync(hook, "#!/bin/sh\nexit 1\n")
      chmodSync(hook, 0o755)
    } else if (kind.startsWith("marker-")) {
      const original = path.join(nested, ".git")
      renameSync(original, original + ".saved")
      if (kind === "marker-link") symlinkSync(original + ".saved", original)
      else if (kind === "marker-fifo") execFileSync("mkfifo", [original])
      else writeFileSync(original, "x".repeat(MAX_JSON_BYTES + 1))
    } else if (kind === "path-link") {
      const saved = path.join(data.base, "nested-saved")
      renameSync(nested, saved)
      symlinkSync(saved, nested)
    } else if (kind === "uninitialized") renameSync(path.join(nested, ".git"), path.join(data.base, "nested-metadata"))
    else if (kind === "missing") renameSync(nested, path.join(data.base, "nested-saved"))
    const report = await run(data)
    assert.equal(existsSync(marker), false, "parent status must not run the nested clean filter")
    const safe = ["safe", "separate-git-dir", "uninitialized", "missing"].includes(kind)
    assert.equal(report.ready, safe, JSON.stringify(report.blockers))
    assert.equal(report.worktreeCreated, false)
    if (!safe) assert.equal(report.sourceSnapshot, null)
  })
})

test("checkout effects guard stops recursive gitlink audits at the depth bound", async t => {
  const data = fixture()
  cleanUp(t, data)
  let source = data.source
  for (let i = 0; i < 9; i++) source = nestedFixture({ ...data, source })
  const report = await run(data)
  assert.equal(report.ready, false)
  assert.equal(report.sourceSnapshot, null)
  assert.ok(report.blockers.some(item => item.includes("bounded scope")), JSON.stringify(report.blockers))
})

test("checkout effects guard bounds the total initialized repository audit", async t => {
  const data = fixture()
  cleanUp(t, data)
  for (let i = 0; i < 63; i++) nestedFixture(data, { name: `nested-${i}` })
  const atLimit = await run(data)
  assert.equal(atLimit.ready, true, JSON.stringify(atLimit.blockers))
  nestedFixture(data, { name: "nested-over-limit" })
  const overLimit = await run(data)
  assert.equal(overLimit.ready, false)
  assert.equal(overLimit.sourceSnapshot, null)
  assert.ok(overLimit.blockers.some(item => item.includes("bounded scope")), JSON.stringify(overLimit.blockers))
})

test("expected snapshot catches a tracked dirty-content change with the same source and branch", async t => {
  const data = fixture()
  cleanUp(t, data)
  const baseline = await run(data)
  assert.equal(baseline.ready, true, JSON.stringify(baseline.blockers))

  writeFileSync(path.join(data.source, "tracked.txt"), "changed after baseline\n")
  const after = await run(data, { expectedSnapshot: baseline })

  assert.equal(after.ready, false)
  assert.ok(after.blockers.includes("source no longer matches the expected preservation snapshot"))
})

test("startup, custom strategy and incomplete source evidence fail closed", async t => {
  const data = fixture()
  cleanUp(t, data)
  const cases = [
    [audit => { audit.project.startupCommand = "npm run setup" }, "Project.Commands.start is configured or not represented as absent"],
    [audit => { audit.strategy = { id: "plugin-worktree", origin: "plugin", sourceReviewed: true, customRegistrations: ["plugin-worktree"] } }, "selected strategy is not verified as bundled Git"],
    [audit => { audit.strategy.sourceReviewed = false }, "worktree strategy source audit is missing"],
    [audit => { delete audit.project.startupCommand }, "runtime audit must explicitly record Project.Commands.start"],
    [audit => { delete audit.configuration.worktreeDirectory }, "runtime audit must explicitly record the effective worktree directory"],
    [audit => { audit.configuration.strategy = "custom" }, "runtime audit has unrecognized configuration fields"],
  ]

  for (const [mutate, diagnostic] of cases) {
    const audit = structuredClone(data.audit)
    mutate(audit)
    const report = await run(data, { runtimeAudit: audit })
    assert.equal(report.ready, false, diagnostic)
    assert.ok(report.blockers.some(blocker => blocker.includes(diagnostic)), JSON.stringify(report.blockers))
  }
})

test("destination rejects source descendants, outside roots, symlink parents and collisions", async t => {
  const data = fixture()
  cleanUp(t, data)
  const inside = path.join(data.source, "destination-parent")
  mkdirSync(inside)
  const outside = path.join(data.base, "outside")
  mkdirSync(outside)
  const realParent = path.join(data.approvedRoot, "real-parent")
  mkdirSync(realParent)
  const symlinkParent = path.join(data.approvedRoot, "linked-parent")
  symlinkSync(realParent, symlinkParent, "dir")
  const collision = path.join(data.parent, data.name)
  writeFileSync(collision, "fixture collision")

  const cases = [
    [{ parent: inside }, "destination parent is inside an existing checkout"],
    [{ parent: outside }, "destination parent is outside the approved repository-save root"],
    [{ parent: symlinkParent }, "destination parent must not traverse symlinks"],
    [{ parent: `${symlinkParent}/../real-parent` }, "destination parent must not contain dot segments"],
    [{}, "destination target already exists"],
    [{ name: "other-repo-checkout" }, "name must begin with the repository-prefixed source name"],
  ]
  for (const [overrides, diagnostic] of cases) {
    const report = await run(data, overrides)
    assert.equal(report.ready, false, diagnostic)
    assert.ok(report.blockers.some(blocker => blocker.includes(diagnostic)), JSON.stringify(report.blockers))
  }
})

test("native inventory paths are included in ancestry and project-identity checks", async t => {
  const data = fixture()
  cleanUp(t, data)
  const savedRoot = path.join(data.approvedRoot, "saved-native-worktree")
  const nestedParent = path.join(savedRoot, "nested")
  mkdirSync(nestedParent, { recursive: true })
  const audit = structuredClone(data.audit)
  audit.savedWorktrees.push({ directory: savedRoot, strategy: "plugin" })
  const report = await run(data, { parent: nestedParent, runtimeAudit: audit })
  assert.equal(report.ready, false)
  assert.ok(report.blockers.includes("destination parent is inside an existing checkout"))

  const other = path.join(data.base, "other-project")
  mkdirSync(other)
  git(other, "init", "--quiet", "--initial-branch=main")
  git(other, "config", "user.name", "Checkout Fixture")
  git(other, "config", "user.email", "checkout-fixture@example.invalid")
  writeFileSync(path.join(other, "file"), "other project\n")
  git(other, "add", "file")
  git(other, "commit", "--quiet", "-m", "other project")
  const mismatched = structuredClone(data.audit)
  mismatched.project.canonical = other
  mismatched.savedWorktrees.push({ directory: other, strategy: null })
  const identityReport = await run(data, { runtimeAudit: mismatched })
  assert.equal(identityReport.ready, false)
  assert.ok(identityReport.blockers.includes("canonical checkout and source do not belong to the same Git project"))
})

test("CLI accepts a bounded regular runtime-audit file and bounded stdin", async t => {
  const data = fixture()
  cleanUp(t, data)

  const fileRun = startCli(data)
  const fileResult = await fileRun.result
  assert.equal(fileResult.timedOut, false)
  assert.equal(fileResult.code, 0, fileResult.stderr)
  assert.equal(JSON.parse(fileResult.stdout).ready, true)

  const stdinRun = startCli(data, { runtimeAudit: "-", input: JSON.stringify(data.audit) })
  const stdinResult = await stdinRun.result
  assert.equal(stdinResult.timedOut, false)
  assert.equal(stdinResult.code, 0, stdinResult.stderr)
  assert.equal(JSON.parse(stdinResult.stdout).ready, true)
})

test("CLI refuses a symlink runtime-audit file", async t => {
  const data = fixture()
  cleanUp(t, data)
  const linked = path.join(data.base, "linked-audit.json")
  symlinkSync(data.auditPath, linked)

  const result = await startCli(data, { runtimeAudit: linked }).result

  assert.equal(result.timedOut, false)
  assert.equal(result.code, 2)
  assert.match(result.stderr, /runtime audit.*symlink/i)
})

test("CLI refuses a FIFO runtime-audit file without blocking on open", async t => {
  const data = fixture()
  cleanUp(t, data)
  const fifo = path.join(data.base, "runtime-audit.fifo")
  execFileSync("mkfifo", [fifo])

  const result = await startCli(data, { runtimeAudit: fifo, watchdogMs: 1500 }).result

  assert.equal(result.timedOut, false, "opening a FIFO without a writer must not hang")
  assert.equal(result.code, 2)
  assert.match(result.stderr, /regular file|FIFO/i)
})

test("CLI rejects a runtime-audit file above the JSON byte limit before parsing", async t => {
  const data = fixture()
  cleanUp(t, data)
  const oversized = path.join(data.base, "oversized-audit.json")
  const json = Buffer.from(JSON.stringify(data.audit))
  writeFileSync(oversized, Buffer.concat([json, Buffer.alloc(MAX_JSON_BYTES + 1 - json.length, 0x20)]))

  const result = await startCli(data, { runtimeAudit: oversized }).result

  assert.equal(result.timedOut, false)
  assert.equal(result.code, 2)
  assert.match(result.stderr, /runtime audit.*1048576 bytes/i)
})

test("CLI bounds runtime-audit bytes read from stdin", async t => {
  const data = fixture()
  cleanUp(t, data)
  const input = Buffer.alloc(MAX_JSON_BYTES + 1, 0x20)

  const result = await startCli(data, { runtimeAudit: "-", input }).result

  assert.equal(result.timedOut, false)
  assert.equal(result.code, 2)
  assert.match(result.stderr, /stdin.*1048576 bytes/i)
})

test("CLI times out an unfinished stdin stream without starting Git", { timeout: 36_000 }, async t => {
  const data = fixture()
  cleanUp(t, data)
  const fake = installFakeGit(data)
  const result = await startCli(data, {
    runtimeAudit: "-",
    keepStdinOpen: true,
    watchdogMs: 35_000,
    env: {
      PATH: `${fake.directory}${path.delimiter}${process.env.PATH}`,
      CHECKOUT_PREFLIGHT_FAKE_GIT_MODE: "sleep",
      CHECKOUT_PREFLIGHT_FAKE_GIT_MARKER: fake.marker,
    },
  }).result
  assert.equal(result.timedOut, false, "the production stdin deadline must beat the test watchdog")
  assert.equal(result.code, 2)
  assert.match(result.stderr, /stdin did not finish within 30000 ms/i)
  assert.equal(result.stdout, "", "unfinished audit input must produce no preflight result")
  assert.equal(existsSync(fake.marker), false, "no Git subprocess may start before the audit finishes")
})

test("CLI refuses JSON files that grow while being acquired", async t => {
  const data = fixture()
  cleanUp(t, data)
  const growing = path.join(data.base, "growing-audit.json")
  const json = Buffer.from(JSON.stringify(data.audit))
  writeFileSync(growing, Buffer.concat([json, Buffer.alloc(MAX_JSON_BYTES - 1 - json.length, 0x20)]))
  const cli = startCli(data, { runtimeAudit: growing })

  await waitForOpenFile(cli.child, growing)
  appendFileSync(growing, " ")
  const result = await cli.result

  assert.equal(result.timedOut, false)
  assert.equal(result.code, 2)
  assert.match(result.stderr, /runtime audit.*changed|grew/i)
})

test("CLI refuses a runtime-audit path replaced during acquisition", async t => {
  const data = fixture()
  cleanUp(t, data)
  const target = path.join(data.base, "replaceable-audit.json")
  const displaced = path.join(data.base, "opened-audit.json")
  const json = Buffer.from(JSON.stringify(data.audit))
  writeFileSync(target, Buffer.concat([json, Buffer.alloc(MAX_JSON_BYTES - 1 - json.length, 0x20)]))
  const cli = startCli(data, { runtimeAudit: target })

  await waitForOpenFile(cli.child, target)
  renameSync(target, displaced)
  writeFileSync(target, JSON.stringify(data.audit))
  const result = await cli.result

  assert.equal(result.timedOut, false)
  assert.equal(result.code, 2)
  assert.match(result.stderr, /runtime audit.*changed/i)
})

test("Git stdout and stderr are bounded for captured output", async t => {
  const data = fixture()
  cleanUp(t, data)
  const fake = installFakeGit(data)

  const stdoutReport = await withFakeGit(fake, "stdout", () => run(data))
  assert.equal(stdoutReport.ready, false)
  assert.ok(stdoutReport.blockers.some(blocker => /git rev-parse.*8388608 byte stdout/i.test(blocker)), JSON.stringify(stdoutReport.blockers))

  const stderrReport = await withFakeGit(fake, "stderr", () => run(data))
  assert.equal(stderrReport.ready, false)
  assert.ok(stderrReport.blockers.some(blocker => /git rev-parse.*65536 byte stderr/i.test(blocker)), JSON.stringify(stderrReport.blockers))
})

test("Git digest output is bounded while hashing", async t => {
  const data = fixture()
  cleanUp(t, data)
  const fake = installFakeGit(data)

  const report = await withFakeGit(fake, "digest", () => run(data))

  assert.equal(report.ready, false)
  assert.ok(report.blockers.some(blocker => /git diff.*8388608 byte stdout/i.test(blocker)), JSON.stringify(report.blockers))
})

test("Git deadline terminates only its own process group", { timeout: 36_000 }, async t => {
  const data = fixture()
  cleanUp(t, data)
  const fake = installFakeGit(data)
  t.after(() => killOwnedFakeGit(fake))
  // Real processes need real termination grace; mocked timers can outrun signal delivery.
  const reportPromise = withFakeGit(fake, "sleep", () => run(data))

  for (let attempt = 0; attempt < 5000 && !existsSync(fake.marker); attempt += 1) {
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.ok(existsSync(fake.marker), "fake Git must start a real sleeping descendant")
  const report = await reportPromise
  const pids = JSON.parse(readFileSync(fake.marker, "utf8"))

  assert.equal(report.ready, false)
  assert.ok(report.blockers.some(blocker => /git rev-parse.*timed out/i.test(blocker)), JSON.stringify(report.blockers))
  assert.ok(!report.blockers.some(blocker => blocker.includes("did not close after termination")), JSON.stringify(report.blockers))
  const stoppedBy = Date.now() + 500
  while (isProcessRunning(pids.descendantPid) && Date.now() < stoppedBy) {
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.equal(isProcessRunning(pids.descendantPid), false, `owned Git descendant ${pids.descendantPid} must be terminated`)
})

test("CLI help is explicit that the preflight never creates or writes a report", () => {
  const result = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /never creates a worktree or writes a report/)
  assert.equal(result.stderr, "")
})
