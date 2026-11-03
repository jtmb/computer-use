import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { constants as fsConstants, lstatSync, realpathSync } from "node:fs"
import { open, opendir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const RUNTIME_AUDIT_SCHEMA = "checkout-runtime-audit/v1"
const PREFLIGHT_SCHEMA = "checkout-preflight/v1"
const NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/
const MAX_JSON_BYTES = 1024 * 1024
const JSON_STDIN_TIMEOUT_MS = 30_000
const MAX_GIT_STDOUT_BYTES = 8 * 1024 * 1024
const MAX_GIT_STDERR_BYTES = 64 * 1024
const GIT_COMMAND_TIMEOUT_MS = 30_000
const GIT_TERMINATION_GRACE_MS = 150
const GIT_TERMINATION_WAIT_MS = 500

function digest(value) {
  return createHash("sha256").update(value).digest("hex")
}

function splitNul(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean)
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function requireAbsolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path`)
  }
  if (value.split(path.sep).some(part => part === "." || part === "..")) {
    throw new Error(`${label} must not contain dot segments`)
  }
  return path.resolve(value)
}

function existingDirectory(value, label) {
  const resolved = requireAbsolutePath(value, label)
  const root = path.parse(resolved).root
  let current = root

  for (const part of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    let stat
    try {
      stat = lstatSync(current)
    } catch {
      throw new Error(`${label} must exist as a directory`)
    }
    if (stat.isSymbolicLink()) throw new Error(`${label} must not traverse symlinks`)
    if (!stat.isDirectory()) throw new Error(`${label} must be a directory`)
  }

  const canonical = realpathSync(resolved)
  if (canonical !== resolved) throw new Error(`${label} must be canonical`)
  return canonical
}

function gitOptions(root) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")))
  env.GIT_CONFIG_GLOBAL = "/dev/null"
  env.GIT_CONFIG_NOSYSTEM = "1"
  env.GIT_OPTIONAL_LOCKS = "0"
  env.GIT_TERMINAL_PROMPT = "0"
  return {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function signalOwnedGitGroup(child, signal) {
  if (!child.pid) return true
  try {
    if (process.platform === "win32") child.kill(signal)
    else process.kill(-child.pid, signal)
    return true
  } catch (error) {
    if (error.code === "ESRCH") return true
    return false
  }
}

async function terminateOwnedGitGroup(child, closed) {
  if (!signalOwnedGitGroup(child, "SIGTERM")) return false
  await delay(GIT_TERMINATION_GRACE_MS)
  if (!signalOwnedGitGroup(child, "SIGKILL")) return false
  return Promise.race([
    closed.then(() => true),
    delay(GIT_TERMINATION_WAIT_MS).then(() => false),
  ])
}

async function runGit(root, args, { stdoutMode, allowedExitCodes = [] } = {}) {
  const command = args[0]
  const child = spawn(
    "git",
    // Porcelain diff refreshes stat-only index entries even when optional locks are disabled.
    ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-c", "diff.autoRefreshIndex=false", ...args],
    { ...gitOptions(root), detached: process.platform !== "win32" },
  )
  const output = []
  const hash = stdoutMode === "digest" ? createHash("sha256") : null
  let stdoutBytes = 0
  let stderrBytes = 0
  let failure = null
  let cleanupFailure = false
  let closeInfo
  let resolveClosed
  let resolveFailure
  let termination
  const closed = new Promise(resolve => {
    resolveClosed = resolve
  })
  const failed = new Promise(resolve => {
    resolveFailure = resolve
  })

  child.once("close", (code, signal) => {
    closeInfo = { code, signal }
    resolveClosed()
  })

  function fail(message) {
    if (failure) return
    failure = message
    termination = terminateOwnedGitGroup(child, closed).then(result => {
      if (!result) cleanupFailure = true
    }).catch(() => {
      cleanupFailure = true
    })
    resolveFailure()
  }

  child.once("error", () => fail(`git ${command} could not be started`))
  child.stdout.on("data", chunk => {
    if (failure) return
    if (stdoutBytes + chunk.length > MAX_GIT_STDOUT_BYTES) {
      fail(`git ${command} exceeded its ${MAX_GIT_STDOUT_BYTES} byte stdout limit`)
      return
    }
    stdoutBytes += chunk.length
    if (hash) hash.update(chunk)
    else output.push(chunk)
  })
  child.stderr.on("data", chunk => {
    if (failure) return
    if (stderrBytes + chunk.length > MAX_GIT_STDERR_BYTES) {
      fail(`git ${command} exceeded its ${MAX_GIT_STDERR_BYTES} byte stderr limit`)
      return
    }
    stderrBytes += chunk.length
  })

  const timeout = setTimeout(() => fail(`git ${command} timed out after ${GIT_COMMAND_TIMEOUT_MS} ms`), GIT_COMMAND_TIMEOUT_MS)
  const outcome = await Promise.race([
    closed.then(() => "closed"),
    failed.then(() => "failed"),
  ])
  clearTimeout(timeout)

  if (outcome === "failed" || failure) {
    await termination
    if (cleanupFailure) failure = `${failure}; owned process group did not close after termination`
    throw new Error(failure)
  }
  if (closeInfo.code !== 0 && !allowedExitCodes.includes(closeInfo.code)) throw new Error(`git ${command} failed`)
  return {
    code: closeInfo.code,
    output: hash ? null : Buffer.concat(output, stdoutBytes),
    digest: hash ? hash.digest("hex") : null,
    bytes: stdoutBytes,
  }
}

async function gitBuffer(root, args, allowedExitCodes = []) {
  const result = await runGit(root, args, { stdoutMode: "buffer", allowedExitCodes })
  return { code: result.code, output: result.output }
}

async function gitDigest(root, args) {
  const result = await runGit(root, args, { stdoutMode: "digest" })
  return { bytes: result.bytes, sha256: result.digest }
}

function directoryIdentity(value, label) {
  const resolved = existingDirectory(value, label)
  const root = path.parse(resolved).root
  const directories = []
  let current = root
  const add = directory => {
    const stat = lstatSync(directory, { bigint: true })
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must not traverse symlinks and must remain a directory`)
    directories.push({ path: directory, stat })
  }
  add(current)
  for (const part of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    add(current)
  }
  return directories
}

