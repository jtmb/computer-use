// Pure in-memory verification that supplied results are exactly the supplied originals with the
// supplied unified-diff patches applied in order.
//
// Nothing here touches the filesystem, a native adapter, a compiler or a source generator: paths
// are lexical strings, `originals` and `results` are caller-supplied text claims, and no native
// root, API configuration, manifest, staging area or Git state is inspected. A passing result is
// evidence about these strings only; it is not a claim about a real checkout, a full dependency
// graph or an applied native route.
//
// Text handling is byte-exact. Every string must be valid UTF-8 text (no unpaired surrogate, no
// NUL) and patches must use LF line endings. Reconstructed line content is never returned, so the
// output carries digests and hunk audit records rather than source text.
//
// Budget accounting (deliberately exact and conservative):
// - maxFileBytes bounds each original text, each result text, each patch text and each rebuilt
//   intermediate file. Intermediate text is checked before it is produced.
// - maxAggregateBytes is charged the UTF-8 bytes of every original, every result, every patch text
//   and every rebuilt intermediate file (one charge per hunk application, not merely per file), so
//   repeated edits to one file cannot hide extra copies behind a single charge.
// - maxMetadataBytes is charged: 64 bytes per original digest slot plus its path bytes; 64 bytes
//   per result digest slot plus its path bytes; 64 bytes per patch digest slot plus its name bytes;
//   and 64 bytes per hunk audit record. Line splits used while parsing and while rebuilding a file
//   are bounded by the already charged patch or file text; object overhead is not metered
//   separately, and no copy is created that is not bounded by a charged text length.
// - maxFiles bounds each of the originals, results and patches collections and therefore the
//   unique input path set; it is not a compiler or dependency-closure claim.
// - maxHunks bounds hunk records across the whole invocation and is checked before a hunk body is
//   read. maxMetadataBytes is charged before a record is created.
// - Every default is at or below the accepted overlay-set helper's maximum; maxFileBytes matches
//   its 2 MiB ceiling exactly, and no limit here may be raised.
//
// Cancellation is cooperative. `signal` and `now` are trusted test seams, not a sandbox: the
// deadline is checked at startup, in record and line loops, between search candidates and hash
// chunks, and once before returning. A single synchronous string operation is not preempted, and
// this module makes no heap-cap, preemption-timing or full-graph guarantee.
import { createHash } from "node:crypto"
import { performance } from "node:perf_hooks"

export const DEFAULT_LIMITS = Object.freeze({
  maxFileBytes: 2097152,
  maxAggregateBytes: 8388608,
  maxFiles: 64,
  maxHunks: 512,
  maxMetadataBytes: 262144,
  timeoutMs: 15000,
})

const MAX_PATH_BYTES = 4096
const MAX_NAME_BYTES = 128
const DIGEST_HEX_LENGTH = 64
const HUNK_RECORD_BYTES = 64
const TEXT_CHUNK_UNITS = 65536
const SEARCH_CHECK_MASK = 255
const PARSE_CHECK_MASK = 255
const FREEZE_CHECK_MASK = 255
const MAX_LINE_NUMBER = 2147483647

const OPTION_FIELDS = Object.freeze(["originals", "patches", "results", "limits", "signal", "now"])
const FILE_FIELDS = Object.freeze(["path", "text"])
const PATCH_FIELDS = Object.freeze(["name", "text"])
const HUNK_HEADER =
  /^@@ -([0-9]+)(?:,([0-9]+))? \+([0-9]+)(?:,([0-9]+))? @@(?: (.*))?$/

const UNSUPPORTED_PREFIXES = Object.freeze([
  "diff --git ",
  "index ",
  "new file mode ",
  "deleted file mode ",
  "old mode ",
  "new mode ",
  "similarity index ",
  "dissimilarity index ",
  "rename from ",
  "rename to ",
  "copy from ",
  "copy to ",
  "Binary files ",
  "GIT binary patch",
  "literal ",
  "delta ",
])

