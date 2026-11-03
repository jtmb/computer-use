import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import vm from "node:vm"
import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { PassThrough } from "node:stream"
import { fileURLToPath, pathToFileURL } from "node:url"
import test from "node:test"
import { readStableFile } from "./full-graph-diagnostics.mjs"
import { pumpBounded } from "../../.opencode/plugins/memory/acceptance/native-host.mjs"

// Explicit provider verification, never a native app/plugin boot or a default offline CI dependency.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const native = path.resolve(process.env.NATIVE_ROW_SOURCE_CHECKOUT ?? path.join(root, "../opencode-native-row"))
const require = createRequire(path.join(native, "packages/core/package.json"))
const ts = require("typescript")
const { Effect, Schema, Exit, Cause } = await import(pathToFileURL(require.resolve("effect")))
const { ChildProcess } = await import(pathToFileURL(require.resolve("effect/process")))
const diff = require("diff")
assert.ok(process.env.NATIVE_ROW_GIT_PROVIDER_SOURCE, "select scratch provider source explicitly")
const source = readStableFile(process.env.NATIVE_ROW_GIT_PROVIDER_SOURCE, { maxBytes: 262_144, label: "complete selected Git provider" })
const patchSource = readStableFile(path.join(native, "packages/core/src/vcs/patch.ts"), { maxBytes: 262_144, label: "complete actual patch helpers" })
const sha = body => createHash("sha256").update(body).digest("hex")

function parse(body, name) {
  const parsed = ts.createSourceFile(name, body.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  assert.equal(parsed.parseDiagnostics.length, 0, name)
  return parsed
}

const parsed = parse(source, "git.ts")
const start = parsed.statements.findIndex(node => ts.isFunctionDeclaration(node) && node.name?.text === "make")
assert.ok(start >= 0)
const adapterText = parsed.statements.slice(start).map(node => node.getText(parsed)).join("\n")
const patches = parse(patchSource, "patch.ts")
const patchText = patches.statements.filter(node => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
  .map(node => node.getText(patches)).join("\n")

function evaluate(text, bindings) {
  const output = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
  })
  assert.equal(output.diagnostics?.length ?? 0, 0)
  return new vm.Script(output.outputText).runInNewContext({ exports: {}, ...bindings }, { timeout: 100 })
}

const patchHelpers = evaluate(patchText + "\nexports", { ...diff })
const vcs = parse(readStableFile(path.join(native, "packages/core/src/vcs.ts"), { maxBytes: 262_144, label: "actual VCS error owner" }), "vcs.ts")
const errorDeclaration = vcs.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === "DiffError")
assert.ok(errorDeclaration)
const DiffError = evaluate(errorDeclaration.getText(vcs) + "\nDiffError", { Schema })
const expectedPrefix = ["--no-optional-locks", "-c", "diff.autoRefreshIndex=false", "-c", "core.autocrlf=false",
  "-c", "core.fsmonitor=false", "-c", "core.longpaths=true", "-c", "core.symlinks=true", "-c", "core.quotepath=false"]

