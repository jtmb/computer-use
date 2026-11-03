// Guarded synchronous read-only adapter for the pinned TS-native virtual-FS callbacks.
//
// Every callback resolves its input through a bounded component walk under approved roots, never
// writes, and never returns `undefined` (readFile documents that as real-FS fallback; the other
// callbacks' undefined serialization is deliberately not relied upon). Refusals latch the adapter so a later
// callback cannot silently continue with an incomplete graph.
//
// Safety is sampled: descriptors, component identities and the requested logical path are compared
// before and after IO, but a synchronous syscall is not preempted and no atomic TOCTOU guarantee is
// claimed. The deadline is cooperative (checked around IO and each loop), and the `io`/`now` seam is
// a trusted synthetic test boundary, not runtime authentication.
import fs from "node:fs"
import path from "node:path"
import { performance } from "node:perf_hooks"

export const DEFAULT_LIMITS = Object.freeze({
  maxFileBytes: 2097152,
  maxAggregateBytes: 67108864,
  maxFiles: 10000,
  maxMetadataBytes: 2097152,
  timeoutMs: 30000,
})

const MAX_ROOTS = 64
const MAX_PATH_LENGTH = 4096
const MAX_LINK_DEPTH = 64
// Reserve the maximum UTF-8 size representable by a bounded input component before
// requesting a record. This is conservative; kernel buffering is outside the byte claim.
const MAX_ENTRY_NAME_BYTES = 4 * MAX_PATH_LENGTH
const READ_CHUNK = 65536
const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

export class ReadonlyInputError extends Error {
  constructor(code, message, detail) {
    super(`readonly-input/${code}: ${message}`)
    this.name = "ReadonlyInputError"
    this.code = code
    this.detail = detail
  }
}

const createError = (code, message, detail) => new ReadonlyInputError(code, message, detail)

const realIo = {
  lstatSync: fs.lstatSync,
  readlinkSync: fs.readlinkSync,
  openSync: fs.openSync,
  fstatSync: fs.fstatSync,
  readSync: fs.readSync,
  closeSync: fs.closeSync,
  opendirSync: fs.opendirSync,
  realpathSync: fs.realpathSync,
}

const sameIdentity = (left, right) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs &&
  left.ctimeMs === right.ctimeMs

const normalizeLimits = (overrides) => {
  if (overrides === undefined) return DEFAULT_LIMITS
  if (overrides === null || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw createError("invalidLimits", "limits must be a plain object", {})
  }
  const limits = { ...DEFAULT_LIMITS }
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) throw createError("unknownLimit", `unknown limit ${key}`, { key })
    if (!Number.isInteger(value) || value <= 0) throw createError("invalidLimit", `${key} must be a positive integer`, { key })
    if (value > DEFAULT_LIMITS[key]) throw createError("limitIncrease", `${key} may only be reduced`, { key, value, max: DEFAULT_LIMITS[key] })
    limits[key] = value
  }
  return Object.freeze(limits)
}

