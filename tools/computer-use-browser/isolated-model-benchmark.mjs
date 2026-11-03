import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, symlink } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { performance } from "node:perf_hooks"

import {
  aggregateSessionUsage,
  parseUsageResponse,
  summarizeSessionUsage,
} from "./efficiency-acceptance.mjs"
import {
  BENCHMARK_LIMITS,
  EXPECTED_BROWSER_TOOLS,
  makeConditionSchedule,
  verifyDispatchExposure,
} from "./benchmark-runtime/contract.mjs"
import { startBenchmarkFixture } from "./benchmark-runtime/fixture.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, "../..")
const SCRATCH_ROOT = "/tmp/opencode"
const RUN_PREFIX = "computer-use-browser-model-bench-"
const OWNER_FILE = ".model-benchmark-owner.json"
const OWNER_KIND = "computer-use-browser-isolated-model-benchmark"
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const MAX_OWNER_BYTES = 4096
const MAX_SCRATCH_PARENT_BYTES = 4096
const OWNERSHIP = new WeakMap()
const TOKEN_FIELDS = ["input", "output", "reasoning", "cacheRead", "cacheWrite"]

export class BenchmarkBlockedError extends Error {
  constructor(code, message) {
    super(message)
    this.name = "BenchmarkBlockedError"
    this.code = code
  }
}

function assertSafeText(value, label, maxBytes = 512) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 ||
      Buffer.byteLength(value, "utf8") > maxBytes || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(`${label} must be non-empty bounded text without control characters`)
  }
  return value
}

export function parseModelReference(value) {
  assertSafeText(value, "model reference", 256)
  const parts = value.split("#")
  if (parts.length > 2) throw new TypeError("model reference may contain at most one #variant")
  const [providerAndModel, variant] = parts
  const slash = providerAndModel.indexOf("/")
  if (slash < 1 || slash === providerAndModel.length - 1) {
    throw new TypeError("model reference must be provider/model with an optional #variant")
  }
  const providerID = providerAndModel.slice(0, slash)
  const id = providerAndModel.slice(slash + 1)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(providerID) ||
      !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,190}$/u.test(id) || id.includes("//") ||
      id.split("/").some((part) => part === "." || part === "..") ||
      (variant !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(variant))) {
    throw new TypeError("model reference contains an invalid provider, model, or variant")
  }
  return { providerID, id, variant: variant ?? null }
}

export function parseArgs(argv) {
  const options = {
    mode: "preflight",
    binary: null,
    model: null,
    scratchParent: SCRATCH_ROOT,
    pairs: 2,
    timeoutMs: 180_000,
    maxBytes: MAX_RESPONSE_BYTES,
  }
  const seen = new Set()
  const numeric = new Map([
    ["--pairs", { key: "pairs", min: 2, max: 8 }],
    ["--timeout-ms", { key: "timeoutMs", min: 30_000, max: 600_000 }],
    ["--max-bytes", { key: "maxBytes", min: 1_048_576, max: MAX_RESPONSE_BYTES }],
  ])

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") {
      if (argv.length !== 1) throw new TypeError("--help cannot be combined with other options")
      options.mode = "help"
      return options
    }
    if (arg === "--preflight" || arg === "--run") {
      if (seen.has("mode")) throw new TypeError("choose only one of --preflight or --run")
      seen.add("mode")
      options.mode = arg === "--run" ? "run" : "preflight"
      continue
    }
    if (!new Set(["--binary", "--model", "--scratch-parent", ...numeric.keys()]).has(arg)) {
      throw new TypeError(`unknown argument: ${arg}`)
    }
    if (seen.has(arg)) throw new TypeError(`duplicate argument: ${arg}`)
    seen.add(arg)
    const value = argv[++index]
    if (value === undefined || value.startsWith("--")) throw new TypeError(`${arg} requires a value`)
    if (arg === "--binary") {
      if (!isAbsolute(value) || value.length > 4096 || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new TypeError("--binary must be an absolute bounded path")
      }
      options.binary = resolve(value)
    } else if (arg === "--model") {
      options.model = parseModelReference(value)
    } else if (arg === "--scratch-parent") {
      if (!isAbsolute(value) || value.length > MAX_SCRATCH_PARENT_BYTES || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new TypeError("--scratch-parent must be an absolute bounded path")
      }
      options.scratchParent = resolve(value)
    } else {
      const rule = numeric.get(arg)
      if (!/^[0-9]{1,9}$/u.test(value)) throw new TypeError(`${arg} must be a bounded decimal integer`)
      const number = Number(value)
      if (!Number.isSafeInteger(number) || number < rule.min || number > rule.max) {
        throw new TypeError(`${arg} must be between ${rule.min} and ${rule.max}`)
      }
      options[rule.key] = number
    }
  }

  return options
}