function sameDirectoryIdentity(left, right) {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index]
    return entry.path === other.path && entry.stat.dev === other.stat.dev && entry.stat.ino === other.stat.ino && entry.stat.mode === other.stat.mode
  })
}

function sameFileState(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function changedInputError(label) {
  return new Error(`${label} changed during bounded acquisition`)
}

async function readRegularFileBounded(input, label) {
  const resolved = path.resolve(input)
  const parent = path.dirname(resolved)
  const parentBefore = directoryIdentity(parent, `${label} parent`)
  let before
  try {
    before = lstatSync(resolved, { bigint: true })
  } catch {
    throw new Error(`${label} could not be checked safely`)
  }
  if (before.isSymbolicLink()) throw new Error(`${label} must not be a symlink`)
  if (!before.isFile()) throw new Error(`${label} must be a regular file`)
  if (before.size > BigInt(MAX_JSON_BYTES)) throw new Error(`${label} exceeds ${MAX_JSON_BYTES} bytes`)

  let file
  try {
    const flags = fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | (fsConstants.O_NOFOLLOW ?? 0)
    file = await open(resolved, flags)
  } catch {
    throw new Error(`${label} could not be opened safely`)
  }

  try {
    const opened = await file.stat({ bigint: true })
    if (!opened.isFile() || !sameFileState(before, opened)) throw changedInputError(label)
    if (opened.size > BigInt(MAX_JSON_BYTES)) throw new Error(`${label} exceeds ${MAX_JSON_BYTES} bytes`)
    let pathAtOpen
    let parentAtOpen
    try {
      pathAtOpen = lstatSync(resolved, { bigint: true })
      parentAtOpen = directoryIdentity(parent, `${label} parent`)
    } catch {
      throw changedInputError(label)
    }
    if (!pathAtOpen.isFile()
      || !sameFileState(before, pathAtOpen)
      || !sameDirectoryIdentity(parentBefore, parentAtOpen)) {
      throw changedInputError(label)
    }

    const chunks = []
    const chunk = Buffer.alloc(64 * 1024)
    let bytes = 0
    while (bytes <= MAX_JSON_BYTES) {
      const length = Math.min(chunk.length, MAX_JSON_BYTES + 1 - bytes)
      const { bytesRead } = await file.read(chunk, 0, length, null)
      if (bytesRead === 0) break
      bytes += bytesRead
      if (bytes > MAX_JSON_BYTES) throw new Error(`${label} exceeds ${MAX_JSON_BYTES} bytes`)
      chunks.push(Buffer.from(chunk.subarray(0, bytesRead)))
    }

    const after = await file.stat({ bigint: true })
    let pathAfter
    let parentAfter
    try {
      pathAfter = lstatSync(resolved, { bigint: true })
      parentAfter = directoryIdentity(parent, `${label} parent`)
    } catch {
      throw changedInputError(label)
    }
    if (!pathAfter.isFile()
      || !sameFileState(before, after)
      || !sameFileState(before, pathAfter)
      || !sameDirectoryIdentity(parentBefore, parentAfter)
      || bytes !== Number(before.size)) {
      throw changedInputError(label)
    }
    return Buffer.concat(chunks, bytes).toString("utf8")
  } finally {
    await file.close()
  }
}

function readBoundedStream(stream, label, limit, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    let ended = false
    let settled = false
    const timeout = setTimeout(() => finish(new Error(`${label} did not finish within ${timeoutMs} ms`)), timeoutMs)

    function finish(error, value) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      stream.off("data", onData)
      stream.off("end", onEnd)
      stream.off("error", onError)
      stream.off("close", onClose)
      if (error) {
        stream.pause()
        stream.destroy()
        reject(error)
      } else {
        resolve(value)
      }
    }

    function onData(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      if (bytes + buffer.length > limit) {
        finish(new Error(`${label} exceeds ${limit} bytes`))
        return
      }
      bytes += buffer.length
      chunks.push(buffer)
    }

    function onEnd() {
      ended = true
      finish(null, Buffer.concat(chunks, bytes).toString("utf8"))
    }

    function onError() {
      finish(new Error(`${label} could not be read safely`))
    }

    function onClose() {
      if (!ended) finish(new Error(`${label} closed before end of input`))
    }

    stream.on("data", onData)
    stream.once("end", onEnd)
    stream.once("error", onError)
    stream.once("close", onClose)
    stream.resume()
  })
}

