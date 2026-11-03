import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { EventEmitter } from "node:events"
import fs from "node:fs"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { PassThrough } from "node:stream"
import { fileURLToPath, pathToFileURL } from "node:url"
import { after, before, test } from "node:test"
import {
  FAMILIES, LIMITS, EXPECTATIONS_SCHEMA, buildWorkerEnvironment, classifyRun, guardedRun, hashStableFile,
  namesDigest, normalizeExpectations, observeOwnedProcess, ownedRssMiB, parseMemAvailable, parseWorkerReceipt,
  plainDiagnostic, preflight, readProcessStartTime, readStableFile, reverifyIdentity, runWorker,
  sameOwnedProcess, sampleOwnedTree, superviseProcess, verifyReceiptBinding,
} from "./full-graph-diagnostics.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, "full-graph-diagnostics.mjs")
const scriptUrl = pathToFileURL(script).href
const nativeRoot = process.env.NATIVE_FULL_GRAPH_NATIVE_ROOT ?? "/home/james/repos/opencode-native-row"
const compiler = join(nativeRoot, "node_modules/.bun/@typescript+typescript-linux-x64@7.0.2/node_modules/@typescript/typescript-linux-x64/lib/tsc")
const apiModule = join(nativeRoot, "packages/plugin/node_modules/@typescript/native/dist/api/sync/api.js")
const compilerSha256 = "4f2de678286401759b3fb4475bafe35b8f32b4b3a07d92642bbf37eadc9b34a4"
const apiModuleSha256 = fs.existsSync(apiModule)
  ? createHash("sha256").update(fs.readFileSync(apiModule)).digest("hex")
  : "0".repeat(64)
const digest = bytes => createHash("sha256").update(bytes).digest("hex")
const digestJson = value => digest(Buffer.from(JSON.stringify(value)))
const json = file => JSON.parse(fs.readFileSync(file, "utf8"))
const compilerAvailable = fs.existsSync(compiler) && fs.existsSync(apiModule)
  && digest(fs.readFileSync(compiler)) === compilerSha256
const compilerSkip = compilerAvailable ? {} : { skip: `pinned 7.0.2 compiler is not present at ${compiler}` }

const baseOptions = {
  strict: true, noEmit: true, skipLibCheck: false, skipDefaultLibCheck: false,
  target: "esnext", module: "esnext", moduleResolution: "bundler",
}
const observedOptions = { strict: true, noEmit: true, skipLibCheck: false, skipDefaultLibCheck: false }

let scratch
const fixtures = {}

function writeTree(directory, files) {
  for (const [file, text] of Object.entries(files)) {
    const target = join(directory, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text)
  }
}

function makeFixture(name, files, options = baseOptions, configText = null) {
  const directory = join(scratch, name)
  mkdirSync(directory, { recursive: true })
  writeTree(directory, files)
  writeFileSync(join(directory, "tsconfig.json"),
    configText ?? JSON.stringify({ compilerOptions: options, files: Object.keys(files) }))
  fixtures[name] = { directory, config: join(directory, "tsconfig.json"), files: Object.keys(files) }
  return fixtures[name]
}

function configSha(path) {
  return fs.existsSync(path) ? digest(fs.readFileSync(path)) : "0".repeat(64)
}

function expectations(fixture, overrides = {}) {
  const rootFiles = fixture.files.map(file => join(fixture.directory, file))
  const project = {
    config: fixture.config,
    configSha256: configSha(fixture.config),
    options: observedOptions,
    rootFiles,
    overlayPaths: [],
    ...(overrides.project ?? {}),
  }
  const result = {
    schema: EXPECTATIONS_SCHEMA,
    compiler: { executable: compiler, apiModule, sha256: compilerSha256, apiModuleSha256, ...(overrides.compiler ?? {}) },
    project,
    overlays: overrides.overlays ?? {},
  }
  if (overrides.native) result.native = overrides.native
  if (overrides.limits) result.limits = overrides.limits
  if (Object.hasOwn(overrides, "runtime")) result.runtime = overrides.runtime
  return result
}

async function run(fixture, name, overrides = {}, budget) {
  const receipt = join(scratch, `${name}.ndjson`)
  const outcome = await runWorker({ expectations: expectations(fixture, overrides), receiptPath: receipt, receiptBudgetBytes: budget })
  const text = fs.readFileSync(receipt, "utf8")
  return { receipt, outcome, text, parsed: parseWorkerReceipt(text, { keepRecords: true, keepFiles: true }) }
}

function directProject(fixture, api) {
  const snapshot = api.updateSnapshot({ openProjects: [fixture.config] })
  const project = snapshot.getProject(fixture.config)
  assert.ok(project, "fixture project must load")
  return project
}

async function nativeIdentity(fixture, name) {
  const { API } = await import(pathToFileURL(apiModule).href)
  const api = new API({ cwd: fixture.directory, tsserverPath: compiler })
  let programFiles
  let entries
  let rootFiles
  try {
    const project = directProject(fixture, api)
    programFiles = [...project.program.getSourceFileNames()].sort()
    entries = programFiles.map(file => ({
      name: file,
      sha256: digest(fs.readFileSync(file)),
      bytes: fs.statSync(file).size,
    }))
    rootFiles = [...project.rootFiles]
  } finally { api.close() }
  assert.ok(programFiles.length > 1, "the tiny graph must include compiler libraries, not only the config and source")

  const repo = join(scratch, `${name}-native`)
  mkdirSync(join(repo, "src"), { recursive: true })
  const original = "export const value = 1\n"
  writeFileSync(join(repo, "src/a.ts"), original)
  const gitArgs = ["--no-optional-locks", "-C", repo]
  execFileSync("git", [...gitArgs, "init", "--quiet"])
  execFileSync("git", [...gitArgs, "add", "-A"])
  execFileSync("git", [...gitArgs, "-c", "user.email=test@example.invalid", "-c", "user.name=Test", "commit", "-qm", "base"])

  const overlayPath = join(scratch, `${name}-overlay-a.ts`)
  const overlayText = "export const value: number = 1\n"
  writeFileSync(overlayPath, overlayText)

  const graphReceipt = join(scratch, `${name}-graph.json`)
  writeFileSync(graphReceipt, JSON.stringify({
    config: fixture.config,
    files: entries.length,
    entries,
    graphSha256: digestJson(entries),
    rootFiles,
  }))
  const graphReceiptSha256 = digest(fs.readFileSync(graphReceipt))
  const names = entries.map(entry => entry.name)
  const shaped = expectations(fixture, {
    project: {
      graphFiles: entries.length,
      namesSha256: namesDigest(names),
      graphReceipt,
      graphReceiptSha256,
      rootFiles,
      overlayPaths: ["src/a.ts"],
    },
    overlays: { "src/a.ts": { path: overlayPath, sha256: digest(Buffer.from(overlayText)), originalSha256: digest(Buffer.from(original)) } },
    native: { root: repo },
  })
  return { repo, original, overlayPath, entries, graphReceipt, graphReceiptSha256, names, expectations: shaped, programFiles }
}

function writeExpectationsFile(name, shaped) {
  const file = join(scratch, `${name}-expectations.json`)
  writeFileSync(file, JSON.stringify(shaped))
  return file
}

async function runNode(args, options = {}) {
  const result = await superviseProcess({
    command: process.execPath, args, cwd: options.cwd ?? scratch, env: options.env,
    available: () => 4096,
    limits: { ...LIMITS, sampleMs: 10, deadlineMs: 5000, prelaunchMiB: 1024 },
  })
  assert.equal(result.reason, null, JSON.stringify(result))
  return result
}

async function spawnWorkerCli({ fixture, name, shaped, env, prelaunchMiB = 1024 }) {
  const expectationsPath = writeExpectationsFile(name, shaped)
  const receipt = join(scratch, `${name}.ndjson`)
  const result = await superviseProcess({
    command: process.execPath,
    args: [script, "worker", "--expectations", expectationsPath, "--receipt", receipt,
      "--receipt-budget", String(LIMITS.receiptBytes)],
    cwd: fixture.directory,
    env,
    available: () => 4096,
    limits: { ...LIMITS, prelaunchMiB },
  })
  const text = fs.existsSync(receipt) ? fs.readFileSync(receipt, "utf8") : null
  return { result, receipt, text, parsed: text === null ? null : parseWorkerReceipt(text, { keepRecords: true, keepFiles: true }) }
}

function receiptObjects(text) {
  return text.slice(0, -1).split("\n").map(line => JSON.parse(line))
}

function receiptText(objects) {
  return `${objects.map(value => JSON.stringify(value)).join("\n")}\n`
}

function recomputeDigest(objects) {
  const hash = createHash("sha256")
  for (const entry of objects) {
    if (entry.kind !== "diagnostic") continue
    hash.update(JSON.stringify(entry.diagnostic))
    hash.update("\n")
  }
  return hash.digest("hex")
}

function blockRange(objects, family) {
  const start = objects.findIndex(entry => entry.kind === "family-start" && entry.family === family)
  const end = objects.findIndex(entry => entry.kind === "family" && entry.family === family)
  return { start, end }
}

function statLine(pid, ppid, start, state = "S") {
  const fields = [state, String(ppid), String(ppid), ...Array(16).fill("0"), String(start)]
  return `${pid} (node) ${fields.join(" ")}`
}

before(() => {
  scratch = mkdtempSync("/tmp/opencode/full-graph-diagnostics-test-")
  makeFixture("valid", { "a.ts": "export const x: number = 1\n" })
  makeFixture("multi", {
    "a.ts": "/// <reference path=\"./ext.d.ts\" />\nexport const a: string = 1\n",
    "b.ts": "import { a } from './a'\nexport const b: number = a\n",
    "c.ts": "export function f( {\n",
    "ext.d.ts": "export declare const z: Missing\n",
  }, baseOptions)
  makeFixture("bad-json", { "a.ts": "export const x = 1\n" }, baseOptions, "{ not json")
  makeFixture("missing-config", { "a.ts": "export const x = 1\n" })
  fs.rmSync(join(scratch, "missing-config", "tsconfig.json"))
})

after(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }) })

test("the mandated resource envelope is frozen and cannot be raised or masked", () => {
  assert.deepEqual(LIMITS, {
    ownedRSSMiB: 1536, availableFloorMiB: 1280, prelaunchMiB: 2816, deadlineMs: 90000,
    stdoutBytes: 2 * 1024 * 1024, stderrBytes: 256 * 1024, receiptBytes: 64 * 1024 * 1024, sampleMs: 100,
    expectationsBytes: 8 * 1024 * 1024, graphReceiptBytes: 64 * 1024 * 1024,
    compilerBytes: 128 * 1024 * 1024, apiModuleBytes: 16 * 1024 * 1024,
    fileBytes: 128 * 1024 * 1024, graphTotalBytes: 512 * 1024 * 1024, acquisitionMs: 120000,
    samplerEntries: 8192, samplerMs: 100, postExitGraceMs: 2000, drainMs: 250,
  })
  assert.ok(Object.isFrozen(LIMITS))
  const raised = expectations(fixtures.valid, { limits: { ...LIMITS, ownedRSSMiB: 4096 } })
  assert.throws(() => normalizeExpectations(raised), /mandated/)
  const lowered = expectations(fixtures.valid, { limits: { ...LIMITS, deadlineMs: 89000 } })
  assert.throws(() => normalizeExpectations(lowered), /mandated/)
  assert.doesNotThrow(() => normalizeExpectations(expectations(fixtures.valid, { limits: { ...LIMITS } })))
})

test("expectations use a strict schema and require every initial identity digest", () => {
  const base = expectations(fixtures.valid)
  assert.throws(() => normalizeExpectations({ ...base, extra: true }), /not part of the expectations schema/)
  assert.throws(() => normalizeExpectations({ ...base, compiler: { ...base.compiler, extra: true } }), /compiler.extra/)
  assert.throws(() => normalizeExpectations({ ...base, project: { ...base.project, extra: true } }), /project.extra/)
  assert.throws(() => normalizeExpectations(expectations(fixtures.valid, { compiler: { apiModuleSha256: undefined } })),
    /apiModuleSha256/)
  assert.throws(() => normalizeExpectations(expectations(fixtures.valid, { compiler: { apiModuleSha256: "not-a-hash" } })),
    /apiModuleSha256/)
  assert.throws(() => normalizeExpectations(expectations(fixtures.valid, {
    project: { configSha256: undefined },
  })), /configSha256/)
  assert.throws(() => normalizeExpectations(expectations(fixtures.valid, {
    project: { graphReceipt: "/tmp/opencode/graph.json", graphFiles: 1, namesSha256: "0".repeat(64) },
  })), /graphReceiptSha256/)
})

test("stable acquisition refuses symlinks, non-regular files, oversize, timeouts, changes and unbounded reads", () => {
  const directory = join(scratch, "acquisition")
  mkdirSync(directory, { recursive: true })
  const file = join(directory, "value.txt")
  const body = "hello bounded acquisition\n"
  writeFileSync(file, body)
  assert.equal(readStableFile(file, { maxBytes: 1024, label: "value" }).toString(), body)
  assert.equal(hashStableFile(file, { maxBytes: 1024, label: "value" }).sha256, digest(Buffer.from(body)))

  const link = join(directory, "link.txt")
  symlinkSync(file, link)
  assert.throws(() => readStableFile(link, { maxBytes: 1024, label: "link" }),
    error => error.code === "acquisition-symlink")

  assert.throws(() => readStableFile(directory, { maxBytes: 1024, label: "directory" }),
    error => error.code === "acquisition-nonregular")

  const fifo = join(directory, "pipe")
  if (fs.existsSync("/usr/bin/mkfifo")) {
    execFileSync("/usr/bin/mkfifo", [fifo])
    assert.throws(() => readStableFile(fifo, { maxBytes: 1024, label: "fifo" }),
      error => error.code === "acquisition-nonregular")
  }

  const big = join(directory, "big.bin")
  writeFileSync(big, Buffer.alloc(4096))
  assert.throws(() => readStableFile(big, { maxBytes: 1024, label: "big" }),
    error => error.code === "acquisition-size")

  assert.throws(() => readStableFile(file, { maxBytes: 1024, label: "value", deadline: performance.now() - 1 }),
    error => error.code === "acquisition-timeout")

  const changing = join(directory, "changing.bin")
  writeFileSync(changing, Buffer.alloc(2 * 1024 * 1024))
  assert.throws(() => hashStableFile(changing, {
    maxBytes: 4 * 1024 * 1024, label: "changing",
    hooks: { afterChunk: () => writeFileSync(changing, Buffer.alloc(3 * 1024 * 1024)) },
  }), error => error.code === "acquisition-changed")

  const growth = join(directory, "growth.bin")
  writeFileSync(growth, Buffer.alloc(8))
  const reads = []
  assert.throws(() => hashStableFile(growth, {
    maxBytes: 16, label: "growth",
    hooks: {
      beforeRead: position => { if (position === 0) writeFileSync(growth, Buffer.alloc(4098)) },
      afterRead: read => reads.push(read),
    },
  }), error => error.code === "acquisition-size")
  assert.deepEqual(reads, [17], "only one byte beyond the remaining budget may be read")
})