export function makePrivateEnvironment(runRoot, sourceEnv = process.env, includeDisplay = false) {
  const home = join(runRoot, "home")
  const config = join(runRoot, "config")
  const dataHome = join(runRoot, "data")
  const dataDirectory = join(dataHome, "opencode")
  const stateHome = join(runRoot, "state")
  const cacheHome = join(runRoot, "cache")
  const temp = join(runRoot, "tmp")
  const browserProfileRoot = join(runRoot, "profile")
  const env = {
    HOME: home,
    PATH: "/usr/bin:/bin",
    LANG: "C.UTF-8",
    TZ: "UTC",
    TMPDIR: temp,
    OPENCODE_CONFIG_DIR: config,
    OPENCODE_DATA_DIR: dataDirectory,
    OPENCODE_BROWSER_PROFILE_ROOT: browserProfileRoot,
    XDG_CONFIG_HOME: config,
    XDG_DATA_HOME: dataHome,
    XDG_STATE_HOME: stateHome,
    XDG_CACHE_HOME: cacheHome,
    OPENCODE_DISABLE_AUTOUPDATE: "1",
  }
  if (includeDisplay) {
    if (!sourceEnv.WAYLAND_DISPLAY || !sourceEnv.XDG_RUNTIME_DIR) {
      throw new BenchmarkBlockedError("VISIBLE_BROWSER_UNAVAILABLE", "A Wayland session is required by the production headed-browser backend; headless fallback is not used.")
    }
    for (const name of ["WAYLAND_DISPLAY", "XDG_RUNTIME_DIR"]) {
      if (typeof sourceEnv[name] === "string" && sourceEnv[name].length <= 4096) env[name] = sourceEnv[name]
    }
    if (typeof sourceEnv.PLAYWRIGHT_BROWSERS_PATH === "string" &&
        sourceEnv.PLAYWRIGHT_BROWSERS_PATH.length <= MAX_SCRATCH_PARENT_BYTES && isAbsolute(sourceEnv.PLAYWRIGHT_BROWSERS_PATH)) {
      env.PLAYWRIGHT_BROWSERS_PATH = resolve(sourceEnv.PLAYWRIGHT_BROWSERS_PATH)
    }
  }
  return Object.freeze(env)
}