export class PatchProvenanceError extends Error {
  constructor(code, message, detail) {
    super(`patch-provenance/${code}: ${message}`)
    this.name = "PatchProvenanceError"
    this.code = code
    this.detail = Object.freeze(detail ?? {})
  }
}

const createError = (code, message, detail) => new PatchProvenanceError(code, message, detail)

const snapshotRecord = (value, code, what) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw createError(code, `${what} must be an ordinary data record`, {})
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw createError(code, `${what} must be an ordinary data record`, {})
  }
  // One descriptor snapshot avoids repeated reads of a possibly changing accessor. Accessors are
  // refused instead of invoked, and symbol keys are refused rather than silently dropped.
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

// The collection is snapshotted once, before any work that could observe later mutation. Length
// and slot/property shape are checked before a new slot array is allocated.
const snapshotArray = (value, code, what, maxItems) => {
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
  if (length > maxItems) throw createError("fileBudget", `${what} exceeds maxFiles`, { count: length })
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length !== length + 1) {
    throw createError(code, `${what} must not be sparse or carry extra properties`, {})
  }
  const slots = new Array(length)
  for (const key of keys) {
    if (typeof key !== "string") throw createError(code, `${what} must not use symbol properties`, {})
    const descriptor = descriptors[key]
    if (!Object.hasOwn(descriptor, "value")) {
      throw createError(code, `${what} must not use accessor properties`, {})
    }
    if (key === "length") continue
    if (!isCanonicalIndex(key, length)) {
      throw createError(code, `${what} must not carry extra properties`, { key })
    }
    slots[Number(key)] = descriptor.value
  }
  return slots
}

const isWellFormedUnitPair = (value, index) => {
  const unit = value.charCodeAt(index)
  if (unit >= 0xd800 && unit <= 0xdbff) {
    if (index + 1 >= value.length) return false
    const next = value.charCodeAt(index + 1)
    return next >= 0xdc00 && next <= 0xdfff
  }
  return unit < 0xdc00 || unit > 0xdfff
}

const assertWellFormed = (value, code, what) => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (!isWellFormedUnitPair(value, index)) {
        throw createError(code, `${what} must not contain an unpaired high surrogate`, {})
      }
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw createError(code, `${what} must not contain an unpaired low surrogate`, {})
    }
  }
}

const validatePath = (value, code, what) => {
  if (typeof value !== "string" || value.length === 0) {
    throw createError(code, `${what} must be a non-empty relative POSIX path`, {})
  }
  if (value.length > MAX_PATH_BYTES) throw createError(code, `${what} exceeds the path length bound`, {})
  if (value.includes("\0") || value.includes("\\")) {
    throw createError(code, `${what} must not contain NUL or backslashes`, {})
  }
  if (value.startsWith("/")) throw createError(code, `${what} must be relative`, {})
  const first = value.charCodeAt(0)
  const letter = (first >= 65 && first <= 90) || (first >= 97 && first <= 122)
  if (letter && value.length >= 2 && value.charCodeAt(1) === 58) {
    throw createError(code, `${what} must not use a drive-like prefix`, {})
  }
  for (const segment of value.split("/")) {
    if (segment.length === 0) throw createError(code, `${what} must not contain empty segments`, {})
    if (segment === "." || segment === "..") {
      throw createError(code, `${what} must not contain dot segments`, {})
    }
  }
  assertWellFormed(value, code, what)
  const bytes = Buffer.byteLength(value, "utf8")
  if (bytes > MAX_PATH_BYTES) throw createError(code, `${what} exceeds the path byte bound`, {})
  return bytes
}

const isNameCodeUnit = (unit, first) => {
  const alphanumeric =
    (unit >= 48 && unit <= 57) || (unit >= 65 && unit <= 90) || (unit >= 97 && unit <= 122)
  if (first) return alphanumeric
  return alphanumeric || unit === 46 || unit === 95 || unit === 45
}

