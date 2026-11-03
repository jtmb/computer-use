// Read-only overlay input composed from the accepted helpers.
//
// This adapter keeps one shared input budget for overlay preparation, base-adapter startup,
// watched-path binding, every public callback and every physical IO operation. It does not write,
// does not fall back to real FS when a provider is supplied, and does not claim that a bounded
// virtual graph is a complete physical snapshot. The IO, clock and signal seams are trusted test
// boundaries, not an authentication or hostile-proxy sandbox; no heap, native-source, permission
// or canonical-patch derivation claim follows.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { performance } from "node:perf_hooks"
import { DEFAULT_LIMITS, InputBudgetError, createInputBudget } from "./input-budget.mjs"
import { ReadonlyInputError, createReadonlyInput } from "./readonly-input.mjs"
import { OverlaySetError, prepareOverlaySet } from "./overlay-set.mjs"

const IO_NAMES = Object.freeze([
  "lstatSync",
  "readlinkSync",
  "openSync",
  "fstatSync",
  "readSync",
  "closeSync",
  "opendirSync",
  "realpathSync",
])
const OPTION_NAMES = Object.freeze(["roots", "cwd", "overlay", "limits", "signal", "io", "now"])
const MAX_ROOTS = 64
const MAX_PATH_LENGTH = 4096
const MAX_ENTRY_NAME_BYTES = 16384
const WATCHED_OVERHEAD = 128

const productionIo = Object.freeze({
  lstatSync: fs.lstatSync,
  readlinkSync: fs.readlinkSync,
  openSync: fs.openSync,
  fstatSync: fs.fstatSync,
  readSync: fs.readSync,
  closeSync: fs.closeSync,
  opendirSync: fs.opendirSync,
  realpathSync: fs.realpathSync,
})

export class OverlayInputError extends Error {
  constructor(code, message, detail) {
    super(`overlay-input/${code}: ${message}`)
    this.name = "OverlayInputError"
    this.code = code
    this.detail = Object.freeze(detail ?? {})
  }
}

const createError = (code, message, detail) => new OverlayInputError(code, message, detail)

const isWellFormed = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = index + 1 < value.length ? value.charCodeAt(index + 1) : -1
      if (next < 0xdc00 || next > 0xdfff) return false
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false
    }
  }
  return true
}

const snapshotRecord = (value, code, what) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw createError(code, `${what} must be an ordinary data record`, {})
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw createError(code, `${what} must be an ordinary data record`, {})
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const fields = new Map()
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") throw createError(code, `${what} must not use symbol fields`, {})
    const descriptor = descriptors[key]
    if (!Object.hasOwn(descriptor, "value")) throw createError(code, `${what} must not use accessor properties`, {})
    fields.set(key, descriptor.value)
  }
  return fields
}

const rejectUnknown = (fields, allowed, code, what) => {
  for (const key of fields.keys()) {
    if (!allowed.includes(key)) throw createError(code, `${what} has unexpected field ${key}`, { key })
  }
}

const isCanonicalIndex = (key, length) => {
  if (key.length === 0 || key.length > 10) return false
  if (key.length > 1 && key.charCodeAt(0) === 48) return false
  let value = 0
  for (let index = 0; index < key.length; index += 1) {
    const unit = key.charCodeAt(index)
    if (unit < 48 || unit > 57) return false
    value = value * 10 + (unit - 48)
  }
  return value < length
}

const snapshotArray = (value, code, what, maxLength) => {
  if (!Array.isArray(value)) throw createError(code, `${what} must be an array`, {})
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw createError(code, `${what} must be a plain array`, {})
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length")
  if (lengthDescriptor === undefined || !Object.hasOwn(lengthDescriptor, "value")) {
    throw createError(code, `${what} must expose a data length`, {})
  }
  const length = lengthDescriptor.value
  if (!Number.isInteger(length) || length < 0) throw createError(code, `${what} length is invalid`, {})
  if (length > maxLength) throw createError(code, `${what} exceeds the supported count`, { count: length })
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length !== length + 1) {
    throw createError(code, `${what} must not be sparse or carry extra properties`, {})
  }
  const items = new Array(length)
  for (const key of keys) {
    if (typeof key !== "string") throw createError(code, `${what} must not use symbol properties`, {})
    if (key === "length") continue
    if (!isCanonicalIndex(key, length)) throw createError(code, `${what} must not carry extra properties`, { key })
    const descriptor = descriptors[key]
    if (!Object.hasOwn(descriptor, "value")) throw createError(code, `${what} must not use accessor properties`, {})
    items[Number(key)] = descriptor.value
  }
  return items
}