function isUnder(root, target) {
  const path = relative(root, target)
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

export async function validateScratchParent(scratchParent = SCRATCH_ROOT, {
  lstatImpl = lstat,
  realpathImpl = realpath,
  approvedRoots = [SCRATCH_ROOT, REPO],
} = {}) {
  if (typeof scratchParent !== "string" || !isAbsolute(scratchParent) || resolve(scratchParent) !== scratchParent) {
    throw new TypeError("scratch parent must be an absolute normalized path")
  }
  const approvedRoot = approvedRoots.map((path) => resolve(path)).find((path) => isUnder(path, scratchParent))
  if (!approvedRoot) {
    throw new BenchmarkBlockedError("SCRATCH_PARENT_UNAPPROVED", "scratch parent must be inside the approved scratch or repository roots")
  }
  const canonical = await realpathImpl(scratchParent)
  if (canonical !== scratchParent) {
    throw new BenchmarkBlockedError("SCRATCH_PARENT_NONCANONICAL", "scratch parent must not contain symlink components")
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : null
  let path = scratchParent
  let parentInfo
  while (true) {
    const info = await lstatImpl(path)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new BenchmarkBlockedError("SCRATCH_ANCESTOR_UNSAFE", "scratch parent ancestry must consist only of real directories")
    }
    if (path === scratchParent) {
      parentInfo = info
      if ((uid !== null && info.uid !== uid) || (info.mode & 0o700) !== 0o700 || (info.mode & 0o022) !== 0) {
        throw new BenchmarkBlockedError("SCRATCH_PARENT_UNSAFE", "scratch parent must be owned by this user, owner-accessible, and not group/other writable")
      }
    } else if ((info.mode & 0o022) !== 0 && !(info.uid === 0 && (info.mode & 0o1000) !== 0)) {
      throw new BenchmarkBlockedError("SCRATCH_ANCESTOR_UNSAFE", `scratch parent ancestry contains a group/other-writable directory: ${path}`)
    }
    const next = dirname(path)
    if (next === path) break
    path = next
  }
  return {
    path: scratchParent,
    approvedRoot,
    uid: parentInfo.uid,
    dev: parentInfo.dev,
    ino: parentInfo.ino,
  }
}

export async function verifySystemConfigAbsent(lstatImpl = lstat) {
  try {
    await lstatImpl("/etc/opencode")
  } catch (error) {
    if (error.code === "ENOENT") return "absent"
    throw error
  }
  throw new BenchmarkBlockedError(
    "SYSTEM_CONFIG_PRESENT",
    "A system OpenCode config directory exists; its inherited providers/plugins/MCPs cannot be excluded safely.",
  )
}

async function readOwnerMarker(runRoot, expectedRootInfo) {
  const ownerPath = join(runRoot, OWNER_FILE)
  const before = await lstat(ownerPath)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
      before.uid !== expectedRootInfo.uid || (before.mode & 0o077) !== 0 || before.size > MAX_OWNER_BYTES) {
    throw new Error("refusing ownership marker that is not a bounded private regular file")
  }
  const handle = await open(ownerPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino ||
        opened.uid !== before.uid || opened.size > MAX_OWNER_BYTES) {
      throw new Error("ownership marker changed or is not a bounded regular file")
    }
    const buffer = Buffer.alloc(MAX_OWNER_BYTES + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead > MAX_OWNER_BYTES) throw new Error("ownership marker exceeds the byte limit")
    return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"))
  } finally {
    await handle.close()
  }
}

export async function verifyOwnedRunRoot({ runRoot, runID, scratchParent, approvedRoots } = {}) {
  const absolute = resolve(runRoot)
  if (absolute !== runRoot || dirname(absolute) !== scratchParent || !basename(absolute).startsWith(RUN_PREFIX)) {
    throw new Error("run root is not bound to the requested scratch parent")
  }
  const parent = await validateScratchParent(scratchParent, {
    ...(Array.isArray(approvedRoots) ? { approvedRoots } : {}),
  })
  const info = await lstat(absolute)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== parent.uid || (info.mode & 0o077) !== 0) {
    throw new Error("run root is not a private real directory owned by the scratch-parent owner")
  }
  const marker = await readOwnerMarker(absolute, info)
  if (marker.kind !== OWNER_KIND || marker.version !== 2 || marker.runID !== runID || marker.uid !== info.uid ||
      marker.parentPath !== parent.path || marker.parentDev !== parent.dev || marker.parentIno !== parent.ino ||
      marker.rootDev !== info.dev || marker.rootIno !== info.ino) {
    throw new Error("refusing cleanup because the ownership marker or bound parent/root identity does not match")
  }
  return { info, parent, marker }
}

