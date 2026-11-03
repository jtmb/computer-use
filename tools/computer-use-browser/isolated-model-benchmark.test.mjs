import assert from "node:assert/strict"
import { appendFile, chmod, mkdir, mkdtemp, lstat, open, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  BenchmarkBlockedError,
  benchmarkPlan,
  cleanupOwnedRunRoot,
  collectPrivateSessionEvidence,
  createOwnedRunRoot,
  makePrivateEnvironment,
  parseArgs,
  parseDebugPaths,
  parseModelReference,
  readBoundedJson,
  runBounded,
  selectModel,
  validateScratchParent,
  verifySystemConfigAbsent,
  verifyOwnedRunRoot,
  verifyDebugPaths,
} from "./isolated-model-benchmark.mjs"
import {
  attestModelDispatch,
  BENCHMARK_LIMITS,
  connectedCredentialIntegrationIDs,
  EXPECTED_BROWSER_TOOLS,
  makeConditionSchedule,
  verifyDispatchExposure,
} from "./benchmark-runtime/contract.mjs"
import { startBenchmarkFixture } from "./benchmark-runtime/fixture.mjs"
import { copySourceFileForStaging, runNativeBenchmark, stageProductionRuntime, summarizeReceipt, writePrivateConfig } from "./benchmark-runtime/orchestrator.mjs"
import { createCredentialSafety } from "../../.opencode/plugins/computer-use/credential-safety.ts"
import { registerBrowserTools } from "../../.opencode/plugins/computer-use/browser-tools.ts"
import { applyCodemodeDefault } from "../../.opencode/plugins/computer-use/codemode.ts"
import { withSerializedTools } from "../../.opencode/plugins/computer-use/serialization.ts"
import { createAuthGuard, createOwnerOperationQueue } from "../computer-use-runtime/src/index.ts"
import { parseMeasureOptions } from "./benchmark-runtime/options.ts"
import { createReceiptWriter } from "./benchmark-runtime/receipt.ts"

const SCRATCH_ROOT = "/tmp/opencode"
const RUN_PREFIX = "computer-use-browser-model-bench-"
const OWNER_KIND = "computer-use-browser-isolated-model-benchmark"
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const SESSION_ID = "ses_benchmark_1"
const PROJECT_ID = "project_benchmark_1"
const DIRECTORY = "/tmp/opencode/benchmark-workspace"

test("receipt saves serialize real-file publication and preserve each call's snapshot", { timeout: 5000 }, async (t) => {
  const root = await mkdtemp(join(SCRATCH_ROOT, "benchmark-receipt-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, "receipt.json")
  const handle = await open(path, "wx", 0o600)
  t.after(() => handle.close())
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  let truncates = 0
  let writes = 0
  const write = createReceiptWriter({
    truncate: (...args) => { truncates += 1; return handle.truncate(...args) },
    write: async (...args) => {
      if (++writes === 1) { entered.resolve(); await release.promise }
      return handle.write(...args)
    },
    sync: () => handle.sync(),
  })
  const first = write({ phase: "older", padding: "x".repeat(100) })
  await entered.promise
  const state = { phase: "latest" }
  const second = write(state)
  state.phase = "mutated-after-save"
  try {
    await Promise.resolve()
    assert.equal(truncates, 1, "later save must not truncate while earlier write is suspended")
  } finally {
    release.resolve()
    await Promise.allSettled([first, second])
  }
  await Promise.all([first, second])
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { phase: "latest" })
})

test("receipt writer stays failed after an I/O failure instead of publishing later evidence", async () => {
  let truncates = 0
  const failure = new Error("injected sync failure")
  const write = createReceiptWriter({
    truncate: async () => { truncates += 1 },
    write: async (_bytes, _offset, length) => ({ bytesWritten: length }),
    sync: async () => { throw failure },
  })
  await assert.rejects(write({ phase: "first" }), error => error === failure)
  const callsBeforeRetry = truncates
  await assert.rejects(write({ phase: "later" }), error => error === failure)
  assert.equal(truncates, callsBeforeRetry, "failed publication must not resume later writes")
})

test("receipt writer handles short real writes and bounds UTF-8 before touching the file", async (t) => {
  const root = await mkdtemp(join(SCRATCH_ROOT, "benchmark-receipt-short-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, "receipt.json")
  const handle = await open(path, "wx", 0o600)
  t.after(() => handle.close())
  let writes = 0
  let truncates = 0
  const write = createReceiptWriter({
    truncate: (...args) => { truncates += 1; return handle.truncate(...args) },
    write: (bytes, offset, length, position) => {
      writes += 1
      return handle.write(bytes, offset, Math.min(length, 3), position)
    },
    sync: () => handle.sync(),
  })
  const value = { phase: "short", text: "é✅" }
  await write(value)
  assert.ok(writes > 1)
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), value)
  const before = truncates
  await assert.rejects(write({ text: "✅".repeat(400_000) }), /one-megabyte bound/u)
  assert.equal(truncates, before)
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), value)
})

test("receipt writer rejects zero or malformed byte counts without syncing or resuming", async () => {
  for (const bytesWritten of [0, -1, NaN, Infinity, 1.5, 1_048_576]) {
    let syncs = 0
    let writes = 0
    const write = createReceiptWriter({
      truncate: async () => {},
      write: async () => { writes += 1; return { bytesWritten } },
      sync: async () => { syncs += 1 },
    })
    await assert.rejects(write({ phase: "first" }), /invalid progress/u)
    await assert.rejects(write({ phase: "later" }), /invalid progress/u)
    assert.equal(writes, 1)
    assert.equal(syncs, 0)
  }
})

test("measurement options return an exact typed session/model/fixture contract before runtime setup", () => {
  const options = { mode: "measure", scenario: "normal", directTools: false,
    expectedSessionID: SESSION_ID, expectedModel: { providerID: "local", id: "fixture/model", variant: null },
    variantPolicy: "exact", fixtureUrl: "http://127.0.0.1:4321/normal" }
  assert.deepEqual(parseMeasureOptions({ ...options, ignoredField: "omit" }), options)
  for (const patch of [{ mode: "catalog" }, { directTools: "false" }, { expectedSessionID: "ses_wrong/path" },
    { expectedModel: { providerID: "local", id: "" } }, { expectedModel: { providerID: "local", id: "m", variant: 7 } },
    { expectedModel: { providerID: "local", id: "m" } }, { variantPolicy: "guess" },
    { expectedModel: { providerID: "local", id: "m", variant: "" } },
    { expectedModel: { providerID: "local\n", id: "m", variant: null } },
    { expectedModel: { providerID: "local", id: "../m", variant: null } },
    { expectedModel: { providerID: "local", id: "m", variant: "high#unsafe" } },
    { variantPolicy: "native-default", expectedModel: { providerID: "local", id: "m", variant: "high" } },
    { fixtureUrl: "http://127.0.0.1:4321/recoverable" }, { fixtureUrl: "http://example.test:4321/normal" },
    { fixtureUrl: "http://127.0.0.1:4321/normal?extra" }]) {
    assert.throws(() => parseMeasureOptions({ ...options, ...patch }), TypeError)
  }
})

