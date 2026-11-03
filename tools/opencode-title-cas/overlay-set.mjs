// Pure in-memory preparation of an overlay set for the title-CAS work.
//
// Nothing here touches the filesystem, a native adapter or a compiler: `root` is only a lexical
// canonical POSIX path string, not proof that a directory exists, and a caller-declared
// `{ absent: true }` original is a supplied claim, not filesystem evidence. Entries are not
// applied, generated, stubbed, deleted or semantically interpreted either; they only carry text
// and digests the caller already supplied.
//
// Budget accounting is part of the accepted output and is deliberately exact:
// - originals and results are each charged their UTF-8 byte length separately and combined; an
//   absent original charges 0 bytes so `{ absent: true }` is never treated as an empty file;
// - an existing original is charged in full even when the replacement is tiny, and identical
//   base and result text are charged twice;
// - metadata is 64 bytes per original (present or absent) plus 64 per result, the root bytes,
//   each entry's path and kind bytes, and for the directory inventory each virtual directory's
//   path bytes plus every direct child basename's bytes and one byte of inventory overhead.
//   A direct-child basename is charged once, when that child is first allocated for a directory;
//   shared ancestors therefore never repeat inventory or directory records.
// - maxFiles counts result files plus every virtual directory, including the root ''. Records are
//   counted as they are allocated, and the whole structural inventory is charged before any
//   entry text is validated or hashed, so capacity and metadata refusals precede content work.
import { createHash } from "node:crypto"
import path from "node:path"
import { performance } from "node:perf_hooks"

export const DEFAULT_LIMITS = Object.freeze({
  maxFileBytes: 2097152,
  maxAggregateBytes: 67108864,
  maxFiles: 10000,
  maxMetadataBytes: 2097152,
  timeoutMs: 30000,
})

const MAX_PATH_LENGTH = 4096
const DIGEST_HEX_LENGTH = 64
const TEXT_CHUNK_UNITS = 65536
const FREEZE_CHECK_MASK = 255
const OPTION_FIELDS = Object.freeze(["root", "entries", "limits", "signal", "now"])
const ENTRY_FIELDS = Object.freeze(["path", "kind", "original", "result"])
const ORIGINAL_FIELDS = Object.freeze(["text", "sha256"])
const RESULT_FIELDS = Object.freeze(["text", "sha256"])
const ABSENT_FIELDS = Object.freeze(["absent"])

export class OverlaySetError extends Error {
  constructor(code, message, detail) {
    super(`overlay-set/${code}: ${message}`)
    this.name = "OverlaySetError"
    this.code = code
    this.detail = Object.freeze(detail ?? {})
  }
}

const createError = (code, message, detail) => new OverlaySetError(code, message, detail)

const snapshotRecord = (value, code, what) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw createError(code, `${what} must be an ordinary data record`, {})
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw createError(code, `${what} must be an ordinary data record`, {})
  }
  // One descriptor snapshot avoids repeated reads of a possibly changing accessor, and accessors
  // themselves are refused instead of being invoked behind the caller's back. This is not a
  // sandbox for hostile proxies; ordinary own data properties are the supported input.
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