export async function createOwnedRunRoot({ scratchParent = SCRATCH_ROOT } = {}) {
  const parent = await validateScratchParent(scratchParent)
  const runRoot = await mkdtemp(join(parent.path, RUN_PREFIX))
  let ownership
  try {
    const info = await lstat(runRoot)
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== parent.uid || (info.mode & 0o077) !== 0) {
      throw new Error("task-owned run root is not a private real directory")
    }
    const runID = randomUUID()
    ownership = { runRoot, runID, parent, rootDev: info.dev, rootIno: info.ino, children: new Set() }
    const marker = {
      kind: OWNER_KIND, version: 2, runID, pid: process.pid, uid: info.uid,
      parentPath: parent.path, parentDev: parent.dev, parentIno: parent.ino,
      rootDev: info.dev, rootIno: info.ino,
    }
    const handle = await open(join(runRoot, OWNER_FILE), "wx", 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(marker)}\n`, "utf8")
      await handle.sync()
    } finally {
      await handle.close()
    }
    for (const name of ["home", "config", "data", "state", "cache", "tmp", "profile", "workspace"]) {
      await mkdir(join(runRoot, name), { mode: 0o700 })
    }
    const capability = Object.freeze({ runID })
    OWNERSHIP.set(capability, ownership)
    return { runRoot, runID, ownership: capability }
  } catch (error) {
    const info = await lstat(runRoot).catch(() => null)
    if (info?.isDirectory() && !info.isSymbolicLink() && info.uid === parent.uid &&
        (!ownership || (info.dev === ownership.rootDev && info.ino === ownership.rootIno))) {
      await rm(runRoot, { recursive: true, force: false }).catch(() => undefined)
    }
    throw error
  }
}

export async function cleanupOwnedRunRoot(runRoot, runID, { ownership } = {}) {
  const state = ownership && OWNERSHIP.get(ownership)
  if (!state || state.runRoot !== runRoot || state.runID !== runID) {
    throw new Error("refusing cleanup without the in-process capability for this exact owned run")
  }
  if (state.children.size > 0) throw new Error("refusing cleanup until every benchmark child process has exited")
  const { info } = await verifyOwnedRunRoot({ runRoot, runID, scratchParent: state.parent.path })
  if (info.dev !== state.rootDev || info.ino !== state.rootIno) {
    throw new Error("refusing cleanup of a replaced task-owned run root")
  }
  await rm(runRoot, { recursive: true, force: false })
  OWNERSHIP.delete(ownership)
}

function signalProcessTree(child, signal) {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch (error) {
      if (error.code !== "ESRCH") throw error
    }
  }
  child.kill(signal)
}

function processGroupExists(pid) {
  if (process.platform === "win32" || pid === undefined) return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (error.code === "EPERM") return true
    if (error.code === "ESRCH") return false
    throw error
  }
}

async function stopProcessGroup(pid, signalGroup) {
  if (!processGroupExists(pid)) return true
  signalGroup("SIGTERM")
  const deadline = performance.now() + 1_000
  while (processGroupExists(pid) && performance.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
  }
  if (!processGroupExists(pid)) return true
  signalGroup("SIGKILL")
  const killDeadline = performance.now() + 1_000
  while (processGroupExists(pid) && performance.now() < killDeadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
  }
  return !processGroupExists(pid)
}

export function runBounded(binary, args, {
  cwd, env, timeoutMs, maxBytes, ownership = null, allowNonZero = false, operation = "OpenCode command",
}) {
  return new Promise((resolvePromise, reject) => {
    const ownerState = ownership ? OWNERSHIP.get(ownership) : null
    if (ownership && !ownerState) throw new Error("child process received an unknown run ownership capability")
    const detached = process.platform !== "win32"
    const child = spawn(binary, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], shell: false, detached })
    ownerState?.children.add(child)
    let stdout = Buffer.alloc(0)
    let stderrBytes = 0
    let settled = false
    let processStopped = false
    let failure = null
    let killTimer = null
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (killTimer !== null) clearTimeout(killTimer)
      if (processStopped) ownerState?.children.delete(child)
      if (error) reject(error)
      else resolvePromise(value)
    }
    const terminate = (error) => {
      if (settled) return
      failure ??= error
      signalProcessTree(child, "SIGTERM")
      killTimer ??= setTimeout(() => {
        if (!settled) signalProcessTree(child, "SIGKILL")
      }, 1_000)
    }
    const timer = setTimeout(() => terminate(new BenchmarkBlockedError(
      "PREFLIGHT_TIMEOUT",
      `${operation} exceeded its bounded timeout.`,
    )), timeoutMs)
    child.stdout.on("data", (chunk) => {
      if (settled || failure) return
      if (stdout.length + chunk.length > maxBytes) {
        terminate(new BenchmarkBlockedError("PREFLIGHT_OUTPUT_LIMIT", `${operation} exceeded its output byte limit.`))
        return
      }
      stdout = Buffer.concat([stdout, chunk])
    })
    child.stderr.on("data", (chunk) => { stderrBytes = Math.min(Number.MAX_SAFE_INTEGER, stderrBytes + chunk.length) })
    child.once("error", (error) => {
      const blocked = new BenchmarkBlockedError("OPENCODE_EXEC_FAILED", `${operation} could not start (${error.code ?? "spawn error"}).`)
      if (child.pid === undefined) {
        processStopped = true
        finish(blocked)
      }
      else terminate(blocked)
    })
    child.once("close", async (code, signal) => {
      if (detached && child.pid !== undefined) {
        try {
          processStopped = await stopProcessGroup(child.pid, (groupSignal) => signalProcessTree(child, groupSignal))
        } catch {
          processStopped = false
        }
        if (!processStopped) failure ??= new BenchmarkBlockedError(
          "CHILD_PROCESS_TREE_NOT_STOPPED",
          "OpenCode exited but a process in its private benchmark process group could not be confirmed stopped.",
        )
      } else {
        processStopped = true
      }
      if (failure) {
        finish(failure)
        return
      }
      if (code !== 0 && !allowNonZero) {
        finish(new BenchmarkBlockedError("PREFLIGHT_FAILED", `${operation} exited non-zero (code=${code}, signal=${signal ?? "none"}, stderrBytes=${stderrBytes}).`))
      } else {
        finish(null, allowNonZero ? { stdout: stdout.toString("utf8"), exitCode: code, signal, stderrBytes } : stdout.toString("utf8"))
      }
    })
  })
}

export function parseDebugPaths(output) {
  const paths = {}
  for (const line of output.split(/\r?\n/u)) {
    const match = /^([a-z]+)\s+(.+)$/u.exec(line.trim())
    if (match) paths[match[1]] = match[2]
  }
  return paths
}

function expectedPrivatePaths(runRoot) {
  return {
    home: join(runRoot, "home"),
    data: join(runRoot, "data", "opencode"),
    config: join(runRoot, "config"),
    state: join(runRoot, "state", "opencode"),
    cache: join(runRoot, "cache", "opencode"),
    tmp: join(runRoot, "tmp", "opencode"),
  }
}

export function verifyDebugPaths(paths, runRoot) {
  if (!isAbsolute(runRoot) || resolve(runRoot) !== runRoot) {
    throw new TypeError("run root must be an absolute normalized path")
  }
  const expected = expectedPrivatePaths(runRoot)
  const failures = Object.entries(expected)
    .filter(([name, path]) => paths[name] !== path)
    .map(([name]) => name)
  if (failures.length > 0) throw new BenchmarkBlockedError(
    "ISOLATION_PATH_MISMATCH",
    `OpenCode debug paths did not match the task-owned roots: ${failures.join(", ")}.`,
  )
  for (const name of ["db", "log", "repos", "bin"]) {
    const path = paths[name]
    if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path ||
        path === runRoot || !isUnder(runRoot, path)) {
      throw new BenchmarkBlockedError("ISOLATION_PATH_MISMATCH", `OpenCode ${name} path escaped the task-owned root.`)
    }
  }
  return { verified: true, roots: expected, derivedPathsPrivate: true }
}

async function verifyNoInheritedProjectFiles(workspace, runRoot) {
  let current = dirname(workspace)
  while (true) {
    for (const path of [
      join(current, "AGENTS.md"), join(current, "opencode.json"), join(current, "opencode.jsonc"),
      join(current, ".opencode", "opencode.json"), join(current, ".opencode", "opencode.jsonc"),
    ]) {
      const info = await lstat(path).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error))
      if (info) throw new BenchmarkBlockedError("PROJECT_CONFIG_INHERITED", `private workspace would inherit project instructions or configuration from ${path}`)
    }
    const next = dirname(current)
    if (next === current) break
    current = next
  }
}

export async function runIsolationPreflight({ binary, scratchParent = SCRATCH_ROOT, timeoutMs = 30_000, maxBytes = 32_768 } = {}) {
  if (typeof binary !== "string" || !isAbsolute(binary)) {
    throw new TypeError("preflight requires the absolute path to the installed OpenCode executable")
  }
  const binaryInfo = await lstat(binary)
  if (!binaryInfo.isFile() || binaryInfo.isSymbolicLink() || (binaryInfo.mode & 0o111) === 0) {
    throw new BenchmarkBlockedError("BINARY_IDENTITY_INVALID", "--binary must identify an executable regular file, not a wrapper or symlink.")
  }
  const systemConfig = await verifySystemConfigAbsent()
  const { runRoot, runID, ownership } = await createOwnedRunRoot({ scratchParent })
  const started = performance.now()
  try {
    const env = makePrivateEnvironment(runRoot)
    const workspace = join(runRoot, "workspace")
    await verifyNoInheritedProjectFiles(workspace, runRoot)
    const versionText = await runBounded(binary, ["--version"], {
      cwd: workspace, env, timeoutMs, maxBytes, ownership, operation: "OpenCode version check",
    })
    const version = versionText.trim()
    if (!/^opencode v2\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/iu.test(version)) {
      throw new BenchmarkBlockedError("UNSUPPORTED_RUNTIME_VERSION", "The selected executable did not identify itself as OpenCode V2.")
    }
    const pathsText = await runBounded(binary, ["debug", "paths"], {
      cwd: workspace, env, timeoutMs, maxBytes, ownership, operation: "OpenCode debug path probe",
    })
    const isolation = verifyDebugPaths(parseDebugPaths(pathsText), runRoot)
    return {
      status: "preflight-verified",
      runtime: version,
      isolation,
      systemConfig: "absent",
      processEnvironment: "explicit allowlist; no provider credentials or user config paths inherited",
      sharedService: "not started or contacted",
      browser: "not launched",
      elapsedMs: Number((performance.now() - started).toFixed(3)),
      cleanup: { verified: true },
    }
  } finally {
    await cleanupOwnedRunRoot(runRoot, runID, { ownership })
  }
}

export function selectModel(modelList, defaultModel, requested = null) {
  if (!Array.isArray(modelList)) throw new TypeError("native model list must be an array")
  const ref = requested ?? (defaultModel && typeof defaultModel.providerID === "string" && typeof defaultModel.id === "string"
    ? { providerID: defaultModel.providerID, id: defaultModel.id, variant: defaultModel.variant ?? null }
    : null)
  if (!ref) throw new BenchmarkBlockedError("NO_DEFAULT_MODEL", "The isolated runtime has no discovered default model.")
  const model = modelList.find((candidate) => candidate.providerID === ref.providerID && candidate.id === ref.id)
  if (!model || model.enabled !== true || model.capabilities?.tools !== true) {
    throw new BenchmarkBlockedError("MODEL_UNAVAILABLE", "The selected model is absent, disabled, or does not advertise tool support in the isolated location.")
  }
  if (ref.variant !== null && !model.variants?.some((variant) => variant.id === ref.variant)) {
    throw new BenchmarkBlockedError("VARIANT_UNAVAILABLE", "The requested model variant is not present in the native model catalog.")
  }
  const variant = ref.variant === null ? null : model.variants.find((candidate) => candidate.id === ref.variant)
  const effort = variant?.settings?.reasoningEffort ?? model.settings?.reasoningEffort ?? "provider-default"
  return {
    ref: { providerID: model.providerID, id: model.id, variant: ref.variant },
    effort,
    source: requested ? "explicit-native-catalog-match" : "native-default-model-discovery",
  }
}

export async function readBoundedJson(response, maxBytes = MAX_RESPONSE_BYTES, onBytes = () => {}) {
  if (!response || typeof response.status !== "number") throw new TypeError("response must be a Fetch Response")
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_RESPONSE_BYTES) {
    throw new TypeError("response byte limit is outside the hard bound")
  }
  if (!response.ok) throw new Error(`private OpenCode API returned HTTP ${response.status}`)
  const declaredLength = response.headers?.get?.("content-length")
  if (declaredLength && Number(declaredLength) > maxBytes) throw new Error("private OpenCode API response exceeds the byte limit")
  if (!response.body) throw new Error("private OpenCode API response body is missing")
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      try {
        onBytes(value.byteLength)
      } catch (error) {
        await reader.cancel().catch(() => undefined)
        throw error
      }
      if (size > maxBytes) {
        await reader.cancel()
        throw new Error("private OpenCode API response exceeds the byte limit")
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return JSON.parse(Buffer.concat(chunks, size).toString("utf8"))
}

async function beforeDeadline(promise, deadline, label) {
  const remaining = deadline - performance.now()
  if (remaining <= 0) throw new Error(`${label} exceeded the total collection time budget`)
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded the total collection time budget`)), remaining)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function collectPrivateSessionEvidence({
  baseUrl,
  sessionID,
  expectedDirectory,
  expectedProjectID,
  fetchImpl = fetch,
  timeoutMs = 30_000,
  pageSize = 25,
  maxPages = 8,
  maxBytes = MAX_RESPONSE_BYTES,
  maxTotalBytes = MAX_RESPONSE_BYTES,
} = {}) {
  if (typeof baseUrl !== "string" || !/^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/u.test(baseUrl)) {
    throw new TypeError("baseUrl must be the private loopback OpenCode server")
  }
  const port = Number(baseUrl.slice(baseUrl.lastIndexOf(":") + 1))
  if (port < 1 || port > 65_535) throw new TypeError("baseUrl must use a valid private loopback port")
  if (typeof sessionID !== "string" || !/^ses_[A-Za-z0-9][A-Za-z0-9_-]{0,123}$/u.test(sessionID)) {
    throw new TypeError("sessionID must be a safe exact session identifier")
  }
  if (!isAbsolute(expectedDirectory) || typeof expectedProjectID !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(expectedProjectID)) {
    throw new TypeError("an exact directory and projectID are required for session scope")
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 8 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_RESPONSE_BYTES ||
      !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1 || maxTotalBytes > MAX_RESPONSE_BYTES ||
      typeof fetchImpl !== "function") {
    throw new TypeError("message collection limits exceed the bounded private-session policy")
  }
  const deadline = performance.now() + timeoutMs
  let totalBytes = 0
  const read = async (path) => {
    if (totalBytes >= maxTotalBytes) throw new Error("private session collection exceeded its total response byte budget")
    const remaining = deadline - performance.now()
    if (remaining <= 0) throw new Error("private session collection exceeded its total time budget")
    const response = await beforeDeadline(fetchImpl(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(Math.max(1, Math.ceil(remaining))),
      redirect: "error",
    }), deadline, "private session request")
    return parseUsageResponse(await beforeDeadline(
      readBoundedJson(response, maxBytes, (bytes) => {
        totalBytes += bytes
        if (totalBytes > maxTotalBytes) throw new Error("private session collection exceeded its total response byte budget")
      }),
      deadline,
      "private session response read",
    ))
  }
  const session = (await read(`/api/session/${sessionID}`)).data
  if (session?.id !== sessionID || session?.projectID !== expectedProjectID || session?.location?.directory !== expectedDirectory) {
    throw new BenchmarkBlockedError("SESSION_SCOPE_MISMATCH", "The exact session identity did not match the task-owned project and directory; no messages were read.")
  }
  const messages = new Map()
  const cursors = new Set()
  let cursor = null
  let complete = false
  let pages = 0
  for (; pages < maxPages; pages += 1) {
    const query = cursor === null
      ? `limit=${pageSize}&order=asc`
      : `limit=${pageSize}&cursor=${encodeURIComponent(cursor)}`
    const page = await read(`/api/session/${sessionID}/message?${query}`)
    if (!Array.isArray(page.data) || page.data.length > pageSize || !page.cursor ||
        !Object.hasOwn(page.cursor, "next") || !(page.cursor.next === null ||
          (typeof page.cursor.next === "string" && page.cursor.next.length > 0 && Buffer.byteLength(page.cursor.next, "utf8") <= 4096))) {
      throw new Error("private session messages returned malformed or unbounded pagination")
    }
    for (const message of page.data) {
      if (typeof message?.id !== "string") throw new Error("private session message is missing its identity")
      messages.set(message.id, message)
    }
    if (page.cursor.next === null) {
      complete = true
      pages += 1
      break
    }
    if (cursors.has(page.cursor.next)) throw new Error("private session message pagination repeated a cursor")
    cursors.add(page.cursor.next)
    cursor = page.cursor.next
  }
  const summary = summarizeSessionUsage(session, { data: [...messages.values()], complete })
  const missingCounters = TOKEN_FIELDS.filter((field) => summary.tokens[field] === null)
  if (summary.cost === null) missingCounters.push("cost")
  return {
    status: complete && missingCounters.length === 0 ? "observed" : "incomplete",
    sessionID,
    projectID: session.projectID,
    directory: session.location.directory,
    pages,
    responseBytes: totalBytes,
    messageCoverage: summary.messageCoverage,
    summary,
    missingCounters,
    aggregate: aggregateSessionUsage([summary]),
    privacy: "message content is reduced to native counters and tool outcome metadata; prompt and page text are not returned",
  }
}