async function assertLocalGitExecutionSafe(source, commonGitDir, seen = new Set(), depth = 0) {
  if (depth > 8 || seen.size >= 64 || seen.has(source)) throw new Error("repository Git execution audit exceeds its bounded scope")
  seen.add(source)
  // Status/diff can run clean filters, including inside submodules. Inspect keys before either command.
  const keys = splitNul((await gitBuffer(source, ["config", "--local", "--no-includes", "--name-only", "--null", "--list"])).output)
    .map(key => key.toLowerCase())
  if (keys.some(key => key === "core.hookspath" || key === "core.fsmonitor" || key === "extensions.worktreeconfig" ||
      key.startsWith("include.") || key.startsWith("includeif.") ||
      (key.startsWith("filter.") && [".clean", ".smudge", ".process"].some(suffix => key.endsWith(suffix))))) {
    throw new Error("repository Git execution configuration requires separate review before source collection")
  }

  const hooks = path.join(commonGitDir, "hooks")
  let hooksPresent = true
  try { lstatSync(hooks) }
  catch (error) {
    if (error.code !== "ENOENT") throw new Error("repository Git hooks could not be checked safely")
    hooksPresent = false
  }
  if (hooksPresent) {
    try {
      const before = directoryIdentity(hooks, "repository Git hooks")
      const directory = await opendir(hooks)
      let count = 0
      for await (const entry of directory) {
        if (++count > 128) throw new Error("repository Git hooks exceed the bounded metadata limit")
        if (entry.name.endsWith(".sample")) continue
        const stat = lstatSync(path.join(hooks, entry.name))
        if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o111) !== 0) {
          throw new Error("repository Git hooks contain an executable or unsafe entry requiring separate review")
        }
      }
      if (!sameDirectoryIdentity(before, directoryIdentity(hooks, "repository Git hooks"))) {
        throw new Error("repository Git hooks changed during metadata review")
      }
    } catch (error) {
      throw new Error("repository Git hooks could not be verified safely: " + error.message)
    }
  }

  const stagedEntries = (await gitBuffer(source, ["ls-files", "--stage", "-z"])).output
  for (const entry of splitNul(stagedEntries)) {
    if (!entry.startsWith("160000 ")) continue
    const tab = entry.indexOf("\t")
    if (tab < 0) throw new Error("nested repository index entry is malformed")
    const relative = entry.slice(tab + 1)
    const nested = path.resolve(source, relative)
    if (path.isAbsolute(relative) || !isWithin(source, nested) || nested === source || relative.split(path.sep).includes("..")) {
      throw new Error("nested repository path is unsafe")
    }
    try { lstatSync(nested) }
    catch (error) { if (error.code === "ENOENT") continue; throw new Error("nested repository path cannot be verified") }
    existingDirectory(nested, "nested repository")
    let marker
    try { marker = lstatSync(path.join(nested, ".git")) }
    catch (error) { if (error.code === "ENOENT") continue; throw new Error("nested repository marker cannot be verified") }
    if (marker.isSymbolicLink() || (!marker.isFile() && !marker.isDirectory()) || (marker.isFile() && marker.size > MAX_JSON_BYTES)) {
      throw new Error("nested repository marker is unsafe")
    }
    const top = (await gitBuffer(nested, ["rev-parse", "--show-toplevel"])).output.toString("utf8").trim()
    if (top !== nested) throw new Error("nested repository root does not match its index path")
    const raw = (await gitBuffer(nested, ["rev-parse", "--git-common-dir"])).output.toString("utf8").trim()
    const common = existingDirectory(path.resolve(nested, raw), "nested Git common directory")
    await assertLocalGitExecutionSafe(nested, common, seen, depth + 1)
  }
  return stagedEntries
}