test("a real bounded child does not hang when the path is replaced by a FIFO", { skip: !fs.existsSync("/usr/bin/mkfifo") }, async () => {
  const directory = join(scratch, "fifo-child")
  mkdirSync(directory, { recursive: true })
  const target = join(directory, "race-file")
  writeFileSync(target, Buffer.alloc(8))
  const childScript = join(directory, "child.mjs")
  writeFileSync(childScript, `import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { readStableFile } from ${JSON.stringify(scriptUrl)}
const target = process.argv[2]
try {
  readStableFile(target, { maxBytes: 1024, label: "race", hooks: {
    beforeOpen: () => { fs.rmSync(target); execFileSync("/usr/bin/mkfifo", [target]) },
  } })
  console.log("unexpected-success")
  process.exitCode = 2
} catch (error) {
  console.log(error.code)
  process.exitCode = error.code === "acquisition-nonregular" ? 0 : 3
}
`)
  const child = spawn(process.execPath, [childScript, target], { stdio: ["ignore", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", chunk => { stdout += chunk })
  child.stderr.on("data", chunk => { stderr += chunk })
  const outcome = await new Promise(resolve => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({ timedOut: true })
    }, 1500)
    child.once("exit", code => {
      clearTimeout(timer)
      resolve({ timedOut: false, code })
    })
  })
  assert.equal(outcome.timedOut, false, "the child acquisition hung on a FIFO replacement")
  assert.equal(outcome.code, 0, `${stdout}${stderr}`)
  assert.equal(stdout.trim(), "acquisition-nonregular")
})

test("synthetic injected sampler requires the full kB grammar and bounded tree", () => {
  const status = "Name:\tworker\nVmRSS:\t  2048 kB\n"
  const good = () => ({
    readFileSync: path => path.endsWith("/status") ? status : "",
    readdirSync: () => ["1"],
  })
  assert.equal(ownedRssMiB(42, good()), 2)

  const cases = [
    { io: { readFileSync: () => { const error = new Error("missing"); error.code = "ENOENT"; throw error }, readdirSync: () => ["1"] }, match: /unavailable/ },
    { io: { readFileSync: path => path.endsWith("/status") ? "Name:\tworker\n" : "", readdirSync: () => ["1"] }, match: /malformed/ },
    { io: { readFileSync: path => path.endsWith("/status") ? "VmRSS:\t  2048 MB\n" : "", readdirSync: () => ["1"] }, match: /malformed/ },
    { io: { readFileSync: path => path.endsWith("/status") ? "VmRSS:\t  2048 kB\nVmRSS:\t  2048 kB\n" : "", readdirSync: () => ["1"] }, match: /malformed/ },
    { io: { readFileSync: path => path.endsWith("/status") ? "VmRSS:\t  2048 kB extra\n" : "", readdirSync: () => ["1"] }, match: /malformed/ },
    { io: { readFileSync: path => path.endsWith("/status") ? "VmRSS:\t  0 kB\n" : "", readdirSync: () => ["1"] }, match: /zero resident/ },
    { io: { readFileSync: path => path.endsWith("/status") ? status : "", readdirSync: () => { throw new Error("denied") } }, match: /tree is unavailable/ },
    { io: { readFileSync: path => path.endsWith("/status") ? status : "", readdirSync: () => [] }, match: /tree is empty/ },
    { io: { readFileSync: path => path.endsWith("/status") ? status : "", readdirSync: () => ["x"] }, match: /malformed thread id/ },
    { io: { readFileSync: path => path.endsWith("/children") ? String(Number.MAX_SAFE_INTEGER + 2) : status, readdirSync: () => ["1"] }, match: /unsafe child id/ },
    { io: { readFileSync: path => path.endsWith("/children") ? "12x" : status, readdirSync: () => ["1"] }, match: /malformed child id/ },
  ]
  for (const { io, match } of cases) {
    assert.throws(() => ownedRssMiB(42, io), match)
  }

  const goneChild = {
    readFileSync: path => {
      if (path === "/proc/42/status") return status
      if (path === "/proc/42/task/1/children") return "7"
      if (path === "/proc/7/status") { const error = new Error("gone"); error.code = "ENOENT"; throw error }
      return ""
    },
    readdirSync: () => ["1"],
  }
  assert.throws(() => ownedRssMiB(42, goneChild), /owned RSS is unavailable/,
    "a missing status without fresh exit evidence remains unknown")
  const confirmedGoneChild = {
    ...goneChild,
    readFileSync: selected => {
      if (selected === "/proc/7/stat") throw Object.assign(new Error("confirmed missing child"), { code: "ENOENT" })
      return goneChild.readFileSync(selected)
    },
  }
  assert.equal(ownedRssMiB(42, confirmedGoneChild), 2,
    "a descendant confirmed missing after status loss is omitted")

  const rootStatus = "Name:\troot\nVmRSS:\t  2048 kB\n"
  const malformedLiveChild = {
    readFileSync: path => {
      if (path === "/proc/42/status") return rootStatus
      if (path === "/proc/42/task/1/children") return "7"
      if (path === "/proc/7/status") return "Name:\tchild\nVmRSS:\t  2048 MB\n"
      return ""
    },
    readdirSync: () => ["1"],
  }
  assert.throws(() => ownedRssMiB(42, malformedLiveChild), /malformed|identity/,
    "a malformed live child with an unknown identity must not be silently dropped")
  assert.throws(() => sampleOwnedTree(42, {
    ...malformedLiveChild,
    readFileSync: path => {
      if (path === "/proc/42/stat") return statLine(42, 1, "100")
      return malformedLiveChild.readFileSync(path)
    },
  }), /malformed|identity/)

  const rootIdentity = {
    readFileSync: path => {
      if (path === "/proc/42/stat") return statLine(42, 1, "100")
      if (path === "/proc/42/status") return rootStatus
      if (path === "/proc/42/task/1/children") return "7"
      return ""
    },
    readdirSync: () => ["1"],
  }
  const zombieChild = {
    ...rootIdentity,
    readFileSync: path => {
      if (path === "/proc/7/stat") return statLine(7, 42, "101", "Z")
      if (path === "/proc/7/status") return "Name:\tchild\nVmRSS:\t  0 kB\n"
      return rootIdentity.readFileSync(path)
    },
    readdirSync: selected => selected === "/proc/7/task" ? ["7"] : ["1"],
  }
  assert.deepEqual(sampleOwnedTree(42, zombieChild).processes.map(entry => entry.pid), [42],
    "a confirmed zombie child is gone")

  const reusedChild = {
    ...rootIdentity,
    readFileSync: path => {
      if (path === "/proc/7/stat") return statLine(7, 999, "101")
      if (path === "/proc/7/status") return "Name:\tchild\nVmRSS:\t  2048 kB\n"
      return rootIdentity.readFileSync(path)
    },
  }
  assert.deepEqual(sampleOwnedTree(42, reusedChild).processes.map(entry => entry.pid), [42],
    "a child whose PPID no longer matches its enumerator is never adopted")
  assert.throws(() => ownedRssMiB(0, good()), /safe positive process id/)
  assert.throws(() => ownedRssMiB(42, good(), { maxEntries: 1 }), /entry bound/)
  assert.throws(() => ownedRssMiB(42, good(), { deadlineMs: -1 }), /non-negative and no larger than the fixed limit/)

  const zeroChild = {
    readFileSync: path => path === "/proc/42/status" ? status
      : path === "/proc/42/task/1/children" ? "7"
        : path === "/proc/7/status" ? "Name:\tchild\nVmRSS:\t  0 kB\n" : "",
    readdirSync: () => ["1"],
  }
  assert.equal(ownedRssMiB(42, zeroChild), 2, "a zero-RSS child is valid while the owned root is non-zero")
})

test("a completed worker receipt covers exactly the seven families with per-file evidence", compilerSkip, async () => {
  const first = await run(fixtures.valid, "valid-1")
  const second = await run(fixtures.valid, "valid-2")
  assert.equal(first.outcome.exitCode, 0)
  assert.equal(first.parsed.ok, true, first.parsed.error)
  assert.equal(first.parsed.complete, true)
  assert.equal(first.parsed.digestMatches, true)
  assert.equal(first.parsed.trailer.status, "completed")
  assert.deepEqual(Object.keys(first.parsed.families), [...FAMILIES])
  assert.equal(first.parsed.families.suggestion, undefined)
  assert.equal(first.parsed.diagnostics, 0)
  const graphFiles = first.parsed.graph.graphFiles
  assert.equal(first.parsed.trailer.iteratedFiles, 4 * graphFiles)
  for (const family of ["syntactic", "bind", "declaration", "semantic"]) {
    assert.equal(first.parsed.families[family].queries, graphFiles)
    assert.equal(first.parsed.families[family].namesSha256, first.parsed.graph.namesSha256)
    assert.equal(first.parsed.files.filter(entry => entry.family === family).length, graphFiles)
  }
  for (const family of ["config", "program", "global"]) {
    assert.equal(first.parsed.families[family].queries, 0)
    assert.equal(first.parsed.families[family].namesSha256, null)
  }
  assert.deepEqual(first.parsed.header.limits, LIMITS)
  assert.equal(first.parsed.header.compilerSha256, compilerSha256)
  assert.equal(first.parsed.header.apiModuleSha256, apiModuleSha256)
  assert.equal(first.parsed.trailer.namesSha256, second.parsed.trailer.namesSha256)
  assert.equal(first.parsed.digest, second.parsed.digest)
  assert.equal(first.parsed.trailer.iteratedFiles, second.parsed.trailer.iteratedFiles)
})

test("per-file sequencing covers every whole-program diagnostic without filtering", compilerSkip, async () => {
  const result = await run(fixtures.multi, "multi")
  assert.equal(result.parsed.ok, true, result.parsed.error)
  assert.equal(result.parsed.trailer.status, "completed")
  assert.ok(result.parsed.diagnostics >= 5, JSON.stringify(result.parsed.trailer))

  const { API } = await import(pathToFileURL(apiModule).href)
  const api = new API({ cwd: fixtures.multi.directory, tsserverPath: compiler })
  let apiNames
  try {
    const project = directProject(fixtures.multi, api)
    apiNames = [...project.program.getSourceFileNames()].sort()
    for (const family of ["syntactic", "semantic"]) {
      const whole = project.program[`get${family[0].toUpperCase()}${family.slice(1)}Diagnostics`]()
        .map(value => JSON.stringify(plainDiagnostic(value))).sort()
      const perFile = result.parsed.records.filter(entry => entry.family === family)
        .map(entry => JSON.stringify(entry.diagnostic)).sort()
      assert.deepEqual(perFile, whole, `${family} diagnostics must match the whole-program query`)
    }
  } finally { api.close() }

  for (const family of ["syntactic", "bind", "declaration", "semantic"]) {
    const files = result.parsed.files.filter(entry => entry.family === family)
    assert.equal(files.length, result.parsed.graph.graphFiles)
    assert.deepEqual(files.map(entry => entry.name), [...files.map(entry => entry.name)].sort())
    assert.equal(new Set(files.map(entry => entry.name)).size, files.length)
    assert.ok(files.some(entry => entry.diagnostics === 0), `${family} must record zero-diagnostic files`)
    if (family === "syntactic") assert.deepEqual(files.map(entry => entry.name), apiNames)
    for (const record of result.parsed.records.filter(entry => entry.family === family)) {
      assert.ok(files.some(entry => entry.name === record.file), `diagnostic file ${record.file} must have a file record`)
    }
  }

  const codes = result.parsed.records.map(entry => entry.diagnostic.code)
  for (const code of [1005, 2322, 2304]) assert.ok(codes.includes(code), `missing diagnostic code ${code}`)
  assert.ok(result.parsed.records.some(entry => entry.diagnostic.fileName?.endsWith(".d.ts")))
})

test("invalid config is reported as invalid config before file checking", compilerSkip, async () => {
  const result = await run(fixtures["bad-json"], "bad-json")
  assert.equal(result.parsed.ok, true, result.parsed.error)
  assert.equal(result.parsed.trailer.status, "invalid-config")
  assert.deepEqual(Object.keys(result.parsed.families), ["config"])
  assert.equal(result.parsed.familyStart.config, 0)
  assert.equal(result.parsed.families.config.queries, 0)
  assert.equal(result.parsed.trailer.iteratedFiles, 0)
  assert.ok(result.parsed.diagnostics > 0)
  assert.ok(result.parsed.records.every(entry => entry.family === "config" && entry.file === null))
  assert.ok(result.parsed.records.some(entry => entry.diagnostic.code === 1005))
})

test("an unreadable config is invalid config, not a compiler or deadline result", compilerSkip, async () => {
  const result = await run(fixtures["missing-config"], "missing-config")
  assert.equal(result.parsed.ok, true, result.parsed.error)
  assert.equal(result.parsed.trailer.status, "invalid-config")
  assert.equal(result.parsed.trailer.stage, "config")
  assert.match(result.parsed.trailer.detail, /could not read file/)
  assert.deepEqual(Object.keys(result.parsed.families), [])
})

test("receipts are write-once; a refused attempt preserves the original bytes", compilerSkip, async () => {
  const receipt = join(scratch, "write-once.ndjson")
  await runWorker({ expectations: expectations(fixtures.valid), receiptPath: receipt })
  const before = fs.readFileSync(receipt)
  await assert.rejects(runWorker({ expectations: expectations(fixtures.valid), receiptPath: receipt }),
    error => error.code === "EEXIST")
  assert.deepEqual(fs.readFileSync(receipt), before)
})

test("receipt budget overflow is incomplete, not a silently narrowed diagnostic set", compilerSkip, async () => {
  const result = await run(fixtures.valid, "budget", {}, 200)
  assert.equal(result.outcome.exitCode, 5)
  assert.equal(result.outcome.status, "incomplete")
  assert.ok(fs.statSync(result.receipt).size <= 200)
  assert.equal(result.parsed.trailer, null)
  const classification = classifyRun({
    preflight: { identityComplete: true, project: { graphFiles: null }, graph: { namesSha256: null } },
    guard: { spawned: true, reason: null, code: 5, signal: null },
    parsed: result.parsed,
  })
  assert.equal(classification.status, "incomplete")
  assert.equal(classification.reason, "receipt-budget")
})

test("a graph-count mismatch fails the run instead of reporting clean diagnostics", compilerSkip, async () => {
  const result = await run(fixtures.valid, "wrong-count", { project: { graphFiles: 5 } })
  assert.equal(result.outcome.exitCode, 4)
  assert.equal(result.parsed.ok, true, result.parsed.error)
  assert.equal(result.parsed.trailer.status, "failed")
  assert.equal(result.parsed.trailer.failure.stage, "graph")
  const classification = classifyRun({
    preflight: { identityComplete: true, project: { graphFiles: 5 }, graph: { namesSha256: null } },
    guard: { spawned: true, reason: null, code: 4, signal: null },
    parsed: result.parsed,
  })
  assert.equal(classification.status, "incomplete")
  assert.equal(classification.reason, "worker-failure:graph")
})

test("a compiler-option mismatch fails the run instead of accepting a different configuration", compilerSkip, async () => {
  const result = await run(fixtures.valid, "option-mismatch", { project: { options: { ...observedOptions, strict: false } } })
  assert.equal(result.outcome.exitCode, 4)
  assert.equal(result.parsed.trailer.status, "failed")
  assert.equal(result.parsed.trailer.failure.stage, "options")
})

test("the tiny identity graph is the actual program graph, including compiler libraries", compilerSkip, async () => {
  const identity = await nativeIdentity(fixtures.valid, "truthful")
  assert.ok(identity.entries.length > 1)
  assert.equal(identity.entries.length, identity.expectations.project.graphFiles)
  assert.equal(identity.programFiles.length, identity.entries.length)
  assert.ok(identity.entries.some(entry => entry.name.includes("/lib.")))
  const checks = preflight(normalizeExpectations(identity.expectations))
  assert.equal(checks.identityComplete, true, JSON.stringify({ graph: checks.graph, overlays: checks.overlays }))
  assert.equal(checks.graph.entriesChecked, identity.entries.length)
  assert.equal(checks.graph.files, identity.entries.length)
})

