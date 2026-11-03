import { constants } from "node:fs"
import { lstat, mkdir, open, readdir, realpath, symlink } from "node:fs/promises"
import { dirname, isAbsolute, join, relative } from "node:path"
import { randomUUID } from "node:crypto"
import { performance } from "node:perf_hooks"
import { chromium } from "playwright-core"
import { BenchmarkDependencyError, verifyBenchmarkDependencyInstallation } from "../benchmark-dependencies.mjs"

import {
  BenchmarkBlockedError,
  cleanupOwnedRunRoot,
  createOwnedRunRoot,
  makePrivateEnvironment,
  runIsolationPreflight,
  runBounded,
  selectModel,
  verifyDebugPaths,
  parseDebugPaths,
} from "../isolated-model-benchmark.mjs"
import { summarizeSessionUsage } from "../efficiency-acceptance.mjs"
import { BENCHMARK_LIMITS, EXPECTED_BROWSER_TOOLS, makeConditionSchedule, verifyDispatchExposure } from "./contract.mjs"
import { startBenchmarkFixture } from "./fixture.mjs"

const TOKEN_FIELDS = ["input", "output", "reasoning", "cacheRead", "cacheWrite"]
const SOURCE_TREES = [
  [".opencode/plugins/computer-use", "vendor/.opencode/plugins/computer-use"],
  ["tools/computer-use-runtime/src", "vendor/tools/computer-use-runtime/src"],
  ["tools/computer-use-browser/src", "vendor/tools/computer-use-browser/src"],
  ["tools/computer-use-browser/benchmark-runtime", "vendor/tools/computer-use-browser/benchmark-runtime"],
]
const MAX_STAGED_FILES = 512
const MAX_STAGED_BYTES = 32 * 1024 * 1024

function isUnder(root, target) {
  const path = relative(root, target)
  return path === "" || (path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(path))
}

async function copySourceTree(source, destination, counter, repositoryRoot) {
  const sourceInfo = await lstat(source)
  if (sourceInfo.isSymbolicLink()) throw new BenchmarkBlockedError("SOURCE_TREE_SYMLINK", "production benchmark source trees may not contain symlinks")
  if (sourceInfo.isDirectory()) {
    await mkdir(destination, { recursive: true, mode: 0o700 })
    await assertStagingDirectory(counter.workspace, destination)
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name.endsWith(".test.ts")) continue
      await copySourceTree(join(source, entry.name), join(destination, entry.name), counter, repositoryRoot)
    }
    return
  }
  if (!sourceInfo.isFile() || !/\.(?:ts|tsx|js|mjs|json)$/u.test(source) || sourceInfo.size > 2 * 1024 * 1024) return
  counter.files += 1
  counter.bytes += sourceInfo.size
  if (counter.files > MAX_STAGED_FILES || counter.bytes > MAX_STAGED_BYTES) {
    throw new BenchmarkBlockedError("SOURCE_STAGE_LIMIT", "private production-source staging exceeded its file or byte budget")
  }
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
  await assertStagingDirectory(counter.workspace, dirname(destination))
  await copySourceFileForStaging(source, destination, sourceInfo, repositoryRoot, counter.workspace)
}

async function assertPrivateStagingDirectory(path, label) {
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink() ||
      (typeof process.getuid === "function" && info.uid !== process.getuid()) ||
      (info.mode & 0o700) !== 0o700 || (info.mode & 0o077) !== 0 ||
      await realpath(path) !== path) {
    throw new BenchmarkBlockedError("STAGING_PATH_UNSAFE", `${label} must be a canonical private directory owned by this user`)
  }
}

async function assertStagingDirectory(workspace, target) {
  if (!isUnder(workspace, target)) throw new BenchmarkBlockedError("STAGING_PATH_UNSAFE", "staged destination escaped its private workspace")
  let current = workspace
  await assertPrivateStagingDirectory(current, "benchmark workspace")
  for (const part of relative(workspace, target).split(/[\\/]+/u).filter(Boolean)) {
    current = join(current, part)
    await assertPrivateStagingDirectory(current, "staged destination directory")
  }
}