const requireExactFields = (fields, expected, code, what) => {
  if (fields.size !== expected.length) throw createError(code, `${what} has unexpected fields`, {})
  for (const key of expected) {
    if (!fields.has(key)) throw createError(code, `${what} is missing ${key}`, { key })
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

// The entries array is snapshotted once, before repeated work checks, so later length changes
// or slot substitution cannot affect accepted work. Only ordinary own data slots are supported.
const snapshotEntries = (value, maxFiles) => {
  if (!Array.isArray(value)) throw createError("invalidEntries", "entries must be an array", {})
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw createError("invalidEntries", "entries must be a plain array", {})
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length")
  if (lengthDescriptor === undefined || !Object.hasOwn(lengthDescriptor, "value")) {
    throw createError("invalidEntries", "entries must expose a data length", {})
  }
  const length = lengthDescriptor.value
  if (!Number.isInteger(length) || length < 0) throw createError("invalidEntries", "entries length is invalid", {})
  if (length + 1 > maxFiles) {
    throw createError("fileBudget", "entry count already exceeds the file and directory budget", { count: length })
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length !== length + 1) {
    throw createError("invalidEntries", "entries must not be sparse or carry extra properties", {})
  }
  const slots = new Array(length)
  for (const key of keys) {
    if (typeof key !== "string") throw createError("invalidEntries", "entries must not use symbol properties", {})
    const descriptor = descriptors[key]
    if (!Object.hasOwn(descriptor, "value")) {
      throw createError("invalidEntries", "entries must not use accessor properties", {})
    }
    if (key === "length") continue
    if (!isCanonicalIndex(key, length)) {
      throw createError("invalidEntries", "entries must not carry extra properties", { key })
    }
    slots[Number(key)] = descriptor.value
  }
  return slots
}

const snapshotEntry = (value, index) => {
  const what = `entries[${index}]`
  const fields = snapshotRecord(value, "invalidEntry", what)
  requireExactFields(fields, ENTRY_FIELDS, "invalidEntry", what)
  const originalFields = snapshotRecord(fields.get("original"), "invalidOriginal", `${what}.original`)
  const resultFields = snapshotRecord(fields.get("result"), "invalidResult", `${what}.result`)
  return { fields, originalFields, resultFields }
}

const isSha256Hex = (value) => {
  if (typeof value !== "string" || value.length !== DIGEST_HEX_LENGTH) return false
  for (let index = 0; index < DIGEST_HEX_LENGTH; index += 1) {
    const unit = value.charCodeAt(index)
    const digit = unit >= 48 && unit <= 57
    const lower = unit >= 97 && unit <= 102
    if (!digit && !lower) return false
  }
  return true
}

const readDigest = (fields, code, what) => {
  const value = fields.get("sha256")
  if (!isSha256Hex(value)) throw createError(code, `${what} sha256 must be 64 lowercase hex characters`, {})
  return value
}

const readClock = (clock) => {
  let value
  try {
    value = clock()
  } catch {
    throw createError("invalidClock", "clock failed during preparation", {})
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw createError("invalidClock", "clock must return a finite number", {})
  }
  return value
}

const normalizeLimits = (overrides) => {
  if (overrides === undefined) return DEFAULT_LIMITS
  const fields = snapshotRecord(overrides, "invalidLimits", "limits")
  const limits = { ...DEFAULT_LIMITS }
  for (const [key, value] of fields) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) throw createError("unknownLimit", `unknown limit ${key}`, { key })
    if (!Number.isInteger(value) || value <= 0) throw createError("invalidLimit", `${key} must be a positive integer`, { key })
    if (value > DEFAULT_LIMITS[key]) {
      throw createError("limitIncrease", `${key} may only be reduced`, { key, value, max: DEFAULT_LIMITS[key] })
    }
    limits[key] = value
  }
  return Object.freeze(limits)
}

const assertWellFormed = (value, code, what) => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = index + 1 < value.length ? value.charCodeAt(index + 1) : -1
      if (next < 0xdc00 || next > 0xdfff) {
        throw createError(code, `${what} must not contain an unpaired high surrogate`, {})
      }
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw createError(code, `${what} must not contain an unpaired low surrogate`, {})
    }
  }
}

const validateRoot = (value) => {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_LENGTH) {
    throw createError("invalidRoot", "root must be a bounded absolute POSIX directory string", {})
  }
  if (value.includes("\0") || value.includes("\\")) {
    throw createError("invalidRoot", "root must not contain NUL or backslashes", {})
  }
  if (!value.startsWith("/")) throw createError("invalidRoot", "root must be absolute", {})
  if (value.length > 1 && value.endsWith("/")) throw createError("invalidRoot", "root must not have a trailing slash", {})
  if (path.posix.normalize(value) !== value) throw createError("invalidRoot", "root must be lexically canonical", {})
  assertWellFormed(value, "invalidRoot", "root")
  return value
}