test("preflight binds the complete graph, config, receipt, API module, overlays and clean native targets", compilerSkip, async () => {
  const fixture = fixtures.valid
  const identity = await nativeIdentity(fixture, "preflight")
  const verified = preflight(normalizeExpectations(identity.expectations))
  assert.equal(verified.graph.verified, true, JSON.stringify(verified.graph))
  assert.equal(verified.graph.files, identity.entries.length)
  assert.equal(verified.graph.receiptSha256, identity.graphReceiptSha256)
  assert.equal(verified.overlays.verified, true, JSON.stringify(verified.overlays))
  assert.equal(verified.compiler.apiModuleVerified, true)
  assert.equal(verified.identityComplete, true)
  assert.equal(verified.project.configVerified, true)
  assert.equal(verified.project.configSha256, digest(fs.readFileSync(fixture.config)))
  assert.equal(verified.wouldSpawn, verified.availableMiB >= LIMITS.prelaunchMiB)

  writeFileSync(join(identity.repo, "src/a.ts"), "export const value = 2\n")
  const tampered = preflight(normalizeExpectations(identity.expectations))
  assert.equal(tampered.overlays.verified, false)
  assert.match(tampered.overlays.problem, /pinned original bytes differ/)
  assert.equal(tampered.identityComplete, false)

  const digestRun = JSON.parse(execFileSync(process.execPath, [script, "digest", "--graph", identity.graphReceipt], { encoding: "utf8" }))
  assert.equal(digestRun.files, identity.entries.length)
  assert.equal(digestRun.namesSha256, namesDigest(identity.names))
  assert.equal(digestRun.graphSha256, digestJson(identity.entries))

  const staleCount = expectations(fixture, {
    project: { ...identity.expectations.project, graphFiles: identity.entries.length - 1 },
    overlays: identity.expectations.overlays,
    native: identity.expectations.native,
  })
  const stale = preflight(normalizeExpectations(staleCount))
  assert.equal(stale.graph.verified, false)
  assert.equal(stale.identityComplete, false)
})

test("preflight rejects compiler drift and a missing or wrong API module digest", compilerSkip, () => {
  const drifted = preflight(normalizeExpectations(expectations(fixtures.valid, { compiler: { sha256: "0".repeat(64) } })))
  assert.equal(drifted.compiler.verified, false)
  assert.equal(drifted.identityComplete, false)

  const wrongModule = preflight(normalizeExpectations(expectations(fixtures.valid, { compiler: { apiModuleSha256: "0".repeat(64) } })))
  assert.equal(wrongModule.compiler.apiModuleVerified, false)
  assert.equal(wrongModule.identityComplete, false)

  assert.throws(() => normalizeExpectations(expectations(fixtures.valid, {
    project: { overlayPaths: ["src/a.ts"] },
  })), /overlays must contain exactly the declared overlayPaths/)
})

test("a config change after preflight cannot remain stable", compilerSkip, async () => {
  const fixture = makeFixture("config-change", { "a.ts": "export const x: number = 1\n" })
  const identity = await nativeIdentity(fixture, "config-change")
  const before = reverifyIdentity(normalizeExpectations(identity.expectations))
  assert.equal(before.stable, true, JSON.stringify(before))
  assert.equal(before.configVerified, true)

  writeFileSync(fixture.config, JSON.stringify({
    compilerOptions: { ...baseOptions, strict: false },
    files: ["a.ts"],
  }))
  const after = reverifyIdentity(normalizeExpectations(identity.expectations))
  assert.equal(after.stable, false)
  assert.equal(after.configVerified, false)
  assert.notEqual(after.configSha256, identity.expectations.project.configSha256)
})

test("rewritten source plus a consistently rewritten receipt cannot self-bless after preflight", compilerSkip, async () => {
  const fixture = makeFixture("epoch", { "a.ts": "export const x: number = 1\n" })
  const identity = await nativeIdentity(fixture, "epoch")
  assert.equal(reverifyIdentity(normalizeExpectations(identity.expectations)).stable, true)

  writeFileSync(join(fixture.directory, "a.ts"), "export const x: number = 2\n")
  const rewritten = {
    ...json(identity.graphReceipt),
    entries: identity.entries.map(entry => ({
      ...entry,
      sha256: digest(fs.readFileSync(entry.name)),
    })),
  }
  rewritten.graphSha256 = digestJson(rewritten.entries)
  writeFileSync(identity.graphReceipt, JSON.stringify(rewritten))

  const after = reverifyIdentity(normalizeExpectations(identity.expectations))
  assert.equal(after.stable, false)
  assert.equal(after.graph.receiptSha256, digest(fs.readFileSync(identity.graphReceipt)))
  assert.notEqual(after.graph.receiptSha256, identity.graphReceiptSha256)
  assert.equal(after.graph.verified, false)
})

test("reverify without the initial identity samples never reports stable", compilerSkip, async () => {
  const fixture = makeFixture("no-before", { "a.ts": "export const x: number = 1\n" })
  const identity = await nativeIdentity(fixture, "no-before")
  const raw = JSON.parse(JSON.stringify(identity.expectations))
  raw.project.configSha256 = undefined
  raw.project.graphReceiptSha256 = undefined
  const after = reverifyIdentity(raw)
  assert.equal(after.stable, false)
  assert.equal(after.graph.verified, false)
  assert.equal(after.configVerified, false)
})

test("identity verification rehashes every graph entry after a non-overlay source change", compilerSkip, async () => {
  const fixture = makeFixture("rehash", { "a.ts": "export const a: number = 1\n", "b.ts": "export const b: number = 2\n" })
  const identity = await nativeIdentity(fixture, "rehash")
  const before = reverifyIdentity(normalizeExpectations(identity.expectations))
  assert.equal(before.stable, true, JSON.stringify({ graph: before.graph, overlays: before.overlays }))
  assert.equal(before.graph.entriesChecked, identity.entries.length)
  assert.equal(before.compilerSha256, compilerSha256)
  assert.equal(before.apiModuleSha256, apiModuleSha256)
  assert.equal(before.configSha256, digest(fs.readFileSync(fixture.config)))

  writeFileSync(join(fixture.directory, "b.ts"), "export const b: number = 3\n")
  const drifted = reverifyIdentity(normalizeExpectations(identity.expectations))
  assert.equal(drifted.stable, false)
  assert.equal(drifted.graph.verified, false)
  assert.equal(drifted.graph.entriesChecked, identity.entries.length)
  assert.ok(drifted.graph.mismatchCount >= 1)
})

test("a graph receipt is refused when it repeats entries, is a symlink, or mismatches its count", compilerSkip, async () => {
  const identity = await nativeIdentity(fixtures.valid, "graph-receipt")
  const original = json(identity.graphReceipt)

  const duplicateEntries = [...original.entries, { ...original.entries[0] }]
  const duplicatePath = join(scratch, "duplicate-graph.json")
  writeFileSync(duplicatePath, JSON.stringify({ ...original, files: duplicateEntries.length,
    entries: duplicateEntries, graphSha256: digestJson(duplicateEntries) }))
  const duplicate = preflight(normalizeExpectations(expectations(fixtures.valid, {
    project: { graphReceipt: duplicatePath, graphReceiptSha256: digest(fs.readFileSync(duplicatePath)),
      graphFiles: duplicateEntries.length, namesSha256: namesDigest(duplicateEntries.map(entry => entry.name)) },
  })))
  assert.equal(duplicate.graph.verified, false)
  assert.match(duplicate.graph.error, /repeats/)

  const linkPath = join(scratch, "linked-graph.json")
  symlinkSync(identity.graphReceipt, linkPath)
  const linked = preflight(normalizeExpectations(expectations(fixtures.valid, {
    project: { graphReceipt: linkPath, graphReceiptSha256: identity.graphReceiptSha256,
      graphFiles: original.files, namesSha256: namesDigest(identity.names) },
  })))
  assert.equal(linked.graph.verified, false)
  assert.match(linked.graph.error, /symbolic link/)

  const wrongCount = preflight(normalizeExpectations(expectations(fixtures.valid, {
    project: { graphReceipt: identity.graphReceipt, graphReceiptSha256: identity.graphReceiptSha256,
      graphFiles: original.files + 1, namesSha256: namesDigest(identity.names) },
  })))
  assert.equal(wrongCount.graph.verified, false)
  assert.match(wrongCount.graph.error, /expected/)
})

test("forged, duplicated or reordered receipt records are rejected", compilerSkip, async () => {
  const base = await run(fixtures.multi, "forge-base")
  assert.equal(base.parsed.ok, true, base.parsed.error)
  assert.ok(base.parsed.diagnostics > 0)
  assert.ok(base.parsed.files.length > 0)
  const control = receiptObjects(base.text)
  assert.equal(parseWorkerReceipt(receiptText(control)).ok, true)

  const deep = () => receiptObjects(base.text)
  const firstFile = (lines, family) => lines.findIndex(entry => entry.kind === "file" && entry.family === family)
  const firstDiagnostic = lines => lines.findIndex(entry => entry.kind === "diagnostic")
  const mutations = [
    ["duplicate trailer", () => { const lines = deep(); lines.push(structuredClone(lines.at(-1))); return lines }],
    ["line after trailer", () => { const lines = deep(); lines.push(structuredClone(lines[firstDiagnostic(lines)])); return lines }],
    ["trailer before families", () => { const lines = deep(); const trailer = lines.pop(); lines.splice(1, 0, trailer); return lines }],
    ["duplicate header", () => { const lines = deep(); lines.splice(1, 0, structuredClone(lines[0])); return lines }],
    ["duplicate family terminal", () => { const lines = deep(); const range = blockRange(lines, "semantic"); lines.splice(range.end + 1, 0, structuredClone(lines[range.end])); return lines }],
    ["out-of-order families", () => {
      const lines = deep()
      const syntactic = blockRange(lines, "syntactic")
      const bind = blockRange(lines, "bind")
      for (let index = syntactic.start; index <= syntactic.end; index++) lines[index].family = "bind"
      for (let index = bind.start; index <= bind.end; index++) lines[index].family = "syntactic"
      return lines
    }],
    ["forged family count", () => { const lines = deep(); lines.at(-1).families.semantic += 1; return lines }],
    ["forged diagnostic total", () => { const lines = deep(); lines.at(-1).diagnostics += 1; return lines }],
    ["forged diagnostic digest", () => { const lines = deep(); lines.at(-1).diagnosticsSha256 = "0".repeat(64); return lines }],
    ["diagnostic in the wrong family", () => { const lines = deep(); lines[firstDiagnostic(lines)].family = "semantic"; return lines }],
    ["unknown schema", () => { const lines = deep(); lines[0].schema = "other"; return lines }],
    ["unknown header key", () => { const lines = deep(); lines[0].extra = true; return lines }],
    ["empty line", () => { const lines = deep(); lines.splice(2, 0, ""); return lines }],
    ["family-start file mismatch", () => { const lines = deep(); const range = blockRange(lines, "syntactic"); lines[range.start].files += 1; return lines }],
    ["diagnostic outside a family", () => { const lines = deep(); const diagnostic = lines[firstDiagnostic(lines)]; lines.splice(2, 0, structuredClone(diagnostic)); return lines }],
    ["diagnostic with an unknown key", () => { const lines = deep(); lines[firstDiagnostic(lines)].diagnostic.extra = 1; return lines }],
    ["diagnostic with a malformed category", () => { const lines = deep(); lines[firstDiagnostic(lines)].diagnostic.category = "error"; return lines }],
    ["diagnostic file mismatch", () => {
      const lines = deep()
      const record = lines[firstDiagnostic(lines)]
      const other = lines.find(entry => entry.kind === "file" && entry.name !== record.file)
      record.file = other.name
      return lines
    }],
    ["duplicate diagnostic without a count update", () => { const lines = deep(); const index = firstDiagnostic(lines); lines.splice(index + 1, 0, structuredClone(lines[index])); return lines }],
    ["missing file record", () => { const lines = deep(); lines.splice(firstFile(lines, "syntactic"), 1); return lines }],
    ["duplicate file record", () => { const lines = deep(); const index = firstFile(lines, "syntactic"); lines.splice(index + 1, 0, structuredClone(lines[index])); return lines }],
    ["out-of-order file names", () => {
      const lines = deep()
      const index = firstFile(lines, "syntactic")
      const next = lines.findIndex((entry, at) => at > index && entry.kind === "file" && entry.family === "syntactic")
      lines[next].name = lines[index].name
      return lines
    }],
    ["file name outside the graph digest", () => {
      const lines = deep()
      const files = lines.filter(entry => entry.kind === "file" && entry.family === "syntactic")
      files.at(-1).name = `${files.at(-1).name}zzz`
      return lines
    }],
    ["forged file diagnostic count", () => { const lines = deep(); lines[firstFile(lines, "syntactic")].diagnostics += 1; return lines }],
    ["forged family query count", () => { const lines = deep(); const range = blockRange(lines, "syntactic"); lines[range.end].queries += 1; return lines }],
    ["forged family query digest", () => { const lines = deep(); const range = blockRange(lines, "syntactic"); lines[range.end].queryDigest = "0".repeat(64); return lines }],
    ["trailer family count for an unknown family", () => { const lines = deep(); lines.at(-1).families.extra = 1; return lines }],
    ["missing completed family", () => {
      const lines = deep()
      const range = blockRange(lines, "semantic")
      lines.splice(range.start, range.end - range.start + 1)
      const trailer = lines.at(-1)
      delete trailer.families.semantic
      delete trailer.familyElapsed.semantic
      trailer.diagnostics = lines.filter(entry => entry.kind === "diagnostic").length
      trailer.errorCount = lines.filter(entry => entry.kind === "diagnostic" && entry.diagnostic.category === 1).length
      trailer.warningCount = lines.filter(entry => entry.kind === "diagnostic" && entry.diagnostic.category === 0).length
      trailer.iteratedFiles = 3 * base.parsed.graph.graphFiles
      trailer.diagnosticsSha256 = recomputeDigest(lines)
      return lines
    }],
  ]

  for (const [name, mutate] of mutations) {
    const parsed = parseWorkerReceipt(receiptText(mutate()))
    assert.equal(parsed.ok, false, `${name} must be rejected`)
    assert.ok(parsed.error, `${name} must explain its rejection`)
  }

  const zeroFile = deep()
  const index = zeroFile.findIndex(entry => entry.kind === "file" && entry.diagnostics === 0)
  assert.ok(index >= 0, "the fixture must contain a zero-diagnostic file record")
  zeroFile.splice(index, 1)
  assert.equal(parseWorkerReceipt(receiptText(zeroFile)).ok, false)
})

test("a worker failure may end mid-family, but a completed trailer may not", compilerSkip, async () => {
  const base = await run(fixtures.multi, "mid-family")
  const objects = receiptObjects(base.text)
  const graph = objects.find(entry => entry.kind === "graph")
  const syntacticStart = objects.findIndex(entry => entry.kind === "family-start" && entry.family === "syntactic")
  const firstFile = objects.findIndex((entry, index) => index > syntacticStart && entry.kind === "file")
  const boundary = objects.findIndex((entry, index) => index > firstFile && (entry.kind === "file" || entry.kind === "family"))
  const prefix = objects.slice(0, boundary)
  const included = prefix.filter(entry => entry.kind === "diagnostic")
  const original = objects.at(-1)
  const pick = keys => Object.fromEntries(Object.entries(original.families).filter(([family]) => keys.includes(family)))
  const pickTime = keys => Object.fromEntries(Object.entries(original.familyElapsed).filter(([family]) => keys.includes(family)))
  const trailer = {
    ...original,
    status: "failed",
    failure: { stage: "family:syntactic", message: "injected failure" },
    families: pick(["config", "program", "global"]),
    familyElapsed: pickTime(["config", "program", "global"]),
    diagnostics: included.length,
    errorCount: included.filter(entry => entry.diagnostic.category === 1).length,
    warningCount: included.filter(entry => entry.diagnostic.category === 0).length,
    diagnosticsSha256: recomputeDigest(prefix),
    iteratedFiles: 1,
  }
  const failed = parseWorkerReceipt(receiptText([...prefix, trailer]))
  assert.equal(failed.ok, true, failed.error)
  assert.equal(failed.trailer.status, "failed")
  const classification = classifyRun({
    preflight: { identityComplete: true, project: { graphFiles: null }, graph: { namesSha256: null } },
    guard: { spawned: true, reason: null, code: 4, signal: null },
    parsed: failed,
  })
  assert.equal(classification.reason, "worker-failure:family:syntactic")

  const completed = { ...trailer, status: "completed" }
  delete completed.failure
  const rejected = parseWorkerReceipt(receiptText([...prefix, completed]))
  assert.equal(rejected.ok, false)
  assert.match(rejected.error, /active family|seven families/)
})