async function collectSource(sourceArgument) {
  const source = existingDirectory(sourceArgument, "source")
  const topResult = await gitBuffer(source, ["rev-parse", "--show-toplevel"])
  const gitRoot = existingDirectory(topResult.output.toString("utf8").trim(), "Git root")
  if (source !== gitRoot) throw new Error("source must be the exact Git worktree root")

  const inside = (await gitBuffer(source, ["rev-parse", "--is-inside-work-tree"])).output.toString("utf8").trim()
  const bare = (await gitBuffer(source, ["rev-parse", "--is-bare-repository"])).output.toString("utf8").trim()
  if (inside !== "true" || bare !== "false") throw new Error("source must be a non-bare Git worktree")

  const head = (await gitBuffer(source, ["rev-parse", "--verify", "HEAD"])).output.toString("utf8").trim()
  if (!/^[0-9a-f]{40,64}$/i.test(head)) throw new Error("source HEAD is not a full commit ID")

  const symbolic = await gitBuffer(source, ["symbolic-ref", "--quiet", "HEAD"], [1])
  const symbolicRef = symbolic.code === 0 ? symbolic.output.toString("utf8").trim() : null
  const commonRaw = (await gitBuffer(source, ["rev-parse", "--git-common-dir"])).output.toString("utf8").trim()
  const commonGitDir = existingDirectory(path.resolve(source, commonRaw), "Git common directory")
  const stagedEntries = await assertLocalGitExecutionSafe(source, commonGitDir)

  const status = (await gitBuffer(source, ["status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignore-submodules=none"])).output
  const statusEntries = splitNul(status).filter(entry => /^(?:1 |2 |u |\? )/.test(entry))
  const untrackedCount = statusEntries.filter(entry => entry.startsWith("? ")).length
  const conflictCount = statusEntries.filter(entry => entry.startsWith("u ")).length
  const indexFlags = (await gitBuffer(source, ["ls-files", "-v", "-z"])).output
  const untrackedPaths = (await gitBuffer(source, ["ls-files", "--others", "--exclude-standard", "-z"])).output
  const unstagedDiff = await gitDigest(source, ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--no-color"])
  const stagedDiff = await gitDigest(source, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv", "--no-color"])
  const gitWorktreeOutput = (await gitBuffer(source, ["worktree", "list", "--porcelain", "-z"])).output
  const gitWorktrees = splitNul(gitWorktreeOutput)
    .filter(entry => entry.startsWith("worktree "))
    .map(entry => path.resolve(source, entry.slice("worktree ".length)))

  const snapshotCore = {
    source,
    gitRoot,
    commonGitDir,
    head,
    symbolicRef,
    detached: symbolicRef === null,
    status: {
      entries: statusEntries.length,
      untracked: untrackedCount,
      conflicts: conflictCount,
      bytes: status.length,
      sha256: digest(status),
    },
    unstagedDiff,
    stagedDiff,
    index: {
      entries: splitNul(stagedEntries).length,
      entriesSha256: digest(stagedEntries),
      flagsSha256: digest(indexFlags),
    },
    untrackedPaths: {
      count: splitNul(untrackedPaths).length,
      sha256: digest(untrackedPaths),
    },
  }

  return {
    snapshot: {
      schema: "checkout-source-snapshot/v1",
      ...snapshotCore,
      snapshotSha256: digest(JSON.stringify(snapshotCore)),
    },
    gitWorktrees,
  }
}

function safeInventoryDirectory(value, label, blockers) {
  try {
    const resolved = requireAbsolutePath(value, label)
    let stat
    try {
      stat = lstatSync(resolved)
    } catch (error) {
      blockers.push(error.code === "ENOENT" ? `${label} is missing from disk; refresh and inspect the saved inventory` : `${label} could not be checked safely`)
      return resolved
    }
    if (stat.isSymbolicLink()) {
      blockers.push(`${label} traverses a symlink`)
      return resolved
    }
    if (!stat.isDirectory()) blockers.push(`${label} is not a directory`)
    else if (realpathSync(resolved) !== resolved) blockers.push(`${label} is not canonical`)
    return resolved
  } catch (error) {
    blockers.push(error.message)
    return null
  }
}

function hasOnlyKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key))
}