export function benchmarkPlan({ pairs = 2, model = null } = {}) {
  const schedule = makeConditionSchedule(pairs)
  return {
    mode: "native-model-dispatch-benchmark",
    conditions: ["codemode", "directTools"],
    schedule,
    scenarios: ["normal", "recoverable"],
    concurrency: 1,
    modelSelection: model ? "explicit request; validate against native catalog before dispatch" : "discover native default model and variant; do not guess",
    exposureEvidence: "loaded production registrations plus the actual model-call tool snapshot from the native context hook",
    measurements: ["exact task-scoped native token/cost counters", "production browser tool outcomes", "monotonic prompt-to-idle duration", "monotonic failure-to-recovery delta"],
  }
}

export async function runBenchmark(options, injectedIO = null) {
  const { runNativeBenchmark } = await import("./benchmark-runtime/orchestrator.mjs")
  return runNativeBenchmark(options, injectedIO)
}

export function usage() {
  return [
    "Usage: node --experimental-strip-types tools/computer-use-browser/isolated-model-benchmark.mjs [--preflight|--run] [--binary ABSOLUTE_PATH] [--scratch-parent ABSOLUTE_PATH] [--model provider/model[#variant]] [--pairs 2..8] [--timeout-ms 30000..600000] [--max-bytes 1048576..16777216]",
    "Default is --preflight. --run discovers an enabled tool-capable model in a private native location before dispatch; no credentials are read or copied, and unavailable isolation/provider/browser evidence blocks a pass.",
  ].join("\n")
}

async function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(argv)
    if (options.mode === "help") {
      process.stdout.write(`${usage()}\n`)
      return
    }
    if (!options.binary) {
      throw new BenchmarkBlockedError("BINARY_REQUIRED", "Pass --binary with the absolute path to the installed native OpenCode V2 executable; wrapper scripts are refused.")
    }
    const report = options.mode === "run"
      ? await runBenchmark(options)
      : await runIsolationPreflight({
          binary: options.binary, scratchParent: options.scratchParent,
          timeoutMs: Math.min(options.timeoutMs, 60_000), maxBytes: options.maxBytes,
        })
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (report.status === "blocked" || report.status === "incomplete") process.exitCode = 3
  } catch (error) {
    const report = {
      status: "blocked",
      code: error instanceof BenchmarkBlockedError
        ? error.code
        : options?.mode === "run" ? "BENCHMARK_ERROR" : "PREFLIGHT_ERROR",
      reason: error instanceof Error ? error.message : "unknown preflight error",
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = 3
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