const validatePath = (value) => {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_LENGTH) {
    throw createError("invalidPath", "path must be a bounded non-empty relative POSIX path", {})
  }
  if (value.includes("\0") || value.includes("\\")) {
    throw createError("invalidPath", "path must not contain NUL or backslashes", {})
  }
  if (value.startsWith("/")) throw createError("invalidPath", "path must be relative", {})
  const first = value.charCodeAt(0)
  const letter = (first >= 65 && first <= 90) || (first >= 97 && first <= 122)
  if (letter && value.length >= 2 && value.charCodeAt(1) === 58) {
    throw createError("invalidPath", "path must not use a drive-like prefix", {})
  }
  const segments = value.split("/")
  for (const segment of segments) {
    if (segment.length === 0) throw createError("invalidPath", "path must not contain empty segments", {})
    if (segment === "." || segment === "..") throw createError("invalidPath", "path must not contain dot segments", {})
  }
  assertWellFormed(value, "invalidPath", "path")
  return segments
}

const validateText = (text, check, field) => {
  for (let index = 0; index < text.length; index += 1) {
    if ((index & (TEXT_CHUNK_UNITS - 1)) === 0) check()
    const unit = text.charCodeAt(index)
    if (unit === 0) throw createError("invalidText", `${field} text must not contain NUL`, { field })
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = index + 1 < text.length ? text.charCodeAt(index + 1) : -1
      if (next < 0xdc00 || next > 0xdfff) {
        throw createError("invalidText", `${field} text must not contain an unpaired high surrogate`, { field })
      }
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw createError("invalidText", `${field} text must not contain an unpaired low surrogate`, { field })
    }
  }
}

const hashText = (text, check) => {
  const hash = createHash("sha256")
  let start = 0
  while (start < text.length) {
    check()
    let end = Math.min(start + TEXT_CHUNK_UNITS, text.length)
    if (end < text.length) {
      const unit = text.charCodeAt(end - 1)
      // Encoding a split surrogate pair would emit a replacement character, so keep pairs together.
      if (unit >= 0xd800 && unit <= 0xdbff) end -= 1
    }
    hash.update(Buffer.from(text.slice(start, end), "utf8"))
    start = end
  }
  return hash.digest("hex")
}

const freezeDeep = (value, check, counter) => {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  for (const key of Object.keys(value)) {
    counter.nodes += 1
    if ((counter.nodes & FREEZE_CHECK_MASK) === 0) check()
    freezeDeep(value[key], check, counter)
  }
  return Object.freeze(value)
}