test("private config keeps browser authority identical and enables Code Mode only in its condition", async (t) => {
  const fixtureUrl = "http://127.0.0.1:4321/normal"
  const browserPermissions = [
    { action: "browser_open", resource: `web/url/${encodeURIComponent(fixtureUrl)}`, effect: "allow" },
    { action: "browser_read", resource: "web/tab/*", effect: "allow" },
    { action: "browser_close", resource: `web/session/${SESSION_ID}`, effect: "allow" },
  ]
  const browserPolicies = browserPermissions.map(({ action, resource }) => ({
    action: "tool.use", resource: `${action}:${resource}`, effect: "allow",
  }))
  for (const directTools of [false, true]) {
    const workspace = await mkdtemp(join(SCRATCH_ROOT, "benchmark-config-"))
    t.after(() => rm(workspace, { recursive: true, force: true }))
    await writePrivateConfig(workspace, join(workspace, "plugin"), { fixtureUrl, expectedSessionID: SESSION_ID }, directTools)
    const file = join(workspace, "opencode.json")
    const bytes = await readFile(file, "utf8")
    const config = JSON.parse(bytes)
    assert.deepEqual(config.policies, [
      { action: "tool.use", resource: "*", effect: "deny" },
      ...browserPolicies,
      ...(directTools ? [] : [{ action: "tool.use", resource: "execute:*", effect: "allow" }]),
    ])
    assert.deepEqual(config.permissions, [
      { action: "*", resource: "*", effect: "deny" },
      ...browserPermissions,
      ...(directTools ? [] : [{ action: "execute", resource: "*", effect: "allow" }]),
    ])
    assert.deepEqual(config.mcp, { servers: {} })
    assert.equal((await lstat(file)).mode & 0o777, 0o600)
    await assert.rejects(writePrivateConfig(workspace, join(workspace, "other"), { directTools: !directTools }, directTools),
      /does not match the benchmark condition/u)
    await assert.rejects(writePrivateConfig(workspace, join(workspace, "other"), {}, "false"), TypeError)
    await assert.rejects(writePrivateConfig(workspace, join(workspace, "other"), {}), TypeError)
    await assert.rejects(writePrivateConfig(workspace, join(workspace, "other"), {}, directTools), { code: "EEXIST" })
    assert.equal(await readFile(file, "utf8"), bytes)
  }
})

test("CLI parsing defaults to preflight and rejects ambiguous or unbounded input", () => {
  assert.deepEqual(parseArgs([]), {
    mode: "preflight", binary: null, model: null, scratchParent: SCRATCH_ROOT,
    pairs: 2, timeoutMs: 180_000, maxBytes: 16 * 1024 * 1024,
  })
  assert.deepEqual(parseArgs([
    "--run", "--binary", "/opt/opencode", "--model", "openai/model-x#high", "--pairs", "4",
  ]), {
    mode: "run", binary: "/opt/opencode", model: { providerID: "openai", id: "model-x", variant: "high" },
    scratchParent: SCRATCH_ROOT, pairs: 4, timeoutMs: 180_000, maxBytes: 16 * 1024 * 1024,
  })
  assert.equal(parseArgs(["--scratch-parent", "/tmp/opencode/private-run"]).scratchParent, "/tmp/opencode/private-run")
  assert.equal(parseArgs(["--help"]).mode, "help")
  for (const args of [
    ["--run", "--preflight"], ["--pairs", "1"], ["--pairs", "2.5"], ["--timeout-ms", "1"],
    ["--max-bytes", "16777217"], ["--binary", "relative/opencode"], ["--scratch-parent", "relative"],
    ["--model", "openai/../model"],
    ["--pairs", "2", "--pairs", "3"], ["--unknown"], ["--help", "--run"],
  ]) assert.throws(() => parseArgs(args))
  assert.throws(() => parseModelReference("openai/model#one#two"), /at most one/u)
})

test("benchmark plan describes only evidence collected by the production runner", () => {
  const plan = benchmarkPlan({ pairs: 2 })
  assert.ok(plan.measurements.includes("exact task-scoped native token/cost counters"))
  assert.ok(plan.measurements.includes("production browser tool outcomes"))
  assert.equal(plan.measurements.some((measurement) => measurement.includes("messages")), false)
})

test("private process environment redirects all OpenCode and XDG roots without inheriting credentials", () => {
  const env = makePrivateEnvironment("/tmp/opencode/private-run", {
    HOME: "/home/operator",
    DISPLAY: ":0",
    OPENAI_API_KEY: undefined,
    PLAYWRIGHT_BROWSERS_PATH: "/opt/browsers",
  })

  assert.equal(env.HOME, "/tmp/opencode/private-run/home")
  assert.equal(env.OPENCODE_CONFIG_DIR, "/tmp/opencode/private-run/config")
  assert.equal(env.XDG_CONFIG_HOME, "/tmp/opencode/private-run/config")
  assert.equal(env.OPENCODE_DATA_DIR, "/tmp/opencode/private-run/data/opencode")
  assert.equal(env.XDG_STATE_HOME, "/tmp/opencode/private-run/state")
  assert.equal(env.XDG_CACHE_HOME, "/tmp/opencode/private-run/cache")
  assert.equal(env.TMPDIR, "/tmp/opencode/private-run/tmp")
  assert.equal(env.OPENCODE_BROWSER_PROFILE_ROOT, "/tmp/opencode/private-run/profile")
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, undefined)
  assert.equal(Object.hasOwn(env, "OPENAI_API_KEY"), false)
  assert.equal(Object.hasOwn(env, "DISPLAY"), false)
  assert.throws(() => makePrivateEnvironment("/tmp/opencode/private-run", {}, true), /Wayland session/u)
  const browserEnv = makePrivateEnvironment("/tmp/opencode/private-run", {
    WAYLAND_DISPLAY: "wayland-0", XDG_RUNTIME_DIR: "/run/user/1000", PLAYWRIGHT_BROWSERS_PATH: "/opt/browsers",
  }, true)
  assert.equal(browserEnv.PLAYWRIGHT_BROWSERS_PATH, "/opt/browsers")
})

test("debug-path parsing verifies every persistent and derived path stays under the run root", () => {
  const runRoot = "/tmp/opencode/computer-use-browser-model-bench-example"
  const paths = {
    home: `${runRoot}/home`,
    data: `${runRoot}/data/opencode`,
    config: `${runRoot}/config`,
    state: `${runRoot}/state/opencode`,
    cache: `${runRoot}/cache/opencode`,
    tmp: `${runRoot}/tmp/opencode`,
    db: `${runRoot}/data/opencode/opencode.db`,
    log: `${runRoot}/data/opencode/log`,
    repos: `${runRoot}/data/opencode/repos`,
    bin: `${runRoot}/data/opencode/bin`,
  }
  const parsed = parseDebugPaths(Object.entries(paths).map(([key, value]) => `${key} ${value}`).join("\n"))

  assert.deepEqual(verifyDebugPaths(parsed, runRoot), {
    verified: true,
    roots: {
      home: paths.home, data: paths.data, config: paths.config,
      state: paths.state, cache: paths.cache, tmp: paths.tmp,
    },
    derivedPathsPrivate: true,
  })
  assert.throws(() => verifyDebugPaths({ ...parsed, db: "/home/operator/.local/share/opencode/opencode.db" }, runRoot), /escaped/u)
  assert.throws(() => verifyDebugPaths({ ...parsed, db: `${runRoot}/../../home/operator/.local/share/opencode.db` }, runRoot), /db path escaped/u)
  assert.throws(() => verifyDebugPaths({ ...parsed, bin: `${runRoot}/../computer-use-browser-model-bench-example-evil/bin` }, runRoot), /bin path escaped/u)
  assert.throws(() => verifyDebugPaths(parsed, `${runRoot}/..`), /normalized/u)
  assert.throws(() => verifyDebugPaths({ ...parsed, config: "/etc/opencode" }, runRoot), /config/u)
})