test("a truncated receipt is incomplete rather than a clean or error diagnosis", compilerSkip, async () => {
  const result = await run(fixtures.valid, "truncated")
  const text = fs.readFileSync(result.receipt, "utf8")
  const parsed = parseWorkerReceipt(text.slice(0, text.length - 40), { keepRecords: true })
  assert.equal(parsed.complete, false)
  const classification = classifyRun({
    preflight: { identityComplete: true, project: { graphFiles: null }, graph: { namesSha256: null } },
    guard: { spawned: true, reason: null, code: null, signal: "SIGKILL" },
    parsed,
  })
  assert.equal(classification.status, "incomplete")
  assert.equal(classification.reason, "receipt-truncated")
})

test("classification separates prelaunch, deadline, RSS, crash, invalid config, errors and clean", () => {
  const checks = { identityComplete: true, project: { graphFiles: 3 }, graph: { namesSha256: "a".repeat(64) } }
  const families = Object.fromEntries(FAMILIES.map(family => [family, { family, diagnostics: 0 }]))
  const graph = { graphFiles: 3, namesSha256: "a".repeat(64) }
  const trailer = { status: "completed", graphFiles: 3, namesSha256: "a".repeat(64), iteratedFiles: 12 }
  const parsed = { ok: true, complete: true, corrupt: false, digestMatches: true, families, graph,
    diagnostics: 0, errors: 0, warnings: 0, trailer }
  const cleanGuard = { spawned: true, reason: null, code: 0, signal: null,
    cleanup: { verified: true, reason: "no-owned-descendants-observed", signalled: false } }
  const clean = classifyRun({ preflight: checks, parsed, guard: cleanGuard, identityAfter: { stable: true } })
  assert.equal(clean.status, "clean")
  assert.deepEqual(clean.completedFamilies, [...FAMILIES].sort())

  const withErrors = classifyRun({
    preflight: checks, parsed: { ...parsed, errors: 2, diagnostics: 2 },
    guard: cleanGuard, identityAfter: { stable: true },
  })
  assert.equal(withErrors.status, "compiler-error")

  const unverifiedCleanup = classifyRun({
    preflight: checks, parsed, identityAfter: { stable: true },
    guard: { ...cleanGuard, cleanup: { verified: false, reason: "descendant-cleanup-unverified", signalled: false } },
  })
  assert.equal(unverifiedCleanup.reason, "cleanup-unverified")

  const noIdentity = classifyRun({
    preflight: checks, parsed,
    guard: { spawned: true, reason: null, code: 0, signal: null },
  })
  assert.equal(noIdentity.status, "incomplete")
  assert.equal(noIdentity.reason, "identity-unverified")

  const noSpawn = classifyRun({ preflight: checks, parsed: null, guard: { spawned: false, reason: "prelaunch-memory-guard" } })
  assert.equal(noSpawn.status, "incomplete")
  assert.equal(noSpawn.reason, "prelaunch-memory-guard")

  for (const reason of ["deadline", "owned-rss-budget", "available-memory-floor", "stdout-budget", "stderr-budget",
    "monitor-unavailable", "spawn-error", "memory-unavailable", "identity-incomplete",
    "receipt-unreadable", "receipt-changed", "receipt-nonregular", "receipt-oversized", "expectations-mismatch"]) {
    const stopped = classifyRun({ preflight: checks, parsed, guard: { spawned: true, reason, code: null, signal: "SIGKILL" } })
    assert.equal(stopped.status, "incomplete")
    assert.equal(stopped.reason, reason)
  }

  const crash = classifyRun({ preflight: checks, parsed, guard: { spawned: true, reason: null, code: null, signal: "SIGABRT" } })
  assert.equal(crash.status, "incomplete")
  assert.equal(crash.reason, "worker-signal:SIGABRT")

  const exited = classifyRun({ preflight: checks, parsed, guard: { spawned: true, reason: null, code: 7, signal: null } })
  assert.equal(exited.status, "incomplete")
  assert.equal(exited.reason, "worker-exit:7")

  const invalidConfig = classifyRun({
    preflight: checks, guard: { spawned: true, reason: null, code: 0, signal: null },
    parsed: { ...parsed, trailer: { ...trailer, status: "invalid-config" } },
  })
  assert.equal(invalidConfig.status, "invalid-config")

  const failedOptions = classifyRun({
    preflight: checks, guard: { spawned: true, reason: null, code: 4, signal: null },
    parsed: { ...parsed, trailer: { status: "failed", failure: { stage: "options" } } },
  })
  assert.equal(failedOptions.reason, "worker-failure:options")

  const missingFamily = { ...parsed, families: { ...families } }
  delete missingFamily.families.syntactic
  const incompleteFamilies = classifyRun({ preflight: checks, guard: cleanGuard,
    parsed: missingFamily, identityAfter: { stable: true } })
  assert.equal(incompleteFamilies.reason, "family-incomplete")

  const names = classifyRun({
    preflight: checks, guard: cleanGuard,
    parsed: { ...parsed, graph: { ...graph, namesSha256: "b".repeat(64) } }, identityAfter: { stable: true },
  })
  assert.equal(names.reason, "graph-names-mismatch")

  const iteration = classifyRun({
    preflight: checks, guard: cleanGuard,
    parsed: { ...parsed, trailer: { ...trailer, iteratedFiles: 11 } }, identityAfter: { stable: true },
  })
  assert.equal(iteration.reason, "iteration-incomplete")

  const drift = classifyRun({
    preflight: checks, guard: { spawned: true, reason: null, code: 0, signal: null },
    parsed, identityAfter: { stable: false },
  })
  assert.equal(drift.reason, "identity-drift")

  const tamperedDigest = classifyRun({
    preflight: checks, guard: { spawned: true, reason: null, code: 0, signal: null },
    parsed: { ...parsed, digestMatches: false },
  })
  assert.equal(tamperedDigest.reason, "diagnostic-digest-mismatch")

  const invalidReceipt = classifyRun({
    preflight: checks, guard: { spawned: true, reason: null, code: 0, signal: null },
    parsed: { ...parsed, ok: false, error: "rejected" },
  })
  assert.equal(invalidReceipt.reason, "receipt-invalid")

  const noGraph = classifyRun({
    preflight: checks, guard: cleanGuard,
    parsed: { ...parsed, graph: null }, identityAfter: { stable: true },
  })
  assert.equal(noGraph.reason, "graph-observation-missing")
})

test("receipt binding compares exact header paths, digests, options and root files", () => {
  const root = join(scratch, "binding-root.ts")
  const expectationsValue = {
    compiler: { executable: "/abs/compiler", apiModule: "/abs/api.mjs", sha256: "a".repeat(64), apiModuleSha256: "b".repeat(64) },
    project: { config: "/abs/tsconfig.json", graphFiles: 2, namesSha256: "c".repeat(64),
      options: { strict: true, checkers: 1 }, rootFiles: [root] },
  }
  const expectationsSha256 = "d".repeat(64)
  const parsed = {
    ok: true,
    header: { config: "/abs/tsconfig.json", compiler: "/abs/compiler", compilerSha256: "a".repeat(64),
      apiModule: "/abs/api.mjs", apiModuleSha256: "b".repeat(64), expectationsSha256 },
    graph: { graphFiles: 2, namesSha256: "c".repeat(64), options: { strict: true, checkers: 1, extra: 2 }, rootFiles: [root] },
  }
  assert.equal(verifyReceiptBinding(expectationsValue, parsed, expectationsSha256), null)
  assert.equal(verifyReceiptBinding(expectationsValue, { ...parsed, header: { ...parsed.header, config: "/abs/other.json" } }, expectationsSha256),
    "header-config-mismatch")
  assert.equal(verifyReceiptBinding(expectationsValue, { ...parsed, header: { ...parsed.header, compilerSha256: "e".repeat(64) } }, expectationsSha256),
    "header-compiler-digest-mismatch")
  assert.equal(verifyReceiptBinding(expectationsValue, { ...parsed, header: { ...parsed.header, apiModule: "/abs/other.mjs" } }, expectationsSha256),
    "header-api-module-mismatch")
  assert.equal(verifyReceiptBinding(expectationsValue, { ...parsed, header: { ...parsed.header, expectationsSha256: "f".repeat(64) } }, expectationsSha256),
    "expectations-mismatch")
  assert.equal(verifyReceiptBinding(expectationsValue, { ...parsed, graph: { ...parsed.graph, options: { strict: false, checkers: 1 } } }, expectationsSha256),
    "option-mismatch:strict")
  assert.equal(verifyReceiptBinding(expectationsValue, { ...parsed, graph: { ...parsed.graph, rootFiles: [join(scratch, "other.ts")] } }, expectationsSha256),
    "root-files-mismatch")
  assert.equal(verifyReceiptBinding(expectationsValue, { ...parsed, graph: null }, expectationsSha256), "graph-observation-missing")
})

test("process start identity is bounded and distinguishes a reused or unknown pid", () => {
  const start = readProcessStartTime(process.pid)
  assert.match(start, /^[0-9]+$/)
  assert.equal(sameOwnedProcess(process.pid, start), true)
  assert.equal(sameOwnedProcess(process.pid, String(Number(start) + 1)), false)
  assert.equal(sameOwnedProcess(999999999, start), false)
  assert.equal(sameOwnedProcess(process.pid, "not-a-start-time"), false)
  assert.equal(readProcessStartTime(0), null)
  assert.equal(readProcessStartTime(999999999), null)
})

test("memory availability requires the complete kB grammar", () => {
  assert.equal(parseMemAvailable("MemTotal: 1000 kB\nMemAvailable:  2048 kB\n"), 2)
  for (const text of [
    "MemTotal: 1000 kB\n",
    "MemAvailable: 2048 MB\n",
    "MemAvailable:  2048\n",
    "MemAvailable:  2048 kB\nMemAvailable:  2048 kB\n",
    "MemAvailable:  0 kB\n",
    "MemAvailable:  many kB\n",
  ]) {
    assert.throws(() => parseMemAvailable(text), /MemAvailable/)
  }
})

test("sampler reads and pending sets are byte and entry bounded", () => {
  const status = "Name:\tworker\nVmRSS:\t  2048 kB\n"
  const base = {
    readFileSync: path => path.endsWith("/status") ? status : "",
    readdirSync: () => ["1"],
  }
  assert.throws(() => ownedRssMiB(42, {
    ...base,
    readFileSync: path => path.endsWith("/status") ? `${status}${"x".repeat(70 * 1024)}` : "",
  }), /exceeds 65536 bytes/)
  assert.throws(() => ownedRssMiB(42, {
    readFileSync: path => path.endsWith("/children") ? "7 ".repeat(40 * 1024) : status,
    readdirSync: () => ["1"],
  }), /exceeds 65536 bytes/)
  assert.throws(() => ownedRssMiB(42, {
    readFileSync: path => path.endsWith("/children") ? "7 8 9 10 11 12" : status,
    readdirSync: () => ["1"],
  }, { maxEntries: 5 }), /entry bound/)

  const tree = sampleOwnedTree(process.pid)
  assert.ok(tree.processes.some(entry => entry.pid === process.pid))
  assert.equal(tree.processes.find(entry => entry.pid === process.pid).startTime, readProcessStartTime(process.pid))
})

test("sample identities bind the stat PID and reject unsafe ancestry fields", () => {
  const io = stat => ({
    readFileSync: selected => selected.endsWith('/stat') ? stat
      : selected.endsWith('/status') ? 'VmRSS:\t2048 kB\n' : '',
    readdirSync: () => ['1'],
  })
  assert.throws(() => sampleOwnedTree(42, io(statLine(999, 1, '100'))), /identity|malformed/)
  assert.throws(() => sampleOwnedTree(42, io(statLine(42, '9007199254740993', '100'))), /identity|malformed/)
  assert.throws(() => sampleOwnedTree(42, io(statLine(42, 1, '101')), { expectedStartTime: '100' }), /identity changed/)
  assert.equal(sampleOwnedTree(42, io(statLine(42, 1, '100')), { expectedStartTime: '100' }).workEntries, 2)
})

test("a transient root RSS teardown is rechecked under the same sampler budget", () => {
  let statusReads = 0
  const io = {
    readFileSync: selected => selected.endsWith('/stat') ? statLine(42, 1, '100')
      : selected.endsWith('/status') ? (++statusReads === 1 ? 'Name:\tworker\n' : 'VmRSS:\t2048 kB\n') : '',
    readdirSync: () => ['1'],
  }
  assert.equal(sampleOwnedTree(42, io, { expectedStartTime: '100' }).rssMiB, 2)
  assert.equal(statusReads, 2)
  statusReads = 0
  assert.throws(() => sampleOwnedTree(42, io, { expectedStartTime: '100', maxEntries: 1 }), /entry bound/)
  assert.throws(() => sampleOwnedTree(42, {
    ...io, readFileSync: selected => selected.endsWith('/stat') ? statLine(42, 1, '100') : '',
  }), /malformed|deadline/)
})

test("a child losing VmRSS requires a fresh confirmed exit under the original sampler budget", async context => {
  for (const mode of ["zombie", "missing", "live", "unknown", "denied", "reused"]) {
    await context.test(mode, () => {
      let childStatReads = 0
      const io = {
        readFileSync(selected) {
          if (selected === "/proc/42/stat") return statLine(42, 1, "100")
          if (selected === "/proc/43/stat") {
            if (++childStatReads === 1) return statLine(43, 42, "101")
            if (mode === "missing" || mode === "denied") {
              throw Object.assign(new Error("injected child stat refusal"), { code: mode === "missing" ? "ENOENT" : "EACCES" })
            }
            if (mode === "unknown") return "malformed stat"
            return statLine(43, 42, mode === "reused" ? "102" : "101",
              mode === "zombie" || mode === "reused" ? "Z" : "S")
          }
          if (selected === "/proc/42/status") return "VmRSS:\t2048 kB\n"
          if (selected === "/proc/43/status") return "Name:\texiting-child\n"
          if (selected === "/proc/42/task/42/children") return "43"
          throw new Error(`unexpected proc read: ${selected}`)
        },
        readdirSync(selected) {
          assert.ok(selected === "/proc/42/task" || selected === "/proc/43/task",
            "only inspect the root or a same-identity zombie child's task group")
          return selected === "/proc/42/task" ? ["42"] : ["43"]
        },
      }
      if (mode === "zombie" || mode === "missing") {
        const sample = sampleOwnedTree(42, io, { expectedStartTime: "100" })
        assert.equal(sample.rssMiB, 2, mode)
        assert.equal(sample.workEntries, mode === "zombie" ? 7 : 4,
          "fresh exit observation and its gone-group identity rebind use the existing shared entry budget")
      } else {
        assert.throws(() => sampleOwnedTree(42, io, { expectedStartTime: "100" }), /owned RSS is malformed/, mode)
      }
      assert.equal(childStatReads, mode === "zombie" || mode === "live" ? 3 : 2,
        `${mode}: never infer exit from the stale first observation or a skipped identity rebind`)
      childStatReads = 0
      assert.throws(() => sampleOwnedTree(42, io, { expectedStartTime: "100", maxEntries: 3 }), /entry bound/, mode)
      assert.equal(childStatReads, 1, "budget exhaustion refuses before another proc read")
    })
  }
})