const validatePathText = (value, code, what, absolute, canonical = false) => {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_LENGTH) {
    throw createError(code, `${what} must be a bounded non-empty path string`, {})
  }
  if (value.includes("\0") || value.includes("\\")) {
    throw createError(code, `${what} must not contain NUL or backslashes`, {})
  }
  if (/^[A-Za-z]:/.test(value)) throw createError(code, `${what} must not use a drive-like prefix`, {})
  if (!isWellFormed(value)) throw createError(code, `${what} must be well-formed UTF-16`, {})
  if (absolute) {
    if (!value.startsWith("/")) throw createError(code, `${what} must be absolute`, {})
    if (canonical) {
      if (value.length > 1 && value.endsWith("/")) throw createError(code, `${what} must not have a trailing slash`, {})
      if (path.posix.normalize(value) !== value) throw createError(code, `${what} must be lexically canonical`, {})
    }
  }
  return value
}

const normalizeLimits = (overrides) => {
  const limits = { ...DEFAULT_LIMITS }
  if (overrides === undefined) return Object.freeze(limits)
  const fields = snapshotRecord(overrides, "invalidLimits", "limits")
  for (const [key, value] of fields) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) throw createError("unknownLimit", `unknown limit ${key}`, { key })
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw createError("invalidLimit", `${key} must be a positive integer`, { key })
    }
    if (value > DEFAULT_LIMITS[key]) {
      throw createError("limitIncrease", `${key} may only be reduced`, { key, value, max: DEFAULT_LIMITS[key] })
    }
    limits[key] = value
  }
  return Object.freeze(limits)
}

const readIo = (value) => {
  if (value === undefined) return productionIo
  const fields = snapshotRecord(value, "invalidIo", "io")
  if (fields.size !== IO_NAMES.length) throw createError("invalidIo", "io must contain exactly the eight read-only methods", {})
  const io = {}
  for (const name of IO_NAMES) {
    if (!fields.has(name)) throw createError("invalidIo", `io is missing ${name}`, { name })
    const candidate = fields.get(name)
    if (typeof candidate !== "function") throw createError("invalidIo", `io.${name} must be a function`, { name })
    io[name] = candidate
  }
  return Object.freeze(io)
}

const sameObservation = (left, right) => {
  if (left.missing || right.missing) return left.missing === true && right.missing === true
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.kind === right.kind
  )
}

const detailCopy = (detail) => {
  if (detail === null || typeof detail !== "object" || Array.isArray(detail)) return {}
  const copy = {}
  for (const key of Object.keys(detail)) copy[key] = detail[key]
  return copy
}