test("condition schedule alternates order and rejects pair counts outside the hard limit", () => {
  assert.deepEqual(makeConditionSchedule(4), [
    { pair: 1, order: ["codemode", "directTools"] },
    { pair: 2, order: ["directTools", "codemode"] },
    { pair: 3, order: ["codemode", "directTools"] },
    { pair: 4, order: ["directTools", "codemode"] },
  ])
  assert.equal(BENCHMARK_LIMITS.maxPairs, 8)
  assert.throws(() => makeConditionSchedule(1), /pairs must be an integer/u)
  assert.throws(() => makeConditionSchedule(9), /pairs must be an integer/u)
})

test("private provider readiness accepts connected credential integrations, not environment connections", () => {
  assert.deepEqual([...connectedCredentialIntegrationIDs([
    { id: "oauth-provider", connections: [{ type: "credential", status: undefined }] },
    { id: "needs-auth", connections: [{ type: "credential", status: { status: "needs_auth" } }] },
    { id: "environment-provider", connections: [{ type: "env", name: "MODEL_TOKEN", status: undefined }] },
    { id: "no-connection", connections: [] },
  ])], ["oauth-provider"])
  assert.throws(() => connectedCredentialIntegrationIDs(null), /inventory must be an array/u)
})

test("receipt acceptance requires a successful native session and the expected snapshot heading", () => {
  const model = { providerID: "local", id: "fixture-model", variant: null }
  const registeredTools = EXPECTED_BROWSER_TOOLS.map((name) => ({
    id: `web_${name}`, namespace: "web", codemode: true,
  }))
  const calls = ["open", "snapshot", "close"].map((name, index) => ({
    name, outcome: "result", inputJsonUtf8Bytes: 0, resultContentJsonUtf8Bytes: 0,
    backendMethods: [], toolExecuteWallMs: 1, startedAtMs: index, finishedAtMs: index + 1,
    snapshotHeadingObserved: name === "snapshot" ? true : null,
  }))
  const codeModeVisibleTools = ["execute"]
  const exposureRegistrations = registeredTools.map((tool) => ({ name: tool.id.slice("web_".length), namespace: tool.namespace }))
  const codeModeExposure = verifyDispatchExposure({ directTools: false, registeredTools: exposureRegistrations, visibleTools: codeModeVisibleTools })
  const receipt = {
    schemaVersion: 1, directTools: false, scenario: "normal", variantPolicy: "exact",
    expectedModel: model, projectID: PROJECT_ID, directory: DIRECTORY,
    registeredTools,
    permissionChecks: calls.length,
    dispatches: [{
      sessionID: SESSION_ID, model, visibleTools: codeModeVisibleTools, exposure: codeModeExposure,
    }],
    sessionIdle: true, promptToIdleMs: 20, failureToRecoveryMs: null,
    cleanup: { ok: true, managerSessionsRemaining: 0 }, violations: [],
    calls,
    session: {
      id: SESSION_ID, projectID: PROJECT_ID, location: { directory: DIRECTORY }, model,
      tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } }, cost: 0,
      time: { created: 1, updated: 2, idle: 3 }, outcome: "succeeded",
    },
  }
  const options = {
    directTools: false, scenario: "normal", sessionID: SESSION_ID,
    model: { ref: model }, variantPolicy: "exact", workspace: DIRECTORY,
  }

  const codeModeSummary = summarizeReceipt(receipt, options)
  assert.equal(codeModeSummary.status, "observed")
  assert.equal(codeModeSummary.codeModeExecutorVisible, true)
  const directVisibleTools = EXPECTED_BROWSER_TOOLS.map((name) => `web_${name}`).sort()
  const directRegisteredTools = registeredTools.map((tool) => ({ ...tool, codemode: false }))
  const directExposure = verifyDispatchExposure({ directTools: true, registeredTools: exposureRegistrations, visibleTools: directVisibleTools })
  const directReceipt = {
    ...receipt,
    directTools: true,
    registeredTools: directRegisteredTools,
    dispatches: [{ sessionID: SESSION_ID, model, visibleTools: directVisibleTools, exposure: directExposure }],
  }
  const directOptions = { ...options, directTools: true }
  const directSummary = summarizeReceipt(directReceipt, directOptions)
  assert.equal(directSummary.status, "observed")
  assert.equal(directSummary.codeModeExecutorVisible, false)
  const leakedDirectTools = ["execute", ...directVisibleTools]
  const leakedDirectReceipt = {
    ...directReceipt,
    dispatches: [{
      ...directReceipt.dispatches[0],
      visibleTools: leakedDirectTools,
      exposure: verifyDispatchExposure({ directTools: true, registeredTools: exposureRegistrations, visibleTools: leakedDirectTools }),
    }],
  }
  assert.throws(() => summarizeReceipt(leakedDirectReceipt, directOptions), /model-dispatch context/u)
  const forgedExecutorReceipt = {
    ...directReceipt,
    dispatches: [{ ...directReceipt.dispatches[0], exposure: { ...directExposure, codeModeExecutorVisible: true } }],
  }
  assert.throws(() => summarizeReceipt(forgedExecutorReceipt, directOptions), /model-dispatch context/u)
  assert.throws(() => summarizeReceipt({ ...receipt, session: { ...receipt.session, outcome: "failed" } }, options), /idle exact private session/u)
  assert.throws(() => summarizeReceipt({ ...receipt, permissionChecks: 0 }, options), /policy checks/u)
  const invalidClock = { ...receipt, calls: calls.map((call, index) => index === 0 ? { ...call, startedAtMs: -1 } : call) }
  assert.throws(() => summarizeReceipt(invalidClock, options), /monotonic timing evidence/u)
  const missingHeading = { ...receipt, calls: calls.map((call) => call.name === "snapshot" ? { ...call, snapshotHeadingObserved: false } : call) }
  assert.throws(() => summarizeReceipt(missingHeading, options), /expected synthetic fixture heading/u)
})

test("dispatch evidence distinguishes actual Code Mode and direct browser-tool exposure", () => {
  const registeredTools = EXPECTED_BROWSER_TOOLS.map((name) => ({ name, namespace: "web" }))
  const codeMode = verifyDispatchExposure({ directTools: false, registeredTools, visibleTools: ["execute"] })
  assert.equal(codeMode.complete, true)
  assert.equal(codeMode.codeModeExecutorVisible, true)
  assert.deepEqual(codeMode.modelVisibleBrowserTools, [])

  const directVisibleTools = EXPECTED_BROWSER_TOOLS.map((name) => `web_${name}`)
  const direct = verifyDispatchExposure({
    directTools: true,
    registeredTools,
    visibleTools: directVisibleTools,
  })
  assert.equal(direct.complete, true)
  assert.equal(direct.codeModeExecutorVisible, false)
  assert.equal(direct.modelVisibleBrowserTools.length, EXPECTED_BROWSER_TOOLS.length)
  assert.equal(verifyDispatchExposure({ directTools: true, registeredTools, visibleTools: ["execute", ...directVisibleTools] }).complete, false)
  assert.equal(verifyDispatchExposure({ directTools: false, registeredTools, visibleTools: ["execute", ...directVisibleTools] }).complete, false)
  assert.equal(verifyDispatchExposure({ directTools: true, registeredTools, visibleTools: ["execute"] }).complete, false)
  assert.equal(verifyDispatchExposure({ directTools: false, registeredTools: registeredTools.slice(1), visibleTools: ["execute"] }).complete, false)
  assert.equal(verifyDispatchExposure({ directTools: false, registeredTools, visibleTools: [] }).complete, false)
  assert.equal(verifyDispatchExposure({ directTools: false, registeredTools, visibleTools: ["execute", "shell"] }).complete, false)
})