const prepare = (options) => {
  const optionFields = snapshotRecord(options, "invalidOptions", "options")
  for (const key of optionFields.keys()) {
    if (!OPTION_FIELDS.includes(key)) throw createError("invalidOptions", `unknown option ${key}`, { key })
  }
  for (const key of ["root", "entries"]) {
    if (!optionFields.has(key)) throw createError("invalidOptions", `options is missing ${key}`, { key })
  }
  const rootInput = optionFields.get("root")
  const entriesInput = optionFields.get("entries")
  const limitOverrides = optionFields.get("limits")
  const signal = optionFields.get("signal")
  const now = optionFields.get("now")

  const limits = normalizeLimits(limitOverrides)
  if (signal !== undefined && signal !== null && typeof signal !== "object") {
    throw createError("invalidOptions", "signal must be an AbortSignal-like object", {})
  }
  const clock = now === undefined ? () => performance.now() : now
  if (typeof clock !== "function") throw createError("invalidClock", "now must be a function", {})

  // The deadline starts before validation. It is cooperative: a synchronous hash step is not
  // preempted, but every loop, chunk, freeze batch and the final check observes it. `signal` and
  // `now` are trusted synthetic seams (their getter/function reads are not authenticated), not a
  // hostile-proxy sandbox.
  let previous = readClock(clock)
  const deadline = previous + limits.timeoutMs
  const check = () => {
    if (signal !== undefined && signal !== null && signal.aborted) {
      throw createError("aborted", "preparation was cancelled", {})
    }
    const current = readClock(clock)
    if (current < previous) throw createError("invalidClock", "clock must not regress", {})
    previous = current
    if (current >= deadline) throw createError("deadline", "preparation deadline exceeded", {})
  }

  // Refuse expired/cancelled work before acquiring entry descriptors. Then snapshot caller-owned
  // entries before repeated work checks so later substitutions cannot alter accepted work.
  check()
  const slots = snapshotEntries(entriesInput, limits.maxFiles)
  const snapshots = slots.map((slot, index) => snapshotEntry(slot, index))
  check()

  const root = validateRoot(rootInput)

  const seenPaths = new Set()
  const filePaths = new Set()
  const validated = []
  for (const snapshot of snapshots) {
    check()
    const entryPath = snapshot.fields.get("path")
    const segments = validatePath(entryPath)
    const kind = snapshot.fields.get("kind")
    if (kind !== "source" && kind !== "config" && kind !== "generated") {
      throw createError("invalidKind", "kind must be source, config or generated", { path: entryPath })
    }
    if (seenPaths.has(entryPath)) throw createError("duplicatePath", "duplicate entry path", { path: entryPath })
    seenPaths.add(entryPath)

    const originalFields = snapshot.originalFields
    let absent
    let originalText = null
    let originalDigest = null
    if (originalFields.has("absent")) {
      requireExactFields(originalFields, ABSENT_FIELDS, "invalidOriginal", "original")
      if (originalFields.get("absent") !== true) {
        throw createError("invalidOriginal", "original absent must be exactly true", { path: entryPath })
      }
      absent = true
    } else {
      requireExactFields(originalFields, ORIGINAL_FIELDS, "invalidOriginal", "original")
      absent = false
      originalText = originalFields.get("text")
      if (typeof originalText !== "string") {
        throw createError("invalidOriginal", "original text must be a string", { path: entryPath })
      }
      originalDigest = readDigest(originalFields, "invalidOriginal", "original")
    }
    if (absent && kind !== "generated") {
      throw createError("originalRequired", `${kind} entries require an existing original`, { path: entryPath })
    }

    const resultFields = snapshot.resultFields
    requireExactFields(resultFields, RESULT_FIELDS, "invalidResult", "result")
    const resultText = resultFields.get("text")
    if (typeof resultText !== "string") throw createError("invalidResult", "result text must be a string", { path: entryPath })
    const resultDigest = readDigest(resultFields, "invalidResult", "result")

    validated.push({
      path: entryPath,
      segments,
      kind,
      original: absent ? { absent: true } : { text: originalText, sha256: originalDigest },
      result: { text: resultText, sha256: resultDigest },
    })
    filePaths.add(entryPath)
  }

  const usage = { files: 0, directories: 0, originalBytes: 0, resultBytes: 0, aggregateBytes: 0, metadataBytes: 0 }
  const chargeMetadata = (bytes, detail) => {
    if (bytes > limits.maxMetadataBytes - usage.metadataBytes) {
      throw createError("metadataBudget", "metadata budget exhausted", detail)
    }
    usage.metadataBytes += bytes
  }

  // Structural allocation runs before any content validation or hashing. Capacity is checked
  // before a record is created, and metadata is charged exactly once per allocated record/child.
  chargeMetadata(Buffer.byteLength(root, "utf8"), { root })
  const directories = new Map()
  const ensureDirectory = (directoryPath) => {
    if (filePaths.has(directoryPath)) {
      throw createError("fileDirectoryConflict", "path is both a file and a directory", { path: directoryPath })
    }
    const existing = directories.get(directoryPath)
    if (existing !== undefined) return existing
    if (usage.files + usage.directories + 1 > limits.maxFiles) {
      throw createError("fileBudget", "file and directory budget exhausted", { path: directoryPath })
    }
    chargeMetadata(Buffer.byteLength(directoryPath, "utf8"), { path: directoryPath })
    const record = { files: [], directories: [], directoryNames: new Set() }
    directories.set(directoryPath, record)
    usage.directories += 1
    return record
  }
  ensureDirectory("")
  for (const entry of validated) {
    check()
    let parentPath = ""
    for (let index = 0; index < entry.segments.length; index += 1) {
      check()
      const name = entry.segments[index]
      const parent = ensureDirectory(parentPath)
      const nameBytes = Buffer.byteLength(name, "utf8")
      if (index === entry.segments.length - 1) {
        if (directories.has(entry.path)) {
          throw createError("fileDirectoryConflict", "path is both a file and a directory", { path: entry.path })
        }
        if (usage.files + usage.directories + 1 > limits.maxFiles) {
          throw createError("fileBudget", "file and directory budget exhausted", { path: entry.path })
        }
        chargeMetadata(nameBytes + 1, { path: entry.path })
        chargeMetadata(
          Buffer.byteLength(entry.path, "utf8") + Buffer.byteLength(entry.kind, "utf8") + DIGEST_HEX_LENGTH * 2,
          { path: entry.path },
        )
        usage.files += 1
        parent.files.push(name)
      } else {
        if (!parent.directoryNames.has(name)) {
          chargeMetadata(nameBytes + 1, { path: entry.path })
          parent.directoryNames.add(name)
          parent.directories.push(name)
        }
        parentPath = parentPath === "" ? name : `${parentPath}/${name}`
      }
    }
  }

  for (const entry of validated) {
    check()
    const absent = entry.original.absent === true
    const originalBytes = absent ? 0 : Buffer.byteLength(entry.original.text, "utf8")
    const resultBytes = Buffer.byteLength(entry.result.text, "utf8")
    if (originalBytes > limits.maxFileBytes) {
      throw createError("fileTooLarge", "original exceeds maxFileBytes", { path: entry.path, field: "original", size: originalBytes })
    }
    if (resultBytes > limits.maxFileBytes) {
      throw createError("fileTooLarge", "result exceeds maxFileBytes", { path: entry.path, field: "result", size: resultBytes })
    }

    // A tiny replacement never discounts the base, and identical base/result text is charged twice.
    const combined = originalBytes + resultBytes
    if (combined > limits.maxAggregateBytes - usage.aggregateBytes) {
      throw createError("aggregateBudget", "aggregate byte budget exhausted", { path: entry.path })
    }
    usage.aggregateBytes += combined
    usage.originalBytes += originalBytes
    usage.resultBytes += resultBytes

    if (!absent) validateText(entry.original.text, check, "original")
    validateText(entry.result.text, check, "result")

    if (!absent) {
      const computed = hashText(entry.original.text, check)
      if (computed !== entry.original.sha256) {
        throw createError("originalHashMismatch", "original sha256 does not match its text", { path: entry.path })
      }
    }
    const computedResult = hashText(entry.result.text, check)
    if (computedResult !== entry.result.sha256) {
      throw createError("resultHashMismatch", "result sha256 does not match its text", { path: entry.path })
    }
  }

  const directoryPaths = [...directories.keys()].sort()
  const output = {
    root,
    entries: validated.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      original: { ...entry.original },
      result: { ...entry.result },
    })),
    directories: directoryPaths.map((directoryPath) => {
      const record = directories.get(directoryPath)
      return {
        path: directoryPath,
        files: record.files.slice().sort(),
        directories: record.directories.slice().sort(),
      }
    }),
    usage: {
      files: usage.files,
      directories: usage.directories,
      originalBytes: usage.originalBytes,
      resultBytes: usage.resultBytes,
      aggregateBytes: usage.aggregateBytes,
      metadataBytes: usage.metadataBytes,
    },
    limits,
  }

  freezeDeep(output, check, { nodes: 0 })
  check()
  return output
}

export function prepareOverlaySet(options) {
  try {
    return prepare(options)
  } catch (error) {
    if (error instanceof OverlaySetError) throw error
    throw createError("internal", "unexpected failure while preparing the overlay set", {})
  }
}