const validateName = (value, code, what) => {
  if (typeof value !== "string") throw createError(code, `${what} must be a string`, {})
  if (value.length === 0 || value.length > MAX_NAME_BYTES) {
    throw createError(code, `${what} must be a bounded simple name`, {})
  }
  if (!isNameCodeUnit(value.charCodeAt(0), true)) {
    throw createError(code, `${what} must start with an ASCII letter or digit`, {})
  }
  for (let index = 1; index < value.length; index += 1) {
    if (!isNameCodeUnit(value.charCodeAt(index), false)) {
      throw createError(code, `${what} must be a simple name, not a path`, {})
    }
  }
  return value.length
}

const validateText = (text, code, field, maxFileBytes, check) => {
  if (typeof text !== "string") throw createError(code, `${field} text must be a string`, { field })
  // UTF-8 never uses fewer bytes than UTF-16 code units, so the code-unit length is a safe early
  // guard before scanning a very large caller-supplied string.
  if (text.length > maxFileBytes) {
    throw createError("fileTooLarge", `${field} exceeds maxFileBytes`, { field, size: text.length })
  }
  for (let index = 0; index < text.length; index += 1) {
    if ((index & (TEXT_CHUNK_UNITS - 1)) === 0) check()
    const unit = text.charCodeAt(index)
    if (unit === 0) throw createError("invalidText", `${field} text must not contain NUL`, { field })
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (!isWellFormedUnitPair(text, index)) {
        throw createError("invalidText", `${field} text must not contain an unpaired high surrogate`, { field })
      }
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw createError("invalidText", `${field} text must not contain an unpaired low surrogate`, { field })
    }
  }
  const bytes = Buffer.byteLength(text, "utf8")
  if (bytes > maxFileBytes) {
    throw createError("fileTooLarge", `${field} exceeds maxFileBytes`, { field, size: bytes })
  }
  return bytes
}

const readClock = (clock) => {
  let value
  try {
    value = clock()
  } catch {
    throw createError("invalidClock", "clock failed during verification", {})
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
    if (!Number.isInteger(value) || value <= 0) {
      throw createError("invalidLimit", `${key} must be a positive integer`, { key })
    }
    if (value > DEFAULT_LIMITS[key]) {
      throw createError("limitIncrease", `${key} may only be reduced`, { key, value, max: DEFAULT_LIMITS[key] })
    }
    limits[key] = value
  }
  return Object.freeze(limits)
}