test("model-dispatch attestation is a hard session/model/exposure/dispatch-count boundary", () => {
  const registeredTools = EXPECTED_BROWSER_TOOLS.map((name) => ({ name, namespace: "web" }))
  const expectedModel = { providerID: "local", id: "fixture-model", variant: null }
  const visibleTools = ["execute"]
  const dispatches = []
  const event = { sessionID: SESSION_ID, model: expectedModel, tools: Object.fromEntries(visibleTools.map((name) => [name, {}])) }

  const attested = attestModelDispatch({
    directTools: false, registeredTools, event, expectedSessionID: SESSION_ID, expectedModel, dispatches,
  })
  assert.equal(attested.exposure.complete, true)
  assert.equal(dispatches.length, 1)
  assert.throws(() => attestModelDispatch({
    directTools: false, registeredTools, event: { ...event, sessionID: "ses_other" },
    expectedSessionID: SESSION_ID, expectedModel, dispatches,
  }), /session did not match/u)
  assert.throws(() => attestModelDispatch({
    directTools: false, registeredTools, event: { ...event, model: { ...expectedModel, id: "other" } },
    expectedSessionID: SESSION_ID, expectedModel, dispatches,
  }), /exact selected model/u)
  const nativeDefaultDispatches = []
  const nativeVariant = { ...event, model: { ...expectedModel, variant: "provider-default" } }
  assert.equal(attestModelDispatch({
    directTools: false, registeredTools, event: nativeVariant,
    expectedSessionID: SESSION_ID, expectedModel, variantPolicy: "native-default", dispatches: nativeDefaultDispatches,
  }).model.variant, "provider-default")
  assert.throws(() => attestModelDispatch({
    directTools: false, registeredTools, event, expectedSessionID: SESSION_ID,
    expectedModel, variantPolicy: "invalid", dispatches: [],
  }), /exact selected model/u)
  assert.throws(() => attestModelDispatch({
    directTools: false, registeredTools, event: { ...event, tools: { execute: {}, shell: {} } },
    expectedSessionID: SESSION_ID, expectedModel, dispatches,
  }), /outside the benchmark allowlist/u)
  const saturated = Array.from({ length: BENCHMARK_LIMITS.maxDispatches }, () => ({}))
  assert.throws(() => attestModelDispatch({
    directTools: false, registeredTools, event, expectedSessionID: SESSION_ID, expectedModel, dispatches: saturated,
  }), /hard limit/u)
  assert.equal(saturated.length, BENCHMARK_LIMITS.maxDispatches)
})

test("model selection requires an exact enabled tool-capable catalog entry and variant", () => {
  const catalog = [{
    providerID: "openai",
    id: "model-x",
    enabled: true,
    capabilities: { tools: true },
    settings: { reasoningEffort: "medium" },
    variants: [{ id: "high", settings: { reasoningEffort: "high" } }],
  }]

  assert.deepEqual(selectModel(catalog, null, parseModelReference("openai/model-x#high")), {
    ref: { providerID: "openai", id: "model-x", variant: "high" },
    effort: "high",
    source: "explicit-native-catalog-match",
  })
  assert.equal(selectModel(catalog, { providerID: "openai", id: "model-x" }).source, "native-default-model-discovery")
  assert.throws(() => selectModel([], null), (error) => error instanceof BenchmarkBlockedError && error.code === "NO_DEFAULT_MODEL")
  assert.throws(() => selectModel([{ ...catalog[0], enabled: false }], null, catalog[0]), /absent, disabled/u)
  assert.throws(() => selectModel([{ ...catalog[0], capabilities: { tools: false } }], null, catalog[0]), /tool support/u)
  assert.throws(() => selectModel(catalog, null, { ...catalog[0], variant: "missing" }), /variant/u)
})

test("bounded JSON reader enforces HTTP status and streaming byte limits", async () => {
  await assert.rejects(readBoundedJson(new Response("{}", { status: 503 })), /HTTP 503/u)
  const oversized = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("1234"))
      controller.enqueue(new TextEncoder().encode("5678"))
      controller.close()
    },
  }))
  await assert.rejects(readBoundedJson(oversized, 6), /exceeds the byte limit/u)
  assert.deepEqual(await readBoundedJson(new Response(JSON.stringify({ data: [1] }))), { data: [1] })
})

test("bounded child probes wait for process exit after output-limit and timeout termination", async () => {
  const options = { cwd: process.cwd(), env: { PATH: "/usr/bin:/bin" }, timeoutMs: 2_000, maxBytes: 4 }
  await assert.rejects(runBounded(process.execPath, ["-e", 'process.stdout.write("12345")'], options),
    (error) => error instanceof BenchmarkBlockedError && error.code === "PREFLIGHT_OUTPUT_LIMIT")

  const started = performance.now()
  await assert.rejects(runBounded(process.execPath, [
    "-e", 'process.stdout.write("ready"); process.on("SIGTERM", () => setTimeout(() => process.exit(0), 150)); setInterval(() => {}, 1000)',
  ], { ...options, timeoutMs: 1_000, maxBytes: 64 }),
  (error) => error instanceof BenchmarkBlockedError && error.code === "PREFLIGHT_TIMEOUT")
  assert.ok(performance.now() - started >= 1_100, "timeout rejection must wait until the child has exited")
})

test("synthetic fixture is loopback-only and recovers after one deterministic connection reset", async (t) => {
  const normal = await startBenchmarkFixture("normal")
  t.after(() => normal.close())
  const recoverable = await startBenchmarkFixture("recoverable")
  t.after(() => recoverable.close())

  assert.match(normal.url, /^http:\/\/127\.0\.0\.1:[0-9]+\/normal$/u)
  const normalResponse = await fetch(normal.url)
  assert.equal(normalResponse.status, 200)
  assert.match(await normalResponse.text(), /Benchmark normal fixture/u)

  assert.match(recoverable.url, /^http:\/\/127\.0\.0\.1:[0-9]+\/recoverable$/u)
  await assert.rejects(fetch(recoverable.url))
  const recoveredResponse = await fetch(recoverable.url)
  assert.equal(recoveredResponse.status, 200)
  assert.match(await recoveredResponse.text(), /Benchmark recoverable fixture/u)
  assert.equal((await fetch(`${normal.url}?external`)).status, 404)
  await assert.rejects(startBenchmarkFixture("external"), /scenario must be normal or recoverable/u)
})

function sessionRecord(overrides = {}) {
  return {
    id: SESSION_ID,
    projectID: PROJECT_ID,
    location: { directory: DIRECTORY },
    model: { providerID: "openai", id: "model-x", variant: "high" },
    tokens: { input: 100, output: 40, reasoning: 12, cache: { read: 20, write: 3 } },
    cost: 0.12,
    time: { created: 1000, updated: 4000, idle: 4500 },
    outcome: "succeeded",
    ...overrides,
  }
}

function apiResponse(data, extra = {}) {
  return new Response(JSON.stringify({ data, ...extra }), { status: 200 })
}