export async function copySourceFileForStaging(source, destination, expectedInfo, repositoryRoot, stagingRoot) {
  const canonical = await realpath(source)
  if (!isUnder(repositoryRoot, canonical)) throw new BenchmarkBlockedError("SOURCE_TREE_ESCAPE", "production source tree escaped the repository")
  const pathInfo = await lstat(source)
  if (pathInfo.isSymbolicLink() || !pathInfo.isFile() || pathInfo.dev !== expectedInfo.dev || pathInfo.ino !== expectedInfo.ino ||
      pathInfo.size !== expectedInfo.size) {
    throw new BenchmarkBlockedError("SOURCE_FILE_CHANGED", "production source changed while it was being staged")
  }
  const sourceHandle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const openedInfo = await sourceHandle.stat()
    if (!openedInfo.isFile() || openedInfo.dev !== expectedInfo.dev || openedInfo.ino !== expectedInfo.ino ||
        openedInfo.size !== expectedInfo.size || openedInfo.size > 2 * 1024 * 1024) {
      throw new BenchmarkBlockedError("SOURCE_FILE_CHANGED", "production source changed while it was being opened")
    }
    const buffer = Buffer.alloc(openedInfo.size + 1)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await sourceHandle.read(buffer, size, Math.min(64 * 1024, buffer.length - size), null)
      if (bytesRead === 0) break
      size += bytesRead
    }
    const finalInfo = await sourceHandle.stat()
    const current = await lstat(source)
    if (size !== expectedInfo.size || ![finalInfo, current].every(info => info.isFile() &&
        ["dev", "ino", "size", "mode", "nlink", "mtimeMs", "ctimeMs"].every(key => info[key] === openedInfo[key]))) {
      throw new BenchmarkBlockedError("SOURCE_FILE_CHANGED", "production source changed while it was being copied")
    }
    await assertStagingDirectory(stagingRoot, dirname(destination))
    const destinationHandle = await open(destination,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600)
    try {
      await destinationHandle.writeFile(buffer.subarray(0, size))
      await destinationHandle.sync()
    } finally {
      await destinationHandle.close()
    }
  } finally {
    await sourceHandle.close()
  }
}

export async function stageProductionRuntime(runRoot, verifyDependencies = verifyBenchmarkDependencyInstallation) {
  if (!isAbsolute(runRoot) || await realpath(runRoot) !== runRoot) {
    throw new BenchmarkBlockedError("STAGING_PATH_UNSAFE", "benchmark run root must be an absolute canonical directory")
  }
  await assertPrivateStagingDirectory(runRoot, "benchmark run root")
  const workspace = join(runRoot, "workspace")
  try {
    await lstat(workspace)
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
    await mkdir(workspace, { mode: 0o700 })
  }
  await assertPrivateStagingDirectory(workspace, "benchmark workspace")
  if ((await readdir(workspace)).length > 0) {
    throw new BenchmarkBlockedError("STAGING_PATH_UNSAFE", "benchmark workspace must be empty before every staged run")
  }
  let dependencies
  try {
    dependencies = await verifyDependencies()
  } catch (error) {
    if (error instanceof BenchmarkDependencyError) throw new BenchmarkBlockedError(error.code, error.message)
    throw error
  }
  const repositoryRoot = dependencies.repositoryRoot
  const vendor = join(workspace, "vendor")
  const counter = { files: 0, bytes: 0, workspace }
  for (const [sourcePath, destinationPath] of SOURCE_TREES) {
    await copySourceTree(join(repositoryRoot, sourcePath), join(workspace, destinationPath), counter, repositoryRoot)
  }
  for (const name of ["efficiency-acceptance.mjs", "isolated-model-benchmark.mjs"]) {
    await copySourceTree(join(repositoryRoot, "tools/computer-use-browser", name),
      join(vendor, "tools/computer-use-browser", name), counter, repositoryRoot)
  }
  const pluginLink = join(vendor, "node_modules", "@opencode", "plugin")
  await mkdir(dirname(pluginLink), { recursive: true, mode: 0o700 })
  await assertStagingDirectory(workspace, dirname(pluginLink))
  await symlink(dependencies.sdkPath, pluginLink, "dir")
  const browserLink = join(vendor, "tools/computer-use-browser/node_modules/playwright-core")
  await mkdir(dirname(browserLink), { recursive: true, mode: 0o700 })
  await assertStagingDirectory(workspace, dirname(browserLink))
  await symlink(dependencies.playwrightPath, browserLink, "dir")
  return {
    workspace,
    pluginDirectory: join(vendor, "tools", "computer-use-browser", "benchmark-runtime"),
    stagedFiles: counter.files,
    stagedBytes: counter.bytes,
  }
}