async function fixture(count, { edge = false, statsFault, unborn = false, review = false, statsOutput } = {}) {
  const directory = await fs.mkdtemp("/tmp/opencode/provider-git-repo-")
  const repository = path.join(directory, "repo"), temporary = path.join(directory, "temporary")
  await fs.mkdir(repository); await fs.mkdir(temporary)
  const deadline = performance.now() + 10_000, commands = [], budget = { remaining: 262_144 }
  const environment = { PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: temporary, LANG: "C.UTF-8",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_ATTR_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" }

  async function git(args, options = {}, lane = "setup", runOptions = {}) {
    const remaining = deadline - performance.now()
    assert.ok(remaining > 0 && commands.length < 64, "bounded fixture command budget")
    const cwd = options.cwd ?? repository
    assert.equal(cwd, repository, "provider must not run in an operator repository")
    if (options.env?.GIT_INDEX_FILE) assert.ok(options.env.GIT_INDEX_FILE.startsWith(temporary + path.sep))
    const child = spawn("/usr/bin/git", Array.from(args), {
      cwd, env: { ...environment, ...options.env }, stdio: ["ignore", "pipe", "pipe"],
    })
    const stdout = [], stderr = [], shared = { remaining: Math.min(65_536, budget.remaining) }
    let refused = false
    const stop = () => { refused = true; child.kill("SIGKILL") }
    const timer = setTimeout(stop, Math.min(2_000, remaining))
    for (const [stream, parts] of [[child.stdout, stdout], [child.stderr, stderr]])
      pumpBounded(stream, new PassThrough().resume(), body => { parts.push(body); budget.remaining -= body.length }, stop, 65_536, shared)
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject); child.once("close", resolve)
    }).finally(() => clearTimeout(timer))
    const out = Buffer.concat(stdout), err = Buffer.concat(stderr)
    commands.push({ lane, args: Array.from(args), cwd, env: options.env ? { ...options.env } : null,
      extendEnv: options.extendEnv ?? null, stdin: options.stdin ?? null,
      requestedMaxOutputBytes: runOptions.maxOutputBytes ?? null, exitCode, refused,
      stdoutBytes: out.length, stderrBytes: err.length, stdoutSHA256: sha(out), stderrSHA256: sha(err) })
    assert.equal(refused, false, "no command/output refusal may be relabelled a provider pass")
    return { exitCode, stdout: out, stderr: err, stdoutTruncated: false, stderrTruncated: false }
  }

  assert.equal((await git(["init", "-b", "main"])).exitCode, 0)
  await fs.appendFile(path.join(repository, ".git/config"),
    "\n[core]\n\tfsmonitor = false\n\tfilemode = true\n\thooksPath = /dev/null\n[commit]\n\tgpgsign = false\n" +
    "[user]\n\tname = Synthetic Provider Test\n\temail = fixture@example.invalid\n[diff]\n\tautoRefreshIndex = true\n")
  await fs.writeFile(path.join(repository, "stable.txt"), "stable\n")
  await fs.writeFile(path.join(repository, "tracked.txt"), "base\n")
  if (edge) {
    await fs.writeFile(path.join(repository, "binary.dat"), Buffer.from([0, 1]))
    await fs.writeFile(path.join(repository, "mode.txt"), "mode\n", { mode: 0o644 })
  }
  assert.equal((await git(["add", "--", "stable.txt", "tracked.txt", ...(edge ? ["binary.dat", "mode.txt"] : [])])).exitCode, 0)
  if (!unborn) assert.equal((await git(["commit", "--no-verify", "-m", "synthetic fixture base"])).exitCode, 0)
  let explicitBase
  if (review) {
    explicitBase = (await git(["rev-parse", "HEAD"])).stdout.toString().trim()
    assert.equal((await git(["update-ref", "refs/heads/explicit-base", "HEAD"])).exitCode, 0)
    await fs.writeFile(path.join(repository, "committed.txt"), "committed\n")
    await fs.writeFile(path.join(repository, "tracked.txt"), "committed\n")
    assert.equal((await git(["add", "--", "committed.txt", "tracked.txt"])).exitCode, 0)
    assert.equal((await git(["commit", "--no-verify", "-m", "synthetic committed changes"])).exitCode, 0)
  }
  await fs.writeFile(path.join(repository, "staged.txt"), "staged\n")
  assert.equal((await git(["add", "--", "staged.txt"])).exitCode, 0)
  await fs.writeFile(path.join(repository, "tracked.txt"), "changed\n")
  if (edge) {
    await fs.writeFile(path.join(repository, "binary.dat"), Buffer.from([0, 2]))
    await fs.chmod(path.join(repository, "mode.txt"), 0o755)
    await fs.writeFile(path.join(repository, "empty.txt"), "")
    assert.equal((await git(["add", "--", "empty.txt"])).exitCode, 0)
  }
  for (let index = 0; index < count; index++) await fs.writeFile(path.join(repository, `untracked-${index}.txt`), "new\n")
  // Content stays identical, but the cached clean tracked-file stat no longer matches.
  await fs.utimes(path.join(repository, "stable.txt"), 946684800, 946684800)
  const beforeIndex = await fs.readFile(path.join(repository, ".git/index"))
  const beforeConfig = await fs.readFile(path.join(repository, ".git/config"))
  const descriptors = new WeakMap()
  const make = evaluate(adapterText + "\nmake", {
    Effect, Buffer, path, fs, os: { tmpdir: () => temporary }, randomUUID, gitExecutable: "/usr/bin/git", ...patchHelpers,
    DiffError,
    ChildProcess: {
      make(command, args, options) {
        assert.equal(command, "/usr/bin/git")
        const descriptor = ChildProcess.make(command, args, options)
        descriptors.set(descriptor, { args, options })
        return descriptor
      },
    },
  })
  const adapter = make({
    run(command, options) {
      const descriptor = descriptors.get(command)
      assert.ok(descriptor, "capture the actual ChildProcess.make boundary")
      if (statsFault && descriptor.args.includes("--numstat") && !descriptor.options.env?.GIT_INDEX_FILE) {
        commands.push({ lane: "injected-numstat", args: Array.from(descriptor.args), fault: statsFault })
        return Effect.succeed({ exitCode: statsFault === "failed" ? 1 : 0,
          stdout: Buffer.from(statsOutput ?? "1\t1\ttracked.txt\0"), stderr: Buffer.alloc(0),
          stdoutTruncated: statsFault === "truncated", stderrTruncated: false })
      }
      return Effect.promise(() => git(descriptor.args, descriptor.options, "provider", options))
    },
  }, { directory: repository, worktree: repository })
  return { directory, repository, temporary, commands, adapter, beforeIndex, beforeConfig, explicitBase }
}