test("session evidence validates exact identity before messages and returns bounded aggregates only", async () => {
  const requests = []
  const messages = [
    { id: "msg_user", type: "user", text: "synthetic prompt text must not appear" },
    {
      id: "msg_assistant", type: "assistant",
      model: { providerID: "openai", id: "model-x", variant: "high" },
      tokens: { input: 100, output: 40, reasoning: 12, cache: { read: 20, write: 3 } },
      cost: 0.12,
      content: [{ type: "tool", name: "web_open", state: { status: "completed", input: { private: "omit this input" } } }],
    },
  ]
  const evidence = await collectPrivateSessionEvidence({
    baseUrl: "http://127.0.0.1:4321",
    sessionID: SESSION_ID,
      expectedDirectory: DIRECTORY,
      expectedProjectID: PROJECT_ID,
      pageSize: 1,
      fetchImpl: async (url, init) => {
        assert.equal(init.redirect, "error")
        assert.ok(init.signal instanceof AbortSignal)
        const path = new URL(url).pathname + new URL(url).search
      requests.push(path)
      if (path === `/api/session/${SESSION_ID}`) return apiResponse(sessionRecord())
      if (path === `/api/session/${SESSION_ID}/message?limit=1&order=asc`) {
        return apiResponse([messages[0]], { cursor: { next: "next-page" } })
      }
      if (path === `/api/session/${SESSION_ID}/message?limit=1&cursor=next-page`) {
        return apiResponse([messages[1]], { cursor: { next: null } })
      }
      assert.fail(`unexpected private API request: ${path}`)
    },
  })

  assert.deepEqual(requests, [
    `/api/session/${SESSION_ID}`,
    `/api/session/${SESSION_ID}/message?limit=1&order=asc`,
    `/api/session/${SESSION_ID}/message?limit=1&cursor=next-page`,
  ])
  assert.equal(evidence.status, "observed")
  assert.equal(evidence.sessionID, SESSION_ID)
  assert.equal(evidence.projectID, PROJECT_ID)
  assert.equal(evidence.directory, DIRECTORY)
  assert.equal(evidence.summary.messageCoverage, "complete")
  assert.equal(evidence.summary.steps, 1)
  assert.deepEqual(evidence.summary.tools, { calls: 1, succeeded: 1, failed: 0, unfinished: 0, byName: { web_open: 1 } })
  assert.equal(evidence.aggregate.sessions, 1)
  assert.equal(evidence.missingCounters.length, 0)
  assert.equal(JSON.stringify(evidence).includes("synthetic prompt text"), false)
  assert.equal(JSON.stringify(evidence).includes("omit this input"), false)
})

test("session scope mismatch refuses transcript reads and pagination cannot imply completeness", async () => {
  const wrongScopeRequests = []
  await assert.rejects(collectPrivateSessionEvidence({
    baseUrl: "http://127.0.0.1:4321", sessionID: SESSION_ID,
    expectedDirectory: DIRECTORY, expectedProjectID: PROJECT_ID,
    fetchImpl: async (url) => {
      wrongScopeRequests.push(url)
      return apiResponse(sessionRecord({ location: { directory: "/another/project" } }))
    },
  }), (error) => error instanceof BenchmarkBlockedError && error.code === "SESSION_SCOPE_MISMATCH")
  assert.equal(wrongScopeRequests.length, 1)
  assert.equal(wrongScopeRequests[0].endsWith(`/api/session/${SESSION_ID}`), true)

  const partial = await collectPrivateSessionEvidence({
    baseUrl: "http://127.0.0.1:4321", sessionID: SESSION_ID,
    expectedDirectory: DIRECTORY, expectedProjectID: PROJECT_ID,
    maxPages: 1,
    fetchImpl: async (url) => new URL(url).pathname === `/api/session/${SESSION_ID}`
      ? apiResponse(sessionRecord())
      : apiResponse([], { cursor: { next: "more" } }),
  })
  assert.equal(partial.status, "incomplete")
  assert.equal(partial.summary.messageCoverage, "partial")
  assert.equal(partial.aggregate.steps, null)
})

test("session collector rejects invalid scope, repeated cursors, and excessive limits", async () => {
  const noReads = async () => assert.fail("invalid options must fail before the API is called")
  await assert.rejects(collectPrivateSessionEvidence({ baseUrl: "http://localhost:4321", fetchImpl: noReads }), TypeError)
  await assert.rejects(collectPrivateSessionEvidence({ baseUrl: "http://127.0.0.1:70000", fetchImpl: noReads }), TypeError)
  await assert.rejects(collectPrivateSessionEvidence({
    baseUrl: "http://127.0.0.1:4321", sessionID: "ses_bad/path",
    expectedDirectory: DIRECTORY, expectedProjectID: PROJECT_ID, fetchImpl: noReads,
  }), TypeError)
  await assert.rejects(collectPrivateSessionEvidence({
    baseUrl: "http://127.0.0.1:4321", sessionID: SESSION_ID,
    expectedDirectory: DIRECTORY, expectedProjectID: PROJECT_ID,
    pageSize: 51, fetchImpl: noReads,
  }), TypeError)
  await assert.rejects(collectPrivateSessionEvidence({
    baseUrl: "http://127.0.0.1:4321", sessionID: SESSION_ID,
    expectedDirectory: DIRECTORY, expectedProjectID: PROJECT_ID,
    maxBytes: 16 * 1024 * 1024 + 1, fetchImpl: noReads,
  }), TypeError)
  await assert.rejects(collectPrivateSessionEvidence({
    baseUrl: "http://127.0.0.1:4321", sessionID: SESSION_ID,
    expectedDirectory: DIRECTORY, expectedProjectID: PROJECT_ID, maxTotalBytes: 100,
    fetchImpl: async () => apiResponse(sessionRecord()),
  }), /total response byte budget/u)

  let messageReads = 0
  await assert.rejects(collectPrivateSessionEvidence({
    baseUrl: "http://127.0.0.1:4321", sessionID: SESSION_ID,
    expectedDirectory: DIRECTORY, expectedProjectID: PROJECT_ID,
    fetchImpl: async (url) => {
      if (new URL(url).pathname === `/api/session/${SESSION_ID}`) return apiResponse(sessionRecord())
      messageReads += 1
      return apiResponse([], { cursor: { next: "repeated" } })
    },
  }), /repeated a cursor/u)
  assert.equal(messageReads, 2)
})

test("scratch-parent validation protects the full ancestor chain and accepts only approved roots", async () => {
  const uid = process.getuid()
  const directory = (mode, owner = uid) => ({
    mode: 0o40000 | mode, uid: owner, dev: 1, ino: mode,
    isDirectory: () => true,
    isSymbolicLink: () => false,
  })
  const entries = new Map([
    ["/", directory(0o755, 0)],
    ["/approved", directory(0o750)],
    ["/approved/scratch", directory(0o700)],
  ])
  const lstatImpl = async (path) => {
    const value = entries.get(path)
    if (!value) throw Object.assign(new Error("not found"), { code: "ENOENT" })
    return value
  }
  const valid = await validateScratchParent("/approved/scratch", {
    approvedRoots: ["/approved"], lstatImpl, realpathImpl: async (path) => path,
  })
  assert.equal(valid.path, "/approved/scratch")
  assert.equal(valid.uid, uid)

  entries.set("/approved", directory(0o775))
  await assert.rejects(validateScratchParent("/approved/scratch", {
    approvedRoots: ["/approved"], lstatImpl, realpathImpl: async (path) => path,
  }), (error) => error instanceof BenchmarkBlockedError && error.code === "SCRATCH_ANCESTOR_UNSAFE")
  await assert.rejects(validateScratchParent("/unapproved/scratch", {
    approvedRoots: ["/approved"], lstatImpl, realpathImpl: async (path) => path,
  }), (error) => error instanceof BenchmarkBlockedError && error.code === "SCRATCH_PARENT_UNAPPROVED")
})

test("createOwnedRunRoot refuses an unsafe owned leaf without creating a run root", { timeout: 10_000 }, async (t) => {
  const fixtureRoot = await mkdtemp(join(SCRATCH_ROOT, "benchmark-guard-fixture-"))
  t.after(async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
  })
  const leaf = join(fixtureRoot, "unsafe-leaf")
  await mkdir(leaf, 0o700)
  // The leaf mode is set explicitly so the case does not depend on the shared
  // scratch root's mode or on this process's umask.
  await chmod(leaf, 0o770)
  const leafBefore = await lstat(leaf)
  const entriesBefore = await readdir(leaf)
  const sharedBefore = await lstat(SCRATCH_ROOT)

  await assert.rejects(createOwnedRunRoot({ scratchParent: leaf }), (error) =>
    error instanceof BenchmarkBlockedError && error.code === "SCRATCH_PARENT_UNSAFE")

  const leafAfter = await lstat(leaf)
  assert.deepEqual(entriesBefore, [])
  assert.deepEqual(await readdir(leaf), entriesBefore)
  assert.equal(leafAfter.ino, leafBefore.ino)
  assert.equal(leafAfter.mode, leafBefore.mode)
  const sharedAfter = await lstat(SCRATCH_ROOT)
  assert.equal(sharedAfter.ino, sharedBefore.ino)
  assert.equal(sharedAfter.mode, sharedBefore.mode)
})

