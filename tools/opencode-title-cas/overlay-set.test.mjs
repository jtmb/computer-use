// Pure-memory contract tests: no filesystem, child process, network, native adapter or package
// import is used. Expected digests were derived once with sha256sum (or a whole-string UTF-8 Node
// digest for the chunk-boundary case), not from the module under test.
import test from "node:test"
import assert from "node:assert/strict"

import { DEFAULT_LIMITS, OverlaySetError, prepareOverlaySet } from "./overlay-set.mjs"

const SHA_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
const SHA_X = "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881"
const SHA_ABCD = "88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589"
const SHA_SOURCE = "5d2eb782fe3a645dbf5bdf2d765a254438962649c9c892811408cb50e04a5be4"
const SHA_CONFIG = "68254562be01a787ad7c65934b27a5b77fc79318e788a67f1e97ce25568d92f3"
const SHA_BOM = "70763fbb918fed9d753d8b42260b266294618e083146aade7fdc138b8a197098"
const SHA_CHUNK_BOUNDARY = "ed1ad8f2592f7d31f23904da4a418085f47e46f93fae0f586e1299a042981f09"

const SOURCE_TEXT = "export const answer = 42\n"
const CONFIG_TEXT = '{"title":"demo"}\n'
const BOM_TEXT = "\uFEFFgenerated\n"