export function createReadonlyInput(options = {}) {
  const limits = normalizeLimits(options.limits)
  const signal = options.signal
  const now = options.now ?? (() => performance.now())
  const io = { ...realIo, ...(options.io ?? {}) }
  for (const name of Object.keys(realIo)) {
    if (typeof io[name] !== "function") throw createError("invalidIo", `io.${name} must be a function`, { name })
  }

  // The deadline starts before any root/cwd IO so a slow startup is still budgeted.
  const deadline = now() + limits.timeoutMs
  const checkStartup = () => {
    if (signal?.aborted) throw createError("aborted", "adapter was cancelled during startup", {})
    if (now() >= deadline) throw createError("deadline", "adapter deadline exceeded during startup", {})
  }
  checkStartup()

  if (!Array.isArray(options.roots) || options.roots.length === 0) throw createError("invalidRoots", "roots must be a non-empty array", {})
  if (options.roots.length > MAX_ROOTS) throw createError("invalidRoots", `at most ${MAX_ROOTS} roots are supported`, { count: options.roots.length })
  const roots = []
  const seenRoots = new Set()
  for (const value of options.roots) {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_LENGTH || value.includes("\0") || !path.isAbsolute(value)) {
      throw createError("invalidRoot", "each root must be a bounded absolute path string", {})
    }
    const canonical = path.resolve(value)
    let stat
    try {
      stat = io.lstatSync(canonical)
    } catch {
      throw createError("invalidRoot", `root does not exist: ${canonical}`, { root: canonical })
    }
    checkStartup()
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw createError("invalidRoot", `root must be a real directory: ${canonical}`, { root: canonical })
    if (io.realpathSync(canonical) !== canonical) throw createError("invalidRoot", `root must be canonical: ${canonical}`, { root: canonical })
    checkStartup()
    if (seenRoots.has(canonical)) continue
    seenRoots.add(canonical)
    roots.push(Object.freeze({ path: canonical, dev: stat.dev, ino: stat.ino }))
  }
  if (roots.length === 0) throw createError("invalidRoots", "roots must contain at least one directory", {})
  Object.freeze(roots)

  const cwd = path.resolve(options.cwd ?? roots[0].path)
  if (!roots.some((root) => cwd === root.path || cwd.startsWith(root.path + path.sep))) {
    throw createError("cwdOutsideRoots", `cwd is outside the approved roots: ${cwd}`, { cwd })
  }
  try {
    if (!io.lstatSync(cwd).isDirectory() || io.realpathSync(cwd) !== cwd) throw new Error("not a canonical directory")
  } catch {
    throw createError("invalidCwd", `cwd must be a canonical directory: ${cwd}`, { cwd })
  }
  checkStartup()

  const state = { calls: 0, entries: 0, links: 0, reads: 0, metadataBytes: 0, aggregateBytes: 0, failure: null }

  const fail = (code, message, detail) => {
    if (!state.failure) state.failure = createError(code, message, detail)
    throw state.failure
  }
  const check = () => {
    if (state.failure) throw state.failure
    if (signal?.aborted) fail("aborted", "adapter was cancelled", {})
    if (now() >= deadline) fail("deadline", "adapter deadline exceeded", {})
  }
  // Any unexpected non-refusal error is converted into one latched typed refusal.
  const guard = (name, body) => (...args) => {
    try {
      check()
      for (const root of roots) checkRoot(root)
      const result = body(...args)
      for (const root of roots) checkRoot(root)
      check()
      return result
    } catch (error) {
      if (error instanceof ReadonlyInputError) {
        state.failure ??= error
        throw state.failure
      }
      fail("ioError", `${name} failed`, { code: error?.code ?? "unknown" })
    }
  }

  const checkRoot = (root) => {
    let stat
    try {
      stat = io.lstatSync(root.path)
    } catch {
      fail("rootChanged", `approved root is unreadable: ${root.path}`, { root: root.path })
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("rootChanged", `approved root is no longer a real directory: ${root.path}`, { root: root.path })
    if (stat.dev !== root.dev || stat.ino !== root.ino) fail("rootChanged", `approved root identity changed: ${root.path}`, { root: root.path })
    if (io.realpathSync(root.path) !== root.path) fail("rootChanged", `approved root is no longer canonical: ${root.path}`, { root: root.path })
  }

  const rootFor = (absolute) => {
    const candidates = roots.filter((root) => absolute === root.path || absolute.startsWith(root.path + path.sep))
    if (candidates.length === 0) fail("pathEscape", "path is outside the approved roots", { path: absolute })
    return candidates.sort((left, right) => right.path.length - left.path.length)[0]
  }

  const normalizeInput = (input) => {
    if (typeof input !== "string" || input.length === 0) fail("invalidPath", "path must be a non-empty string", {})
    if (input.length > MAX_PATH_LENGTH) fail("invalidPath", `path exceeds ${MAX_PATH_LENGTH} characters`, { length: input.length })
    if (input.includes("\0")) fail("invalidPath", "path contains NUL", {})
    return path.resolve(cwd, input)
  }

  // Component walk. Returns the resolved target plus an identity snapshot of every traversed
  // component (directories, files and symlinks) so a later walk can prove the requested logical
  // path still resolves the same way.
  const walk = (absolute) => {
    check()
    let root = rootFor(absolute)
    checkRoot(root)
    let queue = path.relative(root.path, absolute).split(path.sep).filter(Boolean)
    let current = root.path
    const components = []
    const seenLinks = new Set()
    let links = 0

    for (let index = 0; index < queue.length; index += 1) {
      check()
      const name = queue[index]
      if (name === "." || name === "..") fail("invalidPath", "unexpected path component", { component: name })
      const next = path.join(current, name)
      let stat
      try {
        stat = io.lstatSync(next)
      } catch (error) {
        if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
          return { root, absolute: path.join(current, name, ...queue.slice(index + 1)), stats: null, components, missing: true }
        }
        fail("ioError", "lstat failed", { code: error?.code ?? "unknown" })
      }
      components.push({ path: next, dev: stat.dev, ino: stat.ino, link: stat.isSymbolicLink() })
      if (stat.isSymbolicLink()) {
        // lstat exposes the link target length; refuse before readlink when it cannot fit.
        if (stat.size > 0 && state.metadataBytes + stat.size > limits.maxMetadataBytes) {
          fail("metadataBudget", "metadata budget would be exceeded before readlink", { size: stat.size })
        }
        state.links += 1
        state.entries += 1
        if (state.entries > limits.maxFiles) fail("entryBudget", "entry/traversal budget exhausted", {})
        const key = `${stat.dev}:${stat.ino}`
        if (seenLinks.has(key)) fail("linkCycle", "symlink cycle detected", { path: next })
        seenLinks.add(key)
        links += 1
        if (links > MAX_LINK_DEPTH) fail("linkDepth", `symlink depth exceeds ${MAX_LINK_DEPTH}`, { path: next })
        let target
        try {
          target = io.readlinkSync(next)
        } catch (error) {
          fail("ioError", "readlink failed", { code: error?.code ?? "unknown" })
        }
        let after
        try {
          after = io.lstatSync(next)
        } catch {
          fail("sourceMutated", "symlink vanished during resolution", { path: next })
        }
        if (
          !after.isSymbolicLink() ||
          after.dev !== stat.dev ||
          after.ino !== stat.ino ||
          after.size !== stat.size ||
          after.mtimeMs !== stat.mtimeMs ||
          after.ctimeMs !== stat.ctimeMs
        ) {
          fail("sourceMutated", "symlink changed during resolution", { path: next })
        }
        state.metadataBytes += Buffer.byteLength(target)
        if (state.metadataBytes > limits.maxMetadataBytes) fail("metadataBudget", "metadata budget exhausted", {})
        const resolved = path.resolve(current, target)
        root = rootFor(resolved)
        checkRoot(root)
        queue = [...path.relative(root.path, resolved).split(path.sep).filter(Boolean), ...queue.slice(index + 1)]
        current = root.path
        index = -1
        continue
      }
      current = next
    }

    let stats
    try {
      stats = io.lstatSync(current)
    } catch {
      fail("sourceMutated", "path vanished while resolving", { path: current })
    }
    if (stats.isSymbolicLink()) fail("sourceMutated", "path changed to a symlink while resolving", { path: current })
    checkRoot(root)
    check()
    return { root, absolute: current, stats, components, missing: false }
  }

  // Proves the requested logical path still resolves to the same target with the same component
  // identities. This catches alias swaps, ancestor rebinds and replaced directories, not just a
  // changed final inode.
  const verifyRequested = (requested, original) => {
    const again = walk(requested)
    if (again.missing || !again.stats) fail("sourceMutated", "requested path disappeared during IO", { path: requested })
    if (again.absolute !== original.absolute) fail("sourceMutated", "requested path now resolves elsewhere", { path: requested })
    if (again.components.length !== original.components.length) fail("sourceMutated", "resolved component chain changed", { path: requested })
    for (let index = 0; index < again.components.length; index += 1) {
      const left = again.components[index]
      const right = original.components[index]
      if (left.path !== right.path || left.dev !== right.dev || left.ino !== right.ino || left.link !== right.link) {
        fail("sourceMutated", "ancestor or link identity changed", { path: right.path })
      }
    }
    return again
  }

  const beginCall = () => {
    state.calls += 1
    if (state.calls > limits.maxFiles) fail("callBudget", "callback budget exhausted", {})
    check()
  }

  const readFile = guard("readFile", (input) => {
    // Reads are charged before the call budget so repeated-read exhaustion is reported as a file
    // budget rather than masked by the shared callback counter.
    state.reads += 1
    if (state.reads > limits.maxFiles) fail("fileBudget", "file read budget exhausted", {})
    beginCall()
    const requested = normalizeInput(input)
    const target = walk(requested)
    check()
    if (target.missing) return null
    if (!target.stats.isFile()) return null
    if (target.stats.size > limits.maxFileBytes) {
      fail("fileTooLarge", `file is ${target.stats.size} bytes (max ${limits.maxFileBytes})`, { path: target.absolute, size: target.stats.size })
    }
    const remaining = limits.maxAggregateBytes - state.aggregateBytes
    if (target.stats.size > remaining) {
      fail("aggregateBudget", "aggregate budget exhausted before read", { size: target.stats.size, remaining })
    }

    let fd
    try {
      fd = io.openSync(target.absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    } catch (error) {
      fail(error?.code === "ELOOP" ? "sourceMutated" : "ioError", "open failed", { path: target.absolute, code: error?.code ?? "unknown" })
    }
    let primary
    try {
      const opened = io.fstatSync(fd)
      if (!opened.isFile()) fail("nonRegular", "opened path is not a regular file", { path: target.absolute })
      if (!sameIdentity(target.stats, opened)) fail("sourceMutated", "file changed between resolution and open", { path: target.absolute })
      // Before the first content read, the requested alias and its ancestors must still resolve the
      // same way; a rebind here must not yield old bytes.
      verifyRequested(requested, target)
      check()

      const data = Buffer.allocUnsafe(opened.size)
      let offset = 0
      while (offset < opened.size) {
        check()
        const left = limits.maxAggregateBytes - state.aggregateBytes
        if (left <= 0) fail("aggregateBudget", "aggregate budget exhausted during read", {})
        const want = Math.min(READ_CHUNK, opened.size - offset, left)
        let read
        try {
          read = io.readSync(fd, data, offset, want, offset)
        } catch (error) {
          fail("ioError", "read failed", { code: error?.code ?? "unknown" })
        }
        if (read <= 0) fail("shortRead", "short read before EOF", { path: target.absolute, offset })
        offset += read
        state.aggregateBytes += read
      }
      if (offset !== opened.size) fail("shortRead", "read length does not match the file size", { path: target.absolute })
      const finished = io.fstatSync(fd)
      if (!sameIdentity(opened, finished)) fail("sourceMutated", "file changed during read", { path: target.absolute })
      check()
      const again = verifyRequested(requested, target)
      if (!sameIdentity(finished, again.stats)) {
        fail("sourceMutated", "requested path or file identity changed after read", { path: requested })
      }
      check()
      try {
        const text = DECODER.decode(data)
        check()
        return text
      } catch (error) {
        if (error instanceof ReadonlyInputError) throw error
        fail("unsupportedEncoding", "file is not valid UTF-8", { path: target.absolute })
      }
    } catch (error) {
      primary = error
      throw error
    } finally {
      try {
        io.closeSync(fd)
      } catch (error) {
        if (!primary) fail("ioError", "close failed", { code: error?.code ?? "unknown" })
      }
    }
  })

  const fileExists = guard("fileExists", (input) => {
    beginCall()
    const target = walk(normalizeInput(input))
    check()
    if (target.missing) return false
    if (!target.stats.isFile()) return false
    if (target.stats.size > limits.maxFileBytes) {
      fail("fileTooLarge", `file is ${target.stats.size} bytes (max ${limits.maxFileBytes})`, { path: target.absolute, size: target.stats.size })
    }
    return true
  })

  const directoryExists = guard("directoryExists", (input) => {
    beginCall()
    const target = walk(normalizeInput(input))
    check()
    return !target.missing && target.stats.isDirectory()
  })

  const getAccessibleEntries = guard("getAccessibleEntries", (input) => {
    beginCall()
    const requested = normalizeInput(input)
    const target = walk(requested)
    check()
    if (target.missing || !target.stats.isDirectory()) return { files: [], directories: [] }

    let directory
    try {
      // bufferSize 1 asks Node to fetch one directory record per read; the logical entry bound is
      // enforced before each read regardless of any larger kernel/OS buffering.
      directory = io.opendirSync(target.absolute, { bufferSize: 1, encoding: "buffer" })
    } catch (error) {
      fail("ioError", "opendir failed", { code: error?.code ?? "unknown" })
    }
    const files = []
    const directories = []
    let primary
    try {
      for (;;) {
        check()
        // The next record would be the (entries + 1)-th; refuse before acquiring it.
        if (state.entries + 1 > limits.maxFiles) fail("entryBudget", "directory entry budget exhausted", {})
        if (limits.maxMetadataBytes - state.metadataBytes < MAX_ENTRY_NAME_BYTES) {
          fail("metadataBudget", "insufficient capacity for the next directory name", {})
        }
        let entry
        try {
          entry = directory.readSync()
        } catch (error) {
          fail("ioError", "readdir failed", { code: error?.code ?? "unknown" })
        }
        if (entry === null) break
        state.entries += 1
        const nameBytes = Buffer.isBuffer(entry.name) ? entry.name : Buffer.from(entry.name)
        state.metadataBytes += nameBytes.length
        if (state.metadataBytes > limits.maxMetadataBytes) fail("metadataBudget", "metadata budget exhausted", {})
        if (nameBytes.length > MAX_ENTRY_NAME_BYTES) fail("metadataBudget", "unsupported directory name length", {})
        let name
        try {
          name = DECODER.decode(nameBytes)
        } catch {
          fail("unsupportedEncoding", "directory name is not valid UTF-8", {})
        }
        const entryPath = path.join(target.absolute, name)
        if (entry.isDirectory()) {
          directories.push(name)
          continue
        }
        if (entry.isFile()) {
          files.push(name)
          continue
        }
        if (entry.isSymbolicLink()) {
          // Classify a link truthfully under the approved roots; never relabel a directory as a
          // file and never hide an escape, cycle, dangling target or special file.
          const resolved = walk(entryPath)
          if (resolved.missing || !resolved.stats) fail("danglingEntry", "directory entry is a dangling link", { entry: name })
          if (resolved.stats.isDirectory()) directories.push(name)
          else if (resolved.stats.isFile()) files.push(name)
          else fail("nonRegularEntry", "directory entry is not a regular file or directory", { entry: name })
          continue
        }
        fail("nonRegularEntry", "directory entry is not a regular file or directory", { entry: name })
      }
    } catch (error) {
      primary = error
      throw error
    } finally {
      try {
        directory.closeSync()
      } catch (error) {
        if (!primary) fail("ioError", "directory close failed", { code: error?.code ?? "unknown" })
      }
    }

    files.sort()
    directories.sort()
    const again = verifyRequested(requested, target)
    if (!sameIdentity(again.stats, target.stats)) {
      fail("sourceMutated", "directory identity changed during enumeration", { path: requested })
    }
    check()
    return { files, directories }
  })

  const realpath = guard("realpath", (input) => {
    beginCall()
    const target = walk(normalizeInput(input))
    check()
    return target.absolute
  })

  const report = () =>
    Object.freeze({
      limits,
      usage: Object.freeze({
        calls: state.calls,
        entries: state.entries,
        links: state.links,
        reads: state.reads,
        metadataBytes: state.metadataBytes,
        aggregateBytes: state.aggregateBytes,
        failure: state.failure?.code ?? null,
      }),
      roots,
    })

  return Object.freeze({ readFile, fileExists, directoryExists, getAccessibleEntries, realpath, report })
}