const hashText = (text, check) => {
  const hash = createHash("sha256")
  let start = 0
  while (start < text.length) {
    check()
    let end = Math.min(start + TEXT_CHUNK_UNITS, text.length)
    if (end < text.length) {
      // Encoding a split surrogate pair would substitute U+FFFD, so keep pairs in one chunk.
      const unit = text.charCodeAt(end - 1)
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

const splitFileLines = (text) => {
  const lines = text.split("\n")
  lines.pop()
  return lines
}

const parseIntSafe = (digits) => {
  if (digits === undefined) return null
  if (digits.length > 10) return null
  let value = 0
  for (let index = 0; index < digits.length; index += 1) {
    const unit = digits.charCodeAt(index)
    if (unit < 48 || unit > 57) return null
    value = value * 10 + (unit - 48)
  }
  if (value > MAX_LINE_NUMBER) return null
  return value
}

const unsupportedLine = (patchName, lineNumber, line) => {
  if (line.startsWith("\\ No newline at end of file")) {
    return createError("noNewlineSentinel", "patches must not use the no-newline sentinel", {
      patch: patchName,
      line: lineNumber,
    })
  }
  for (const prefix of UNSUPPORTED_PREFIXES) {
    if (line.startsWith(prefix)) {
      return createError("unsupportedConstruct", "unsupported patch construct", {
        patch: patchName,
        line: lineNumber,
      })
    }
  }
  return createError("unexpectedLine", "unexplained patch line", { patch: patchName, line: lineNumber })
}

const parseHunk = (context, patchName, lines, state) => {
  const { limits, check, chargeMetadata, hunkCounter } = context
  const headerLine = lines[state.index]
  const headerNumber = state.index + 1
  const match = HUNK_HEADER.exec(headerLine)
  if (match === null) {
    throw createError("badHunkHeader", "malformed hunk header", { patch: patchName, line: headerNumber })
  }
  const oldStart = parseIntSafe(match[1])
  const newStart = parseIntSafe(match[3])
  const oldCount = match[2] === undefined ? 1 : parseIntSafe(match[2])
  const newCount = match[4] === undefined ? 1 : parseIntSafe(match[4])
  if (oldStart === null || newStart === null || oldCount === null || newCount === null) {
    throw createError("badHunkHeader", "hunk numbers are out of range", { patch: patchName, line: headerNumber })
  }
  if (oldStart < 1 || newStart < 1 || oldCount < 1 || newCount < 1) {
    throw createError("badHunkHeader", "hunk locations and counts must be positive", {
      patch: patchName,
      line: headerNumber,
    })
  }
  if (oldCount > limits.maxFileBytes || newCount > limits.maxFileBytes) {
    throw createError("badHunkHeader", "hunk count exceeds the per-file byte bound", {
      patch: patchName,
      line: headerNumber,
    })
  }
  if (hunkCounter.value + 1 > limits.maxHunks) {
    throw createError("hunkBudget", "maxHunks exhausted", { patch: patchName, line: headerNumber })
  }
  chargeMetadata(HUNK_RECORD_BYTES, { patch: patchName, line: headerNumber })
  hunkCounter.value += 1
  state.index += 1

  const oldLines = []
  const newLines = []
  let oldSeen = 0
  let newSeen = 0
  while (oldSeen < oldCount || newSeen < newCount) {
    if (state.index >= lines.length) {
      throw createError("badHunkCounts", "hunk body ends before its declared counts", {
        patch: patchName,
        line: headerNumber,
      })
    }
    if ((state.index & PARSE_CHECK_MASK) === 0) check()
    const body = lines[state.index]
    if (body.length === 0) {
      throw createError("badHunkCounts", "hunk body line must carry a diff prefix", {
        patch: patchName,
        line: state.index + 1,
      })
    }
    const prefix = body.charCodeAt(0)
    if (prefix === 92) throw unsupportedLine(patchName, state.index + 1, body)
    if (prefix === 32) {
      oldSeen += 1
      newSeen += 1
      if (oldSeen > oldCount || newSeen > newCount) {
        throw createError("badHunkCounts", "hunk body exceeds its declared counts", {
          patch: patchName,
          line: headerNumber,
        })
      }
      const content = body.slice(1)
      oldLines.push(content)
      newLines.push(content)
    } else if (prefix === 45) {
      oldSeen += 1
      if (oldSeen > oldCount) {
        throw createError("badHunkCounts", "hunk body exceeds its declared old count", {
          patch: patchName,
          line: headerNumber,
        })
      }
      oldLines.push(body.slice(1))
    } else if (prefix === 43) {
      newSeen += 1
      if (newSeen > newCount) {
        throw createError("badHunkCounts", "hunk body exceeds its declared new count", {
          patch: patchName,
          line: headerNumber,
        })
      }
      newLines.push(body.slice(1))
    } else {
      throw createError("badHunkCounts", "hunk body line has no context, removal or addition prefix", {
        patch: patchName,
        line: state.index + 1,
      })
    }
    state.index += 1
  }
  if (state.index < lines.length) {
    const next = lines[state.index]
    if (!next.startsWith("--- ") && !next.startsWith("@@")) {
      const prefix = next.charCodeAt(0)
      if (prefix === 92) throw unsupportedLine(patchName, state.index + 1, next)
      if (prefix === 32 || prefix === 45 || prefix === 43) {
        throw createError("badHunkCounts", "hunk body continues past its declared counts", {
          patch: patchName,
          line: headerNumber,
        })
      }
      throw unsupportedLine(patchName, state.index + 1, next)
    }
  }
  return {
    declaredOldStart: oldStart,
    declaredNewStart: newStart,
    oldCount,
    newCount,
    oldLines,
    newLines,
  }
}

const parsePatch = (context, patchName, text) => {
  const { check } = context
  if (text.length === 0) {
    throw createError("unsupportedNoFinalNewline", "patch text must be newline-terminated", { patch: patchName })
  }
  if (!text.endsWith("\n")) {
    throw createError("unsupportedNoFinalNewline", "patch text must be newline-terminated", { patch: patchName })
  }
  if (text.includes("\r")) {
    throw createError("unsupportedNewline", "patch text must not use CRLF or carriage returns", {
      patch: patchName,
    })
  }
  const lines = text.split("\n")
  lines.pop()
  const sections = []
  const seenPaths = new Set()
  const state = { index: 0 }
  while (state.index < lines.length) {
    if ((state.index & PARSE_CHECK_MASK) === 0) check()
    const header = lines[state.index]
    if (header.startsWith("--- /dev/null")) {
      throw createError("unsupportedAddDelete", "patch must not add or delete a file", { patch: patchName })
    }
    if (!header.startsWith("--- ")) throw unsupportedLine(patchName, state.index + 1, header)
    const oldHeader = header.slice(4)
    if (!oldHeader.startsWith("a/")) {
      throw createError("unsupportedHeader", "old header must use an a/ path", { patch: patchName })
    }
    const oldPath = oldHeader.slice(2)
    if (oldPath.length === 0) {
      throw createError("invalidPath", "patch path must not be empty", { patch: patchName })
    }
    validatePath(oldPath, "invalidPath", "patch path")
    state.index += 1

    if (state.index >= lines.length || !lines[state.index].startsWith("+++ ")) {
      throw createError("malformedHeader", "old header must be followed by a new header", { patch: patchName })
    }
    const newHeader = lines[state.index].slice(4)
    if (newHeader === "/dev/null") {
      throw createError("unsupportedAddDelete", "patch must not add or delete a file", { patch: patchName })
    }
    if (!newHeader.startsWith("b/")) {
      throw createError("unsupportedHeader", "new header must use a b/ path", { patch: patchName })
    }
    const newPath = newHeader.slice(2)
    validatePath(newPath, "invalidPath", "patch path")
    if (newPath !== oldPath) {
      throw createError("pathMismatch", "old and new headers must name the same path", { patch: patchName })
    }
    if (seenPaths.has(oldPath)) {
      throw createError("duplicatePathInPatch", "a patch must not name the same file twice", {
        patch: patchName,
        path: oldPath,
      })
    }
    seenPaths.add(oldPath)
    state.index += 1

    const hunks = []
    while (state.index < lines.length && lines[state.index].startsWith("@@")) {
      hunks.push(parseHunk(context, patchName, lines, state))
    }
    if (hunks.length === 0) {
      throw createError("missingHunks", "patch file section must carry at least one hunk", {
        patch: patchName,
        path: oldPath,
      })
    }
    sections.push({ path: oldPath, hunks })
  }
  if (sections.length === 0) {
    throw createError("missingHunks", "patch must carry at least one file section", { patch: patchName })
  }
  return sections
}

const findMatch = (check, lines, needle, from, path) => {
  // Count comparisons, not just candidates: repetitive prefixes can make a single candidate
  // expensive, and the earlier-context diagnostic scan needs the same lifecycle checks.
  let steps = 0
  const checkSearch = () => {
    if ((steps++ & SEARCH_CHECK_MASK) === 0) check()
  }
  const lastStart = lines.length - needle.length
  let found = -1
  let position = lines.indexOf(needle[0], from)
  while (position !== -1 && position <= lastStart) {
    checkSearch()
    let matches = true
    for (let offset = 1; offset < needle.length; offset += 1) {
      checkSearch()
      if (lines[position + offset] !== needle[offset]) {
        matches = false
        break
      }
    }
    if (matches) {
      if (found !== -1) {
        throw createError("ambiguousContext", "hunk context matches more than one location", { path })
      }
      found = position
    }
    position = lines.indexOf(needle[0], position + 1)
  }
  if (found === -1) {
    let earlier = lines.indexOf(needle[0], 0)
    while (earlier !== -1 && earlier < from) {
      checkSearch()
      let matches = earlier <= lastStart
      for (let offset = 1; matches && offset < needle.length; offset += 1) {
        checkSearch()
        if (lines[earlier + offset] !== needle[offset]) matches = false
      }
      if (matches) {
        throw createError("reorderedHunk", "hunk context is located before the previous hunk end", { path })
      }
      earlier = lines.indexOf(needle[0], earlier + 1)
    }
    throw createError("missingContext", "hunk context does not match the current file", { path })
  }
  return found
}

const applyPatch = (context, patch, patchIndex, originalPaths, working, workingBytes, hunks) => {
  const { limits, check, usage } = context
  for (const section of patch.sections) {
    check()
    if (!originalPaths.has(section.path)) {
      throw createError("unknownPath", "patch target is not a supplied file", {
        patch: patch.name,
        path: section.path,
      })
    }
    const current = working.get(section.path)
    if (!current.endsWith("\n")) {
      throw createError("unsupportedNoFinalNewline", "targeted originals must be newline-terminated", {
        path: section.path,
      })
    }
    let lines = splitFileLines(current)
    let size = workingBytes.get(section.path)
    let searchStart = 0
    for (const hunk of section.hunks) {
      check()
      const matchIndex = findMatch(check, lines, hunk.oldLines, searchStart, section.path)
      let removedBytes = 0
      for (const line of hunk.oldLines) removedBytes += Buffer.byteLength(line, "utf8") + 1
      let addedBytes = 0
      for (const line of hunk.newLines) addedBytes += Buffer.byteLength(line, "utf8") + 1
      const nextSize = size - removedBytes + addedBytes
      if (nextSize > limits.maxFileBytes) {
        throw createError("fileTooLarge", "rebuilt intermediate exceeds maxFileBytes", {
          path: section.path,
          field: "intermediate",
          size: nextSize,
        })
      }
      if (nextSize > limits.maxAggregateBytes - usage.aggregateBytes) {
        throw createError("aggregateBudget", "aggregate byte budget exhausted by an intermediate", {
          path: section.path,
          patch: patch.name,
        })
      }
      const nextLength = lines.length - hunk.oldLines.length + hunk.newLines.length
      const nextLines = new Array(nextLength)
      let cursor = 0
      for (let index = 0; index < matchIndex; index += 1) nextLines[cursor++] = lines[index]
      for (const line of hunk.newLines) nextLines[cursor++] = line
      for (let index = matchIndex + hunk.oldLines.length; index < lines.length; index += 1) {
        nextLines[cursor++] = lines[index]
      }
      lines = nextLines
      size = nextSize
      usage.intermediateBytes += nextSize
      usage.aggregateBytes += nextSize
      hunks.push({
        file: section.path,
        patchIndex,
        hunkIndex: hunks.length,
        declaredOldStart: hunk.declaredOldStart,
        actualOldStart: matchIndex + 1,
        offset: matchIndex + 1 - hunk.declaredOldStart,
        declaredNewStart: hunk.declaredNewStart,
        oldCount: hunk.oldCount,
        newCount: hunk.newCount,
      })
      searchStart = matchIndex + hunk.newLines.length
    }
    working.set(section.path, lines.join("\n") + "\n")
    workingBytes.set(section.path, size)
  }
}

const prepare = (options) => {
  const optionFields = snapshotRecord(options, "invalidOptions", "options")
  for (const key of optionFields.keys()) {
    if (!OPTION_FIELDS.includes(key)) throw createError("invalidOptions", `unknown option ${key}`, { key })
  }
  for (const key of ["originals", "patches", "results"]) {
    if (!optionFields.has(key)) throw createError("invalidOptions", `options is missing ${key}`, { key })
  }
  const originalsInput = optionFields.get("originals")
  const patchesInput = optionFields.get("patches")
  const resultsInput = optionFields.get("results")
  const limits = normalizeLimits(optionFields.get("limits"))
  const signal = optionFields.get("signal")
  const now = optionFields.get("now")
  if (signal !== undefined && signal !== null && typeof signal !== "object") {
    throw createError("invalidOptions", "signal must be an AbortSignal-like object", {})
  }
  const clock = now === undefined ? () => performance.now() : now
  if (typeof clock !== "function") throw createError("invalidClock", "now must be a function", {})

  let previous = readClock(clock)
  const deadline = previous + limits.timeoutMs
  if (!Number.isFinite(deadline)) throw createError("invalidClock", "deadline is not finite", {})
  const check = () => {
    // `signal` and `now` are caller-provided trusted seams; their reads are not authenticated.
    if (signal !== undefined && signal !== null && signal.aborted) {
      throw createError("aborted", "verification was cancelled", {})
    }
    const current = readClock(clock)
    if (current < previous) throw createError("invalidClock", "clock must not regress", {})
    previous = current
    if (current >= deadline) throw createError("deadline", "verification deadline exceeded", {})
  }

  check()
  const originalSlots = snapshotArray(originalsInput, "invalidOriginals", "originals", limits.maxFiles)
  const resultSlots = snapshotArray(resultsInput, "invalidResults", "results", limits.maxFiles)
  const patchSlots = snapshotArray(patchesInput, "invalidPatches", "patches", limits.maxFiles)
  check()

  const usage = {
    files: 0,
    patches: 0,
    hunks: 0,
    originalBytes: 0,
    resultBytes: 0,
    patchBytes: 0,
    intermediateBytes: 0,
    aggregateBytes: 0,
    metadataBytes: 0,
  }
  const chargeAggregate = (bytes, detail) => {
    if (bytes > limits.maxAggregateBytes - usage.aggregateBytes) {
      throw createError("aggregateBudget", "aggregate byte budget exhausted", detail)
    }
    usage.aggregateBytes += bytes
  }
  const chargeMetadata = (bytes, detail) => {
    if (bytes > limits.maxMetadataBytes - usage.metadataBytes) {
      throw createError("metadataBudget", "metadata budget exhausted", detail)
    }
    usage.metadataBytes += bytes
  }

  const readFileRecord = (slot, index, kind) => {
    const code = kind === "original" ? "invalidOriginal" : "invalidResult"
    const what = `${kind}s[${index}]`
    const fields = snapshotRecord(slot, code, what)
    requireExactFields(fields, FILE_FIELDS, code, what)
    const path = fields.get("path")
    const pathBytes = validatePath(path, "invalidPath", `${what}.path`)
    const text = fields.get("text")
    const bytes = validateText(text, "invalidText", `${what}.text`, limits.maxFileBytes, check)
    chargeMetadata(DIGEST_HEX_LENGTH + pathBytes, { path })
    chargeAggregate(bytes, { path, field: kind })
    return { path, text, bytes }
  }

  const originalRecords = []
  const originalPaths = new Map()
  for (let index = 0; index < originalSlots.length; index += 1) {
    check()
    const record = readFileRecord(originalSlots[index], index, "original")
    if (originalPaths.has(record.path)) {
      throw createError("duplicatePath", "duplicate original path", { path: record.path })
    }
    originalPaths.set(record.path, record)
    originalRecords.push(record)
    usage.originalBytes += record.bytes
  }

  const resultRecords = []
  const resultPaths = new Map()
  for (let index = 0; index < resultSlots.length; index += 1) {
    check()
    const record = readFileRecord(resultSlots[index], index, "result")
    if (resultPaths.has(record.path)) {
      throw createError("duplicatePath", "duplicate result path", { path: record.path })
    }
    resultPaths.set(record.path, record)
    resultRecords.push(record)
    usage.resultBytes += record.bytes
  }

  if (originalPaths.size !== resultPaths.size) {
    throw createError("pathSetMismatch", "originals and results must name exactly the same files", {
      originals: originalPaths.size,
      results: resultPaths.size,
    })
  }
  for (const path of originalPaths.keys()) {
    if (!resultPaths.has(path)) {
      throw createError("pathSetMismatch", "results are missing a supplied file", { path })
    }
  }

  const patchRecords = []
  const patchNames = new Set()
  for (let index = 0; index < patchSlots.length; index += 1) {
    check()
    const what = `patches[${index}]`
    const fields = snapshotRecord(patchSlots[index], "invalidPatch", what)
    requireExactFields(fields, PATCH_FIELDS, "invalidPatch", what)
    const name = fields.get("name")
    const nameBytes = validateName(name, "invalidName", `${what}.name`)
    if (patchNames.has(name)) throw createError("duplicatePatchName", "duplicate patch name", { name })
    patchNames.add(name)
    const text = fields.get("text")
    const bytes = validateText(text, "invalidPatchText", `${what}.text`, limits.maxFileBytes, check)
    if (text.length === 0 || !text.endsWith("\n")) {
      throw createError("unsupportedNoFinalNewline", "patch text must be newline-terminated", { name })
    }
    if (text.includes("\r")) {
      throw createError("unsupportedNewline", "patch text must not use CRLF or carriage returns", { name })
    }
    chargeMetadata(DIGEST_HEX_LENGTH + nameBytes, { name })
    chargeAggregate(bytes, { name, field: "patch" })
    patchRecords.push({ name, text, bytes, sha256: null })
    usage.patchBytes += bytes
  }
  usage.patches = patchRecords.length
  usage.files = originalRecords.length

  const parsed = []
  const hunkCounter = { value: 0 }
  for (let index = 0; index < patchRecords.length; index += 1) {
    check()
    const record = patchRecords[index]
    const sections = parsePatch({ limits, check, chargeMetadata, hunkCounter }, record.name, record.text)
    parsed.push({ name: record.name, sections })
  }
  // Digests are computed only after every collection, base aggregate, metadata slot and hunk
  // capacity is known, so a capacity refusal cannot hide behind earlier hash work.
  for (const record of patchRecords) {
    check()
    record.sha256 = hashText(record.text, check)
  }

  for (const patch of parsed) {
    for (const section of patch.sections) {
      const original = originalPaths.get(section.path)
      if (original === undefined) {
        throw createError("unknownPath", "patch target is not a supplied file", {
          patch: patch.name,
          path: section.path,
        })
      }
      if (!original.text.endsWith("\n")) {
        throw createError("unsupportedNoFinalNewline", "targeted originals must be newline-terminated", {
          path: section.path,
        })
      }
    }
  }

  const working = new Map()
  const workingBytes = new Map()
  for (const record of originalRecords) {
    working.set(record.path, record.text)
    workingBytes.set(record.path, record.bytes)
  }
  const hunks = []
  for (let index = 0; index < parsed.length; index += 1) {
    applyPatch({ limits, check, usage }, parsed[index], index, originalPaths, working, workingBytes, hunks)
  }
  usage.hunks = hunks.length

  for (const result of resultRecords) {
    check()
    const finalText = working.get(result.path)
    if (finalText !== result.text) {
      throw createError("resultMismatch", "supplied result does not match the reconstructed text", {
        path: result.path,
        patched: hunks.some((hunk) => hunk.file === result.path),
      })
    }
  }

  const files = originalRecords
    .map((record) => ({
      path: record.path,
      originalSha256: hashText(record.text, check),
      resultSha256: hashText(resultPaths.get(record.path).text, check),
    }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))

  const output = {
    files,
    patches: patchRecords.map((record, order) => ({ name: record.name, sha256: record.sha256, order })),
    hunks: hunks.map((hunk) => ({ ...hunk })),
    usage: { ...usage },
    limits,
  }
  freezeDeep(output, check, { nodes: 0 })
  check()
  return output
}

export function verifyPatchProvenance(options) {
  try {
    return prepare(options)
  } catch (error) {
    if (error instanceof PatchProvenanceError) throw error
    throw createError("internal", "unexpected failure while verifying patch provenance", {})
  }
}