test("a zombie leader with live sibling threads is not zero RSS or a confirmed exit", async context => {
  const makeIo = ({ leaderState = "Z", siblingState = "S", siblingRssMiB = 2, tasks = ["42", "43"],
    threads = "2", siblingStat = null, siblingStatus = null, child = true, extraSibling = false } = {}) => ({
    readFileSync(selected) {
      if (selected === "/proc/42/stat") return statLine(42, 1, "100", leaderState)
      if (selected === "/proc/42/status") return `Name:\tworker\nState:\tZ (zombie)\nThreads:\t${threads}\n`
      if (selected === "/proc/42/task/42/stat") return statLine(42, 1, "100", leaderState)
      if (selected === "/proc/42/task/43/stat") return siblingStat ?? statLine(43, 42, "101", siblingState)
      if (selected === "/proc/42/task/43/status") return siblingStatus ?? (siblingRssMiB === null
        ? "Name:\tworker\nState:\tR (running)\n"
        : `Name:\tworker\nState:\tR (running)\nVmRSS:\t${siblingRssMiB * 1024} kB\n`)
      if (selected === "/proc/42/task/42/children") return ""
      if (selected === "/proc/42/task/43/children") return child ? "44" : ""
      if (selected === "/proc/44/stat") return statLine(44, 42, "102", "S")
      if (selected === "/proc/44/status") return "VmRSS:\t1024 kB\n"
      if (selected === "/proc/44/task/44/children") return ""
      if (extraSibling && selected === "/proc/42/task/45/stat") return statLine(45, 42, "103", "R")
      if (extraSibling && selected === "/proc/42/task/45/status") return "VmRSS:\t2048 kB\n"
      if (extraSibling && selected === "/proc/42/task/45/children") return ""
      throw new Error(`unexpected proc read: ${selected}`)
    },
    readdirSync(selected) {
      if (selected === "/proc/42/task") return extraSibling ? [...tasks, "45"] : tasks
      if (selected === "/proc/44/task") return ["44"]
      throw new Error(`unexpected proc readdir: ${selected}`)
    },
  })

  const sample = sampleOwnedTree(42, makeIo(), { expectedStartTime: "100" })
  assert.equal(sample.rssMiB, 3,
    "the live sibling's shared mm is measured once together with its child, never zero")
  const root = sample.processes.find(entry => entry.pid === 42)
  assert.equal(root.state, "S", "the process is live through its sibling thread")
  assert.equal(root.leaderState, "Z", "the leader's zombie state remains visible")
  assert.ok(sample.processes.some(entry => entry.pid === 44), "children of a live sibling stay owned")
  assert.equal(observeOwnedProcess(42, "100", makeIo()), "alive")

  const sharedMm = sampleOwnedTree(42, makeIo({ extraSibling: true }), { expectedStartTime: "100" })
  assert.equal(sharedMm.rssMiB, 3, "a second thread sharing the mm is not counted twice")

  await context.test("an all-zombie thread group is confirmed gone", () => {
    const io = makeIo({ siblingState: "Z", child: false })
    assert.equal(sampleOwnedTree(42, io, { expectedStartTime: "100" }).rssMiB, 0)
    assert.equal(observeOwnedProcess(42, "100", io), "missing")
  })

  await context.test("Threads: 0 or Threads: 1 cannot substitute for the task list", () => {
    for (const threads of ["0", "1"]) {
      const io = makeIo({ threads })
      assert.equal(sampleOwnedTree(42, io, { expectedStartTime: "100" }).rssMiB, 3, threads)
      assert.equal(observeOwnedProcess(42, "100", io), "alive", threads)
    }
  })

  await context.test("an empty or unreadable task list is unknown, not gone", () => {
    for (const readdirSync of [() => [], () => { throw Object.assign(new Error("denied"), { code: "EACCES" }) }]) {
      const io = { ...makeIo(), readdirSync }
      assert.throws(() => sampleOwnedTree(42, io, { expectedStartTime: "100" }), /thread group|unverifiable/)
      assert.equal(observeOwnedProcess(42, "100", io), "unknown")
    }
  })

  await context.test("a malformed or differently-identified sibling is unknown", () => {
    for (const siblingStat of ["malformed stat", statLine(999, 42, "101", "S")]) {
      const io = makeIo({ siblingStat })
      assert.throws(() => sampleOwnedTree(42, io, { expectedStartTime: "100" }), /thread group|unverifiable/)
      assert.equal(observeOwnedProcess(42, "100", io), "unknown")
    }
  })

  await context.test("an incomplete live RSS reading is refused rather than deferred or zeroed", () => {
    const io = makeIo({ siblingStatus: "State:\tR (running)\n" })
    assert.throws(() => sampleOwnedTree(42, io, { expectedStartTime: "100" }), /thread group|unverifiable/)
    assert.equal(observeOwnedProcess(42, "100", io), "alive")
  })

  await context.test("a complete live status without VmRSS is still unmeasured and refused", () => {
    const io = makeIo({ siblingStatus: "Name:\tworker\nState:\tR (running)\n" })
    assert.throws(() => sampleOwnedTree(42, io, { expectedStartTime: "100" }), /live thread RSS unavailable/,
      "Name and State without VmRSS do not prove that the live thread released its mm")
    assert.equal(observeOwnedProcess(42, "100", io), "alive",
      "ownership remains live even when its RSS cannot be measured")
  })

  await context.test("a changed leader start identity is reused, not a zombie exit", () => {
    const io = { ...makeIo(), readFileSync: selected => selected === "/proc/42/stat"
      ? statLine(42, 1, "999", "Z") : makeIo().readFileSync(selected) }
    assert.throws(() => sampleOwnedTree(42, io, { expectedStartTime: "100" }), /identity changed/)
    assert.equal(observeOwnedProcess(42, "100", io), "reused")
  })

  const descendantIo = {
    readFileSync(selected) {
      if (selected === "/proc/42/stat") return statLine(42, 1, "100", "S")
      if (selected === "/proc/42/status") return "VmRSS:\t2048 kB\n"
      if (selected === "/proc/42/task/42/children") return "43"
      if (selected === "/proc/43/stat") return statLine(43, 42, "101", "Z")
      if (selected === "/proc/43/status") return "Name:\texiting-child\n"
      if (selected === "/proc/43/task/43/stat") return statLine(43, 42, "101", "Z")
      if (selected === "/proc/43/task/44/stat") return statLine(44, 42, "102", "S")
      if (selected === "/proc/43/task/44/status") return "VmRSS:\t1024 kB\n"
      if (selected === "/proc/43/task/43/children" || selected === "/proc/43/task/44/children") return ""
      throw new Error(`unexpected proc read: ${selected}`)
    },
    readdirSync(selected) {
      if (selected === "/proc/42/task") return ["42"]
      if (selected === "/proc/43/task") return ["43", "44"]
      throw new Error(`unexpected proc readdir: ${selected}`)
    },
  }
  const descendant = sampleOwnedTree(42, descendantIo, { expectedStartTime: "100" })
  assert.equal(descendant.rssMiB, 3, "a multithreaded descendant is measured, not dropped as a zombie")
  assert.ok(descendant.processes.some(entry => entry.pid === 43))
  assert.equal(observeOwnedProcess(43, "101", descendantIo), "alive")
})

test("a missing task directory or unbound gone group is never a confirmed exit", async context => {
  const makeIo = ({ taskDirectoryMissing = false, reusedAfterGroup = false } = {}) => {
    let rootReads = 0
    return {
      readFileSync(selected) {
        assert.equal(selected, "/proc/42/stat")
        return statLine(42, 1, ++rootReads > 1 && reusedAfterGroup ? "101" : "100", "Z")
      },
      readdirSync(selected) {
        assert.equal(selected, "/proc/42/task")
        if (taskDirectoryMissing) throw Object.assign(new Error("task group unavailable"), { code: "ENOENT" })
        return ["42"]
      },
    }
  }

  await context.test("missing task directory is unknown while the leader identity exists", () => {
    assert.equal(observeOwnedProcess(42, "100", makeIo({ taskDirectoryMissing: true })), "unknown")
    assert.throws(() => sampleOwnedTree(42, makeIo({ taskDirectoryMissing: true }), { expectedStartTime: "100" }),
      /thread group|unverifiable|unavailable/)
  })

  await context.test("gone-group observation rebinds the leader identity", () => {
    assert.equal(observeOwnedProcess(42, "100", makeIo({ reusedAfterGroup: true })), "reused")
    assert.throws(() => sampleOwnedTree(42, makeIo({ reusedAfterGroup: true }), { expectedStartTime: "100" }),
      /identity|reused|unverifiable/)
  })

  await context.test("the observer refuses before extra task IO at its existing bounds", () => {
    let readdirs = 0
    let threadReads = 0
    const io = {
      readFileSync(selected) {
        assert.equal(selected, "/proc/42/stat")
        return statLine(42, 1, "100", "Z")
      },
      readdirSync(selected) {
        readdirs++
        assert.equal(selected, "/proc/42/task")
        return ["42", "43"]
      },
    }
    let clockCalls = 0
    assert.equal(observeOwnedProcess(42, "100", io, {
      now: () => clockCalls++ === 0 ? 0 : 1000, deadlineMs: 100,
    }), "unknown")
    assert.equal(readdirs, 0, "an exhausted deadline refuses before the task directory read")

    readdirs = 0
    const counted = {
      ...io,
      readFileSync(selected) {
        if (selected === "/proc/42/task/43/stat") threadReads++
        return io.readFileSync(selected)
      },
    }
    assert.equal(observeOwnedProcess(42, "100", counted, {
      now: () => 0, deadlineMs: 100, maxEntries: 1,
    }), "unknown")
    assert.equal(readdirs, 0, "the initial stat's pre/post charges exhaust the allowance before directory IO")
    assert.equal(threadReads, 0, "the entry bound refuses the extra thread stat")
  })
})