function validateRuntimeAudit(audit, source, blockers) {
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    blockers.push("runtime audit must be a JSON object")
    return null
  }
  if (audit.schema !== RUNTIME_AUDIT_SCHEMA) blockers.push(`runtime audit schema must be ${RUNTIME_AUDIT_SCHEMA}`)

  const project = audit.project
  if (!project || typeof project.id !== "string" || !project.id.trim()) blockers.push("runtime audit must include the native project ID")
  if (!project || !Object.hasOwn(project, "startupCommand")) {
    blockers.push("runtime audit must explicitly record Project.Commands.start (null means absent)")
  } else if (project.startupCommand !== null) {
    blockers.push("Project.Commands.start is configured or not represented as absent")
  }

  let canonical = null
  if (!project || typeof project.canonical !== "string") {
    blockers.push("runtime audit must include the saved canonical checkout")
  } else {
    try {
      canonical = existingDirectory(project.canonical, "canonical checkout")
    } catch (error) {
      blockers.push(error.message)
    }
  }

  const configuration = audit.configuration
  if (!configuration || !Array.isArray(configuration.sources) || configuration.sources.length === 0) {
    blockers.push("runtime audit must list the effective configuration document sources")
  } else {
    if (!hasOnlyKeys(configuration, ["sources", "worktreeDirectory"])) blockers.push("runtime audit has unrecognized configuration fields")
    if (!Object.hasOwn(configuration, "worktreeDirectory")) blockers.push("runtime audit must explicitly record the effective worktree directory (null means unset)")
    if (configuration.sources.some(item => typeof item !== "string" || !path.isAbsolute(item))) {
      blockers.push("configuration sources must be absolute paths from the native config API")
    }
    if (configuration.worktreeDirectory !== null && typeof configuration.worktreeDirectory !== "string") {
      blockers.push("effective worktree directory must be a path or null")
    }
  }

  const strategy = audit.strategy
  if (!strategy || strategy.id !== "git" || strategy.origin !== "bundled") {
    blockers.push("selected strategy is not verified as bundled Git")
  }
  if (!strategy || strategy.sourceReviewed !== true || !Array.isArray(strategy.customRegistrations)) {
    blockers.push("worktree strategy source audit is missing")
  } else if (strategy.customRegistrations.length !== 0) {
    blockers.push("a custom worktree strategy registration is present")
  }
  if (strategy && !hasOnlyKeys(strategy, ["id", "origin", "sourceReviewed", "customRegistrations"])) {
    blockers.push("runtime audit has unrecognized strategy fields")
  }

  const savedWorktrees = audit.savedWorktrees
  const inventoryPaths = []
  if (!Array.isArray(savedWorktrees)) {
    blockers.push("runtime audit must include the native saved worktree inventory")
  } else {
    for (const [index, entry] of savedWorktrees.entries()) {
      if (!entry || typeof entry !== "object" || typeof entry.directory !== "string") {
        blockers.push(`saved worktree ${index + 1} is malformed`)
        continue
      }
      const directory = safeInventoryDirectory(entry.directory, `saved worktree ${index + 1}`, blockers)
      if (directory) inventoryPaths.push(directory)
    }
  }

  if (canonical && !inventoryPaths.includes(canonical)) blockers.push("native saved inventory does not include the canonical checkout")
  if (!inventoryPaths.includes(source.snapshot.source)) blockers.push("native saved inventory does not include the exact source worktree")

  return {
    projectID: project?.id ?? null,
    canonical,
    startupCommandAbsent: Boolean(project && Object.hasOwn(project, "startupCommand") && project.startupCommand === null),
    configurationSources: Array.isArray(configuration?.sources) ? configuration.sources.length : 0,
    worktreeDirectoryObserved: Boolean(configuration && Object.hasOwn(configuration, "worktreeDirectory")),
    worktreeDirectory: configuration?.worktreeDirectory ?? null,
    strategyVerified: Boolean(strategy?.id === "git" && strategy.origin === "bundled" && strategy.sourceReviewed === true && Array.isArray(strategy.customRegistrations) && strategy.customRegistrations.length === 0),
    strategyReviewComplete: strategy?.sourceReviewed === true,
    customStrategyCount: Array.isArray(strategy?.customRegistrations) ? strategy.customRegistrations.length : null,
    savedWorktrees: inventoryPaths,
  }
}