test("system-config preflight check distinguishes absence, presence, and inspection failures", async () => {
  let checkedPath = null
  await assert.rejects(verifySystemConfigAbsent(async (path) => {
    checkedPath = path
    return { isDirectory: () => true }
  }), (error) => error instanceof BenchmarkBlockedError && error.code === "SYSTEM_CONFIG_PRESENT")
  assert.equal(checkedPath, "/etc/opencode")
  assert.equal(await verifySystemConfigAbsent(async () => {
    throw Object.assign(new Error("absent"), { code: "ENOENT" })
  }), "absent")
  await assert.rejects(verifySystemConfigAbsent(async () => {
    throw Object.assign(new Error("cannot inspect"), { code: "EACCES" })
  }), { code: "EACCES" })
})

test("private provider readiness failure cleans its catalog root before any model or browser dispatch", async () => {
  const root = {
    runRoot: `/tmp/opencode/${RUN_PREFIX}provider-gate`,
    runID: "provider-gate-run",
    ownership: Object.freeze({ runID: "provider-gate-run" }),
  }
  const commands = []
  let cleaned = false
  let fixtureStarted = false
  let browserReadinessChecked = false
  const workspace = join(root.runRoot, "workspace")
  const paths = {
    home: join(root.runRoot, "home"), data: join(root.runRoot, "data", "opencode"), config: join(root.runRoot, "config"),
    state: join(root.runRoot, "state", "opencode"), cache: join(root.runRoot, "cache", "opencode"),
    tmp: join(root.runRoot, "tmp", "opencode"), db: join(root.runRoot, "data", "opencode", "opencode.db"),
    log: join(root.runRoot, "data", "opencode", "log"), repos: join(root.runRoot, "data", "opencode", "repos"),
    bin: join(root.runRoot, "data", "opencode", "bin"),
  }
  const model = { providerID: "openai", id: "private-model", variant: null }
  const io = {
    async preflight() { return { status: "preflight-verified", isolation: { verified: true } } },
    async browserReadiness() { browserReadinessChecked = true; throw new Error("provider readiness must be verified first") },
    async createRunRoot() { return root },
    async cleanupRunRoot() { cleaned = true },
    async stageRuntime() { return { workspace, pluginDirectory: join(workspace, "plugin") } },
    async writeConfig() {},
    async startFixture() { fixtureStarted = true; throw new Error("fixture must stay stopped") },
    async readJson() {
      return {
        directory: workspace,
        defaultModel: model,
        models: [{ ...model, enabled: true, capabilities: { tools: true }, variants: [] }],
        providers: [{ id: "openai", activation: "enabled", authReady: false }],
      }
    },
    async runCommand(_binary, args) {
      commands.push(args)
      if (args[0] === "debug") return Object.entries(paths).map(([key, value]) => `${key} ${value}`).join("\n")
      if (args[0] === "models") return "openai/private-model\n"
      assert.fail("model dispatch must not start before provider readiness")
    },
  }
  await assert.rejects(runNativeBenchmark({
    binary: "/opt/opencode", scratchParent: SCRATCH_ROOT, model: null,
    pairs: 2, timeoutMs: 30_000, maxBytes: 1_048_576,
  }, io), (error) => error instanceof BenchmarkBlockedError && error.code === "PRIVATE_PROVIDER_NOT_READY")
  assert.equal(cleaned, true)
  assert.equal(fixtureStarted, false)
  assert.equal(browserReadinessChecked, false)
  assert.equal(commands.some((args) => args[0] === "run"), false)
})

test("production runtime staging copies the required source and confines dependency links", async (t) => {
  const runRoot = await mkdtemp(join(SCRATCH_ROOT, `${RUN_PREFIX}staging-`))
  const dependencyRoot = await mkdtemp(join(SCRATCH_ROOT, `${RUN_PREFIX}dependencies-`))
  t.after(() => rm(runRoot, { recursive: true, force: true }))
  t.after(() => rm(dependencyRoot, { recursive: true, force: true }))
  const sdkPath = join(dependencyRoot, "sdk")
  const playwrightPath = join(dependencyRoot, "playwright")
  await mkdir(sdkPath)
  await mkdir(playwrightPath)
  await mkdir(join(runRoot, "workspace"), { mode: 0o700 })

  const staged = await stageProductionRuntime(runRoot, async () => ({
    repositoryRoot: REPOSITORY_ROOT,
    sdkPath,
    playwrightPath,
  }))
  assert.equal(staged.workspace, join(runRoot, "workspace"))
  assert.ok(staged.stagedFiles > 0)
  assert.ok(staged.stagedBytes > 0)
  for (const path of [
    "vendor/.opencode/plugins/computer-use/index.ts",
    "vendor/tools/computer-use-runtime/src/index.ts",
    "vendor/tools/computer-use-browser/src/index.ts",
    "vendor/tools/computer-use-browser/benchmark-runtime/index.ts",
    "vendor/tools/computer-use-browser/benchmark-runtime/options.ts",
    "vendor/tools/computer-use-browser/benchmark-runtime/receipt.ts",
  ]) {
    const info = await lstat(join(staged.workspace, path))
    assert.ok(info.isFile(), `${path} must be copied into the private workspace`)
  }
  const stagedReceiptModule = join(staged.pluginDirectory, "receipt.ts")
  assert.equal(await readFile(stagedReceiptModule, "utf8"),
    await readFile(join(REPOSITORY_ROOT, "tools/computer-use-browser/benchmark-runtime/receipt.ts"), "utf8"))
  const { createReceiptWriter: stagedWriter } = await import(pathToFileURL(stagedReceiptModule).href)
  const receiptPath = join(runRoot, "staged-receipt.json")
  const receiptFile = await open(receiptPath, "wx", 0o600)
  try {
    await stagedWriter(receiptFile)({ source: "staged-production-helper" })
    assert.deepEqual(JSON.parse(await readFile(receiptPath, "utf8")), { source: "staged-production-helper" })
  } finally {
    await receiptFile.close()
  }
  for (const [path, expectedTarget] of [
    ["vendor/node_modules/@opencode/plugin", sdkPath],
    ["vendor/tools/computer-use-browser/node_modules/playwright-core", playwrightPath],
  ]) {
    const info = await lstat(join(staged.workspace, path))
    assert.ok(info.isSymbolicLink(), `${path} must link to the already installed dependency`)
    assert.equal(await realpath(join(staged.workspace, path)), expectedTarget)
  }
})