const refusal = (run, code) => {
  try {
    run()
  } catch (error) {
    assert.ok(error instanceof OverlaySetError, `expected OverlaySetError, got ${error}`)
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`)
    return error
  }
  assert.fail(`expected refusal ${code}`)
}

const generated = (overrides = {}) => ({
  path: "a.txt",
  kind: "generated",
  original: { absent: true },
  result: { text: "x", sha256: SHA_X },
  ...overrides,
})

const successWorkload = () => [
  generated({ path: "one.txt" }),
  generated({ path: "two.txt" }),
  generated({ path: "three.txt" }),
]

const assertDeepFrozen = (value) => {
  if (value === null || typeof value !== "object") return
  assert.equal(Object.isFrozen(value), true)
  for (const key of Object.keys(value)) assertDeepFrozen(value[key])
}

test("prepares source, config and generated entries with an explicit absence", () => {
  const set = prepareOverlaySet({
    root: "/srv/overlay",
    entries: [
      {
        path: "src/app.js",
        kind: "source",
        original: { text: SOURCE_TEXT, sha256: SHA_SOURCE },
        result: { text: SOURCE_TEXT, sha256: SHA_SOURCE },
      },
      {
        path: "config/title.json",
        kind: "config",
        original: { text: CONFIG_TEXT, sha256: SHA_CONFIG },
        result: { text: CONFIG_TEXT, sha256: SHA_CONFIG },
      },
      {
        path: "dist/out.txt",
        kind: "generated",
        original: { absent: true },
        result: { text: BOM_TEXT, sha256: SHA_BOM },
      },
    ],
  })

  assert.equal(set.root, "/srv/overlay")
  assert.deepEqual(set.entries, [
    {
      path: "src/app.js",
      kind: "source",
      original: { text: SOURCE_TEXT, sha256: SHA_SOURCE },
      result: { text: SOURCE_TEXT, sha256: SHA_SOURCE },
    },
    {
      path: "config/title.json",
      kind: "config",
      original: { text: CONFIG_TEXT, sha256: SHA_CONFIG },
      result: { text: CONFIG_TEXT, sha256: SHA_CONFIG },
    },
    {
      path: "dist/out.txt",
      kind: "generated",
      original: { absent: true },
      result: { text: BOM_TEXT, sha256: SHA_BOM },
    },
  ])
  assert.deepEqual(set.directories, [
    { path: "", files: [], directories: ["config", "dist", "src"] },
    { path: "config", files: ["title.json"], directories: [] },
    { path: "dist", files: ["out.txt"], directories: [] },
    { path: "src", files: ["app.js"], directories: [] },
  ])
  assert.deepEqual(set.usage, {
    files: 3,
    directories: 4,
    originalBytes: 42,
    resultBytes: 55,
    aggregateBytes: 97,
    metadataBytes: 511,
  })
  assert.deepEqual(set.limits, DEFAULT_LIMITS)
  assert.equal(set.entries[2].original.absent, true)
  assert.equal(set.entries[2].result.text, "\uFEFFgenerated\n", "BOM is preserved byte for byte")
})

test("derives sorted inventories for every ancestor directory", () => {
  const set = prepareOverlaySet({
    root: "/r",
    entries: [
      generated({ path: "z/b.txt" }),
      generated({ path: "a.txt" }),
      generated({ path: "a/c/d.txt" }),
    ],
  })
  assert.deepEqual(set.directories, [
    { path: "", files: ["a.txt"], directories: ["a", "z"] },
    { path: "a", files: [], directories: ["c"] },
    { path: "a/c", files: ["d.txt"], directories: [] },
    { path: "z", files: ["b.txt"], directories: [] },
  ])
})

test("shared ancestors have unique direct-child directories and exact unique metadata", () => {
  const entries = [generated({ path: "a/b" }), generated({ path: "a/c" })]
  const expected = [
    { path: "", files: [], directories: ["a"] },
    { path: "a", files: ["b", "c"], directories: [] },
  ]
  const forward = prepareOverlaySet({ root: "/r", entries })
  const reverse = prepareOverlaySet({ root: "/r", entries: entries.slice().reverse() })
  assert.deepEqual(forward.directories, expected)
  assert.deepEqual(reverse.directories, expected)
  assert.equal(forward.usage.metadataBytes, 289)
  assert.equal(reverse.usage.metadataBytes, 289)
  assert.equal(prepareOverlaySet({ root: "/r", entries, limits: { maxMetadataBytes: 289 } }).usage.metadataBytes, 289)
})

test("file and directory capacity is refused before hashing entry content", () => {
  refusal(() => prepareOverlaySet({
    root: "/r", limits: { maxFiles: 2 },
    entries: [generated({ path: "a/b", result: { text: "x", sha256: SHA_EMPTY } })],
  }), "fileBudget")
})

test("entry arrays cannot execute accessor-backed elements", () => {
  let calls = 0
  const entries = []
  Object.defineProperty(entries, "0", { get() { calls++; return generated() } })
  refusal(() => prepareOverlaySet({ root: "/r", entries }), "invalidEntries")
  assert.equal(calls, 0)
})

test("options must be a plain own-data snapshot without invoking accessors", () => {
  let calls = 0
  const options = { entries: [] }
  Object.defineProperty(options, "root", { get() { calls++; return "/r" } })
  refusal(() => prepareOverlaySet(options), "invalidOptions")
  assert.equal(calls, 0)
})

test("unpaired surrogates cannot alias root UTF-8 identities", () => {
  for (const root of ["/r/\ud800", "/r/\udc00"]) {
    refusal(() => prepareOverlaySet({ root, entries: [] }), "invalidRoot")
  }
})

test("unpaired surrogates cannot alias entry path UTF-8 identities", () => {
  for (const path of ["bad\ud800", "bad\udc00"]) {
    refusal(() => prepareOverlaySet({ root: "/r", entries: [generated({ path })] }), "invalidPath")
  }
})

test("accepts the filesystem root and empty entries without inventing files", () => {
  const set = prepareOverlaySet({ root: "/", entries: [] })
  assert.equal(set.root, "/")
  assert.deepEqual(set.entries, [])
  assert.deepEqual(set.directories, [{ path: "", files: [], directories: [] }])
  assert.deepEqual(set.usage, {
    files: 0,
    directories: 1,
    originalBytes: 0,
    resultBytes: 0,
    aggregateBytes: 0,
    metadataBytes: 1,
  })
})

test("accepts real empty text and keeps absent distinct from empty", () => {
  const set = prepareOverlaySet({
    root: "/",
    entries: [
      generated({
        path: "empty.txt",
        original: { text: "", sha256: SHA_EMPTY },
        result: { text: "", sha256: SHA_EMPTY },
      }),
    ],
  })
  assert.deepEqual(set.entries[0].original, { text: "", sha256: SHA_EMPTY })
  assert.deepEqual(set.entries[0].result, { text: "", sha256: SHA_EMPTY })
  assert.equal(set.usage.originalBytes, 0)
  assert.equal(set.usage.resultBytes, 0)
  assert.equal(set.usage.aggregateBytes, 0)
  assert.equal(set.usage.metadataBytes, 157)
})

test("refuses both hash mismatches", () => {
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: [
          generated({
            kind: "source",
            original: { text: "x", sha256: SHA_EMPTY },
            result: { text: "x", sha256: SHA_X },
          }),
        ],
      }),
    "originalHashMismatch",
  )
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: [generated({ result: { text: "x", sha256: SHA_ABCD } })],
      }),
    "resultHashMismatch",
  )
})

test("hashes across the chunk boundary without splitting surrogate pairs", () => {
  const text = "a".repeat(65535) + "\u{1F600}"
  assert.equal(Buffer.byteLength(text, "utf8"), 65539)
  const set = prepareOverlaySet({
    root: "/r",
    entries: [generated({ result: { text, sha256: SHA_CHUNK_BOUNDARY } })],
  })
  assert.equal(set.entries[0].result.sha256, SHA_CHUNK_BOUNDARY)
  assert.equal(set.usage.resultBytes, 65539)
})

test("refuses invalid roots without claiming filesystem identity", () => {
  const invalid = [
    "",
    "relative/path",
    "/a/../b",
    "/a/",
    "//a",
    "/a//b",
    "C:/x",
    "C:\\x",
    "/a\\b",
    "/a\u0000b",
    "/" + "a".repeat(4096),
  ]
  for (const root of invalid) {
    refusal(() => prepareOverlaySet({ root, entries: [] }), "invalidRoot")
  }
})

test("refuses invalid or non-canonical paths", () => {
  const invalid = [
    "",
    "/abs",
    "a//b",
    "a/./b",
    "a/../b",
    "a/",
    ".",
    "..",
    "C:/x",
    "C:x",
    "a\\b",
    "a\u0000b",
    "x".repeat(4097),
  ]
  for (const pathValue of invalid) {
    refusal(() => prepareOverlaySet({ root: "/r", entries: [generated({ path: pathValue })] }), "invalidPath")
  }
})

test("refuses invalid kinds, records and text", () => {
  for (const kind of ["other", "Source", null]) {
    refusal(() => prepareOverlaySet({ root: "/r", entries: [generated({ kind })] }), "invalidKind")
  }

  refusal(() => prepareOverlaySet({ root: "/r", entries: [null] }), "invalidEntry")
  refusal(() => prepareOverlaySet({ root: "/r", entries: [[]] }), "invalidEntry")
  refusal(
    () => prepareOverlaySet({ root: "/r", entries: [{ ...generated(), extra: true }] }),
    "invalidEntry",
  )
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: [{ path: "a.txt", kind: "generated", original: { absent: true } }],
      }),
    "invalidEntry",
  )
  class FakeEntry {
    constructor() {
      Object.assign(this, generated())
    }
  }
  refusal(() => prepareOverlaySet({ root: "/r", entries: [new FakeEntry()] }), "invalidEntry")

  const accessorEntry = generated()
  Object.defineProperty(accessorEntry, "path", { enumerable: true, get: () => "a.txt" })
  refusal(() => prepareOverlaySet({ root: "/r", entries: [accessorEntry] }), "invalidEntry")

  for (const text of ["\uD800", "\uDC00", "a\u0000b"]) {
    refusal(
      () => prepareOverlaySet({ root: "/r", entries: [generated({ result: { text, sha256: SHA_EMPTY } })] }),
      "invalidText",
    )
  }
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: [
          generated({
            kind: "source",
            original: { text: "\uD800", sha256: SHA_EMPTY },
            result: { text: "x", sha256: SHA_X },
          }),
        ],
      }),
    "invalidText",
  )
})

test("refuses invalid limits, original shapes and result shapes", () => {
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], limits: null }), "invalidLimits")
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], limits: [] }), "invalidLimits")
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], limits: { maxFileBytes: 0 } }), "invalidLimit")
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], limits: { maxFileBytes: 1.5 } }), "invalidLimit")
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], limits: { maxFiles: "5" } }), "invalidLimit")
  refusal(
    () => prepareOverlaySet({ root: "/r", entries: [], limits: { maxFileBytes: 2097153 } }),
    "limitIncrease",
  )
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], limits: { unknown: 1 } }), "unknownLimit")

  refusal(() => prepareOverlaySet({ root: "/r", entries: [generated({ original: { text: "x" } })] }), "invalidOriginal")
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: [generated({ original: { text: "x", sha256: "ABC" } })],
      }),
    "invalidOriginal",
  )
  refusal(
    () => prepareOverlaySet({ root: "/r", entries: [generated({ original: { absent: false } })] }),
    "invalidOriginal",
  )
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: [generated({ original: { absent: true, text: "x" } })],
      }),
    "invalidOriginal",
  )
  refusal(() => prepareOverlaySet({ root: "/r", entries: [generated({ result: { text: "x" } })] }), "invalidResult")
  refusal(
    () => prepareOverlaySet({ root: "/r", entries: [generated({ result: { sha256: SHA_X } })] }),
    "invalidResult",
  )

  for (const kind of ["source", "config"]) {
    refusal(() => prepareOverlaySet({ root: "/r", entries: [generated({ kind })] }), "originalRequired")
  }
})

test("refuses duplicate paths even when the content is identical", () => {
  const entry = generated()
  refusal(() => prepareOverlaySet({ root: "/r", entries: [entry, entry] }), "duplicatePath")
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: [
          generated(),
          generated({ kind: "source", original: { text: "x", sha256: SHA_X } }),
        ],
      }),
    "duplicatePath",
  )
})

test("refuses file/directory conflicts independently of input order", () => {
  const file = generated({ path: "a" })
  const nested = generated({ path: "a/b.txt" })
  refusal(() => prepareOverlaySet({ root: "/r", entries: [file, nested] }), "fileDirectoryConflict")
  refusal(() => prepareOverlaySet({ root: "/r", entries: [nested, file] }), "fileDirectoryConflict")
})

test("refuses an oversized original even when the result is tiny", () => {
  const base = generated({
    kind: "source",
    original: { text: "abcd", sha256: SHA_ABCD },
    result: { text: "x", sha256: SHA_X },
  })
  const set = prepareOverlaySet({ root: "/r", entries: [base], limits: { maxFileBytes: 4 } })
  assert.equal(set.usage.aggregateBytes, 5)

  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        limits: { maxFileBytes: 4 },
        entries: [
          generated({
            kind: "source",
            original: { text: "abcde", sha256: SHA_ABCD },
            result: { text: "x", sha256: SHA_X },
          }),
        ],
      }),
    "fileTooLarge",
  )
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        limits: { maxFileBytes: 4 },
        entries: [generated({ original: { text: "x", sha256: SHA_X }, result: { text: "abcde", sha256: SHA_ABCD } })],
      }),
    "fileTooLarge",
  )
})

test("charges base plus result against the aggregate budget", () => {
  const entry = generated({
    kind: "source",
    original: { text: "abcd", sha256: SHA_ABCD },
    result: { text: "x", sha256: SHA_X },
  })
  prepareOverlaySet({ root: "/r", entries: [entry], limits: { maxAggregateBytes: 5 } })
  refusal(
    () => prepareOverlaySet({ root: "/r", entries: [entry], limits: { maxAggregateBytes: 4 } }),
    "aggregateBudget",
  )
})

test("counts result files and every virtual directory against maxFiles", () => {
  const nested = generated({ path: "a/b.txt" })
  const set = prepareOverlaySet({ root: "/r", entries: [nested], limits: { maxFiles: 3 } })
  assert.equal(set.usage.files, 1)
  assert.equal(set.usage.directories, 2)

  refusal(
    () => prepareOverlaySet({ root: "/r", entries: [nested], limits: { maxFiles: 2 } }),
    "fileBudget",
  )
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        limits: { maxFiles: 3 },
        entries: [nested, generated({ path: "a/c.txt" })],
      }),
    "fileBudget",
  )
})

test("enforces the metadata budget at the exact documented boundary", () => {
  const entry = generated({
    kind: "source",
    path: "a.txt",
    original: { text: "x", sha256: SHA_X },
    result: { text: "x", sha256: SHA_X },
  })
  const set = prepareOverlaySet({ root: "/r", entries: [entry], limits: { maxMetadataBytes: 147 } })
  assert.equal(set.usage.metadataBytes, 147)
  refusal(
    () => prepareOverlaySet({ root: "/r", entries: [entry], limits: { maxMetadataBytes: 146 } }),
    "metadataBudget",
  )
})

test("deeply freezes output and copies values away from mutable inputs", () => {
  const inputEntry = {
    path: "a.txt",
    kind: "source",
    original: { text: "x", sha256: SHA_X },
    result: { text: "x", sha256: SHA_X },
  }
  const entries = [inputEntry]
  const set = prepareOverlaySet({ root: "/r", entries })

  assertDeepFrozen(set)
  assert.notEqual(set.entries[0], inputEntry)
  assert.notEqual(set.entries[0].original, inputEntry.original)
  assert.throws(() => {
    set.entries[0].path = "changed"
  }, TypeError)
  assert.throws(() => {
    set.entries.push(generated())
  }, TypeError)
  assert.throws(() => {
    set.directories[0].files.push("injected")
  }, TypeError)
  assert.throws(() => {
    set.entries[0].original.text = "changed"
  }, TypeError)
  assert.throws(() => {
    set.usage.files = 0
  }, TypeError)
  assert.throws(() => {
    set.limits.maxFiles = 1
  }, TypeError)
  assert.throws(() => {
    set.root = "/other"
  }, TypeError)

  inputEntry.path = "b.txt"
  inputEntry.original.text = "changed"
  inputEntry.result.sha256 = SHA_EMPTY
  entries.push(generated({ path: "b.txt" }))
  entries.length = 0

  assert.equal(set.entries[0].path, "a.txt")
  assert.deepEqual(set.entries[0].original, { text: "x", sha256: SHA_X })
  assert.deepEqual(set.entries[0].result, { text: "x", sha256: SHA_X })
  assert.equal(set.usage.files, 1)
  assert.deepEqual(set.directories[0].files, ["a.txt"])
})

test("refuses cancellation at startup, during work and at the final check", () => {
  refusal(
    () => prepareOverlaySet({ root: "/r", entries: successWorkload(), signal: { aborted: true } }),
    "aborted",
  )

  let reads = 0
  const midSignal = {
    get aborted() {
      reads += 1
      return reads > 4
    },
  }
  refusal(
    () => prepareOverlaySet({ root: "/r", entries: successWorkload(), signal: midSignal }),
    "aborted",
  )
  assert.ok(reads >= 5, "cancellation was observed after startup")

  let passiveReads = 0
  const passive = {
    get aborted() {
      passiveReads += 1
      return false
    },
  }
  prepareOverlaySet({ root: "/r", entries: successWorkload(), signal: passive })
  const totalReads = passiveReads
  assert.ok(totalReads > 5)

  let lateReads = 0
  const lateSignal = {
    get aborted() {
      lateReads += 1
      return lateReads > totalReads - 1
    },
  }
  refusal(
    () => prepareOverlaySet({ root: "/r", entries: successWorkload(), signal: lateSignal }),
    "aborted",
  )
  assert.equal(lateReads, totalReads, "cancellation was observed at the final check")
})

test("startup cancellation stops before entry snapshot or shape work", () => {
  refusal(() => prepareOverlaySet({
    root: "/r", entries: [null], signal: { aborted: true },
  }), "aborted")
})

test("startup deadline stops before entry snapshot or shape work", () => {
  let calls = 0
  refusal(() => prepareOverlaySet({
    root: "/r", entries: [null], limits: { timeoutMs: 1 }, now: () => calls++,
  }), "deadline")
})

test("caller mutation after snapshot cannot replace entries or their content", () => {
  const entry = generated({ path: "kept.txt" })
  const entries = [entry]
  let calls = 0
  const result = prepareOverlaySet({ root: "/r", entries, now() {
    if (++calls === 3) {
      entry.path = "changed.txt"
      entry.result.text = "changed"
      entries[0] = null
      entries.push(null)
    }
    return 0
  } })
  assert.deepEqual(result.entries, [generated({ path: "kept.txt" })])
  assert.deepEqual(result.directories, [{ path: "", files: ["kept.txt"], directories: [] }])
})

test("default per-file cap still refuses a large original with a tiny replacement", () => {
  const error = refusal(() => prepareOverlaySet({
    root: "/r", entries: [generated({ kind: "source", original: {
      text: "x".repeat(DEFAULT_LIMITS.maxFileBytes + 1), sha256: SHA_X,
    } })],
  }), "fileTooLarge")
  assert.equal(error.detail.field, "original")
  assert.equal(error.detail.size, 2097153)
})

test("refuses exact, mid-work and end-of-work deadlines", () => {
  const times = [0, 1000]
  let index = 0
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: [],
        limits: { timeoutMs: 1000 },
        now: () => times[Math.min(index++, 1)],
      }),
    "deadline",
  )

  let ticks = 0
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: successWorkload(),
        limits: { timeoutMs: 8 },
        now: () => ticks++,
      }),
    "deadline",
  )
  assert.ok(ticks >= 8, "deadline was observed after startup")

  let countTicks = 0
  const counting = () => countTicks++
  prepareOverlaySet({ root: "/r", entries: successWorkload(), now: counting })
  const totalCalls = countTicks
  assert.ok(totalCalls > 10)
  countTicks = 0
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: successWorkload(),
        limits: { timeoutMs: totalCalls - 1 },
        now: counting,
      }),
    "deadline",
  )
})

test("refuses invalid, non-finite and regressing clocks", () => {
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], now: "clock" }), "invalidClock")
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], now: () => NaN }), "invalidClock")
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], now: () => Infinity }), "invalidClock")
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: [],
        now: () => {
          throw new Error("clock exploded")
        },
      }),
    "invalidClock",
  )

  const values = [5, 4]
  let index = 0
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        entries: [],
        now: () => values[Math.min(index++, 1)],
      }),
    "invalidClock",
  )
})

test("refuses options that are not an object and converts unexpected failures", () => {
  refusal(() => prepareOverlaySet(null), "invalidOptions")
  refusal(() => prepareOverlaySet([]), "invalidOptions")

  const hostile = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("hostile record")
      },
      getOwnPropertyDescriptor() {
        throw new Error("hostile record")
      },
    },
  )
  const error = refusal(() => prepareOverlaySet({ root: "/r", entries: [hostile] }), "internal")
  assert.equal(error.message.startsWith("overlay-set/internal:"), true)
})

test("never returns a partial result on refusal", () => {
  const state = { returned: false }
  try {
    const result = prepareOverlaySet({
      root: "/r",
      entries: [generated(), generated({ path: "" })],
    })
    state.returned = result !== undefined
  } catch (error) {
    assert.ok(error instanceof OverlaySetError)
    assert.equal(error.code, "invalidPath")
  }
  assert.equal(state.returned, false)
})

test("rejects sparse, extended, symbolic and subclassed entry arrays without invoking getters", () => {
  const sparse = new Array(2)
  sparse[0] = generated()
  refusal(() => prepareOverlaySet({ root: "/r", entries: sparse }), "invalidEntries")

  const extra = [generated()]
  extra.note = "x"
  refusal(() => prepareOverlaySet({ root: "/r", entries: extra }), "invalidEntries")

  const symbolic = [generated()]
  symbolic[Symbol("extra")] = true
  refusal(() => prepareOverlaySet({ root: "/r", entries: symbolic }), "invalidEntries")

  class EntryList extends Array {}
  refusal(() => prepareOverlaySet({ root: "/r", entries: new EntryList(generated()) }), "invalidEntries")

  let calls = 0
  const accessor = [generated()]
  Object.defineProperty(accessor, "1", {
    enumerable: true,
    get() {
      calls += 1
      return generated()
    },
  })
  refusal(() => prepareOverlaySet({ root: "/r", entries: accessor }), "invalidEntries")
  assert.equal(calls, 0)
})

test("rejects extra, inherited, symbolic and incomplete options", () => {
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], extra: true }), "invalidOptions")
  refusal(() => prepareOverlaySet({ root: "/r", entries: [], [Symbol("extra")]: true }), "invalidOptions")

  const inherited = Object.create({ extra: true })
  inherited.root = "/r"
  inherited.entries = []
  refusal(() => prepareOverlaySet(inherited), "invalidOptions")

  refusal(() => prepareOverlaySet({ root: "/r" }), "invalidOptions")
  refusal(() => prepareOverlaySet({ entries: [] }), "invalidOptions")
})

test("preserves valid surrogate pairs in roots and paths", () => {
  const root = "/r/\u{1F600}"
  const path = "dir-\u{1F4C1}/file.txt"
  const set = prepareOverlaySet({ root, entries: [generated({ path })] })
  assert.equal(set.root, root)
  assert.equal(set.entries[0].path, path)
  assert.deepEqual(set.directories.map((directory) => directory.path), ["", "dir-\u{1F4C1}"])
  assert.deepEqual(set.directories[1].files, ["file.txt"])
})

test("metadata capacity is refused before original hashing", () => {
  refusal(
    () =>
      prepareOverlaySet({
        root: "/r",
        limits: { maxMetadataBytes: 3 },
        entries: [
          generated({
            path: "a/b",
            kind: "source",
            original: { text: "x", sha256: SHA_EMPTY },
          }),
        ],
      }),
    "metadataBudget",
  )
})

test("publishes the frozen default limits that bound every charge", () => {
  assert.deepEqual(DEFAULT_LIMITS, {
    maxFileBytes: 2097152,
    maxAggregateBytes: 67108864,
    maxFiles: 10000,
    maxMetadataBytes: 2097152,
    timeoutMs: 30000,
  })
  assert.equal(Object.isFrozen(DEFAULT_LIMITS), true)
})