export async function writePrivateConfig(workspace, pluginDirectory, pluginOptions, directTools) {
  if (typeof directTools !== "boolean") throw new TypeError("directTools must be a boolean")
  if (pluginOptions.directTools !== undefined && pluginOptions.directTools !== directTools) {
    throw new TypeError("private config exposure does not match the benchmark condition")
  }
  const relativePlugin = relative(workspace, pluginDirectory)
  const packagePath = relativePlugin.startsWith(".") ? relativePlugin : `./${relativePlugin}`
  const browserPermissions = [
    { action: "browser_open", resource: `web/url/${encodeURIComponent(pluginOptions.fixtureUrl ?? "")}`, effect: "allow" },
    { action: "browser_read", resource: "web/tab/*", effect: "allow" },
    { action: "browser_close", resource: `web/session/${pluginOptions.expectedSessionID ?? "catalog"}`, effect: "allow" },
  ]
  const codeModePermissions = directTools ? [] : [{ action: "execute", resource: "*", effect: "allow" }]
  const browserPolicies = browserPermissions.map(({ action, resource }) => ({
    action: "tool.use", resource: `${action}:${resource}`, effect: "allow",
  }))
  const config = {
    plugins: [{ package: packagePath, options: pluginOptions }],
    mcp: { servers: {} },
    skills: [],
    instructions: [],
    permissions: [
      { action: "*", resource: "*", effect: "deny" },
      ...browserPermissions,
      ...codeModePermissions,
    ],
    policies: [
      { action: "tool.use", resource: "*", effect: "deny" },
      // Native hard policies match action:resource, not tool registry IDs.
      ...browserPolicies,
      ...(directTools ? [] : [{ action: "tool.use", resource: "execute:*", effect: "allow" }]),
    ],
  }
  const handle = await open(join(workspace, "opencode.json"), "wx", 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`, "utf8")
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function readOwnedJson(path, runRoot, maxBytes = 1_048_576) {
  if (dirname(path) !== runRoot) throw new Error("private benchmark JSON must be a direct child of its run root")
  const before = await lstat(path)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maxBytes || (before.mode & 0o077) !== 0) {
    throw new Error("private benchmark JSON is not a bounded private regular file")
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const after = await handle.stat()
    if (!after.isFile() || after.nlink !== 1 || after.dev !== before.dev || after.ino !== before.ino || after.size > maxBytes) {
      throw new Error("private benchmark JSON changed while it was being opened")
    }
    const buffer = Buffer.alloc(maxBytes + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead > maxBytes) throw new Error("private benchmark JSON exceeds the byte limit")
    return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"))
  } finally {
    await handle.close()
  }
}

async function verifyBrowserReadiness(sourceEnv = process.env) {
  if (!sourceEnv.WAYLAND_DISPLAY || !sourceEnv.XDG_RUNTIME_DIR) {
    throw new BenchmarkBlockedError("VISIBLE_BROWSER_UNAVAILABLE", "production headed browser requires the existing Wayland session; no headless or shared-profile fallback is used")
  }
  const runtimeInfo = await lstat(sourceEnv.XDG_RUNTIME_DIR)
  if (!runtimeInfo.isDirectory() || runtimeInfo.isSymbolicLink() ||
      (typeof process.getuid === "function" && runtimeInfo.uid !== process.getuid()) || (runtimeInfo.mode & 0o077) !== 0) {
    throw new BenchmarkBlockedError("WAYLAND_RUNTIME_UNSAFE", "Wayland runtime directory must be a real private directory owned by this user")
  }
  const executablePath = chromium.executablePath()
  const executableInfo = await lstat(executablePath).catch(() => null)
  const executableCanonical = await realpath(executablePath).catch(() => null)
  if (!executableInfo?.isFile() || executableInfo.isSymbolicLink() || executableCanonical !== executablePath ||
      (executableInfo.mode & 0o111) === 0 || (executableInfo.mode & 0o022) !== 0 ||
      (typeof process.getuid === "function" && executableInfo.uid !== process.getuid())) {
    throw new BenchmarkBlockedError("BROWSER_BINARY_UNAVAILABLE", "the existing Playwright Chromium executable is not installed and executable; no install was attempted")
  }
  const browserVersionDirectory = dirname(dirname(executablePath))
  const browsersPath = dirname(browserVersionDirectory)
  const browsersInfo = await lstat(browsersPath)
  const browsersCanonical = await realpath(browsersPath).catch(() => null)
  if (!browsersInfo.isDirectory() || browsersInfo.isSymbolicLink() || browsersCanonical !== browsersPath ||
      (typeof process.getuid === "function" && browsersInfo.uid !== process.getuid()) || (browsersInfo.mode & 0o022) !== 0) {
    throw new BenchmarkBlockedError("BROWSER_PATH_UNSAFE", "the existing Playwright browser installation root is not a real directory")
  }
  return {
    status: "headed-browser-ready",
    compositor: "Wayland",
    profile: "fresh task-owned OPENCODE_BROWSER_PROFILE_ROOT for every condition",
    executable: "existing Playwright Chromium; path not included in report",
    browsersPath,
  }
}

function makePrompt(scenario, fixtureUrl) {
  const recovery = scenario === "recoverable"
    ? "If the first open reports a Browser error, retry opening this exact same URL once, then continue only after it succeeds."
    : "Open this URL once."
  return [
    "Use only the browser tools available in this session. Do not use shell, filesystem, web search, sign-in, screenshots, or any external URL.",
    `The only permitted page is ${fixtureUrl}. ${recovery}`,
    "Read the page with a text snapshot, then close the benchmark browser session. Report the page heading and whether a retry was needed.",
    "Do not navigate to any other URL, interact with forms, or reveal browser profile or environment information.",
  ].join(" ")
}

export function summarizeReceipt(receipt, { directTools, scenario, sessionID, model, variantPolicy, workspace }) {
  if (!receipt || receipt.schemaVersion !== 1 || receipt.directTools !== directTools || receipt.scenario !== scenario) {
    throw new Error("production benchmark plugin receipt did not match the requested condition")
  }
  if (receipt.variantPolicy !== variantPolicy || receipt.expectedModel?.providerID !== model.ref.providerID ||
      receipt.expectedModel?.id !== model.ref.id ||
      (variantPolicy === "exact" && (receipt.expectedModel?.variant ?? null) !== model.ref.variant)) {
    throw new Error("production benchmark receipt did not preserve the selected model and variant policy")
  }
  const names = receipt.registeredTools?.map((tool) => tool.id?.slice("web_".length)).sort()
  if (JSON.stringify(names) !== JSON.stringify([...EXPECTED_BROWSER_TOOLS].sort()) ||
      receipt.registeredTools.some((tool) => tool.namespace !== "web" || tool.codemode !== !directTools)) {
    throw new Error("production browser registration evidence did not match the selected exposure condition")
  }
  const session = receipt.session
  const dispatchModel = receipt.dispatches?.[0]?.model
  const observedVariant = dispatchModel?.variant ?? null
  if (!session || session.id !== sessionID || session.projectID !== receipt.projectID ||
      receipt.directory !== workspace || session.location?.directory !== workspace || !receipt.sessionIdle ||
      session.model?.providerID !== model.ref.providerID || session.model?.id !== model.ref.id ||
      (session.model?.variant ?? null) !== observedVariant || session.outcome !== "succeeded" ||
      !Number.isFinite(receipt.promptToIdleMs) || receipt.promptToIdleMs < 0 || receipt.cleanup?.ok !== true ||
      receipt.cleanup?.managerSessionsRemaining !== 0 || receipt.violations?.length) {
    throw new Error("plugin did not attest an idle exact private session, bounded exposure, and clean browser shutdown")
  }
  if (!Array.isArray(receipt.dispatches) || receipt.dispatches.length < 1) {
    throw new Error("native model-dispatch context did not attest the exact session, model, variant, and exposed tool set")
  }
  const verifiedExposures = receipt.dispatches.map((dispatch) => verifyDispatchExposure({
    directTools,
    registeredTools: receipt.registeredTools.map((tool) => ({ name: tool.id?.slice("web_".length), namespace: tool.namespace })),
    visibleTools: dispatch.visibleTools,
  }))
  if (receipt.dispatches.some((dispatch, index) => dispatch.sessionID !== sessionID || !dispatch.exposure?.complete ||
        dispatch.model?.providerID !== model.ref.providerID || dispatch.model?.id !== model.ref.id ||
        (variantPolicy === "exact" && (dispatch.model?.variant ?? null) !== model.ref.variant) ||
        (dispatch.model?.variant ?? null) !== observedVariant ||
        !verifiedExposures[index].complete ||
        JSON.stringify(dispatch.exposure) !== JSON.stringify(verifiedExposures[index]))) {
    throw new Error("native model-dispatch context did not attest the exact session, model, variant, and exposed tool set")
  }
  const calls = receipt.calls
  if (!Array.isArray(calls) || calls.length < 3 || calls.length > BENCHMARK_LIMITS.maxDispatches ||
      calls.some((call) => !Number.isFinite(call.toolExecuteWallMs) || call.toolExecuteWallMs < 0 ||
        !Number.isSafeInteger(call.inputJsonUtf8Bytes) || call.inputJsonUtf8Bytes < 0 ||
        !Number.isSafeInteger(call.resultContentJsonUtf8Bytes) || call.resultContentJsonUtf8Bytes < 0 ||
        !Number.isFinite(call.startedAtMs) || call.startedAtMs < 0 ||
        !Number.isFinite(call.finishedAtMs) || call.finishedAtMs < call.startedAtMs ||
        !Array.isArray(call.backendMethods) || call.backendMethods.some((method) =>
          typeof method?.method !== "string" || !Number.isFinite(method.wallMs) || method.wallMs < 0))) {
    throw new Error("production browser tool outcome or monotonic timing evidence is incomplete")
  }
  if (!Number.isSafeInteger(receipt.permissionChecks) || receipt.permissionChecks !== calls.length) {
    throw new Error("production browser policy checks did not match every measured tool call")
  }
  if (scenario === "normal" && JSON.stringify(calls.map((call) => call.name)) !== JSON.stringify(["open", "snapshot", "close"])) {
    throw new Error("normal fixture calls did not match the controlled open/snapshot/close workflow")
  }
  if (scenario === "normal" && calls.some((call) => call.outcome !== "result")) {
    throw new Error("normal fixture produced a failed or erroring browser operation")
  }
  const snapshotCall = calls.find((call) => call.name === "snapshot")
  if (snapshotCall?.snapshotHeadingObserved !== true) {
    throw new Error("production text snapshot did not contain the expected synthetic fixture heading")
  }
  if (scenario === "recoverable") {
    if (JSON.stringify(calls.map((call) => call.name)) !== JSON.stringify(["open", "open", "snapshot", "close"]) ||
        calls[0].outcome !== "browser-error" || calls.slice(1).some((call) => call.outcome !== "result") ||
        !Number.isFinite(receipt.failureToRecoveryMs) || receipt.failureToRecoveryMs < 0) {
      throw new Error("recoverable fixture did not observe failure, successful retry, snapshot, and close")
    }
  }
  const usage = summarizeSessionUsage(session)
  const missingCounters = TOKEN_FIELDS.filter((field) => usage.tokens[field] === null)
  if (usage.cost === null) missingCounters.push("cost")
  return {
    status: missingCounters.length === 0 && calls.every((call) => call.outcome !== "tool-error") ? "observed" : "incomplete",
    directTools, scenario, sessionID, projectID: session.projectID, directory: workspace,
    model: { providerID: model.ref.providerID, id: model.ref.id, variant: observedVariant },
    dispatches: receipt.dispatches.length, visibleTools: receipt.dispatches[0].visibleTools,
    codeModeExecutorVisible: verifiedExposures[0].codeModeExecutorVisible,
    registeredTools: receipt.registeredTools, permissionChecks: receipt.permissionChecks, calls,
    promptToIdleMs: receipt.promptToIdleMs, failureToRecoveryMs: receipt.failureToRecoveryMs,
    usage, missingCounters, cleanup: receipt.cleanup, violations: receipt.violations,
  }
}

function makePairedComparison(conditions) {
  const pairs = []
  for (const condition of conditions) {
    let row = pairs.find((candidate) => candidate.pair === condition.pair && candidate.scenario === condition.scenario)
    if (!row) {
      row = { pair: condition.pair, scenario: condition.scenario, codemode: null, directTools: null }
      pairs.push(row)
    }
    const side = condition.directTools ? "directTools" : "codemode"
    if (row[side] !== null) throw new Error("benchmark emitted a duplicate condition for a paired scenario")
    row[side] = {
      promptToIdleMs: condition.promptToIdleMs,
      failureToRecoveryMs: condition.failureToRecoveryMs,
      tokens: condition.usage.tokens,
      cost: condition.usage.cost,
    }
  }
  return pairs.map((pair) => {
    if (!pair.codemode || !pair.directTools) throw new Error("benchmark condition pair is incomplete")
    const delta = (direct, code) => Number((direct - code).toFixed(3))
    const tokenDeltas = Object.fromEntries(TOKEN_FIELDS.map((field) => [
      field,
      pair.directTools.tokens[field] - pair.codemode.tokens[field],
    ]))
    return {
      pair: pair.pair,
      scenario: pair.scenario,
      codemode: pair.codemode,
      directTools: pair.directTools,
      deltaDirectToolsMinusCodeMode: {
        promptToIdleMs: delta(pair.directTools.promptToIdleMs, pair.codemode.promptToIdleMs),
        failureToRecoveryMs: pair.directTools.failureToRecoveryMs === null || pair.codemode.failureToRecoveryMs === null
          ? null
          : delta(pair.directTools.failureToRecoveryMs, pair.codemode.failureToRecoveryMs),
        tokens: tokenDeltas,
        cost: delta(pair.directTools.cost, pair.codemode.cost),
      },
    }
  }).sort((left, right) => left.pair - right.pair || left.scenario.localeCompare(right.scenario))
}

function defaultNativeIO() {
  return {
    preflight: runIsolationPreflight,
    createRunRoot: createOwnedRunRoot,
    cleanupRunRoot: cleanupOwnedRunRoot,
    stageRuntime: stageProductionRuntime,
    writeConfig: writePrivateConfig,
    startFixture: startBenchmarkFixture,
    readJson: readOwnedJson,
    browserReadiness: verifyBrowserReadiness,
    runCommand: (binary, args, settings) => runBounded(binary, args, settings),
  }
}

export async function runNativeBenchmark(options, injectedIO = null) {
  const io = injectedIO ?? defaultNativeIO()
  const preflight = await io.preflight({
    binary: options.binary, scratchParent: options.scratchParent,
    timeoutMs: options.timeoutMs, maxBytes: options.maxBytes,
  })
  if (preflight.status !== "preflight-verified" || preflight.isolation?.verified !== true) {
    throw new BenchmarkBlockedError("ISOLATION_NOT_VERIFIED", "native private location preflight did not verify every OpenCode path")
  }
  const catalogRoot = await io.createRunRoot({ scratchParent: options.scratchParent })
  let catalogCleanup = false
  let browserReadiness
  let fixture
  let fixtureClosed = false
  const conditions = []
  let nativeDefaultModel = null
  const startedAt = performance.now()
  try {
    const env = makePrivateEnvironment(catalogRoot.runRoot)
    const staged = await io.stageRuntime(catalogRoot.runRoot)
    const catalogReceiptPath = join(catalogRoot.runRoot, "catalog.json")
    await io.writeConfig(staged.workspace, staged.pluginDirectory, {
      mode: "catalog", runRoot: catalogRoot.runRoot, runID: catalogRoot.runID,
      scratchParent: options.scratchParent, approvedScratchRoots: [options.scratchParent],
      profileRoot: join(catalogRoot.runRoot, "profile"),
      receiptPath: catalogReceiptPath,
    }, true)
    const catalogPaths = await io.runCommand(options.binary, ["debug", "paths"], {
      cwd: staged.workspace, env, timeoutMs: Math.min(options.timeoutMs, 60_000), maxBytes: 32_768,
      ownership: catalogRoot.ownership, operation: "private native catalog path verification",
    })
    verifyDebugPaths(parseDebugPaths(catalogPaths), catalogRoot.runRoot)
    await io.runCommand(options.binary, ["models", "--standalone"], {
      cwd: staged.workspace, env, timeoutMs: options.timeoutMs, maxBytes: options.maxBytes,
      ownership: catalogRoot.ownership, operation: "private native model catalog discovery",
    })
    const catalog = await io.readJson(catalogReceiptPath, catalogRoot.runRoot)
    if (!catalog || catalog.directory !== staged.workspace || !Array.isArray(catalog.models)) {
      throw new BenchmarkBlockedError("NATIVE_MODEL_CATALOG_UNAVAILABLE", "private native model catalog did not return an exact-workspace inventory")
    }
    const selected = selectModel(catalog.models, catalog.defaultModel, options.model)
    const provider = catalog.providers?.find((entry) => entry.id === selected.ref.providerID)
    if (!provider || provider.authReady !== true || provider.activation === "disabled") {
      throw new BenchmarkBlockedError(
        "PRIVATE_PROVIDER_NOT_READY",
        "the selected provider is not verified auth-free/connected in this private native location; no model or browser dispatch was started",
      )
    }
    const providerReadiness = {
      status: "private-provider-ready",
      model: selected.ref,
      toolCapability: true,
      discovery: selected.source,
      authentication: "native integration reports connected, or local Ollama/LM Studio provider is enabled without an integration credential",
      credentialMaterialReadOrCopied: false,
      caveat: "Provider readiness is metadata-based; any model request rejection is preserved as a failed run.",
      catalogModels: catalog.models.length,
    }
    await io.cleanupRunRoot(catalogRoot.runRoot, catalogRoot.runID, { ownership: catalogRoot.ownership })
    catalogCleanup = true

    browserReadiness = await io.browserReadiness()
    fixture = await io.startFixture("normal")
    const schedule = makeConditionSchedule(options.pairs)
    benchmarkRuns: for (const pair of schedule) {
      for (const scenario of ["normal", "recoverable"]) {
        for (const condition of pair.order) {
          fixture.setScenario?.(scenario)
          const directTools = condition === "directTools"
          const root = await io.createRunRoot({ scratchParent: options.scratchParent })
          let commandResult = null
          let cleanupVerified = false
          try {
            const env = makePrivateEnvironment(root.runRoot, {
              ...process.env,
              PLAYWRIGHT_BROWSERS_PATH: browserReadiness.browsersPath,
            }, true)
            const stagedRun = await io.stageRuntime(root.runRoot)
            const sessionID = `ses_${randomUUID().replaceAll("-", "")}`
            const fixtureUrl = fixture.urlFor
              ? fixture.urlFor(scenario)
              : fixture.url.replace(/\/(?:normal|recoverable)$/u, `/${scenario}`)
            const receiptPath = join(root.runRoot, "receipt.json")
            const pluginOptions = {
              mode: "measure", runRoot: root.runRoot, runID: root.runID,
              scratchParent: options.scratchParent, approvedScratchRoots: [options.scratchParent],
              profileRoot: join(root.runRoot, "profile"), receiptPath,
              expectedSessionID: sessionID, expectedModel: selected.ref,
              variantPolicy: selected.source === "native-default-model-discovery" ? "native-default" : "exact",
              scenario, directTools, fixtureUrl,
            }
            await io.writeConfig(stagedRun.workspace, stagedRun.pluginDirectory, pluginOptions, directTools)
            const isolation = verifyDebugPaths(parseDebugPaths(await io.runCommand(options.binary, ["debug", "paths"], {
              cwd: stagedRun.workspace, env, timeoutMs: Math.min(options.timeoutMs, 60_000), maxBytes: 32_768,
              ownership: root.ownership, operation: "private benchmark path verification",
            })), root.runRoot)
            const runArgs = ["run", "--standalone", "--session", sessionID]
            if (pluginOptions.variantPolicy === "exact") {
              runArgs.push("--model", `${selected.ref.providerID}/${selected.ref.id}${selected.ref.variant ? `#${selected.ref.variant}` : ""}`)
            }
            runArgs.push("--format", "json", makePrompt(scenario, fixtureUrl))
            commandResult = await io.runCommand(options.binary, runArgs, {
              cwd: stagedRun.workspace, env, timeoutMs: options.timeoutMs, maxBytes: options.maxBytes,
              ownership: root.ownership, allowNonZero: true, operation: "native standalone model session",
            })
            const receipt = await io.readJson(receiptPath, root.runRoot)
            const report = summarizeReceipt(receipt, {
              directTools, scenario, sessionID, model: selected,
              variantPolicy: pluginOptions.variantPolicy, workspace: stagedRun.workspace,
            })
            if (pluginOptions.variantPolicy === "native-default") {
              if (nativeDefaultModel && (nativeDefaultModel.providerID !== report.model.providerID ||
                  nativeDefaultModel.id !== report.model.id || nativeDefaultModel.variant !== report.model.variant)) {
                throw new Error("native default model or variant changed between paired conditions")
              }
              nativeDefaultModel = report.model
              providerReadiness.model = report.model
            }
            report.pair = pair.pair
            report.order = [...pair.order]
            report.isolation = isolation
            report.exitCode = commandResult.exitCode
            if (commandResult.exitCode !== 0) {
              report.status = "failed"
              report.error = "native CLI returned non-zero after the private session receipt was captured"
            }
            conditions.push(report)
          } catch (error) {
            conditions.push({
              status: "failed", pair: pair.pair, order: [...pair.order], condition, directTools, scenario,
              model: selected.ref, error: error instanceof Error ? error.message : "unknown benchmark error",
              exitCode: commandResult?.exitCode ?? null,
            })
          } finally {
            try {
              await io.cleanupRunRoot(root.runRoot, root.runID, { ownership: root.ownership })
              cleanupVerified = true
            } catch (error) {
              conditions.at(-1).cleanupError = error instanceof Error ? error.message : "cleanup failed"
          }
          conditions.at(-1).cleanupVerified = cleanupVerified
          if (conditions.at(-1).status !== "observed" || !cleanupVerified) break benchmarkRuns
        }
      }
      }
    }
    await fixture.close()
    fixture = null
    fixtureClosed = true
    const complete = conditions.length === options.pairs * 4 &&
      conditions.every((condition) => condition.status === "observed" && condition.cleanupVerified)
    const comparison = complete ? makePairedComparison(conditions) : null
    return {
      status: complete ? "observed" : "incomplete",
      preflight,
      browserReadiness: { status: browserReadiness.status, compositor: browserReadiness.compositor, profile: browserReadiness.profile },
      plan: {
        mode: "native-model-dispatch-benchmark",
        conditions: ["codemode", "directTools"],
        schedule,
        scenarios: ["normal", "recoverable"],
        concurrency: 1,
        model: nativeDefaultModel ?? selected.ref,
      },
      providerReadiness,
      schedule,
      conditions,
      counters: complete ? { sessions: conditions.length, pairs: options.pairs } : null,
      comparison,
      elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
      cleanup: { catalogRootRemoved: catalogCleanup, fixtureClosed },
    }
  } finally {
    if (fixture) await fixture.close()
    if (!catalogCleanup) await io.cleanupRunRoot(catalogRoot.runRoot, catalogRoot.runID, { ownership: catalogRoot.ownership })
  }
}
