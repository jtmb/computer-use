import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import test from "node:test"

const HERE = dirname(fileURLToPath(import.meta.url))
const PIN = "ba546ec1598a70db2570e9c6258028d955ba8f58"
const SOURCE = process.env.NATIVE_ROW_SOURCE_CHECKOUT
const PATCH = join(HERE, "gaxios-fetch-compliance.patch")
const TARGETS = ["build/cjs/src/gaxios.d.ts", "build/esm/src/gaxios.d.ts"]
const ORIGINAL_SHA = "7b77539db0683e287a0424a8a9eb2255a52054b2a7ba6ec477a67f594293abe0"
const PATCH_SHA = "323b8fe19f185ed53358309dc9668ee618651945d3552bef71e3b51114873643"
const PRODUCER_SHA = "8982ae7988a3902c7ce586427672887f95349e7b7dd26de475f33ac81c5ca45d"
const PRODUCER = "packages/ai/src/protocols/open-responses.ts"
const EXPECTATION_PATCH = join(HERE, "type-expectation-placement.patch")
const EXPECTATION_SHA = "f6bf8d846a77966d212fc4a2f911ee5ed4dbdd7942a785a4892206592a22d37c"
const EXPECTATIONS = [
  ["packages/ai/test/llm-option-types.types.ts", "3cb217df140a3879dc94b5c397b74c647fac110dbb67955040362b7254d18b3b"],
  ["packages/ai/test/provider-options/checkpoint.types.ts", "88abffa11cdbe4e878fcbb1e93154e939787533741b6abdff1546024861752b9"],
]
const OLD = "fetch: typeof fetch;"
const FIX = "fetch: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;"
const METHODS = ["getConfigFileParsingDiagnostics", "getOptionsDiagnostics", "getSyntacticDiagnostics", "getGlobalDiagnostics", "getSemanticDiagnostics", "getDeclarationDiagnostics"]
const hash = value => createHash("sha256").update(value).digest("hex")
const json = path => JSON.parse(fs.readFileSync(path, "utf8"))
const git = (directory, ...args) => execFileSync("/usr/bin/git", ["--no-optional-locks", "-C", directory, ...args],
  { encoding: "utf8", timeout: 15000, maxBuffer: 2 * 1024 * 1024 })

function locations() {
  assert.ok(SOURCE && isAbsolute(SOURCE), "explicit absolute pinned checkout required")
  assert.equal(git(SOURCE, "rev-parse", "HEAD").trim(), PIN)
  assert.ok(["https://github.com/anomalyco/opencode", "https://github.com/anomalyco/opencode.git"].includes(git(SOURCE, "config", "--get", "remote.origin.url").trim()))
  const require = createRequire(join(SOURCE, "packages/ai/package.json"))
  const google = createRequire(require.resolve("google-auth-library"))
  let gaxios = dirname(google.resolve("gaxios"))
  while (!fs.existsSync(join(gaxios, "package.json"))) {
    const parent = dirname(gaxios)
    assert.notEqual(parent, gaxios)
    gaxios = parent
  }
  const pkg = json(join(gaxios, "package.json"))
  assert.equal(pkg.name, "gaxios")
  assert.equal(pkg.version, "7.3.1")
  const ts = require("typescript")
  assert.equal(ts.version, "6.0.3")
  const alias = require.resolve("typescript")
  assert.equal(json(join(dirname(alias), "../package.json")).version, "6.0.2")
  const config = join(SOURCE, "packages/ai/tsconfig.json")
  const raw = ts.readConfigFile(config, ts.sys.readFile)
  assert.equal(raw.error, undefined)
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, dirname(config), undefined, config)
  const bun = ts.resolveTypeReferenceDirective("bun", join(dirname(config), "__inferred type names__.ts"), parsed.options, ts.sys).resolvedTypeReferenceDirective
  assert.ok(bun)
  const node = fs.realpathSync(join(HERE, "node_modules/@types/node"))
  assert.equal(json(join(node, "package.json")).version, "26.6.6")
  const lock = json(join(HERE, "package-lock.json"))
  assert.equal(lock.packages["node_modules/@types/node"].integrity,
    "sha512-MzQj+8Kx3XI40OmUAE6Qoh58ZMNstNNMwn2nfd3qWsfe7nDNSqJNzes4njhz6AHwrSHOffSLwXU6yb474Q4aog==")
  return { ts, gaxios, node, parsed, config, bunTypesRoot: dirname(dirname(bun.resolvedFileName)) }
}