const create = (options) => {
  let budget = null
  let failure = null

  const mapError = (error) => {
    if (error instanceof OverlayInputError) return error
    let ledgerFailure = null
    if (budget !== null) {
      try {
        ledgerFailure = budget.snapshot().failure
      } catch {
        ledgerFailure = null
      }
    }
    if (
      ledgerFailure !== null &&
      (error instanceof ReadonlyInputError || error instanceof OverlaySetError || error instanceof InputBudgetError)
    ) {
      return createError(ledgerFailure, "shared input budget refused the operation", detailCopy(error?.detail))
    }
    if (error instanceof ReadonlyInputError || error instanceof OverlaySetError || error instanceof InputBudgetError) {
      return createError(error.code, error.message, detailCopy(error?.detail))
    }
    return createError("internal", "unexpected failure while reading overlay input", {})
  }

  const latch = (error) => {
    if (failure !== null) return failure
    failure = mapError(error)
    return failure
  }

  try {
    const optionFields = snapshotRecord(options, "invalidOptions", "options")
    rejectUnknown(optionFields, OPTION_NAMES, "invalidOptions", "options")
    for (const required of ["roots", "overlay"]) {
      if (!optionFields.has(required)) throw createError("invalidOptions", `options is missing ${required}`, { key: required })
    }

    const limits = normalizeLimits(optionFields.get("limits"))
    const rootsInput = snapshotArray(optionFields.get("roots"), "invalidRoots", "roots", MAX_ROOTS)
    if (rootsInput.length === 0) throw createError("invalidRoots", "roots must be a non-empty array", {})
    const roots = rootsInput.map((value) => validatePathText(value, "invalidRoot", "root", true))
    const cwdInput = optionFields.get("cwd")
    const cwd = cwdInput === undefined ? undefined : validatePathText(cwdInput, "invalidCwd", "cwd", true)

    const overlayFields = snapshotRecord(optionFields.get("overlay"), "invalidOverlay", "overlay")
    rejectUnknown(overlayFields, ["root", "entries"], "invalidOverlay", "overlay")
    for (const required of ["root", "entries"]) {
      if (!overlayFields.has(required)) throw createError("invalidOverlay", `overlay is missing ${required}`, { key: required })
    }
    const overlayRoot = validatePathText(overlayFields.get("root"), "invalidOverlayRoot", "overlay.root", true, true)
    const overlayEntries = snapshotArray(
      overlayFields.get("entries"),
      "invalidEntries",
      "overlay.entries",
      limits.maxFiles + 1,
    )

    const signal = optionFields.get("signal")
    if (signal !== undefined && signal !== null && (typeof signal !== "object" || Array.isArray(signal))) {
      throw createError("invalidOptions", "signal must be an AbortSignal-like object", {})
    }
    // Both trusted seams re-check the driver latch immediately after caller code returns. This
    // keeps a swallowed signal reentry from committing a ledger reservation.
    const guardedSignal =
      signal === undefined || signal === null
        ? signal
        : Object.freeze({
            get aborted() {
              if (failure !== null) throw failure
              const value = signal.aborted
              if (failure !== null) throw failure
              return value
            },
          })
    const nowInput = optionFields.get("now")
    if (nowInput !== undefined && typeof nowInput !== "function") {
      throw createError("invalidClock", "now must be a function", {})
    }
    const callerClock = nowInput === undefined ? () => performance.now() : nowInput
    const io = readIo(optionFields.get("io"))

    const ledgerClock = () => {
      if (failure !== null) throw failure
      const value = callerClock()
      if (failure !== null) throw failure
      return value
    }
    budget = createInputBudget({ limits, signal: guardedSignal, now: ledgerClock })

    const budgetCheck = () => {
      if (failure !== null) throw failure
      try {
        budget.check()
      } catch (error) {
        throw latch(error)
      }
      if (failure !== null) throw failure
    }
    const reserveBudget = (cost) => {
      if (failure !== null) throw failure
      try {
        budget.reserve(cost)
      } catch (error) {
        throw latch(error)
      }
      if (failure !== null) throw failure
    }
    const remainingBudget = () => {
      if (failure !== null) throw failure
      let remaining
      try {
        remaining = budget.remaining()
      } catch (error) {
        throw latch(error)
      }
      if (failure !== null) throw failure
      return remaining
    }
    const guardClock = () => {
      budgetCheck()
      return performance.now()
    }
    const assertDriverLive = () => {
      if (failure !== null) throw failure
    }

    const prepared = prepareOverlaySet({
      root: overlayRoot,
      entries: overlayEntries,
      limits,
      signal: guardedSignal,
      now: guardClock,
    })
    if (prepared.root !== overlayRoot) {
      throw createError("invalidOverlayRoot", "prepared overlay root changed", {})
    }
    // Reserve the prepared overlay text, metadata and inventory before any physical IO. This
    // meters the caller-owned overlay graph, not how it was acquired or helper heap use.
    reserveBudget({
      contentBytes: prepared.usage.aggregateBytes,
      metadataBytes: prepared.usage.metadataBytes,
      units: prepared.usage.files + prepared.usage.directories,
    })

    let collecting = true
    let active = true
    let operationWatched = null
    const watched = new Map()
    const linkSizes = new Map()

    const wrapperRefuse = (code, message, detail) => {
      const error = latch(createError(code, message, detail))
      throw new ReadonlyInputError(error.code, error.message, { ...error.detail })
    }

    const inBase = (body) => {
      try {
        return body()
      } catch (error) {
        if (failure !== null) {
          if (error instanceof ReadonlyInputError) throw error
          throw new ReadonlyInputError(failure.code, failure.message, { ...failure.detail })
        }
        if (error instanceof OverlayInputError) {
          throw new ReadonlyInputError(error.code, error.message, { ...error.detail })
        }
        throw error
      }
    }

    const readIdentity = (stat, target) => {
      if (
        stat === null ||
        typeof stat !== "object" ||
        typeof stat.isFile !== "function" ||
        typeof stat.isDirectory !== "function" ||
        typeof stat.isSymbolicLink !== "function"
      ) {
        throw createError("invalidIdentity", "io returned an invalid stat record", { path: target })
      }
      const numbers = [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]
      if (!numbers.every((value) => typeof value === "number" && Number.isFinite(value))) {
        throw createError("invalidIdentity", "io stat fingerprint must be finite", { path: target })
      }
      if (!Number.isSafeInteger(stat.mode) || stat.mode < 0 || stat.size < 0) {
        throw createError("invalidIdentity", "io stat fingerprint must be finite and non-negative", { path: target })
      }
      let kind
      if (stat.isSymbolicLink()) kind = "symlink"
      else if (stat.isFile()) kind = "file"
      else if (stat.isDirectory()) kind = "directory"
      else kind = "special"
      return {
        missing: false,
        dev: stat.dev,
        ino: stat.ino,
        mode: stat.mode,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ctimeMs: stat.ctimeMs,
        kind,
      }
    }

    const observe = (target, observation) => {
      const permanent = watched.get(target)
      const records = collecting ? watched : operationWatched
      if (records === null) return
      const existing = permanent ?? records.get(target)
      if (existing !== undefined) {
        if (!sameObservation(existing, observation)) {
          wrapperRefuse("sourceMutated", "a watched component changed during the operation", { path: target })
        }
        return
      }
      reserveBudget({ metadataBytes: WATCHED_OVERHEAD + Buffer.byteLength(target), units: 1 })
      records.set(target, observation)
    }

    const lstatSync = (target) => inBase(() => {
      assertDriverLive()
      budgetCheck()
      let stat
      try {
        stat = io.lstatSync(target)
      } catch (error) {
        assertDriverLive()
        if (error?.code === "ENOENT") {
          observe(target, { missing: true })
          budgetCheck()
          throw error
        }
        if (error?.code === "ENOTDIR") {
          wrapperRefuse("notMissing", "a non-directory ancestor is not an absence", { path: target })
        }
        throw error
      }
      assertDriverLive()
      const observation = readIdentity(stat, target)
      assertDriverLive()
      if (observation.kind === "symlink" && (!Number.isSafeInteger(stat.size) || stat.size < 0)) {
        wrapperRefuse("invalidIdentity", "symlink size must be a non-negative safe integer", { path: target })
      }
      if (observation.kind === "symlink") linkSizes.set(target, stat.size)
      observe(target, observation)
      assertDriverLive()
      budgetCheck()
      return stat
    })

    const readlinkSync = (target) => inBase(() => {
      assertDriverLive()
      budgetCheck()
      const known = linkSizes.get(target)
      if (!Number.isSafeInteger(known) || known < 0) {
        wrapperRefuse("invalidLink", "readlink has no bounded lstat size", { path: target })
      }
      reserveBudget({ units: 1, metadataBytes: known })
      assertDriverLive()
      let value
      try {
        value = io.readlinkSync(target)
      } catch (error) {
        assertDriverLive()
        throw error
      }
      assertDriverLive()
      if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > MAX_PATH_LENGTH ||
        !isWellFormed(value) ||
        value.includes("\0") ||
        value.includes("\\") ||
        /^[A-Za-z]:/.test(value)
      ) {
        wrapperRefuse("invalidLink", "readlink must return a lossless bounded string", { path: target })
      }
      if (Buffer.byteLength(value) > known) {
        wrapperRefuse("sourceMutated", "readlink target exceeds its lstat size", { path: target })
      }
      budgetCheck()
      return value
    })

    const openSync = (target, flags) => inBase(() => {
      assertDriverLive()
      budgetCheck()
      reserveBudget({ units: 1 })
      assertDriverLive()
      let fd
      try {
        fd = io.openSync(target, flags)
      } catch (error) {
        assertDriverLive()
        throw error
      }
      try {
        assertDriverLive()
        if (!Number.isSafeInteger(fd) || fd < 0) wrapperRefuse("ioError", "open must return a non-negative fd", { path: target })
        budgetCheck()
      } catch (error) {
        if (Number.isSafeInteger(fd) && fd >= 0) {
          try {
            io.closeSync(fd)
          } catch {
            // Preserve the first refusal; a close failure cannot rescue the opened handle.
          }
        }
        throw error
      }
      return fd
    })

    const fstatSync = (fd) => inBase(() => {
      assertDriverLive()
      budgetCheck()
      let stat
      try {
        stat = io.fstatSync(fd)
      } catch (error) {
        assertDriverLive()
        throw error
      }
      assertDriverLive()
      if (typeof stat?.isFile === "function" && stat.isFile()) {
        if (!Number.isSafeInteger(stat.size) || stat.size < 0) {
          wrapperRefuse("invalidIdentity", "regular file size must be a non-negative safe integer", { fd })
        }
        if (stat.size > limits.maxFileBytes) {
          wrapperRefuse("fileTooLarge", "physical file exceeds maxFileBytes", { size: stat.size })
        }
      }
      budgetCheck()
      return stat
    })

    const readSync = (fd, buffer, offset, length, position) => inBase(() => {
      assertDriverLive()
      budgetCheck()
      if (!Number.isSafeInteger(length) || length < 0) wrapperRefuse("ioError", "read length is invalid", { length })
      reserveBudget({ contentBytes: length })
      assertDriverLive()
      let count
      try {
        count = io.readSync(fd, buffer, offset, length, position)
      } catch (error) {
        assertDriverLive()
        throw error
      }
      assertDriverLive()
      if (!Number.isSafeInteger(count) || count < 0 || count > length) {
        wrapperRefuse("ioError", "read returned an invalid count", { count, length })
      }
      budgetCheck()
      return count
    })

    const closeProxy = (error) => new ReadonlyInputError(error.code, error.message, { ...error.detail })
    const closeSync = (fd) => {
      let result
      let rawError = null
      try {
        result = io.closeSync(fd)
      } catch (error) {
        rawError = error
      }
      if (rawError !== null) {
        if (failure !== null) throw closeProxy(failure)
        throw rawError
      }
      if (failure !== null) throw closeProxy(failure)
      return result
    }

    const opendirSync = (target, flags) => inBase(() => {
      assertDriverLive()
      budgetCheck()
      let directory
      try {
        directory = io.opendirSync(target, flags)
      } catch (error) {
        assertDriverLive()
        throw error
      }
      try {
        assertDriverLive()
        if (
          directory === null ||
          typeof directory !== "object" ||
          typeof directory.readSync !== "function" ||
          typeof directory.closeSync !== "function"
        ) {
          wrapperRefuse("ioError", "opendir must return read and close methods", { path: target })
        }
        budgetCheck()
      } catch (error) {
        if (directory !== null && typeof directory === "object" && typeof directory.closeSync === "function") {
          try {
            directory.closeSync()
          } catch {
            // Preserve the first refusal; a close failure cannot rescue the opened directory.
          }
        }
        throw error
      }
      return {
        readSync: () => inBase(() => {
          assertDriverLive()
          budgetCheck()
          // The 16 KiB check is headroom for the next Dirent name, not a per-entry charge. The
          // private ledger plus the driver reentry guard make this pre-check safe without a
          // temporary refund; the actual name bytes are reserved after the read below.
          if (remainingBudget().metadataBytes < MAX_ENTRY_NAME_BYTES) {
            wrapperRefuse("metadataBudget", "insufficient capacity for the next directory name", {})
          }
          reserveBudget({ units: 1 })
          assertDriverLive()
          let entry
          try {
            entry = directory.readSync()
          } catch (error) {
            assertDriverLive()
            throw error
          }
          assertDriverLive()
          if (entry === null) {
            budgetCheck()
            return null
          }
          if (entry === null || typeof entry !== "object") wrapperRefuse("ioError", "directory entry is invalid", {})
          let nameBytes
          if (Buffer.isBuffer(entry.name)) {
            nameBytes = entry.name
          } else if (typeof entry.name === "string") {
            if (entry.name.length === 0 || !isWellFormed(entry.name) || entry.name.includes("\0")) {
              wrapperRefuse("invalidName", "directory name must be non-empty lossless text", {})
            }
            nameBytes = Buffer.from(entry.name, "utf8")
          } else {
            wrapperRefuse("invalidName", "directory name must be a buffer or string", {})
          }
          if (nameBytes.includes(0)) {
            wrapperRefuse("invalidName", "directory name must not contain NUL", {})
          }
          if (nameBytes.length === 0 || nameBytes.length > MAX_ENTRY_NAME_BYTES) {
            wrapperRefuse("metadataBudget", "directory name exceeds the supported length", { size: nameBytes.length })
          }
          reserveBudget({ metadataBytes: nameBytes.length })
          assertDriverLive()
          budgetCheck()
          return entry
        }),
        closeSync: () => {
          let result
          let rawError = null
          try {
            result = directory.closeSync()
          } catch (error) {
            rawError = error
          }
          if (rawError !== null) {
            if (failure !== null) throw closeProxy(failure)
            throw rawError
          }
          if (failure !== null) throw closeProxy(failure)
          return result
        },
      }
    })

    const realpathSync = (target) => inBase(() => {
      assertDriverLive()
      budgetCheck()
      let value
      try {
        value = io.realpathSync(target)
      } catch (error) {
        assertDriverLive()
        throw error
      }
      assertDriverLive()
      if (
        typeof value !== "string" ||
        !path.isAbsolute(value) ||
        value.length > MAX_PATH_LENGTH ||
        !isWellFormed(value) ||
        value.includes("\0")
      ) {
        wrapperRefuse("ioError", "realpath must return a bounded absolute string", { path: target })
      }
      budgetCheck()
      return value
    })

    const wrappedIo = Object.freeze({
      lstatSync,
      readlinkSync,
      openSync,
      fstatSync,
      readSync,
      closeSync,
      opendirSync,
      realpathSync,
    })

    let base
    try {
      base = createReadonlyInput({
        roots,
        ...(cwd === undefined ? {} : { cwd }),
        limits,
        signal: guardedSignal,
        now: guardClock,
        io: wrappedIo,
      })
    } catch (error) {
      throw latch(error)
    }

    const joinOverlay = (relative) => (relative === "" ? overlayRoot : path.posix.join(overlayRoot, relative))
    const relativeSegments = (absolute) => {
      if (absolute === overlayRoot) return []
      const relative = path.posix.relative(overlayRoot, absolute)
      if (relative === "" || relative === ".." || relative.startsWith("../") || path.posix.isAbsolute(relative)) {
        throw createError("overlayConflict", "path is outside the overlay root", { path: absolute })
      }
      return relative.split("/")
    }

    const rootObservation = () => {
      const observed = watched.get(overlayRoot)
      if (observed === undefined || observed.missing || observed.kind !== "directory") {
        throw createError("overlayConflict", "overlay root must be an observed real directory", { root: overlayRoot })
      }
      return observed
    }

    const presenceChain = (absolute, finalKind) => {
      rootObservation()
      const segments = relativeSegments(absolute)
      if (segments.length === 0) return { ok: false, position: overlayRoot, reason: "root" }
      let current = overlayRoot
      for (let index = 0; index < segments.length; index += 1) {
        current = path.posix.join(current, segments[index])
        const observed = watched.get(current)
        if (observed === undefined) return { ok: false, position: current, reason: "unverified" }
        if (observed.missing) return { ok: false, position: current, reason: "missing" }
        const last = index === segments.length - 1
        if (!last && observed.kind !== "directory") return { ok: false, position: current, reason: "blocked" }
        if (last && observed.kind !== finalKind) return { ok: false, position: current, reason: "kind" }
      }
      return { ok: true }
    }

    const absenceWitness = (absolute) => {
      rootObservation()
      const segments = relativeSegments(absolute)
      if (segments.length === 0) return { absent: false, position: overlayRoot, reason: "present" }
      let current = overlayRoot
      for (let index = 0; index < segments.length; index += 1) {
        current = path.posix.join(current, segments[index])
        const observed = watched.get(current)
        if (observed === undefined) return { absent: false, position: current, reason: "unverified" }
        if (observed.missing) return { absent: true, position: current }
        if (index < segments.length - 1 && observed.kind !== "directory") {
          return { absent: false, position: current, reason: "blocked" }
        }
        if (index === segments.length - 1) return { absent: false, position: current, reason: "present" }
      }
      return { absent: false, position: absolute, reason: "unverified" }
    }

    const sampleWatched = (records = watched) => {
      // Cooperative sampled identity checks, not an atomic whole-FS snapshot.
      for (const [target, expected] of records) {
        budgetCheck()
        let actual
        try {
          const stat = io.lstatSync(target)
          assertDriverLive()
          actual = readIdentity(stat, target)
        } catch (error) {
          assertDriverLive()
          if (error instanceof OverlayInputError) throw latch(error)
          if (error?.code === "ENOENT") actual = { missing: true }
          else if (error?.code === "ENOTDIR") actual = { missing: false, kind: "blocked" }
          else throw latch(createError("ioError", "watched lstat failed", { code: error?.code ?? "unknown" }))
        }
        budgetCheck()
        if (!sameObservation(expected, actual)) {
          throw latch(createError("sourceMutated", "a watched component changed", { path: target }))
        }
      }
    }

    const rootCanonical = base.realpath(overlayRoot)
    assertDriverLive()
    if (rootCanonical !== overlayRoot) {
      throw createError("overlayConflict", "overlay root must be canonical", { root: overlayRoot })
    }
    if (!base.directoryExists(overlayRoot)) {
      throw createError("overlayConflict", "overlay root must be a real directory", { root: overlayRoot })
    }
    assertDriverLive()
    rootObservation()

    const directories = prepared.directories
      .slice()
      .sort((left, right) => {
        const leftDepth = left.path === "" ? 0 : left.path.split("/").length
        const rightDepth = right.path === "" ? 0 : right.path.split("/").length
        return leftDepth - rightDepth || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
      })
    for (const directory of directories) {
      if (directory.path === "") continue
      const absolute = joinOverlay(directory.path)
      const canonical = base.realpath(absolute)
      assertDriverLive()
      if (canonical !== absolute) {
        throw createError("overlayAlias", "overlay directory resolves elsewhere", { path: directory.path })
      }
      const exists = base.directoryExists(absolute)
      assertDriverLive()
      if (exists) {
        const observed = watched.get(absolute)
        if (observed === undefined || observed.missing || observed.kind !== "directory") {
          throw createError("overlayConflict", "overlay directory is not an observed real directory", { path: directory.path })
        }
      } else {
        const witness = absenceWitness(absolute)
        if (!witness.absent) {
          throw createError("overlayConflict", "new overlay directory is not under sampled absence", {
            path: directory.path,
            reason: witness.reason,
          })
        }
      }
    }

    for (const entry of prepared.entries) {
      const absolute = joinOverlay(entry.path)
      const canonical = base.realpath(absolute)
      assertDriverLive()
      if (canonical !== absolute) {
        throw createError("overlayAlias", "overlay file resolves elsewhere", { path: entry.path })
      }
      if (entry.original.absent === true) {
        const witness = absenceWitness(absolute)
        if (!witness.absent) {
          throw createError("overlayConflict", "absent overlay original has a physical entry", {
            path: entry.path,
            reason: witness.reason,
          })
        }
        continue
      }
      const chain = presenceChain(absolute, "file")
      if (!chain.ok) {
        throw createError("overlayConflict", "present overlay original is not an observed regular file", {
          path: entry.path,
          reason: chain.reason,
        })
      }
      if (!base.fileExists(absolute)) {
        throw createError("originalMismatch", "overlay original is not a regular file", { path: entry.path })
      }
      // Base guards enforce maxFileBytes before content open; a tiny prepared overlay never
      // discounts an oversized physical original.
      const text = base.readFile(absolute)
      assertDriverLive()
      if (typeof text !== "string" || text !== entry.original.text) {
        throw createError("originalMismatch", "overlay original text does not match the guarded file", { path: entry.path })
      }
      const digest = createHash("sha256").update(text, "utf8").digest("hex")
      if (digest !== entry.original.sha256) {
        throw createError("originalMismatch", "overlay original hash does not match the guarded file", { path: entry.path })
      }
    }

    sampleWatched()
    collecting = false
    sampleWatched()

    const overlayFiles = new Map()
    const overlayDirs = new Set()
    const directoryChildren = new Map()
    const ensureDir = (absolute) => {
      if (!directoryChildren.has(absolute)) directoryChildren.set(absolute, { files: new Set(), directories: new Set() })
      overlayDirs.add(absolute)
    }
    ensureDir(overlayRoot)
    for (const directory of prepared.directories) {
      budgetCheck()
      if (directory.path !== "") ensureDir(joinOverlay(directory.path))
    }
    for (const entry of prepared.entries) {
      budgetCheck()
      const absolute = joinOverlay(entry.path)
      if (overlayDirs.has(absolute)) {
        throw createError("fileDirectoryConflict", "overlay path is both a file and a directory", { path: entry.path })
      }
      overlayFiles.set(absolute, entry)
      const parentRelative = path.posix.dirname(entry.path)
      const parentAbsolute = parentRelative === "." ? overlayRoot : joinOverlay(parentRelative)
      ensureDir(parentAbsolute)
      directoryChildren.get(parentAbsolute).files.add(path.posix.basename(entry.path))
    }
    for (const directory of prepared.directories) {
      budgetCheck()
      if (directory.path === "") continue
      const parentRelative = path.posix.dirname(directory.path)
      const parentAbsolute = parentRelative === "." ? overlayRoot : joinOverlay(parentRelative)
      ensureDir(parentAbsolute)
      directoryChildren.get(parentAbsolute).directories.add(path.posix.basename(directory.path))
    }

    const emptyInventory = () => Object.freeze({ files: Object.freeze([]), directories: Object.freeze([]) })
    const freezeInventory = (inventory) =>
      Object.freeze({
        files: Object.freeze(inventory.files.slice()),
        directories: Object.freeze(inventory.directories.slice()),
      })

    const mergeInventory = (absolute, physical) => {
      const children = directoryChildren.get(absolute)
      if (children === undefined) {
        throw createError("overlayConflict", "overlay directory has no prepared children", { path: absolute })
      }
      const files = new Set(physical.files)
      const directories = new Set(physical.directories)
      for (const name of files) {
        if (directories.has(name)) {
          throw createError("fileDirectoryConflict", "physical entry is both a file and a directory", { name })
        }
      }
      for (const name of children.files) {
        if (directories.has(name)) {
          throw createError("fileDirectoryConflict", "physical directory conflicts with overlay file", { name })
        }
        files.add(name)
      }
      for (const name of children.directories) {
        if (files.has(name)) {
          throw createError("fileDirectoryConflict", "physical file conflicts with overlay directory", { name })
        }
        directories.add(name)
      }
      return Object.freeze({
        files: Object.freeze([...files].sort()),
        directories: Object.freeze([...directories].sort()),
      })
    }

    const validateCallbackInput = (input) => {
      if (typeof input !== "string" || input.length === 0 || input.length > MAX_PATH_LENGTH) {
        throw createError("invalidPath", "path must be a non-empty bounded string", {})
      }
      if (input.includes("\0") || input.includes("\\")) {
        throw createError("invalidPath", "path must not contain NUL or backslashes", {})
      }
      if (/^[A-Za-z]:/.test(input)) throw createError("invalidPath", "path must not use a drive-like prefix", {})
      if (!isWellFormed(input)) throw createError("invalidPath", "path must be well-formed UTF-16", {})
      return input
    }

    const reentrantFailure = (operation) =>
      latch(createError("reentrant", "nested overlay input operation is not allowed", { operation }))

    const run = (operation, body) => {
      if (failure !== null) throw failure
      if (active) throw reentrantFailure(operation)
      active = true
      // The initial canonicalization and delegated read are separate base calls. Retain sampled
      // components across both so an alias/ancestor swap cannot hide in that gap. New temporary
      // records are charged once per public operation, never refunded or kept as global watches.
      operationWatched = new Map()
      try {
        reserveBudget({ units: 1 })
        budgetCheck()
        sampleWatched()
        budgetCheck()
        const result = body()
        budgetCheck()
        sampleWatched()
        sampleWatched(operationWatched)
        budgetCheck()
        return result
      } catch (error) {
        throw latch(error)
      } finally {
        operationWatched = null
        active = false
      }
    }

    const publicRun = (operation, input, body) => {
      if (failure !== null) throw failure
      if (active) throw reentrantFailure(operation)
      try {
        validateCallbackInput(input)
      } catch (error) {
        throw latch(error)
      }
      return run(operation, () => body(input))
    }

    const readFile = (input) =>
      publicRun("readFile", input, (valid) => {
        const target = base.realpath(valid)
        assertDriverLive()
        const entry = overlayFiles.get(target)
        if (entry !== undefined) {
          const text = entry.result.text
          reserveBudget({ contentBytes: Buffer.byteLength(text, "utf8") })
          assertDriverLive()
          return text
        }
        if (overlayDirs.has(target)) return null
        const text = base.readFile(valid)
        assertDriverLive()
        return text
      })

    const fileExists = (input) =>
      publicRun("fileExists", input, (valid) => {
        const target = base.realpath(valid)
        assertDriverLive()
        if (overlayFiles.has(target)) return true
        if (overlayDirs.has(target)) return false
        const result = base.fileExists(valid)
        assertDriverLive()
        return result
      })

    const directoryExists = (input) =>
      publicRun("directoryExists", input, (valid) => {
        const target = base.realpath(valid)
        assertDriverLive()
        if (overlayDirs.has(target)) return true
        if (overlayFiles.has(target)) return false
        const result = base.directoryExists(valid)
        assertDriverLive()
        return result
      })

    const getAccessibleEntries = (input) =>
      publicRun("getAccessibleEntries", input, (valid) => {
        const target = base.realpath(valid)
        assertDriverLive()
        if (overlayFiles.has(target)) return emptyInventory()
        if (overlayDirs.has(target)) {
          const physical = base.getAccessibleEntries(valid)
          assertDriverLive()
          return mergeInventory(target, physical)
        }
        const result = base.getAccessibleEntries(valid)
        assertDriverLive()
        return freezeInventory(result)
      })

    const realpath = (input) =>
      publicRun("realpath", input, (valid) => {
        const target = base.realpath(valid)
        assertDriverLive()
        return target
      })

    const report = () => {
      const baseReport = base.report()
      const shared = budget.snapshot()
      const sharedUsage = Object.freeze({ ...shared.usage })
      const baseCopy = Object.freeze({
        limits: Object.freeze({ ...baseReport.limits }),
        usage: Object.freeze({ ...baseReport.usage }),
        roots: Object.freeze(baseReport.roots.map((root) => Object.freeze({ ...root }))),
      })
      const overlayUsage = Object.freeze({ ...prepared.usage })
      return Object.freeze({
        limits: Object.freeze({ ...limits }),
        usage: sharedUsage,
        sharedUsage,
        base: baseCopy,
        baseReport: baseCopy,
        overlay: Object.freeze({
          root: prepared.root,
          usage: overlayUsage,
          files: prepared.entries.length,
          directories: prepared.directories.length,
        }),
        overlayUsage,
        failure: failure === null ? null : failure.code,
        flags: Object.freeze({
          pin: false,
          native: false,
          provenance: "unverified",
          fullGraph: "unverified",
        }),
      })
    }

    sampleWatched()
    budgetCheck()
    active = false
    return Object.freeze({ readFile, fileExists, directoryExists, getAccessibleEntries, realpath, report })
  } catch (error) {
    throw latch(error)
  }
}

export function createOverlayInput(options = {}) {
  try {
    return create(options)
  } catch (error) {
    if (error instanceof OverlayInputError) throw error
    throw createError("internal", "unexpected failure while creating overlay input", {})
  }
}