async function verifyCanonicalProject(runtime, source, blockers) {
  if (!runtime?.canonical) return
  try {
    const top = existingDirectory((await gitBuffer(runtime.canonical, ["rev-parse", "--show-toplevel"])).output.toString("utf8").trim(), "canonical Git root")
    const commonRaw = (await gitBuffer(runtime.canonical, ["rev-parse", "--git-common-dir"])).output.toString("utf8").trim()
    const common = existingDirectory(path.resolve(runtime.canonical, commonRaw), "canonical Git common directory")
    if (top !== runtime.canonical || common !== source.snapshot.commonGitDir) {
      blockers.push("canonical checkout and source do not belong to the same Git project")
    }
  } catch {
    blockers.push("canonical checkout cannot be verified as part of the source project")
  }
}

export async function evaluatePreflight({ source, parent, name, approvedRoot = path.join(homedir(), "repos"), runtimeAudit, expectedSnapshot } = {}) {
  const blockers = []
  const warnings = []
  let sourceResult = null
  let sourcePath = null
  let parentPath = null
  let approvedPath = null

  try {
    sourcePath = existingDirectory(source, "source")
    sourceResult = await collectSource(sourcePath)
  } catch (error) {
    blockers.push(error.message)
  }

  try {
    approvedPath = existingDirectory(approvedRoot, "approved repository-save root")
    parentPath = existingDirectory(parent, "destination parent")
    if (!isWithin(approvedPath, parentPath)) blockers.push("destination parent is outside the approved repository-save root")
  } catch (error) {
    blockers.push(error.message)
  }

  if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
    blockers.push("name must be 1-40 lowercase ASCII letters/digits with internal hyphens, starting with a letter")
  } else if (sourcePath) {
    const prefix = path.basename(sourcePath).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    if (!prefix || !name.startsWith(`${prefix}-`)) blockers.push("name must begin with the repository-prefixed source name")
  }

  let runtime = null
  if (!runtimeAudit) blockers.push("a sanitized native runtime audit is required")
  else if (sourceResult) {
    runtime = validateRuntimeAudit(runtimeAudit, sourceResult, blockers)
    await verifyCanonicalProject(runtime, sourceResult, blockers)
  }

  const validName = typeof name === "string" && NAME_PATTERN.test(name)
  if (sourceResult && parentPath && sourcePath && validName) {
    const target = path.join(parentPath, name)
    const checkoutPaths = new Set(sourceResult.gitWorktrees)
    for (const directory of runtime?.savedWorktrees ?? []) checkoutPaths.add(directory)

    for (const checkout of checkoutPaths) {
      if (isWithin(checkout, parentPath)) blockers.push("destination parent is inside an existing checkout")
      if (isWithin(checkout, target) || isWithin(target, checkout)) blockers.push("destination overlaps an existing checkout")
    }

    try {
      lstatSync(target)
      blockers.push("destination target already exists")
    } catch (error) {
      if (error.code !== "ENOENT") blockers.push("destination target could not be checked safely")
    }
  }

  const snapshot = sourceResult?.snapshot ?? null
  if (snapshot?.status.entries) warnings.push("source has dirty or untracked state; native creation uses the captured commit and must not copy these changes")
  if (snapshot?.status.conflicts) blockers.push("source has unresolved index conflicts")

  if (expectedSnapshot && snapshot) {
    const expected = expectedSnapshot.sourceSnapshot ?? expectedSnapshot
    if (expected.source !== snapshot.source || expected.snapshotSha256 !== snapshot.snapshotSha256) {
      blockers.push("source no longer matches the expected preservation snapshot")
    }
  }

  return {
    schema: PREFLIGHT_SCHEMA,
    ready: blockers.length === 0,
    readOnly: true,
    worktreeCreated: false,
    blockers: [...new Set(blockers)],
    warnings,
    sourceSnapshot: snapshot,
    destination: parentPath && validName ? {
      approvedRoot: approvedPath,
      parent: parentPath,
      name,
      target: path.join(parentPath, name),
    } : null,
    runtime: runtime ? {
      projectID: runtime.projectID,
      canonical: runtime.canonical,
      startupCommandAbsent: runtime.startupCommandAbsent,
      configurationSources: runtime.configurationSources,
      worktreeDirectoryObserved: runtime.worktreeDirectoryObserved,
      worktreeDirectory: runtime.worktreeDirectory,
      strategy: runtime.strategyVerified ? "bundled-git" : "custom-or-unverified",
      strategyReviewComplete: runtime.strategyReviewComplete,
      customStrategyCount: runtime.customStrategyCount,
      savedWorktreeCount: runtime.savedWorktrees.length,
    } : null,
  }
}