function worker() {
  const { ts, gaxios, node, parsed: baseParsed, config: baseConfig, bunTypesRoot } = locations()
  const mode = process.env.NATIVE_DECLARATION_MODE
  assert.ok(["baseline", "node-only", "compatible", "bad-return", "bad-parameter", "bad-library", "ai-source", "ai-types", "ai-types-valid"].includes(mode))
  const typeConfig = mode === "ai-types" || mode === "ai-types-valid"
  const full = mode === "ai-source" || typeConfig
  const shard = JSON.parse(process.env.NATIVE_DECLARATION_SHARD ?? '{"index":0,"count":1}')
  assert.ok(Number.isInteger(shard.index) && Number.isInteger(shard.count) && shard.count >= 1 && shard.count <= 4 && shard.index >= 0 && shard.index < shard.count)
  const config = typeConfig ? join(dirname(baseConfig), "tsconfig.types.json") : baseConfig
  const raw = ts.readConfigFile(config, ts.sys.readFile)
  assert.equal(raw.error, undefined)
  const parsed = config === baseConfig ? baseParsed : ts.parseJsonConfigFileContent(raw.config, ts.sys, dirname(config), undefined, config)
  const compatible = mode !== "baseline"
  const patched = mode !== "baseline" && mode !== "node-only"
  const options = { ...parsed.options, strict: true, noEmit: true, noCheck: false, skipLibCheck: false,
    ...(compatible ? { typeRoots: [join(HERE, "node_modules/@types"), bunTypesRoot] } : {}) }
  const virtual = join(dirname(config), "src/__declaration_compatibility_not_written.ts")
  const library = join(dirname(config), "src/__declaration_compatibility_not_written.d.ts")
  assert.ok(!fs.existsSync(virtual) && !fs.existsSync(library))
  const fixtures = new Map([[virtual, TARGETS.map((p, i) =>
    `import type { Gaxios as G${i} } from ${JSON.stringify(join(gaxios, p.slice(0, -5) + ".js"))};`).join("\n") +
    "\nexport type DeclarationControl = G0 | G1;\n"]])
  if (mode === "bad-library") fixtures.set(library, "export interface BrokenLibrary { value: MissingNativeDeclaration }\n")
  const host = ts.createCompilerHost(options)
  host.getCurrentDirectory = () => dirname(config)
  const read = host.readFile.bind(host)
  const overlays = new Map(TARGETS.map(p => [resolve(gaxios, p), join(process.env.NATIVE_DECLARATION_SCRATCH, p)]))
  if (full) overlays.set(join(SOURCE, PRODUCER), join(process.env.NATIVE_DECLARATION_SCRATCH, PRODUCER))
  if (typeConfig) for (const [file] of EXPECTATIONS) overlays.set(join(SOURCE, file), join(process.env.NATIVE_DECLARATION_SCRATCH, file))
  const hits = new Set()
  host.readFile = file => {
    if (fixtures.has(file)) return fixtures.get(file)
    if (!patched || !overlays.has(resolve(file))) return read(file)
    hits.add(resolve(file))
    let value = fs.readFileSync(overlays.get(resolve(file)), "utf8")
    if (mode === "bad-return") value = value.replace("fetch<T = unknown>(...args: Parameters<typeof fetch> | Parameters<Gaxios['request']>): GaxiosPromise<T>;", "fetch<T = unknown>(...args: Parameters<typeof fetch> | Parameters<Gaxios['request']>): Promise<number>;")
    if (mode === "bad-parameter") value = value.replace("fetch<T = unknown>(...args: Parameters<typeof fetch> | Parameters<Gaxios['request']>): GaxiosPromise<T>;", "fetch<T = unknown>(input: number): GaxiosPromise<T>;")
    if (mode === "ai-types-valid") {
      const once = (before, after) => {
        assert.equal(value.split(before).length, 2, "mutation must bind exactly one intended input")
        value = value.replace(before, after)
      }
      if (file === join(SOURCE, EXPECTATIONS[0][0])) once('providerOptions: { mode: false },', 'providerOptions: { mode: "fast" },')
      if (file === join(SOURCE, EXPECTATIONS[1][0])) {
        once('Azure.responsesModel("fixture", { resourceName: "fixture" }) }), {\n  mechanism: "trigger",',
          'Azure.responsesModel("fixture", { resourceName: "fixture" }) }), {\n  mechanism: "endpoint",')
        once('model: model.route.with({ compact: { endpoint: model.route.compact.endpoint } }).model({ id: "fixture" }),\n  }),\n  { mechanism: "trigger" },',
          'model: model.route.with({ compact: { endpoint: model.route.compact.endpoint } }).model({ id: "fixture" }),\n  }),\n  { mechanism: "endpoint" },')
      }
    }
    return value
  }
  const roots = full ? parsed.fileNames : [...fixtures.keys()]
  const program = ts.createProgram({ rootNames: roots, options, host, configFileParsingDiagnostics: parsed.errors })
  if (!full) for (const [file, text] of fixtures) assert.equal(program.getSourceFile(file)?.text, text)
  const sourceFiles = program.getSourceFiles().toSorted((a, b) => a.fileName.localeCompare(b.fileName, "en"))
  const files = sourceFiles.map(file => file.fileName)
  const selected = sourceFiles.filter((_, index) => index % shard.count === shard.index)
  const graphSha256 = hash(JSON.stringify(sourceFiles.map(file => [file.fileName, hash(file.text)])))
  assert.equal(files.includes(join(SOURCE, PRODUCER)), full)
  if (full) assert.equal(program.getSourceFile(join(SOURCE, PRODUCER))?.text, fs.readFileSync(join(process.env.NATIVE_DECLARATION_SCRATCH, PRODUCER), "utf8"))
  if (compatible) {
    assert.ok(files.some(file => file.startsWith(node + "/")))
    assert.ok(!files.some(file => file.includes("/@types+node@24.12.2/")))
  }
  if (patched) assert.equal(hits.size, typeConfig ? 5 : full ? 3 : 2)
  console.log(JSON.stringify({ mode, phase: "program-created", roots: roots.length, files: files.length,
    strict: options.strict, noCheck: options.noCheck, skipLibCheck: options.skipLibCheck, noEmit: options.noEmit }))
  const groups = {}
  for (const method of METHODS) {
    const values = shard.count === 1 || (method !== "getSemanticDiagnostics" && method !== "getDeclarationDiagnostics") ?
      program[method]() : selected.flatMap(file => program[method](file))
    groups[method] = values.map(d => ({ code: d.code, category: d.category, file: d.file?.fileName, start: d.start, length: d.length,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n") }))
    console.log(JSON.stringify({ mode, phase: method, shard, count: groups[method].length }))
  }
  console.log(JSON.stringify({ mode, compiler: ts.version, roots: roots.length, files: files.length, producerLoaded: full,
    strict: options.strict, noEmit: options.noEmit, noCheck: options.noCheck, skipLibCheck: options.skipLibCheck,
    nodeTypes: compatible ? "26.6.6" : "24.12.2", overlays: hits.size, shard, graphSha256,
    rootsSha256: hash(JSON.stringify(roots.toSorted())), sourceFiles: files, assignedFiles: selected.map(file => file.fileName), groups }))
}

function combineReports(parts) {
  assert.ok(parts.length > 0)
  const first = parts[0]
  assert.equal(parts.length, first.shard.count, "every declared shard must be present")
  assert.deepEqual(parts.map(part => part.shard.index).toSorted((a, b) => a - b),
    Array.from({ length: parts.length }, (_, index) => index), "shard identities must be exact and unique")
  for (const part of parts) {
    assert.equal(part.shard.count, first.shard.count)
    assert.equal(part.graphSha256, first.graphSha256, "every shard must retain the same complete graph bytes")
    assert.equal(part.rootsSha256, first.rootsSha256, "every shard must retain all roots")
    assert.deepEqual(part.sourceFiles, first.sourceFiles)
    for (const method of METHODS.filter(method => method !== "getSemanticDiagnostics" && method !== "getDeclarationDiagnostics")) {
      assert.deepEqual(part.groups[method], first.groups[method], "whole-program diagnostics may not differ or vanish in a later shard")
    }
  }
  const assigned = parts.flatMap(part => part.assignedFiles)
  assert.equal(new Set(assigned).size, assigned.length, "no source diagnostic file may be assigned twice")
  assert.deepEqual(assigned.toSorted(), first.sourceFiles.toSorted(), "every program file, including external declarations, must be assigned")
  return { ...first, groups: Object.fromEntries(METHODS.map(method => [method,
    method === "getSemanticDiagnostics" || method === "getDeclarationDiagnostics" ? parts.flatMap(part => part.groups[method]) : first.groups[method]])) }
}

async function boundedRun(mode, root, signal, shard, onReceipt) {
  const available = () => Number(fs.readFileSync("/proc/meminfo", "utf8").split("\n").find(line => line.startsWith("MemAvailable:"))?.split(/\s+/)[1]) / 1024
  const initialAvailableMiB = available()
  assert.ok(!signal.aborted, "test already cancelled")
  if (!(initialAvailableMiB >= 2304)) onReceipt({ mode, shard, spawned: false, reason: "prelaunch-memory-guard",
    initialAvailableMiB, requiredMiB: 2304, stdout: "", stderr: "" })
  assert.ok(initialAvailableMiB >= 2304, `no spawn: need2304 MiB; available ${initialAvailableMiB}`)
  const started = performance.now()
  const child = spawn(process.execPath, ["--max-old-space-size=768", fileURLToPath(import.meta.url)], {
    detached: true, cwd: root, stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root, NATIVE_ROW_SOURCE_CHECKOUT: SOURCE,
      NATIVE_DECLARATION_MODE: mode, NATIVE_DECLARATION_SCRATCH: root, NATIVE_DECLARATION_SHARD: JSON.stringify(shard) },
  })
  let reason = null, stdout = "", stderr = "", peakRSSMiB = 0, minimumAvailableMiB = initialAvailableMiB
  function kill(value) {
    reason ??= value
    if (child.pid) try { process.kill(-child.pid, "SIGKILL") } catch (error) { if (error.code !== "ESRCH") throw error }
  }
  const abort = () => kill("cancelled")
  const terminate = () => kill("terminated")
  const cleanup = () => { if (child.pid) try { process.kill(-child.pid, "SIGKILL") } catch (error) { if (error.code !== "ESRCH") throw error } }
  signal.addEventListener("abort", abort, { once: true })
  process.once("SIGTERM", terminate)
  process.once("SIGINT", terminate)
  process.once("exit", cleanup)
  if (signal.aborted) abort()
  for (const [stream, key, cap] of [[child.stdout, "stdout", 2 * 1024 * 1024], [child.stderr, "stderr", 256 * 1024]]) {
    let count = 0
    stream.on("data", bytes => {
      count += bytes.length
      if (count > cap) return kill(`${key}-budget`)
      if (key === "stdout") stdout += bytes.toString()
      else stderr += bytes.toString()
    })
  }
  const timer = setInterval(() => {
    try {
      if (performance.now() - started > 90000) return kill("deadline")
      const currentAvailable = available()
      if (!Number.isFinite(currentAvailable)) return kill("monitor-unavailable")
      minimumAvailableMiB = Math.min(minimumAvailableMiB, currentAvailable)
      if (minimumAvailableMiB < 1280) return kill("system-memory-floor")
      let rss = 0
      const pending = [child.pid], seen = new Set()
      while (pending.length) {
        const pid = pending.pop()
        if (seen.has(pid)) continue
        seen.add(pid)
        try {
          rss += Number(fs.readFileSync(`/proc/${pid}/status`, "utf8").split("\n").find(line => line.startsWith("VmRSS:"))?.split(/\s+/)[1] ?? 0) / 1024
          for (const tid of fs.readdirSync(`/proc/${pid}/task`)) {
            try { pending.push(...fs.readFileSync(`/proc/${pid}/task/${tid}/children`, "utf8").trim().split(" ").filter(Boolean).map(Number)) }
            catch (error) { if (error.code !== "ENOENT") throw error }
          }
        } catch (error) { if (error.code !== "ENOENT") throw error }
      }
      peakRSSMiB = Math.max(peakRSSMiB, rss)
      if (rss > 1024) kill("owned-rss-budget")
    } catch { kill("monitor-unavailable") }
  }, 100)
  const result = await new Promise(resolve => {
    child.once("error", error => { kill("spawn-error"); resolve({ code: null, signal: null, error: error.message }) })
    child.once("close", (code, signal) => resolve({ code, signal }))
  })
  clearInterval(timer)
  signal.removeEventListener("abort", abort)
  process.removeListener("SIGTERM", terminate)
  process.removeListener("SIGINT", terminate)
  process.removeListener("exit", cleanup)
  if (child.pid) try { process.kill(-child.pid, "SIGKILL") } catch (error) { if (error.code !== "ESRCH") throw error }
  const receipt = { ...result, mode, reason, initialAvailableMiB, peakRSSMiB, minimumAvailableMiB,
    elapsedSeconds: (performance.now() - started) / 1000, stdout, stderr }
  onReceipt(receipt)
  assert.equal(reason, null, JSON.stringify(receipt))
  assert.equal(result.code, 0, JSON.stringify(receipt))
  assert.equal(result.signal, null, JSON.stringify(receipt))
  return { receipt, report: JSON.parse(stdout.trim().split("\n").at(-1)) }
}

if (process.env.NATIVE_DECLARATION_MODE) worker()
else test("upstream callable-fetch correction retains parameter/return and external-library checking", {
  skip: !SOURCE ? "requires explicit NATIVE_ROW_SOURCE_CHECKOUT; no install or live runtime" : false,
  timeout: 570000,
}, async t => {
  const { gaxios } = locations()
  assert.equal(hash(fs.readFileSync(PATCH)), PATCH_SHA)
  assert.deepEqual(fs.readFileSync(PATCH, "utf8").split("\n").filter(line => line.startsWith("diff --git ")),
    TARGETS.map(p => `diff --git a/${p} b/${p}`))
  const originalStatus = git(SOURCE, "status", "--porcelain")
  const producerOriginal = fs.readFileSync(join(SOURCE, PRODUCER))
  assert.equal(producerOriginal.toString(), execFileSync("/usr/bin/git", ["-C", SOURCE, "show", `${PIN}:${PRODUCER}`], { encoding: "utf8", timeout: 10000 }))
  const originals = TARGETS.map(p => fs.readFileSync(join(gaxios, p)))
  for (const bytes of originals) assert.equal(hash(bytes), ORIGINAL_SHA)
  const root = fs.mkdtempSync("/tmp/opencode/native-declaration-check-")
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (let i = 0; i < TARGETS.length; i++) {
    fs.mkdirSync(dirname(join(root, TARGETS[i])), { recursive: true })
    fs.writeFileSync(join(root, TARGETS[i]), originals[i], { flag: "wx" })
  }
  git(root, "apply", "--check", "--whitespace=error-all", PATCH)
  git(root, "apply", "--whitespace=error-all", PATCH)
  for (let i = 0; i < TARGETS.length; i++) assert.equal(fs.readFileSync(join(root, TARGETS[i]), "utf8"), originals[i].toString().replace(OLD, FIX))
  const scope = process.env.NATIVE_DECLARATION_SCOPE ?? (process.env.NATIVE_DECLARATION_FULL === "1" ? "all" : "controls")
  assert.ok(["all", "controls", "source", "types"].includes(scope))
  const full = scope !== "controls"
  const expectationOriginals = new Map()
  if (scope === "types" || scope === "all") {
    assert.equal(hash(fs.readFileSync(EXPECTATION_PATCH)), EXPECTATION_SHA)
    assert.deepEqual(fs.readFileSync(EXPECTATION_PATCH, "utf8").split("\n").filter(line => line.startsWith("diff --git ")),
      EXPECTATIONS.map(([p]) => `diff --git a/${p} b/${p}`))
    for (const [file, sha] of EXPECTATIONS) {
      const original = fs.readFileSync(join(SOURCE, file), "utf8")
      assert.equal(hash(original), sha)
      expectationOriginals.set(file, original)
      fs.mkdirSync(dirname(join(root, file)), { recursive: true })
      fs.writeFileSync(join(root, file), original, { flag: "wx" })
    }
    git(root, "apply", "--check", "--whitespace=error-all", EXPECTATION_PATCH)
    git(root, "apply", "--whitespace=error-all", EXPECTATION_PATCH)
    const withoutDirectives = text => text.split("\n").filter(line => !line.includes("@ts-expect-error")).join("\n")
    const directives = text => text.split("\n").filter(line => line.includes("@ts-expect-error")).map(line => line.trim()).toSorted()
    for (const [file, original] of expectationOriginals) {
      const corrected = fs.readFileSync(join(root, file), "utf8")
      assert.equal(withoutDirectives(corrected), withoutDirectives(original), "every invalid input and all non-directive source must remain byte-identical")
      assert.deepEqual(directives(corrected), directives(original), "no expectation may be added, removed or weakened")
    }
  }
  if (full) {
    const producerPatch = join(HERE, "provider-observation.patch")
    assert.equal(hash(fs.readFileSync(producerPatch)), PRODUCER_SHA)
    fs.mkdirSync(dirname(join(root, PRODUCER)), { recursive: true })
    fs.writeFileSync(join(root, PRODUCER), producerOriginal, { flag: "wx" })
    git(root, "apply", "--check", "--whitespace=error-all", producerPatch)
    git(root, "apply", "--whitespace=error-all", producerPatch)
  }
  const receipts = []
  const modes = scope === "source" ? ["ai-source"] : scope === "types" ? ["ai-types-sharded", "ai-types-valid-sharded"] :
    ["baseline", "node-only", "compatible", "bad-return", "bad-parameter", "bad-library",
      "baseline-sharded", "bad-library-sharded", ...(full ? ["ai-source", "ai-types-sharded", "ai-types-valid-sharded"] : [])]
  const reports = new Map()
  for (const label of modes) {
    const sharded = label.endsWith("-sharded")
    const mode = sharded ? label.slice(0, -8) : label
    const count = !sharded ? 1 : mode.startsWith("ai-types") ? 4 : 2
    const parts = []
    for (let index = 0; index < count; index++) {
      const { report } = await boundedRun(mode, root, t.signal, { index, count }, receipt => {
        receipts.push(receipt)
        t.diagnostic(`checker-receipt-base64:${Buffer.from(JSON.stringify(receipt)).toString("base64")}`)
      })
      parts.push(report)
    }
    const report = combineReports(parts)
    if (sharded && !mode.startsWith("ai-types")) {
      const whole = reports.get(mode)
      // TypeScript may reorder rendered union members as different files populate its caches.
      const normalized = groups => Object.fromEntries(METHODS.map(method => [method, groups[method].map(d =>
        JSON.stringify([d.code, d.category, d.file, d.start, d.length])).toSorted()]))
      assert.deepEqual(normalized(report.groups), normalized(whole.groups), "sharding must preserve every diagnostic, including errors")
    }
    reports.set(label, report)
    for (const method of METHODS.filter(method => method !== "getSemanticDiagnostics")) assert.deepEqual(report.groups[method], [])
    const diagnostics = report.groups.getSemanticDiagnostics
    if (mode === "baseline") assert.deepEqual(diagnostics.map(d => d.code).toSorted((a, b) => a - b), [2304, 2416, 2416, 2552, 2552, 2694])
    else if (mode === "node-only") assert.deepEqual(diagnostics.map(d => d.code), [2416, 2416])
    else if (mode === "compatible" || mode === "ai-source" || mode === "ai-types") {
      assert.deepEqual(diagnostics, [])
      if (mode === "ai-source") assert.equal(report.roots, 218)
      if (mode === "ai-types") assert.equal(report.roots, 35)
    }
    else if (mode === "ai-types-valid") {
      assert.equal(report.roots, 35)
      assert.equal(diagnostics.length, 3, "making all three formerly invalid calls valid must leave three unused expectations")
      for (const d of diagnostics) {
        assert.equal(d.code, 2578)
        assert.ok(EXPECTATIONS.some(([file]) => d.file === join(SOURCE, file)))
      }
    }
    else if (mode === "bad-library") { assert.equal(diagnostics.length, 1); assert.equal(diagnostics[0].code, 2304); assert.ok(diagnostics[0].file.endsWith(".d.ts")) }
    else { assert.equal(diagnostics.length, 2); for (const d of diagnostics) assert.equal(d.code, 2416) }
  }
  assert.equal(git(SOURCE, "status", "--porcelain"), originalStatus)
  assert.equal(hash(fs.readFileSync(join(SOURCE, PRODUCER))), hash(producerOriginal))
  for (let i = 0; i < TARGETS.length; i++) assert.equal(hash(fs.readFileSync(join(gaxios, TARGETS[i]))), hash(originals[i]))
  for (const [file, original] of expectationOriginals) assert.equal(fs.readFileSync(join(SOURCE, file), "utf8"), original)
  t.diagnostic(JSON.stringify({ pin: PIN, scope, patchSha256: hash(fs.readFileSync(PATCH)), sourceUnchanged: true,
    layer: full ? "complete selected AI configs with explicit Node26 types and gaxios/producer/test-placement overlays; NOT unchanged-lock/host/installed acceptance" :
      "declaration-only compatibility/negative controls; NOT complete AI/host or installed acceptance",
    cases: [...reports].map(([mode, report]) => ({ mode, roots: report.roots, files: report.files, diagnostics: Object.values(report.groups).flat().length })),
    checkerCount: receipts.length }))
})

if (!process.env.NATIVE_DECLARATION_MODE) test("receipt aggregation refuses non-first shard diagnostics and malformed coverage", () => {
  const sample = () => [0, 1].map(index => ({
    graphSha256: "same-graph", rootsSha256: "same-roots", shard: { index, count: 2 },
    sourceFiles: ["/fixture/source.ts", "/fixture/library.d.ts"],
    assignedFiles: [["/fixture/source.ts"], ["/fixture/library.d.ts"]][index],
    groups: Object.fromEntries(METHODS.map(method => [method, []])),
  }))
  assert.equal(Object.values(combineReports(sample()).groups).flat().length, 0)
  const lateGlobal = sample()
  lateGlobal[1].groups.getGlobalDiagnostics.push({ code: 2304, message: "late global failure" })
  assert.throws(() => combineReports(lateGlobal))
  const missing = sample()
  missing[1].assignedFiles = []
  assert.throws(() => combineReports(missing))
  const duplicate = sample()
  duplicate[1].assignedFiles = duplicate[0].assignedFiles
  assert.throws(() => combineReports(duplicate))
  const identity = sample()
  identity[1].shard.index = 0
  assert.throws(() => combineReports(identity))
  const count = sample()
  count[0].shard.count = 3
  assert.throws(() => combineReports(count))
  const lateSemantic = sample()
  lateSemantic[1].groups.getSemanticDiagnostics.push({ code: 2304, message: "external declaration error" })
  assert.deepEqual(combineReports(lateSemantic).groups.getSemanticDiagnostics, lateSemantic[1].groups.getSemanticDiagnostics)
  const lateDeclaration = sample()
  lateDeclaration[1].groups.getDeclarationDiagnostics.push({ code: 4023, message: "declaration emit contract error" })
  assert.deepEqual(combineReports(lateDeclaration).groups.getDeclarationDiagnostics, lateDeclaration[1].groups.getDeclarationDiagnostics)
})