async function exercise(label, count, mode, options = {}) {
  const sample = await fixture(count, options)
  let accepted = false, indexAfter, configAfter, temporaryAfter, rows
  try {
    if (mode === "single") await Effect.runPromise(sample.adapter.status())
    rows = await Effect.runPromise(mode === "status" ? sample.adapter.status() : sample.adapter.diff("working"))
    indexAfter = await fs.readFile(path.join(sample.repository, ".git/index"))
    configAfter = await fs.readFile(path.join(sample.repository, ".git/config"))
    temporaryAfter = await fs.readdir(sample.temporary)
    const calls = sample.commands.filter(call => call.lane === "provider")
    assert.ok(calls.some(call => call.args.includes("status")))
    assert.ok(calls.some(call => call.args.includes("--numstat")))
    for (const call of calls) {
      assert.deepEqual(call.args.slice(0, expectedPrefix.length), expectedPrefix,
        "every provider status/diff subprocess must receive index-refresh protection")
      assert.equal(call.extendEnv, true)
      assert.equal(call.stdin, "ignore")
    }
    const added = calls.filter(call => call.args.includes("--intent-to-add"))
    assert.equal(added.length, count > 1 ? 1 : 0)
    for (const call of added) assert.ok(call.env?.GIT_INDEX_FILE.endsWith(".index"), "batch add must use a throwaway index")
    const batchedDiffs = calls.filter(call => call.env?.GIT_INDEX_FILE && call.args.includes("diff"))
    assert.equal(batchedDiffs.length, count > 1 ? (mode === "status" ? 1 : 2) : 0)
    if (mode !== "status") assert.ok(calls.some(call => call.args.includes("--patch")))
    if (mode === "single") assert.ok(calls.some(call => call.args.includes("--no-index")))
    assert.deepEqual(Array.from(rows, row => row.file), [...(options.edge ? ["binary.dat", "empty.txt", "mode.txt"] : []), "staged.txt", "tracked.txt",
      ...Array.from({ length: count }, (_, index) => `untracked-${index}.txt`)])
    assert.ok(rows.filter(row => !["binary.dat", "empty.txt", "mode.txt"].includes(row.file)).every(row => row.additions === 1))
    if (options.edge) {
      for (const file of ["binary.dat", "empty.txt", "mode.txt"]) {
        const row = rows.find(item => item.file === file)
        assert.equal(row.additions, 0, file)
        assert.equal(row.deletions, 0, file)
      }
      assert.ok(rows.find(row => row.file === "binary.dat").patch.includes("Binary files"))
      assert.ok(rows.find(row => row.file === "mode.txt").patch.includes("new mode 100755"))
      assert.ok(rows.find(row => row.file === "empty.txt").patch.includes("new file mode"))
    }
    assert.equal(rows.find(row => row.file === "tracked.txt").deletions, 1)
    if (mode !== "status") {
      assert.ok(rows.find(row => row.file === "tracked.txt").patch.includes("+changed"))
      assert.ok(rows.find(row => row.file === "untracked-0.txt").patch.includes("+new"))
    }
    assert.deepEqual(indexAfter, sample.beforeIndex, "actual provider calls must preserve complete raw index bytes")
    assert.deepEqual(configAfter, sample.beforeConfig, "protection must not persist a repository setting")
    assert.deepEqual(temporaryAfter, [], "provider must clean its exact throwaway index/list/lock")
    accepted = true
  } finally {
    if (process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY) {
      await fs.mkdir(process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY, { recursive: true, mode: 0o700 })
      await fs.writeFile(path.join(process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY, `${label}.json`), JSON.stringify({
        accepted, source: { bytes: source.length, sha256: sha(source) }, directory: sample.directory,
        indexBefore: { bytes: sample.beforeIndex.length, sha256: sha(sample.beforeIndex) },
        indexAfter: indexAfter ? { bytes: indexAfter.length, sha256: sha(indexAfter) } : null,
        configBeforeSHA256: sha(sample.beforeConfig), configAfterSHA256: configAfter ? sha(configAfter) : null,
        temporaryAfter, files: rows ? Array.from(rows, row => row.file) : null, commands: sample.commands,
        limits: { commandMs: 2000, jobMs: 10000, commandBytes: 65536, totalCommandBytes: 262144 },
        qualification: "Actual complete selected adapter/helpers with real Effect/ChildProcess descriptors and a synthetic-only Git runner, not native plugin registration/AppProcess engine/installed/model/full types. Only fixture initial commits; no operator commit/push. Exact temporary file cleanup, not whole-host quiescence.",
      }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
    }
  }
}

test("provider raw index: status forwards protection through tracked stats and the throwaway untracked batch", () =>
  exercise("status", 2, "status"))
test("provider raw index: working diff forwards protection through tracked and untracked patch batches", () =>
  exercise("diff-batch", 2, "diff"))
test("provider raw index: single untracked fallback preserves the index through status and per-file diff", () =>
  exercise("diff-single", 1, "single"))
test("provider raw index: binary, mode-only and empty additions survive stat-only filtering", () =>
  exercise("diff-edge", 2, "diff", { edge: true }))

test("provider checked stats: failed or truncated numstat must not be reported as a clean diff", async () => {
  if (process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY)
    await fs.mkdir(process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY, { recursive: true, mode: 0o700 })
  for (const fault of ["failed", "truncated"]) {
    const sample = await fixture(0, { statsFault: fault })
    const exit = await Effect.runPromise(Effect.exit(sample.adapter.diff("working")))
    const failed = Exit.isFailure(exit)
    const error = failed ? Cause.squash(exit.cause) : undefined
    if (process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY)
      await fs.writeFile(path.join(process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY, `stats-${fault}.json`), JSON.stringify({
        source: { bytes: source.length, sha256: sha(source) }, directory: sample.directory, fault,
        failed, errorTag: error?._tag, message: error?.message, commands: sample.commands,
      }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
    assert.equal(failed, true, "incomplete numstat must not become successful empty/partial file results")
    assert.equal(error?._tag, "Vcs.DiffError")
  }
})

test("provider raw index: unborn repository uses the adapted empty-stat record without changing its index", async () => {
  const sample = await fixture(1, { unborn: true })
  let status
  await assert.doesNotReject(async () => { status = await Effect.runPromise(sample.adapter.status()) },
    "unborn status must consume the adapted empty-stat record")
  const rows = await Effect.runPromise(sample.adapter.diff("working"))
  const expected = ["stable.txt", "staged.txt", "tracked.txt", "untracked-0.txt"]
  assert.deepEqual(Array.from(status, row => row.file), expected)
  assert.deepEqual(Array.from(rows, row => row.file), expected)
  assert.ok(rows.every(row => row.additions === 1 && row.deletions === 0))
  const after = await fs.readFile(path.join(sample.repository, ".git/index"))
  assert.deepEqual(after, sample.beforeIndex)
  assert.deepEqual(await fs.readFile(path.join(sample.repository, ".git/config")), sample.beforeConfig)
  assert.deepEqual(await fs.readdir(sample.temporary), [])
  for (const call of sample.commands.filter(row => row.lane === "provider"))
    assert.deepEqual(call.args.slice(0, expectedPrefix.length), expectedPrefix)
  if (process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY) {
    await fs.mkdir(process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY, { recursive: true, mode: 0o700 })
    await fs.writeFile(path.join(process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY, "unborn.json"), JSON.stringify({
      accepted: true, directory: sample.directory, source: { bytes: source.length, sha256: sha(source) },
      files: expected, indexBeforeSHA256: sha(sample.beforeIndex), indexAfterSHA256: sha(after),
      configUnchanged: true, temporaryAfter: [], commands: sample.commands,
    }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
  }
})

for (const mode of ["committed", "branch"]) {
  test(`provider review mode: ${mode} honors an explicit base and excludes the wrong change layers`, async () => {
    const sample = await fixture(2, { review: true })
    const rows = await Effect.runPromise(sample.adapter.diff(mode, { base: "explicit-base", context: 1 }))
    const expected = mode === "committed" ? ["committed.txt", "tracked.txt"] :
      ["committed.txt", "staged.txt", "tracked.txt", "untracked-0.txt", "untracked-1.txt"]
    assert.deepEqual(Array.from(rows, row => row.file), expected, `${mode} must select the requested committed/worktree layers`)
    const tracked = rows.find(row => row.file === "tracked.txt")
    assert.ok(tracked.patch.includes(mode === "committed" ? "+committed" : "+changed"))
    assert.equal(tracked.patch.includes(mode === "committed" ? "+changed" : "+committed"), false)
    assert.equal(tracked.additions, 1)
    assert.equal(tracked.deletions, 1)
    assert.ok(rows.find(row => row.file === "committed.txt").patch.includes("+committed"))
    if (mode === "branch") {
      assert.ok(rows.find(row => row.file === "staged.txt").patch.includes("+staged"))
      assert.ok(rows.find(row => row.file === "untracked-0.txt").patch.includes("+new"))
    }
    const calls = sample.commands.filter(call => call.lane === "provider")
    for (const call of calls) assert.deepEqual(call.args.slice(0, expectedPrefix.length), expectedPrefix)
    assert.ok(calls.some(call => call.args.includes("explicit-base^{commit}")), "resolve the supplied base, not the current default")
    const diffs = calls.filter(call => call.args.includes("diff") && call.args.includes(sample.explicitBase))
    assert.equal(diffs.length, 3, "name/stat/patch queries must share the resolved explicit base")
    for (const call of diffs) assert.equal(call.args.includes("HEAD"), mode === "committed")
    const intent = calls.filter(call => call.args.includes("--intent-to-add"))
    assert.equal(intent.length, mode === "committed" ? 0 : 1)
    for (const call of intent) assert.ok(call.env?.GIT_INDEX_FILE.endsWith(".index"))
    const afterIndex = await fs.readFile(path.join(sample.repository, ".git/index"))
    const afterConfig = await fs.readFile(path.join(sample.repository, ".git/config"))
    const temporaryAfter = await fs.readdir(sample.temporary)
    assert.deepEqual(afterIndex, sample.beforeIndex)
    assert.deepEqual(afterConfig, sample.beforeConfig)
    assert.deepEqual(temporaryAfter, [])
    if (process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY) {
      await fs.mkdir(process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY, { recursive: true, mode: 0o700 })
      await fs.writeFile(path.join(process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY, `${mode}.json`), JSON.stringify({
        accepted: true, mode, source: { bytes: source.length, sha256: sha(source) }, directory: sample.directory,
        explicitBase: sample.explicitBase, files: expected, indexBefore: { bytes: sample.beforeIndex.length, sha256: sha(sample.beforeIndex) },
        indexAfter: { bytes: afterIndex.length, sha256: sha(afterIndex) }, configBeforeSHA256: sha(sample.beforeConfig),
        configAfterSHA256: sha(afterConfig), temporaryAfter, commands: sample.commands,
        qualification: "Only new explicit-base committed/branch cases; staged/unstaged/untracked distractions are synthetic. No earlier accepted case/control, native activation, model, full build or operator repository mutation.",
      }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
    }
  })
}

for (const fault of ["failed", "truncated"]) {
  test(`provider status fallback: ${fault} partial statistics keep best-effort counts and the full file list`, async () => {
    const statsOutput = fault === "failed" ? "1\t1\ttracked.txt\0" : "1\t0\tstaged.txt\0"
    const sample = await fixture(2, { statsFault: fault, statsOutput })
    let accepted = false, rows, afterIndex, afterConfig, temporaryAfter
    try {
      await assert.doesNotReject(async () => { rows = await Effect.runPromise(sample.adapter.status()) },
        "status must retain its best-effort API rather than throw a diff-stat error")
      afterIndex = await fs.readFile(path.join(sample.repository, ".git/index"))
      afterConfig = await fs.readFile(path.join(sample.repository, ".git/config"))
      temporaryAfter = await fs.readdir(sample.temporary)
      assert.deepEqual(Array.from(rows, row => row.file), ["staged.txt", "tracked.txt", "untracked-0.txt", "untracked-1.txt"],
        "partial statistics must not replace the independent porcelain file list")
      assert.deepEqual(Array.from(rows, row => ({ ...row })), [
        { file: "staged.txt", additions: 1, deletions: 0, status: "added" },
        { file: "tracked.txt", additions: fault === "failed" ? 1 : 0, deletions: fault === "failed" ? 1 : 0, status: "modified" },
        { file: "untracked-0.txt", additions: 1, deletions: 0, status: "added" },
        { file: "untracked-1.txt", additions: 1, deletions: 0, status: "added" },
      ], "preserve partial counts, missing-tracked zero defaults and added-file count fallback")
      const injected = sample.commands.filter(call => call.lane === "injected-numstat")
      assert.equal(injected.length, 1)
      assert.ok(injected[0].args.includes("HEAD"))
      const calls = sample.commands.filter(call => call.lane === "provider")
      assert.ok(calls.some(call => call.args.includes("--porcelain=v1")))
      assert.equal(calls.filter(call => call.args.includes("--intent-to-add")).length, 1)
      const batchStats = calls.filter(call => call.args.includes("--numstat") && call.env?.GIT_INDEX_FILE)
      assert.equal(batchStats.length, 1, "added files missing from partial stats must use the isolated batch")
      assert.ok(batchStats[0].env.GIT_INDEX_FILE.startsWith(sample.temporary + path.sep))
      assert.equal(calls.some(call => call.args.includes("--patch")), false, "status needs counts, not patches")
      assert.deepEqual(afterIndex, sample.beforeIndex, "partial-status handling must preserve all raw index bytes")
      assert.deepEqual(afterConfig, sample.beforeConfig, "partial-status handling must not persist configuration")
      assert.deepEqual(temporaryAfter, [])
      accepted = true
    } finally {
      if (process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY) {
        await fs.mkdir(process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY, { recursive: true, mode: 0o700 })
        await fs.writeFile(path.join(process.env.NATIVE_ROW_GIT_REPORT_DIRECTORY, `status-${fault}.json`), JSON.stringify({
          accepted, fault, statsOutputBytes: Buffer.byteLength(statsOutput), statsOutputSHA256: sha(statsOutput),
          source: { bytes: source.length, sha256: sha(source) }, directory: sample.directory,
          rows: rows ? Array.from(rows, row => ({ ...row })) : null,
          indexBefore: { bytes: sample.beforeIndex.length, sha256: sha(sample.beforeIndex) },
          indexAfter: afterIndex ? { bytes: afterIndex.length, sha256: sha(afterIndex) } : null,
          configBeforeSHA256: sha(sample.beforeConfig), configAfterSHA256: afterConfig ? sha(afterConfig) : null,
          temporaryAfter, commands: sample.commands,
          qualification: "Only new best-effort status cases with partial failed/truncated numstat injected at I/O. Original and corrected source are compared in separate selected runs; no old case/control or native/AppProcess/plugin/model/full build is run.",
        }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
      }
    }
  })
}