test("a real zombie leader with a live allocating sibling stays measured until the group exits",
  { skip: ["/usr/bin/cc", "/usr/bin/gcc"].find(file => fs.existsSync(file)) ? false
    : "no C compiler for the bounded thread-group probe" }, async () => {
  const cc = ["/usr/bin/cc", "/usr/bin/gcc"].find(file => fs.existsSync(file))
  const directory = mkdtempSync(join(scratch, "multithread-leader-"))
  const source = join(directory, "leader.c")
  const binary = join(directory, "leader")
  writeFileSync(source, `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
static void *worker(void *arg) {
  size_t n = 32UL * 1024 * 1024;
  volatile char *p = malloc(n);
  if (!p) return NULL;
  for (size_t i = 0; i < n; i += 4096) p[i] = 1;
  usleep(800000);
  return (void *)p;
}
int main(void) {
  pthread_t thread;
  if (pthread_create(&thread, NULL, worker, NULL) != 0) return 2;
  pthread_exit(NULL);
}
`)
  let rootPid = null
  try {
    execFileSync(cc, ["-O0", "-pthread", "-o", binary, source],
      { cwd: directory, timeout: 15000, maxBuffer: 64 * 1024, stdio: ["ignore", "pipe", "pipe"] })
    const result = await superviseProcess({
      command: binary, args: [], cwd: directory,
      env: { PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: directory },
      available: () => 4096,
      spawn(command, args, options) {
        const child = spawn(command, args, options)
        rootPid = child.pid
        return child
      },
      limits: { ...LIMITS, sampleMs: 20, deadlineMs: 5000, postExitGraceMs: 1000, drainMs: 200 },
    })
    assert.ok(Number.isSafeInteger(rootPid), JSON.stringify(result))
    assert.equal(result.reason, null, JSON.stringify(result))
    assert.equal(result.cleanup.verified, true, JSON.stringify(result.cleanup))
    assert.ok(result.peakRSSMiB >= 8,
      `the live sibling allocation must remain counted after the leader becomes a zombie (peak ${result.peakRSSMiB})`)
    assert.notEqual(observeOwnedProcess(rootPid, result.workerStartTime), "alive")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("supervisor registry and forest budgets remain cumulative at injected I/O boundaries", async context => {
  const signals = context.mock.method(process, 'kill', () => {
    throw Object.assign(new Error('fabricated PID signal refused by test'), { code: 'EPERM' })
  })
  for (const mode of ['registry-bound', 'identity-change', 'forest-entries', 'forest-deadline']) {
    const root = Object.assign(new EventEmitter(), {
      pid: 900000001, stdout: new PassThrough(), stderr: new PassThrough(), unref() {},
      exitCode: null, signalCode: null,
    })
    let calls = 0
    let exited = false
    let uncertain = false
    let clock = 0
    const budgets = []
    const entry = (pid, startTime = '100') => ({ pid, startTime, ppid: root.pid, state: 'S' })
    const result = await superviseProcess({
      command: 'injected-no-process', args: [], cwd: scratch, env: {},
      available: () => 4096, readStartTime: () => '100', now: () => clock,
      spawn() {
        if (mode.startsWith('forest-')) queueMicrotask(() => {
          exited = true
          root.exitCode = 0
          root.emit('exit', 0, null)
          root.emit('close', 0, null)
        })
        return root
      },
      // Fabricated PIDs can never reach process.kill: the root is always
      // unknown, and descendants become unknown before any stop/cleanup.
      observeOwned(pid) { return pid === root.pid || uncertain ? 'unknown' : 'alive' },
      sampleTree(pid, io, options) {
        calls++
        if (mode === 'registry-bound') {
          uncertain = true
          return { rssMiB: 1, processes: Array.from({length: LIMITS.samplerEntries + 1}, (_, i) => entry(900000002 + i)), workEntries: 0 }
        }
        if (mode === 'identity-change') {
          uncertain = calls > 1
          return { rssMiB: 1, processes: [entry(900000002, calls === 1 ? '100' : '101')] }
        }
        if (!exited) return { rssMiB: 1, processes: [entry(900000002), entry(900000003)] }
        budgets.push(options)
        if (mode === 'forest-deadline') {
          uncertain = true
          clock += LIMITS.samplerMs + 1
          return { rssMiB: 1, processes: [], workEntries: 1 }
        }
        uncertain = budgets.length > 1
        clock += 10
        return { rssMiB: 1, processes: [], workEntries: budgets.length === 1 ? LIMITS.samplerEntries - 5 : 3 }
      },
      limits: { ...LIMITS, sampleMs: 10 },
    })
    assert.equal(result.reason, 'monitor-unavailable', `${mode}: ${JSON.stringify(result)}`)
    assert.equal(result.cleanup.verified, false, mode)
    assert.equal(result.descendantSignals, 0, mode)
    if (mode === 'registry-bound') assert.match(result.monitorError, /cumulative owned registry/)
    if (mode === 'identity-change') assert.match(result.monitorError, /descendant identity changed/)
    if (mode === 'forest-entries') {
      assert.equal(budgets.length, 2)
      assert.equal(budgets[1].maxEntries, 1, 'dispatch and both registry observations share the forest allowance')
      assert.ok(budgets[1].deadlineMs < budgets[0].deadlineMs)
    }
    assert.equal(signals.mock.callCount(), 0, `${mode}: no fabricated PID may reach even the refused signal seam`)
  }
})

test("cumulative RSS includes a known descendant lost from enumeration before root exit", async () => {
  const directory = mkdtempSync(join(scratch, 'lost-enumeration-'))
  const marker = join(directory, 'child.pid')
  const helper = join(directory, 'root.mjs')
  writeFileSync(helper, `import {spawn} from 'node:child_process';
spawn(process.execPath,['-e',${JSON.stringify(`require('fs').writeFileSync(process.argv[1],String(process.pid));setTimeout(()=>process.exit(0),1800)`)},${JSON.stringify(marker)}],{detached:true,stdio:'ignore'});
setTimeout(()=>process.exit(0),1000);
`)
  let rootPid = null
  let rootExited = false
  let retained = false
  let sampledWhileRootAlive = false
  const result = await superviseProcess({
    command: process.execPath, args: [helper], cwd: directory,
    env: { PATH: '/usr/bin:/bin', HOME: directory, TMPDIR: directory },
    available: () => 4096,
    spawn(command, args, options) {
      const child = spawn(command, args, options)
      rootPid = child.pid
      child.once('exit', () => { rootExited = true })
      return child
    },
    sampleTree(pid, io, options) {
      if (pid !== rootPid) {
        sampledWhileRootAlive = !rootExited
        return { rssMiB: 2048, processes: [], workEntries: 1 }
      }
      const tree = sampleOwnedTree(pid, io, options)
      if (retained) return { rssMiB: 50, processes: tree.processes.filter(entry => entry.pid === rootPid), workEntries: 2 }
      if (fs.existsSync(marker)) {
        const descendant = Number(fs.readFileSync(marker, 'utf8'))
        retained = tree.processes.some(entry => entry.pid === descendant)
      }
      return { ...tree, rssMiB: 50 }
    },
    limits: { ...LIMITS, sampleMs: 20, deadlineMs: 3000, drainMs: 100 },
  })
  assert.equal(retained, true)
  assert.equal(result.reason, 'owned-rss-budget', JSON.stringify(result))
  assert.equal(sampledWhileRootAlive, true, 'retaining identities without sampling their RSS is insufficient')
  assert.equal(result.peakRSSMiB, 2098)
  assert.equal(result.cleanup.verified, true, JSON.stringify(result))
})

test("post-exit sample failure retains unknown identities and fails closed immediately", async () => {
  for (const unknown of [true, false]) {
    const directory = mkdtempSync(join(scratch, 'post-exit-error-'))
    const marker = join(directory, 'child.pid')
    const helper = join(directory, 'root.mjs')
    writeFileSync(helper, `import {spawn} from 'node:child_process';import fs from 'node:fs';
const child=spawn(process.execPath,['-e',${JSON.stringify(`require('fs').writeFileSync(process.argv[1],String(process.pid));setTimeout(()=>process.exit(0),1800)`)},${JSON.stringify(marker)}],{stdio:'ignore'});
const fallback=setTimeout(()=>process.exit(2),2500);
const wait=setInterval(()=>{if(!fs.existsSync(${JSON.stringify(marker)}))return;clearInterval(wait);clearTimeout(fallback);setTimeout(()=>process.exit(0),160)},5);
`)
    let rootExited = false
    let sampleFailed = false
    let descendant = null
    let descendantStart = null
    const result = await superviseProcess({
      command: process.execPath, args: [helper], cwd: directory,
      env: { PATH: '/usr/bin:/bin', HOME: directory, TMPDIR: directory },
      available: () => 4096,
      spawn(command, args, options) {
        const child = spawn(command, args, options)
        child.once('exit', () => { rootExited = true })
        return child
      },
      sampleTree(pid, io, options) {
        if (fs.existsSync(marker)) {
          descendant = Number(fs.readFileSync(marker, 'utf8'))
          descendantStart ??= readProcessStartTime(descendant)
        }
        if (rootExited) {
          sampleFailed = true
          throw new Error('injected post-exit proc read failure')
        }
        return sampleOwnedTree(pid, io, options)
      },
      observeOwned(pid, start) {
        if (unknown && sampleFailed && pid === descendant) return 'unknown'
        return observeOwnedProcess(pid, start)
      },
      limits: { ...LIMITS, sampleMs: 20, deadlineMs: 3000, postExitGraceMs: 1500, drainMs: 100 },
    })
    assert.equal(sampleFailed, true, JSON.stringify(result))
    assert.equal(result.reason, 'monitor-unavailable', JSON.stringify(result))
    if (unknown) {
      assert.equal(result.cleanup.verified, false)
      assert.equal(result.descendantSignals, 0)
      assert.equal(observeOwnedProcess(descendant, descendantStart), 'alive')
    } else {
      assert.equal(result.cleanup.verified, true)
      assert.ok(result.descendantSignals > 0)
      assert.notEqual(observeOwnedProcess(descendant, descendantStart), 'alive')
    }
  }
})

test("the lifecycle guard keeps monitoring after root exit and bounds descendant closure", async () => {
  const lifecycleLimits = {
    ...LIMITS, prelaunchMiB: 1024, availableFloorMiB: 64, ownedRSSMiB: 1024,
    deadlineMs: 5000, sampleMs: 50, postExitGraceMs: 2000, drainMs: 100,
    stdoutBytes: 1024 * 1024, stderrBytes: 256 * 1024,
  }
  const hangLimits = { ...lifecycleLimits, postExitGraceMs: 500 }
  const writeHelper = (name, source) => {
    const file = join(scratch, name)
    writeFileSync(file, source)
    return file
  }
  const supervise = (helper, marker) => superviseProcess({
    command: process.execPath,
    args: marker ? [helper, marker] : [helper],
    cwd: scratch,
    env: { PATH: "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch },
    available: () => 4096,
    limits: lifecycleLimits,
  })
  const writeDescendant = (name, body, exitDelay = 100) => {
    const marker = join(scratch, `${name}.ready`)
    try { fs.rmSync(marker, { force: true }) } catch { /* absent */ }
    const helper = writeHelper(name, `import { spawn } from "node:child_process"
import fs from "node:fs"
const marker = process.argv[2]
const child = spawn(process.execPath, ["-e", ${JSON.stringify(`require("fs").writeFileSync(process.argv[1], String(process.pid)); ${body}`)}, marker], { stdio: ["ignore", "inherit", "inherit"] })
child.on("error", () => process.exit(2))
const fallback = setTimeout(() => process.exit(2), 4000)
const wait = setInterval(() => {
  if (!fs.existsSync(marker)) return
  clearInterval(wait)
  clearTimeout(fallback)
  setTimeout(() => process.exit(0), ${exitDelay})
}, 10)
`)
    return { helper, marker }
  }

  const normal = writeHelper("normal.mjs", "setTimeout(() => process.exit(0), 120)\n")
  const normalRun = await supervise(normal)
  assert.equal(normalRun.spawned, true)
  assert.equal(normalRun.reason, null, JSON.stringify(normalRun))
  assert.ok(normalRun.elapsedSeconds < 2)
  assert.ok(normalRun.rssSamples > 0)
  assert.equal(normalRun.cleanup.verified, true, JSON.stringify(normalRun.cleanup))
  assert.equal(normalRun.cleanup.reason, "no-owned-descendants-observed")

  const selfExit = writeDescendant("self-exit.mjs", "setTimeout(() => process.exit(0), 1600)")
  const selfExitRun = await supervise(selfExit.helper, selfExit.marker)
  assert.ok(selfExitRun.elapsedSeconds >= 0.2 && selfExitRun.elapsedSeconds < 3)
  assert.ok(selfExitRun.postExitChecks > 0, "monitoring must continue after the root exits")
  assert.equal(selfExitRun.reason, null)
  assert.equal(selfExitRun.cleanup.verified, true, JSON.stringify(selfExitRun.cleanup))
  assert.ok(["owned-descendants-gone", "descendants-terminated", "no-owned-descendants-observed"]
    .includes(selfExitRun.cleanup.reason))

  const hang = writeDescendant("hang.mjs", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)")
  const held = writeDescendant("held.mjs", "setTimeout(() => process.exit(0), 3000)")
  const hangRun = await superviseProcess({
    command: process.execPath, args: [hang.helper, hang.marker], cwd: scratch,
    env: { PATH: "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch },
    available: () => 4096, limits: hangLimits,
  })
  assert.ok(hangRun.elapsedSeconds < 2.5, `elapsed ${hangRun.elapsedSeconds}`)
  if (hangRun.reason === "descendant-close-timeout") {
    assert.ok(hangRun.descendantSignals >= 1)
    assert.equal(hangRun.cleanup.verified, true, JSON.stringify(hangRun.cleanup))
    assert.ok(["descendants-terminated", "no-owned-descendants-observed"].includes(hangRun.cleanup.reason),
      JSON.stringify(hangRun.cleanup))
  } else {
    assert.equal(hangRun.reason, "descendant-cleanup-unverified")
    assert.equal(hangRun.descendantSignals, 0)
    assert.equal(hangRun.cleanup.verified, false)
  }

  const rss = writeDescendant("rss.mjs", "setTimeout(() => process.exit(0), 1600)")
  let rootExited = false
  let rootPid = null
  const postExitPids = []
  const rssRun = await superviseProcess({
    command: process.execPath, args: [rss.helper, rss.marker], cwd: scratch,
    env: { PATH: "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch },
    available: () => 4096,
    spawn(command, args, options) {
      const child = spawn(command, args, options)
      rootPid = child.pid
      child.once("exit", () => { rootExited = true })
      return child
    },
    sampleTree(pid, io, options) {
      if (rootExited) {
        postExitPids.push(pid)
        return { rssMiB: 2048, processes: [] }
      }
      const markerPid = fs.existsSync(rss.marker) ? Number(fs.readFileSync(rss.marker, "utf8")) : null
      const rootStart = readProcessStartTime(rootPid)
      const processes = [{ pid: rootPid, startTime: rootStart, state: "S", ppid: 1, pgrp: rootPid }]
      if (Number.isSafeInteger(markerPid)) {
        const descendantStart = readProcessStartTime(markerPid)
        if (descendantStart !== null) {
          processes.push({ pid: markerPid, startTime: descendantStart, state: "S", ppid: rootPid, pgrp: rootPid })
        }
      }
      return { rssMiB: 50, processes }
    },
    limits: { ...lifecycleLimits, ownedRSSMiB: LIMITS.ownedRSSMiB, sampleMs: 20, postExitGraceMs: 1500 },
  })
  assert.equal(rssRun.reason, "owned-rss-budget")
  assert.ok(rssRun.postExitSamples > 0, "post-exit RSS sampling must run")
  assert.ok(rssRun.peakRSSMiB >= 2048)
  assert.ok(!postExitPids.includes(rootPid), "the dead root must not be sampled")
  if (rssRun.descendantSignals > 0) assert.equal(rssRun.cleanup.signalled, true)

  const budgetRoot = writeHelper("root-floor.mjs", "setTimeout(() => process.exit(0), 1500)\n")
  for (const allowedReads of [1, 2]) {
    let availableCalls = 0
    const rootRun = await superviseProcess({
      command: process.execPath, args: [budgetRoot], cwd: scratch,
      env: { PATH: "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch },
      available: () => ++availableCalls <= allowedReads ? 4096 : 0,
      limits: lifecycleLimits,
    })
    assert.equal(rootRun.reason, "available-memory-floor")
    assert.equal(rootRun.cleanup.signalled, true)
    assert.equal(rootRun.cleanup.verified, allowedReads === 2, JSON.stringify(rootRun))
    if (allowedReads === 1) assert.equal(rootRun.cleanup.reason, "no-sample")
    assert.notEqual(observeOwnedProcess(rootRun.pid, rootRun.workerStartTime), "alive")
  }

  const early = writeHelper("early.mjs", "process.exit(0)\n")
  const earlyRun = await supervise(early)
  assert.ok(earlyRun.elapsedSeconds < 1)
  assert.ok(earlyRun.reason === "monitor-unavailable" || earlyRun.reason === "cleanup-unverified"
    || earlyRun.cleanup.verified === true, JSON.stringify({ reason: earlyRun.reason, cleanup: earlyRun.cleanup }))

  const errorRun = await superviseProcess({
    command: "/nonexistent-opencode-fullgraph-child",
    args: [],
    cwd: scratch,
    env: { PATH: "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch },
    available: () => 4096,
    limits: lifecycleLimits,
  })
  assert.equal(errorRun.reason, "spawn-error")
  assert.equal(errorRun.cleanup.verified, false)
  assert.equal(errorRun.cleanup.reason, "no-child")

  const noIdentity = await superviseProcess({
    command: process.execPath, args: [held.helper, held.marker], cwd: scratch,
    env: { PATH: "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch },
    available: () => 4096, limits: hangLimits, observeOwned: () => "unknown",
  })
  assert.equal(noIdentity.reason, "descendant-identity-unavailable")
  assert.equal(noIdentity.cleanup.verified, false)
  assert.equal(noIdentity.descendantSignals, 0)
  const stillAlive = Number(fs.readFileSync(held.marker, "utf8"))
  assert.ok(Number.isSafeInteger(stillAlive) && readProcessStartTime(stillAlive) !== null,
    "an unverified live descendant must not be signalled")

  const reused = await superviseProcess({
    command: process.execPath, args: [held.helper, held.marker], cwd: scratch,
    env: { PATH: "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch },
    available: () => 4096, limits: hangLimits, observeOwned: () => "reused",
  })
  assert.equal(reused.reason, "descendant-cleanup-unverified")
  assert.equal(reused.descendantSignals, 0)
  assert.equal(reused.rootSignal, "worker-identity-unverified")
})

test("the real tiny worker completes under the injected supervisor seam with verified cleanup", compilerSkip, async () => {
  const fixture = fixtures.valid
  const identity = await nativeIdentity(fixture, "spawned-worker")
  const expectationsPath = writeExpectationsFile("spawned-worker", identity.expectations)
  const receipt = join(scratch, "spawned-worker.ndjson")
  const result = await superviseProcess({
    command: process.execPath,
    args: [script, "worker", "--expectations", expectationsPath, "--receipt", receipt,
      "--receipt-budget", String(LIMITS.receiptBytes)],
    cwd: fixture.directory,
    env: { PATH: "/usr/bin:/bin", HOME: fixture.directory, TMPDIR: fixture.directory },
    available: () => 4096,
    limits: { ...LIMITS, prelaunchMiB: 1024 },
  })
  assert.equal(result.spawned, true)
  assert.equal(result.reason, null, JSON.stringify(result))
  assert.equal(result.cleanup.verified, true, JSON.stringify(result.cleanup))
  assert.ok(["worker-close", "owned-descendants-gone", "descendants-terminated", "no-owned-descendants-observed"]
    .includes(result.cleanup.reason), JSON.stringify(result.cleanup))
  assert.ok(result.rssSamples > 0)
  const parsed = parseWorkerReceipt(fs.readFileSync(receipt, "utf8"))
  assert.equal(parsed.ok, true, parsed.error)
  assert.equal(parsed.trailer.status, "completed")
  assert.equal(parsed.graph.graphFiles, identity.entries.length)
  assert.equal(parsed.trailer.iteratedFiles, 4 * identity.entries.length)
})

test("the supervisor refuses to spawn when graph identity is unverified", async () => {
  const receipt = join(scratch, "refused.json")
  const expectationsPath = writeExpectationsFile("refused", expectations(fixtures.valid))
  const result = await guardedRun({ expectationsPath, receiptPath: receipt })
  assert.equal(result.spawned, false)
  assert.equal(result.reason, "identity-incomplete")
  assert.equal(result.classification.status, "incomplete")
  assert.equal(fs.existsSync(result.workerReceipt.path), false)
  const stored = json(receipt)
  assert.equal(stored.spawned, false)
  assert.equal(stored.status, "incomplete")
  assert.equal(stored.limits.ownedRSSMiB, 1536)
})

test("the supervisor runs the truthful tiny fixture end to end or refuses before spawn", compilerSkip, async t => {
  const fixture = fixtures.valid
  const identity = await nativeIdentity(fixture, "guarded")
  const expectationsPath = writeExpectationsFile("guarded", identity.expectations)
  const receipt = join(scratch, "guarded.json")
  const result = await guardedRun({ expectationsPath, receiptPath: receipt })
  t.diagnostic(`spawned=${result.spawned} reason=${result.reason ?? "none"} cleanup=${result.cleanup?.reason ?? "none"}`)
  const stored = json(receipt)
  assert.equal(stored.limits.ownedRSSMiB, 1536)
  assert.equal(stored.limits.deadlineMs, 90000)
  assert.equal(stored.spawned, result.spawned)
  if (!result.spawned) {
    assert.equal(result.reason, "prelaunch-memory-guard")
    assert.equal(result.classification.status, "incomplete")
    assert.equal(fs.existsSync(result.workerReceipt.path), false)
    return
  }
  assert.equal(result.status, "clean", JSON.stringify(result.classification))
  assert.match(result.workerStartTime, /^[0-9]+$/)
  assert.equal(result.workerReceipt.parsed.ok, true, result.workerReceipt.parsed.error)
  assert.equal(result.workerReceipt.parsed.trailer.status, "completed")
  assert.deepEqual(Object.keys(result.workerReceipt.parsed.families), [...FAMILIES])
  assert.equal(result.workerReceipt.parsed.graph.graphFiles, identity.entries.length)
  assert.equal(result.workerReceipt.parsed.trailer.iteratedFiles, 4 * identity.entries.length)
  assert.equal(result.expectationsSha256, result.workerReceipt.parsed.header.expectationsSha256)
  assert.equal(result.identityAfter.stable, true)
  assert.equal(result.identityAfter.graph.entriesChecked, identity.entries.length)
  assert.equal(result.identityAfter.configSha256, digest(fs.readFileSync(fixture.config)))
  assert.equal(result.identityAfter.apiModuleSha256, apiModuleSha256)
  assert.equal(result.identityAfter.compilerSha256, compilerSha256)
  if (result.elapsedSeconds >= 0.2) {
    assert.ok(result.peakRSSMiB > 0)
    assert.ok(result.rssSamples > 0)
  }
  assert.ok(result.stdoutBytes < LIMITS.stdoutBytes)
  assert.equal(result.cleanup.verified, true, JSON.stringify(result.cleanup))
  assert.ok(["worker-close", "owned-descendants-gone", "descendants-terminated", "no-owned-descendants-observed"]
    .includes(result.cleanup.reason), JSON.stringify(result.cleanup))
})

test("runtime is an optional strict frozen GOGC-25 record and bad values refuse before work", async () => {
  const legacy = normalizeExpectations(expectations(fixtures.valid))
  assert.equal(legacy.runtime, null)

  const source = { goGcPercent: 25 }
  const normalized = normalizeExpectations(expectations(fixtures.valid, { runtime: source }))
  assert.deepEqual(normalized.runtime, { goGcPercent: 25 })
  assert.ok(Object.isFrozen(normalized.runtime))
  source.goGcPercent = 100
  assert.equal(normalized.runtime.goGcPercent, 25, "the normalized snapshot is independent of the input object")

  let getterCalls = 0
  const accessor = { get goGcPercent() { getterCalls++; return 25 } }
  const inheritedOwn = Object.assign(Object.create({ goGcPercent: 1 }), { goGcPercent: 25 })
  const inheritedOnly = Object.create({ goGcPercent: 25 })
  const nonEnumerable = Object.defineProperty({}, "goGcPercent", { value: 25, enumerable: false })
  const bad = [
    null, "25", 25, "off", [], [25],
    { goGcPercent: "25" }, { goGcPercent: 0 }, { goGcPercent: 100 }, { goGcPercent: -1 }, { goGcPercent: 25.5 },
    { goGcPercent: 25, extra: true }, { goGcPercent: 25, [Symbol("extra")]: 1 },
    accessor, inheritedOwn, inheritedOnly, nonEnumerable,
  ]
  for (const runtime of bad) {
    assert.throws(() => normalizeExpectations(expectations(fixtures.valid, { runtime })), /runtime|goGcPercent/)
  }
  assert.equal(getterCalls, 0, "the accessor must be refused without being evaluated")

  const badPath = join(scratch, "bad-runtime-expectations.json")
  const badReceipt = join(scratch, "bad-runtime.json")
  writeFileSync(badPath, JSON.stringify(expectations(fixtures.valid, { runtime: { goGcPercent: 100 } })))
  await assert.rejects(guardedRun({ expectationsPath: badPath, receiptPath: badReceipt }),
    error => error.code === "invalid-expectations")
  assert.equal(fs.existsSync(badReceipt), false, "an unsupported runtime is refused before a receipt or worker exists")
})

test("the worker environment is fresh, sanitized and only transmits GOGC=25", async () => {
  const directory = fixtures.valid.directory
  const before = { gogc: process.env.GOGC, keys: Object.keys(process.env).sort() }
  const legacy = buildWorkerEnvironment(directory)
  assert.deepEqual(legacy, { PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: directory })
  assert.ok(Object.isFrozen(legacy))
  const runtime = buildWorkerEnvironment(directory, { goGcPercent: 25 })
  assert.deepEqual(runtime, { PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: directory, GOGC: "25" })
  assert.ok(Object.isFrozen(runtime))
  assert.equal(process.env.GOGC, before.gogc)
  assert.deepEqual(Object.keys(process.env).sort(), before.keys)

  assert.throws(() => buildWorkerEnvironment("relative/path"), /absolute/)
  assert.throws(() => buildWorkerEnvironment(directory, { goGcPercent: 100 }), /25/)
  assert.throws(() => buildWorkerEnvironment(directory, { goGcPercent: 25, GOMEMLIMIT: "1GiB" }), /runtime/)

  const childScript = `import { buildWorkerEnvironment } from ${JSON.stringify(scriptUrl)}
import { spawn } from "node:child_process"
const directory = process.argv[1]
const observe = env => new Promise(resolve => {
  const child = spawn(process.execPath, ["-e", "process.stdout.write(process.env.GOGC ?? 'unset')"], { stdio: ["ignore", "pipe", "ignore"], env })
  let text = ""
  child.stdout.on("data", chunk => { text += chunk })
  child.on("close", () => resolve(text))
})
const legacy = buildWorkerEnvironment(directory)
const runtime = buildWorkerEnvironment(directory, { goGcPercent: 25 })
const payload = { legacy, runtime, childGoGc: process.env.GOGC ?? null,
  legacyObserved: await observe(legacy), runtimeObserved: await observe(runtime) }
process.stdout.write(JSON.stringify(payload))
`
  const result = await runNode(["--input-type=module", "-e", childScript, directory], {
    env: { PATH: "/usr/bin:/bin", GOGC: "100", GOMEMLIMIT: "512MiB", GODEBUG: "x=1",
      NODE_OPTIONS: "", OPENCODE_TEST_TOKEN: "do-not-forward" },
  })
  assert.equal(result.code, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.deepEqual(payload.legacy, { PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: directory })
  assert.deepEqual(payload.runtime, { PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: directory, GOGC: "25" })
  assert.equal(payload.childGoGc, "100", "building an environment must not mutate the parent environment")
  assert.equal(payload.legacyObserved, "unset", "legacy omission must not forward an inherited GOGC")
  assert.equal(payload.runtimeObserved, "25", "a real grandchild must inherit only the built GOGC=25")
})

test("the runtime header is parsed strictly and bound to expectations and observed GOGC", compilerSkip, async () => {
  const runtime = { goGcPercent: 25 }
  const identity = await nativeIdentity(fixtures.valid, "runtime-header")
  identity.expectations.runtime = runtime
  const worker = await spawnWorkerCli({ fixture: fixtures.valid, name: "runtime-header-worker",
    shaped: identity.expectations, env: buildWorkerEnvironment(fixtures.valid.directory, runtime) })
  assert.equal(worker.result.reason, null, JSON.stringify(worker.result))
  assert.equal(worker.parsed.ok, true, worker.parsed.error)
  assert.deepEqual(worker.parsed.header.runtime, { goGcPercent: 25, observedWorkerGoGc: "25" })

  const mutate = change => {
    const lines = receiptObjects(worker.text)
    change(lines)
    return parseWorkerReceipt(receiptText(lines))
  }
  assert.equal(mutate(lines => { delete lines[0].runtime.observedWorkerGoGc }).ok, false)
  assert.equal(mutate(lines => { lines[0].runtime.extra = 1 }).ok, false)
  assert.equal(mutate(lines => { lines[0].runtime.goGcPercent = 100 }).ok, false)
  assert.equal(mutate(lines => { lines[0].runtime.observedWorkerGoGc = 100 }).ok, false)
  assert.equal(mutate(lines => { lines[0].runtime.observedWorkerGoGc = "100" }).ok, false,
    "a completed receipt must not claim an unobserved GOGC")
  const legacy = mutate(lines => { delete lines[0].runtime })
  assert.equal(legacy.ok, true, legacy.error)
  assert.equal("runtime" in legacy.header, false)

  const sha = digest(Buffer.from(JSON.stringify(identity.expectations)))
  assert.equal(verifyReceiptBinding(normalizeExpectations(identity.expectations), worker.parsed, sha), null)
  assert.equal(verifyReceiptBinding(normalizeExpectations(identity.expectations), legacy, sha), "runtime-missing")

  const expectationsValue = { compiler: { executable: "/abs/compiler", apiModule: "/abs/api.mjs",
    sha256: "a".repeat(64), apiModuleSha256: "b".repeat(64) },
  project: { config: "/abs/tsconfig.json", options: { strict: true } }, runtime: { goGcPercent: 25 } }
  const parsed = { ok: true, header: { config: "/abs/tsconfig.json", compiler: "/abs/compiler",
    compilerSha256: "a".repeat(64), apiModule: "/abs/api.mjs", apiModuleSha256: "b".repeat(64),
    expectationsSha256: "d".repeat(64), runtime: { goGcPercent: 25, observedWorkerGoGc: "25" } },
  graph: { graphFiles: 2, namesSha256: "c".repeat(64), options: { strict: true }, rootFiles: [] } }
  assert.equal(verifyReceiptBinding(expectationsValue, parsed, "d".repeat(64)), null)
  assert.equal(verifyReceiptBinding({ ...expectationsValue, runtime: null }, parsed, "d".repeat(64)), "runtime-unexpected")
  assert.equal(verifyReceiptBinding(expectationsValue,
    { ...parsed, header: { ...parsed.header, runtime: undefined } }, "d".repeat(64)), "runtime-missing")
  assert.equal(verifyReceiptBinding(expectationsValue,
    { ...parsed, header: { ...parsed.header, runtime: { goGcPercent: 25, observedWorkerGoGc: "100" } } },
    "d".repeat(64)), "runtime-observation-mismatch")
  assert.equal(verifyReceiptBinding(expectationsValue,
    { ...parsed, header: { ...parsed.header, runtime: { goGcPercent: 24, observedWorkerGoGc: "25" } } },
    "d".repeat(64)), "runtime-go-gc-mismatch")
  assert.equal(verifyReceiptBinding(expectationsValue,
    { ...parsed, header: { ...parsed.header, expectationsSha256: "e".repeat(64) } }, "d".repeat(64)),
  "expectations-mismatch")
})

test("a worker without the requested GOGC refuses before loading the native API", async () => {
  assert.equal("GOGC" in buildWorkerEnvironment(fixtures.valid.directory), false)
  const directory = join(scratch, "runtime-gate")
  mkdirSync(directory, { recursive: true })
  const marker = join(directory, "api-loaded")
  const fakeCompiler = join(directory, "fake-tsc")
  writeFileSync(fakeCompiler, "#!/bin/sh\nexit 0\n")
  const fakeApi = join(directory, "api.mjs")
  writeFileSync(fakeApi,
    `import fs from "node:fs"\nfs.writeFileSync(${JSON.stringify(marker)}, "loaded")\nexport class API { constructor() {} }\n`)
  const compilerOverrides = { executable: fakeCompiler, sha256: digest(fs.readFileSync(fakeCompiler)),
    apiModule: fakeApi, apiModuleSha256: digest(fs.readFileSync(fakeApi)) }
  const shaped = expectations(fixtures.valid, { compiler: compilerOverrides, runtime: { goGcPercent: 25 } })
  const refused = await spawnWorkerCli({ fixture: fixtures.valid, name: "runtime-gate-refused", shaped,
    env: buildWorkerEnvironment(fixtures.valid.directory) })
  assert.equal(refused.result.reason, null, JSON.stringify(refused.result))
  assert.equal(refused.parsed.ok, true, refused.parsed.error)
  assert.equal(refused.parsed.trailer.status, "failed")
  assert.equal(refused.parsed.trailer.failure.stage, "runtime")
  assert.match(refused.parsed.trailer.failure.message, /GOGC is unset, requested 25/)
  assert.deepEqual(refused.parsed.header.runtime, { goGcPercent: 25, observedWorkerGoGc: null })
  assert.equal(fs.existsSync(marker), false, "the native API module must not be loaded after a runtime mismatch")
  const refusedClassification = classifyRun({
    preflight: { identityComplete: true, project: { graphFiles: null }, graph: { namesSha256: null } },
    guard: { spawned: true, reason: null, code: 4, signal: null },
    parsed: refused.parsed,
  })
  assert.equal(refusedClassification.status, "incomplete")
  assert.equal(refusedClassification.reason, "worker-failure:runtime")
  assert.equal(verifyReceiptBinding(normalizeExpectations(shaped), refused.parsed,
    digest(Buffer.from(JSON.stringify(shaped)))), "runtime-observation-mismatch")

  const accepted = await spawnWorkerCli({ fixture: fixtures.valid, name: "runtime-gate-accepted", shaped,
    env: buildWorkerEnvironment(fixtures.valid.directory, { goGcPercent: 25 }) })
  assert.equal(accepted.parsed.ok, true, accepted.parsed.error)
  assert.equal(fs.existsSync(marker), true, "the same worker must reach the API module when GOGC matches")
  assert.equal(accepted.parsed.trailer.status, "invalid-config")
  assert.equal(accepted.parsed.trailer.stage, "config")

  fs.rmSync(marker, { force: true })
  const legacyShaped = expectations(fixtures.valid, { compiler: compilerOverrides })
  const legacyRun = await spawnWorkerCli({ fixture: fixtures.valid, name: "runtime-gate-legacy", shaped: legacyShaped,
    env: { ...buildWorkerEnvironment(fixtures.valid.directory), GOGC: "100" } })
  assert.equal(legacyRun.parsed.ok, true, legacyRun.parsed.error)
  assert.equal("runtime" in legacyRun.parsed.header, false)
  assert.equal(fs.existsSync(marker), true, "legacy omission must not demand or rewrite GOGC")
})

test("a GOGC=25 supervisor run preserves the tiny graph, families and hard caps", compilerSkip, async () => {
  const runtime = { goGcPercent: 25 }
  const validated = await nativeIdentity(fixtures.valid, "runtime-guarded")
  validated.expectations.runtime = runtime
  const expectationsPath = writeExpectationsFile("runtime-guarded", validated.expectations)
  const receipt = join(scratch, "runtime-guarded.json")
  const result = await guardedRun({ expectationsPath, receiptPath: receipt })
  assert.equal(result.spawned, true, `guarded run refused: ${result.reason}`)
  assert.equal(result.status, "clean", JSON.stringify(result.classification))
  assert.deepEqual(result.runtime, { goGcPercent: 25 })
  const stored = json(receipt)
  assert.deepEqual(stored.runtime, { goGcPercent: 25 })
  assert.deepEqual(stored.limits, LIMITS)
  const parsed = result.workerReceipt.parsed
  assert.equal(parsed.ok, true, parsed.error)
  assert.deepEqual(parsed.header.runtime, { goGcPercent: 25, observedWorkerGoGc: "25" })
  assert.deepEqual(parsed.header.limits, LIMITS)
  assert.deepEqual(Object.keys(parsed.families), [...FAMILIES])
  assert.equal(parsed.graph.graphFiles, validated.entries.length)
  assert.equal(parsed.graph.namesSha256, namesDigest(validated.names))
  assert.equal(parsed.trailer.iteratedFiles, 4 * validated.entries.length)
  assert.equal(parsed.trailer.diagnostics, 0)
  assert.equal(parsed.trailer.warningCount, 0)
  assert.equal(parsed.trailer.status, "completed")
  assert.equal(result.cleanup.verified, true)
  assert.equal(verifyReceiptBinding(normalizeExpectations(validated.expectations), parsed,
    digest(Buffer.from(JSON.stringify(validated.expectations)))), null)

  const legacyControl = await run(fixtures.valid, "runtime-control-legacy")
  assert.equal(legacyControl.parsed.ok, true, legacyControl.parsed.error)
  assert.equal("runtime" in legacyControl.parsed.header, false)
  assert.equal(legacyControl.parsed.graph.namesSha256, parsed.graph.namesSha256)
  assert.equal(legacyControl.parsed.trailer.diagnostics, parsed.trailer.diagnostics)
  assert.equal(legacyControl.parsed.trailer.warningCount, parsed.trailer.warningCount)
  for (const family of FAMILIES) {
    assert.equal(legacyControl.parsed.families[family].diagnostics, parsed.families[family].diagnostics, family)
    assert.equal(legacyControl.parsed.families[family].queries, parsed.families[family].queries, family)
  }

  const multi = await nativeIdentity(fixtures.multi, "runtime-guarded-multi")
  multi.expectations.runtime = runtime
  const multiPath = writeExpectationsFile("runtime-guarded-multi", multi.expectations)
  const multiReceipt = join(scratch, "runtime-guarded-multi.json")
  const multiResult = await guardedRun({ expectationsPath: multiPath, receiptPath: multiReceipt })
  assert.equal(multiResult.spawned, true, `guarded run refused: ${multiResult.reason}`)
  assert.equal(multiResult.status, "compiler-error", JSON.stringify(multiResult.classification))
  const multiParsed = parseWorkerReceipt(fs.readFileSync(multiResult.workerReceipt.path, "utf8"), { keepRecords: true })
  assert.equal(multiParsed.ok, true, multiParsed.error)
  assert.deepEqual(multiParsed.header.runtime, { goGcPercent: 25, observedWorkerGoGc: "25" })
  assert.equal(multiParsed.trailer.status, "completed")
  assert.equal(multiParsed.graph.namesSha256, namesDigest(multi.names))
  assert.deepEqual(Object.keys(multiParsed.families), [...FAMILIES])
  assert.ok(multiParsed.errors > 0)
  assert.equal(multiParsed.trailer.errorCount, multiParsed.errors)
  assert.equal(multiParsed.trailer.warningCount, multiParsed.warnings)
  const codes = multiParsed.records.map(entry => entry.diagnostic.code)
  for (const code of [2322, 2304]) assert.ok(codes.includes(code), `missing diagnostic code ${code}`)
})

test("parent runtime boundary rejects an outer accessor without reading it", () => {
  const shaped = expectations(fixtures.valid)
  let reads = 0
  Object.defineProperty(shaped, "runtime", {
    enumerable: true,
    get() { reads++; return { goGcPercent: 25 } },
  })
  let error
  try { normalizeExpectations(shaped) } catch (caught) { error = caught }
  assert.equal(reads, 0, "requesting a runtime must not invoke an outer getter")
  assert.equal(error?.code, "invalid-expectations")
})

test("parent runtime boundary requires explicit own data rather than inherited or undefined selection", () => {
  const inherited = Object.assign(Object.create({ runtime: { goGcPercent: 25 } }), expectations(fixtures.valid))
  assert.throws(() => normalizeExpectations(inherited), { code: "invalid-expectations" })
  const missing = expectations(fixtures.valid)
  assert.equal(normalizeExpectations(missing).runtime, null)
  assert.throws(() => normalizeExpectations({ ...missing, runtime: undefined }), { code: "invalid-expectations" })
})

test("parent runtime mismatch neither exports arbitrary environment bytes nor corrupts its failed receipt", async () => {
  const directory = join(scratch, "parent-runtime-redaction")
  mkdirSync(directory, { recursive: true })
  const marker = join(directory, "api-loaded")
  const fakeCompiler = join(directory, "fake-tsc")
  const fakeApi = join(directory, "api.mjs")
  writeFileSync(fakeCompiler, "not executed")
  writeFileSync(fakeApi, `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "loaded"); export class API {}`)
  const shaped = expectations(fixtures.valid, { compiler: {
    executable: fakeCompiler, sha256: digest(fs.readFileSync(fakeCompiler)),
    apiModule: fakeApi, apiModuleSha256: digest(fs.readFileSync(fakeApi)),
  }, runtime: { goGcPercent: 25 } })
  const syntheticValue = "fixture-only-do-not-export-" + "X".repeat(4096)
  const failed = await spawnWorkerCli({ fixture: fixtures.valid, name: "parent-runtime-redaction", shaped,
    env: { ...buildWorkerEnvironment(fixtures.valid.directory), GOGC: syntheticValue } })
  assert.equal(fs.existsSync(marker), false)
  assert.equal(failed.text.includes(syntheticValue), false, "arbitrary mismatched environment bytes must not reach evidence")
  assert.equal(failed.parsed.ok, true, failed.parsed.error)
  assert.equal(failed.parsed.trailer.status, "failed")
  assert.equal(failed.parsed.trailer.failure.stage, "runtime")
  assert.equal(failed.parsed.header.runtime.observedWorkerGoGc, "mismatch")
})

test("lower GOGC accepts only the explicit numeric 10 route while retaining 25 and legacy omission", () => {
  const source = { goGcPercent: 10 }
  const normalized = normalizeExpectations(expectations(fixtures.valid, { runtime: source }))
  assert.deepEqual(normalized.runtime, { goGcPercent: 10 })
  assert.ok(Object.isFrozen(normalized.runtime))
  source.goGcPercent = 25
  assert.equal(normalized.runtime.goGcPercent, 10)
  assert.deepEqual(normalizeExpectations(expectations(fixtures.valid, { runtime: source })).runtime, { goGcPercent: 25 })
  assert.equal(normalizeExpectations(expectations(fixtures.valid)).runtime, null)
  assert.deepEqual(normalizeExpectations(expectations(fixtures.valid, {
    runtime: Object.assign(Object.create(null), { goGcPercent: 10 }),
  })).runtime, { goGcPercent: 10 })

  let reads = 0
  const getter = { get goGcPercent() { reads++; return 10 } }
  const bad = [getter, Object.create({ goGcPercent: 10 }),
    Object.assign(Object.create({ inherited: true }), { goGcPercent: 10 }),
    Object.defineProperty({}, "goGcPercent", { value: 10, enumerable: false }),
    { goGcPercent: 10, [Symbol("extra")]: true }, { goGcPercent: 10, GOMEMLIMIT: "1GiB" },
    ...[0, -0, -1, 1, 9, 11, 24, 26, 100, 10.5, NaN, Infinity, "10", "off"].map(goGcPercent => ({ goGcPercent }))]
  for (const runtime of bad) {
    assert.throws(() => normalizeExpectations(expectations(fixtures.valid, { runtime })), { code: "invalid-expectations" })
    assert.throws(() => buildWorkerEnvironment(fixtures.valid.directory, runtime), { code: "invalid-expectations" })
  }
  const outer = expectations(fixtures.valid)
  Object.defineProperty(outer, "runtime", { enumerable: true, get() { reads++; return { goGcPercent: 10 } } })
  assert.throws(() => normalizeExpectations(outer), { code: "invalid-expectations" })
  assert.equal(reads, 0, "neither descriptor boundary may evaluate a getter")
})

test("lower GOGC uses a fresh exact environment and a real child receives 10 without parent leakage", async () => {
  const directory = fixtures.valid.directory
  const runtime = buildWorkerEnvironment(directory, { goGcPercent: 10 })
  assert.deepEqual(runtime, { PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: directory, GOGC: "10" })
  assert.ok(Object.isFrozen(runtime))
  const childScript = `import { buildWorkerEnvironment } from ${JSON.stringify(scriptUrl)}
const before = { GOGC: process.env.GOGC, GOMEMLIMIT: process.env.GOMEMLIMIT }
const environment = buildWorkerEnvironment(process.argv[1], { goGcPercent: 10 })
const unchanged = before.GOGC === process.env.GOGC && before.GOMEMLIMIT === process.env.GOMEMLIMIT
process.stdout.write(JSON.stringify({ environment, unchanged }))`
  const child = await runNode(["--input-type=module", "-e", childScript, directory], {
    env: { PATH: "/usr/bin:/bin", GOGC: "25", GOMEMLIMIT: "512MiB", OPENCODE_TEST_TOKEN: "fixture-not-forwarded" },
  })
  assert.equal(child.code, 0, child.stderr)
  assert.deepEqual(JSON.parse(child.stdout), { environment: runtime, unchanged: true })
  const actual = await runNode(["-e", "process.stdout.write(JSON.stringify(process.env))"], { env: runtime })
  assert.equal(actual.code, 0, actual.stderr)
  assert.deepEqual(JSON.parse(actual.stdout), runtime)
})

test("lower GOGC worker refuses missing, old or malformed observations before API import", async () => {
  const directory = join(scratch, "lower-gogc-gate")
  mkdirSync(directory)
  const marker = join(directory, "api-loaded")
  const fakeCompiler = join(directory, "fake-tsc"), fakeApi = join(directory, "api.mjs")
  writeFileSync(fakeCompiler, "not executed")
  writeFileSync(fakeApi, `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "loaded"); export class API {}`)
  const shaped = expectations(fixtures.valid, { runtime: { goGcPercent: 10 }, compiler: {
    executable: fakeCompiler, sha256: digest(fs.readFileSync(fakeCompiler)),
    apiModule: fakeApi, apiModuleSha256: digest(fs.readFileSync(fakeApi)),
  } })
  const malformed = "fixture-private-mismatch-" + "X".repeat(4096)
  for (const [name, value] of [["unset", undefined], ["old", "25"], ["malformed", malformed]]) {
    const environment = { ...buildWorkerEnvironment(directory) }
    if (value !== undefined) environment.GOGC = value
    const refused = await spawnWorkerCli({ fixture: fixtures.valid, name: `lower-gogc-${name}`, shaped, env: environment })
    assert.equal(refused.result.reason, null, JSON.stringify(refused.result))
    assert.equal(refused.parsed.ok, true, refused.parsed.error)
    assert.equal(refused.parsed.trailer.failure.stage, "runtime")
    assert.match(refused.parsed.trailer.failure.message, /requested 10/)
    assert.deepEqual(refused.parsed.header.runtime, { goGcPercent: 10,
      observedWorkerGoGc: value === undefined ? null : "mismatch" })
    assert.equal(fs.existsSync(marker), false)
    assert.equal(refused.text.includes(malformed), false, "mismatched environment content must not reach the receipt")
  }
  const accepted = await spawnWorkerCli({ fixture: fixtures.valid, name: "lower-gogc-match", shaped,
    env: buildWorkerEnvironment(directory, { goGcPercent: 10 }) })
  assert.equal(accepted.parsed.ok, true, accepted.parsed.error)
  assert.deepEqual(accepted.parsed.header.runtime, { goGcPercent: 10, observedWorkerGoGc: "10" })
  assert.equal(fs.existsSync(marker), true)
  assert.equal(accepted.parsed.trailer.status, "invalid-config", "the test module is loaded, not a working compiler")
})

test("lower GOGC real tiny diagnostics retain every family, library errors and exact receipt binding", compilerSkip, async () => {
  const runtime = { goGcPercent: 10 }
  const cleanExpectations = expectations(fixtures.valid, { runtime })
  const clean = await spawnWorkerCli({ fixture: fixtures.valid, name: "lower-gogc-real-clean", shaped: cleanExpectations,
    env: buildWorkerEnvironment(fixtures.valid.directory, runtime) })
  assert.equal(clean.result.reason, null, JSON.stringify(clean.result))
  assert.equal(clean.result.cleanup.verified, true)
  assert.equal(clean.parsed.ok, true, clean.parsed.error)
  assert.equal(clean.parsed.trailer.status, "completed")
  assert.equal(clean.parsed.errors, 0)
  assert.deepEqual(clean.parsed.header.runtime, { goGcPercent: 10, observedWorkerGoGc: "10" })
  assert.deepEqual(clean.parsed.header.limits, LIMITS)
  assert.deepEqual(Object.keys(clean.parsed.families), [...FAMILIES])
  assert.ok(clean.parsed.graph.graphFiles > 1, "compiler libraries must remain in the tiny graph")
  assert.equal(clean.parsed.trailer.iteratedFiles, 4 * clean.parsed.graph.graphFiles)
  const expected = normalizeExpectations(cleanExpectations), sha = digestJson(cleanExpectations)
  assert.equal(verifyReceiptBinding(expected, clean.parsed, sha), null)
  assert.equal(verifyReceiptBinding({ ...expected, runtime: { goGcPercent: 25 } }, clean.parsed, sha), "runtime-go-gc-mismatch")
  assert.equal(verifyReceiptBinding({ ...expected, runtime: null }, clean.parsed, sha), "runtime-unexpected")
  for (const runtime of [{ goGcPercent: 10, observedWorkerGoGc: "25" }, { goGcPercent: 25, observedWorkerGoGc: "10" },
    { goGcPercent: 10, observedWorkerGoGc: "mismatch" }, { goGcPercent: 10, observedWorkerGoGc: null }]) {
    const lines = receiptObjects(clean.text)
    lines[0].runtime = runtime
    assert.equal(parseWorkerReceipt(receiptText(lines)).ok, false, "a completed receipt must match its own requested value")
  }
  const failed = await spawnWorkerCli({ fixture: fixtures.multi, name: "lower-gogc-real-errors",
    shaped: expectations(fixtures.multi, { runtime }), env: buildWorkerEnvironment(fixtures.multi.directory, runtime) })
  assert.equal(failed.result.reason, null, JSON.stringify(failed.result))
  assert.equal(failed.result.cleanup.verified, true)
  assert.equal(failed.parsed.ok, true, failed.parsed.error)
  assert.equal(failed.parsed.trailer.status, "completed")
  assert.deepEqual(failed.parsed.header.runtime, { goGcPercent: 10, observedWorkerGoGc: "10" })
  assert.deepEqual(Object.keys(failed.parsed.families), [...FAMILIES])
  const diagnostics = failed.parsed.records
  for (const code of [2322, 2304]) assert.ok(diagnostics.some(entry => entry.diagnostic.code === code), `missing ${code}`)
  assert.ok(diagnostics.some(entry => entry.diagnostic.code === 2304 && entry.diagnostic.fileName?.endsWith("/ext.d.ts")),
    "the declaration-file error must be checked, not suppressed")
  assert.equal(failed.parsed.trailer.iteratedFiles, 4 * failed.parsed.graph.graphFiles)
})