function usage() {
  return [
    "Usage: node scripts/checkout-preflight.mjs --source DIR --parent DIR --name NAME --runtime-audit FILE|- [--expected-snapshot FILE|-]",
    "The CLI always uses ~/repos as the approved destination root.",
    "The command prints JSON only; it never creates a worktree or writes a report.",
  ].join("\n")
}

function parseArguments(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (key === "--help" || key === "-h") return { help: true }
    if (!["--source", "--parent", "--name", "--runtime-audit", "--expected-snapshot"].includes(key)) {
      throw new Error(`unsupported argument: ${key}`)
    }
    if (options[key]) throw new Error(`duplicate argument: ${key}`)
    const value = args[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${key}`)
    options[key] = value
    index += 1
  }
  for (const required of ["--source", "--parent", "--name", "--runtime-audit"]) {
    if (!options[required]) throw new Error(`missing required argument: ${required}`)
  }
  if (options["--runtime-audit"] === "-" && options["--expected-snapshot"] === "-") {
    throw new Error("runtime audit and expected snapshot cannot both read stdin")
  }
  return {
    source: options["--source"],
    parent: options["--parent"],
    name: options["--name"],
    runtimeAudit: options["--runtime-audit"],
    expectedSnapshot: options["--expected-snapshot"],
  }
}

async function readStdin() {
  return readBoundedStream(process.stdin, "stdin", MAX_JSON_BYTES, JSON_STDIN_TIMEOUT_MS)
}

async function readJson(input, label) {
  const text = input === "-" ? await readStdin() : await readRegularFileBounded(input, label)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} must contain valid JSON`)
  }
}

async function main(args) {
  let options
  try {
    options = parseArguments(args)
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`)
    return 2
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return 0
  }

  try {
    const runtimeAudit = await readJson(options.runtimeAudit, "runtime audit")
    const expectedSnapshot = options.expectedSnapshot ? await readJson(options.expectedSnapshot, "expected snapshot") : undefined
    const report = await evaluatePreflight({ ...options, runtimeAudit, expectedSnapshot })
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return report.ready ? 0 : 1
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return 2
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