test("source staging refuses to copy a file replaced after its source identity was checked", async (t) => {
  const root = await mkdtemp(join(SCRATCH_ROOT, `${RUN_PREFIX}source-race-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourceRoot = join(root, "source")
  await mkdir(sourceRoot, { recursive: true })
  const source = join(sourceRoot, "module.ts")
  const original = join(sourceRoot, "original.ts")
  const destination = join(root, "staged.ts")
  await writeFile(source, "approved source")
  const expectedInfo = await lstat(source)
  await rename(source, original)
  await writeFile(source, "replacement source")

  await assert.rejects(copySourceFileForStaging(source, destination, expectedInfo, sourceRoot, root),
    (error) => error instanceof BenchmarkBlockedError && error.code === "SOURCE_FILE_CHANGED")
  assert.equal(await readFile(source, "utf8"), "replacement source")
  await assert.rejects(lstat(destination), { code: "ENOENT" })
})

test("source staging bounds bytes acquired from a file growing after descriptor inspection", async t => {
  const root = await mkdtemp(join(SCRATCH_ROOT, `${RUN_PREFIX}source-growth-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourceRoot = join(root, "source")
  await mkdir(sourceRoot, { mode: 0o700 })
  const source = join(sourceRoot, "module.ts"), destination = join(root, "staged.ts")
  await writeFile(source, "approved source")
  const expectedInfo = await lstat(source)
  const handle = await open(source, "r"), prototype = Object.getPrototypeOf(handle)
  await handle.close()
  const stat = prototype.stat, read = prototype.read, readAll = prototype.readFile
  let grew = false, acquiredBytes = 0
  t.mock.method(prototype, "stat", async function (...args) {
    const info = await stat.apply(this, args)
    if (!grew) {
      grew = true
      await appendFile(source, Buffer.alloc(3 * 1024 * 1024, 0x20))
    }
    return info
  })
  t.mock.method(prototype, "read", async function (...args) {
    const result = await read.apply(this, args)
    acquiredBytes += result.bytesRead
    return result
  })
  t.mock.method(prototype, "readFile", async function (...args) {
    const result = await readAll.apply(this, args)
    acquiredBytes += result.length
    return result
  })
  await assert.rejects(copySourceFileForStaging(source, destination, expectedInfo, sourceRoot, root),
    error => error instanceof BenchmarkBlockedError && error.code === "SOURCE_FILE_CHANGED")
  assert.equal(grew, true)
  assert.ok(acquiredBytes <= 2 * 1024 * 1024 + 1, `acquired ${acquiredBytes} bytes before refusal`)
  await assert.rejects(lstat(destination), { code: "ENOENT" })
})

test("source staging refuses a pre-existing symlinked workspace without writing through it", async (t) => {
  const runRoot = await mkdtemp(join(SCRATCH_ROOT, `${RUN_PREFIX}workspace-symlink-`))
  const outside = await mkdtemp(join(SCRATCH_ROOT, `${RUN_PREFIX}workspace-target-`))
  t.after(() => rm(runRoot, { recursive: true, force: true }))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const sentinel = join(outside, "preserve.txt")
  await writeFile(sentinel, "do not overwrite")
  await symlink(outside, join(runRoot, "workspace"), "dir")

  await assert.rejects(stageProductionRuntime(runRoot),
    (error) => error instanceof BenchmarkBlockedError && error.code === "STAGING_PATH_UNSAFE")
  assert.equal(await readFile(sentinel, "utf8"), "do not overwrite")
})

test("ownership verification and cleanup refuse unbound markers under an unsafe ancestor", { timeout: 10_000 }, async (t) => {
  const runID = "test-run-owner-1"
  const fixtureRoot = await mkdtemp(join(SCRATCH_ROOT, "benchmark-owner-fixture-"))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const scratchParent = join(fixtureRoot, "private-parent")
  await mkdir(scratchParent, 0o700)
  // Refuse a task-owned unsafe ancestor regardless of the host scratch mode.
  await chmod(fixtureRoot, 0o770)
  const sharedBefore = await lstat(SCRATCH_ROOT)
  const runRoot = await mkdtemp(join(scratchParent, `${RUN_PREFIX}test-`))
  const info = await lstat(runRoot)
  await writeFile(join(runRoot, ".model-benchmark-owner.json"), `${JSON.stringify({
    kind: OWNER_KIND, version: 2, runID, pid: process.pid, uid: info.uid,
    parentPath: scratchParent, parentDev: 0, parentIno: 0, rootDev: info.dev, rootIno: info.ino,
  })}\n`, { mode: 0o600 })
  const sentinel = join(runRoot, "keep.txt")
  await writeFile(sentinel, "not authorized for cleanup")

  await assert.rejects(verifyOwnedRunRoot({ runRoot, runID, scratchParent }),
    error => error instanceof BenchmarkBlockedError && error.code === "SCRATCH_ANCESTOR_UNSAFE")
  await assert.rejects(cleanupOwnedRunRoot(runRoot, runID, { ownership: Object.freeze({ runID }) }), /in-process capability/u)
  assert.equal(await readFile(sentinel, "utf8"), "not authorized for cleanup")
  assert.equal((await lstat(runRoot)).ino, info.ino)
  const sharedAfter = await lstat(SCRATCH_ROOT)
  assert.equal(sharedAfter.ino, sharedBefore.ino)
  assert.equal(sharedAfter.mode, sharedBefore.mode)
})

test("native orchestration dispatches paired standalone sessions through an injectable offline boundary", async () => {
  const originalWayland = process.env.WAYLAND_DISPLAY
  const originalRuntime = process.env.XDG_RUNTIME_DIR
  process.env.WAYLAND_DISPLAY = "wayland-test"
  process.env.XDG_RUNTIME_DIR = "/run/user/1000"
  const runRoots = []
  const commands = []
  const configs = new Map()
  const receipts = new Map()
  let nextRoot = 0
  let scenario = "normal"
  let closed = false
  const model = { providerID: "lmstudio", id: "local-coder", variant: "high" }
  const modelInfo = {
    providerID: model.providerID, id: model.id, enabled: true,
    capabilities: { tools: true }, variants: [{ id: "high", settings: { reasoningEffort: "high" } }],
  }
  const io = {
    async preflight() { return { status: "preflight-verified", isolation: { verified: true } } },
    async browserReadiness() { return { status: "headed-browser-ready", compositor: "Wayland", profile: "private", browsersPath: "/private/browsers" } },
    async createRunRoot() {
      const runRoot = `/tmp/opencode/${RUN_PREFIX}fake-${++nextRoot}`
      const root = { runRoot, runID: `run-${nextRoot}`, ownership: Object.freeze({ runID: `run-${nextRoot}` }) }
      runRoots.push(root)
      return root
    },
    async cleanupRunRoot(runRoot) { assert.ok(runRoots.some((root) => root.runRoot === runRoot)) },
    async stageRuntime(runRoot) {
      return { workspace: join(runRoot, "workspace"), pluginDirectory: join(runRoot, "workspace", "plugin") }
    },
    async writeConfig(workspace, _pluginDirectory, pluginOptions, directTools = false) {
      configs.set(workspace, { ...pluginOptions, directTools })
    },
    async startFixture() {
      return {
        url: "http://127.0.0.1:43210/normal",
        setScenario(value) { scenario = value },
        urlFor(value) { return `http://127.0.0.1:43210/${value}` },
        async close() { closed = true },
      }
    },
    async readJson(path) { return receipts.get(path) },
    async runCommand(_binary, args, settings) {
      commands.push({ args: [...args], cwd: settings.cwd, env: settings.env, allowNonZero: settings.allowNonZero })
      if (args[0] === "debug" && args[1] === "paths") {
        const root = dirname(settings.cwd)
        const paths = {
          home: join(root, "home"), data: join(root, "data", "opencode"), config: join(root, "config"),
          state: join(root, "state", "opencode"), cache: join(root, "cache", "opencode"),
          tmp: join(root, "tmp", "opencode"), db: join(root, "data", "opencode", "opencode.db"),
          log: join(root, "data", "opencode", "log"), repos: join(root, "data", "opencode", "repos"),
          bin: join(root, "data", "opencode", "bin"),
        }
        return Object.entries(paths).map(([key, value]) => `${key} ${value}`).join("\n")
      }
      if (args[0] === "models") return "lmstudio/local-coder#high\n"
      if (args[0] === "run") {
        const sessionID = args[args.indexOf("--session") + 1]
        const config = configs.get(settings.cwd)
        const names = config.directTools ? EXPECTED_BROWSER_TOOLS : []
        const registeredTools = EXPECTED_BROWSER_TOOLS.map((name) => ({ id: `web_${name}`, namespace: "web", codemode: !config.directTools }))
        const visibleTools = (config.directTools ? names.map((name) => `web_${name}`) : ["execute"]).sort()
        const exposure = verifyDispatchExposure({
          directTools: config.directTools,
          registeredTools: registeredTools.map((tool) => ({ name: tool.id.slice(4), namespace: tool.namespace })),
          visibleTools,
        })
        const calls = scenario === "normal"
          ? ["open", "snapshot", "close"].map((name) => ({
              name, outcome: "result", inputJsonUtf8Bytes: 0, resultContentJsonUtf8Bytes: 0,
              toolExecuteWallMs: 1, startedAtMs: 1, finishedAtMs: 2,
              snapshotHeadingObserved: name === "snapshot" ? true : null, backendMethods: [],
            }))
          : [
              { name: "open", outcome: "browser-error", inputJsonUtf8Bytes: 0, resultContentJsonUtf8Bytes: 0, toolExecuteWallMs: 1, startedAtMs: 1, finishedAtMs: 2, backendMethods: [] },
              { name: "open", outcome: "result", inputJsonUtf8Bytes: 0, resultContentJsonUtf8Bytes: 0, toolExecuteWallMs: 1, startedAtMs: 3, finishedAtMs: 4, backendMethods: [] },
               { name: "snapshot", outcome: "result", inputJsonUtf8Bytes: 0, resultContentJsonUtf8Bytes: 0, toolExecuteWallMs: 1, startedAtMs: 5, finishedAtMs: 6, snapshotHeadingObserved: true, backendMethods: [] },
              { name: "close", outcome: "result", inputJsonUtf8Bytes: 0, resultContentJsonUtf8Bytes: 0, toolExecuteWallMs: 1, startedAtMs: 7, finishedAtMs: 8, backendMethods: [] },
            ]
        receipts.set(config.receiptPath, {
          schemaVersion: 1, directory: settings.cwd, projectID: "private-project", scenario,
          expectedModel: { providerID: model.providerID, id: model.id, variant: null },
          variantPolicy: "native-default",
          directTools: config.directTools, registeredTools, permissionChecks: calls.length,
          dispatches: [{ sessionID, model, visibleTools, exposure }], calls,
          sessionIdle: true, promptToIdleMs: 20, failureToRecoveryMs: scenario === "recoverable" ? 5 : null,
          session: {
            id: sessionID, projectID: "private-project", location: { directory: settings.cwd }, model,
            tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 2, write: 0 } }, cost: 0.01,
            time: { created: 1, updated: 2, idle: 3 }, outcome: "succeeded",
          },
          cleanup: { managerSessionsRemaining: 0, ok: true }, violations: [],
        })
        return { stdout: "", exitCode: 0, stderrBytes: 0 }
      }
      assert.fail(`unexpected native command: ${args.join(" ")}`)
    },
  }
  const catalogRoot = { runRoot: `/tmp/opencode/${RUN_PREFIX}fake-1` }
  receipts.set(join(catalogRoot.runRoot, "catalog.json"), {
    directory: join(catalogRoot.runRoot, "workspace"),
    defaultModel: model,
    models: [modelInfo],
    providers: [{ id: "lmstudio", activation: "enabled", authReady: true }],
  })
  const originalRunCommand = io.runCommand
  io.runCommand = async (...args) => {
    if (args[1][0] === "models") return originalRunCommand(...args)
    return originalRunCommand(...args)
  }

  try {
    const report = await runNativeBenchmark({
      binary: "/opt/opencode", scratchParent: SCRATCH_ROOT, model: null,
      pairs: 2, timeoutMs: 30_000, maxBytes: 1_048_576,
    }, io)
    assert.equal(report.status, "observed")
    assert.equal(report.conditions.length, 8)
    assert.equal(report.counters.sessions, 8)
    assert.equal(report.comparison.length, 4)
    assert.ok(report.comparison.every((row) => row.deltaDirectToolsMinusCodeMode.tokens.input === 0))
    assert.ok(report.conditions.every((row) => row.codeModeExecutorVisible === !row.directTools))
    assert.ok(report.conditions.filter((row) => row.directTools).every((row) =>
      JSON.stringify(row.visibleTools) === JSON.stringify(EXPECTED_BROWSER_TOOLS.map((name) => `web_${name}`).sort())))
    assert.ok([...configs.values()].some((config) => config.mode === "catalog" && config.directTools === true))
    assert.equal(report.cleanup.catalogRootRemoved, true)
    assert.equal(closed, true)
    assert.deepEqual(report.conditions.filter((row) => row.scenario === "normal").map((row) => row.directTools), [false, true, true, false])
    assert.ok(commands.every(({ args }) => !args.includes("--auto")))
    assert.ok(commands.filter(({ args }) => args[0] === "run").every(({ args }) =>
      args.includes("--standalone") && args.includes("--format") && args.includes("json")))
    assert.ok(commands.every(({ env }) => !Object.hasOwn(env, "OPENAI_API_KEY")))
    assert.ok(commands.filter(({ args }) => args[0] === "run").every(({ env }) => env.PLAYWRIGHT_BROWSERS_PATH === "/private/browsers"))
  } finally {
    if (originalWayland === undefined) delete process.env.WAYLAND_DISPLAY
    else process.env.WAYLAND_DISPLAY = originalWayland
    if (originalRuntime === undefined) delete process.env.XDG_RUNTIME_DIR
    else process.env.XDG_RUNTIME_DIR = originalRuntime
  }
})

test("production browser registration and Code Mode transforms run against a fake plugin editor", () => {
  const makeEditor = () => {
    const byId = new Map()
    return {
      namespace() {},
      add(tool) {
        const id = `${tool.options?.namespace ?? "web"}_${tool.name}`
        if (byId.has(id)) throw new Error(`duplicate test tool: ${id}`)
        byId.set(id, tool)
      },
      list() { return [...byId].map(([id, tool]) => ({ ...tool, id })) },
      update(id, mutate) {
        const current = byId.get(id)
        if (!current) throw new Error(`unknown test tool: ${id}`)
        const draft = { ...current, options: { ...current.options } }
        mutate(draft)
        byId.set(id, draft)
      },
      remove(id) { byId.delete(id) },
    }
  }

  for (const directTools of [false, true]) {
    const editor = makeEditor()
    const registeredIds = new Set()
    const guard = createAuthGuard()
    const serialized = withSerializedTools(editor, "web", {
      queue: createOwnerOperationQueue(), authGuard: guard,
      allowDuringSignIn: new Set(["close"]), registeredIds,
    })
    registerBrowserTools(serialized, {
      assertPermission: async () => {},
      dataDirectory: "/tmp/opencode/model-benchmark-test-data",
      authGuard: guard,
      credentialSafety: createCredentialSafety(),
      createManager: () => { throw new Error("fake editor registration must not launch a browser") },
    })
    applyCodemodeDefault(editor, { directTools, only: registeredIds })

    const tools = editor.list().filter((tool) => registeredIds.has(tool.id))
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [...EXPECTED_BROWSER_TOOLS].sort())
    assert.ok(tools.every((tool) => tool.options.namespace === "web" && tool.options.codemode === !directTools))
    assert.equal(registeredIds.size, EXPECTED_BROWSER_TOOLS.length)
  }
})
