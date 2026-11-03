// Pure-memory contract tests: no filesystem, child process, network, native adapter or Git command
// is used. Expected digests were derived once from the literal fixture strings with Node's
// independent `crypto` module, not from the verifier under test. Fixtures are small synthetic
// patches; they are not the repository's canonical title-CAS patches and prove nothing about a
// real checkout or a native apply route.
import test from "node:test"
import assert from "node:assert/strict"

import { DEFAULT_LIMITS, PatchProvenanceError, verifyPatchProvenance } from "./patch-provenance.mjs"

const ORIGINAL_A = "alpha\nbeta\ngamma\ndelta\n"
const ORIGINAL_B = "one\ntwo\nthree\n"
const ORIGINAL_KEEP = "untouched tail without newline"
const ORIGINAL_BOM = "\uFEFFline one\nline two\n"
const RESULT_A = "alpha\nBETA\ngamma\ninserted\ndelta\n"
const RESULT_B = "one\nTWO\nTHREE\n"

const SHA_A = "927c9bb49935d22cfef1df0fd954eb8011420a9b1ec2350d65647accf201bbe9"
const SHA_B = "b6285c57e8797db5d4c51c80d6f11938afda9b11c6a003549709189e9b4b92a2"
const SHA_KEEP = "8173fc2a71877caa3cdd5567784a94dfe7f714d2c2b1ce23e6859d0385d7e68c"
const SHA_BOM = "b5a9d9adf7a89dc74ecddb1d067850c75d5afce8c457aad70c3b60c31d00def6"
const SHA_RESULT_A = "e8dffe098ce17a81a9b09db30a52eb2af8c57a162f6fe1f48d1b696d0598c0d4"
const SHA_RESULT_B = "bcfa08af84b8583a224befd0ab7e524b07819f1cb484e983294c84a1d059cff2"
const SHA_PATCH_ONE = "5e65a7daed0ff57c8dfe45693bde2d672c1aa578d23bc93a418fdbc549f7a91f"
const SHA_PATCH_TWO = "7d9c20e0178e8241fb0c70e76e33cb59630e4bcfd2ccc5c7fbe7d49c8de1c8f7"

const lines = (...values) => `${values.join("\n")}\n`

const PATCH_ONE = lines(
  "--- a/src/a.txt",
  "+++ b/src/a.txt",
  "@@ -1,2 +1,2 @@",
  " alpha",
  "-beta",
  "+BETA",
  "--- a/src/b.txt",
  "+++ b/src/b.txt",
  "@@ -1,3 +1,3 @@",
  " one",
  "-two",
  "+TWO",
  " three",
)

const PATCH_TWO = lines(
  "--- a/src/a.txt",
  "+++ b/src/a.txt",
  "@@ -99,2 +99,3 @@",
  " BETA",
  " gamma",
  "+inserted",
  "--- a/src/b.txt",
  "+++ b/src/b.txt",
  "@@ -2,2 +2,2 @@",
  " TWO",
  "-three",
  "+THREE",
)

const file = (path, text) => ({ path, text })
const patch = (name, text) => ({ name, text })

const baseOriginals = () => [
  file("src/a.txt", ORIGINAL_A),
  file("src/b.txt", ORIGINAL_B),
  file("docs/keep.md", ORIGINAL_KEEP),
  file("assets/bom.txt", ORIGINAL_BOM),
]

const baseResults = () => [
  file("src/a.txt", RESULT_A),
  file("src/b.txt", RESULT_B),
  file("docs/keep.md", ORIGINAL_KEEP),
  file("assets/bom.txt", ORIGINAL_BOM),
]

const basePatches = () => [patch("first.patch", PATCH_ONE), patch("second.patch", PATCH_TWO)]

const workload = (overrides = {}) => ({
  originals: baseOriginals(),
  patches: basePatches(),
  results: baseResults(),
  ...overrides,
})

const refusal = (run, code, inspect) => {
  let output
  try {
    output = run()
  } catch (error) {
    assert.ok(error instanceof PatchProvenanceError, `expected PatchProvenanceError, got ${error}`)
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`)
    if (inspect !== undefined) inspect(error)
    return error
  }
  assert.fail(`expected refusal ${code}, got ${JSON.stringify(output)}`)
}

const assertDeepFrozen = (value) => {
  if (value === null || typeof value !== "object") return
  assert.equal(Object.isFrozen(value), true)
  for (const key of Object.keys(value)) assertDeepFrozen(value[key])
}

test("verifies two ordered patches over multiple files plus untouched files", () => {
  const output = verifyPatchProvenance(workload())

  assert.deepEqual(
    output.files.map((entry) => entry.path),
    ["assets/bom.txt", "docs/keep.md", "src/a.txt", "src/b.txt"],
  )
  assert.deepEqual(output.files, [
    { path: "assets/bom.txt", originalSha256: SHA_BOM, resultSha256: SHA_BOM },
    { path: "docs/keep.md", originalSha256: SHA_KEEP, resultSha256: SHA_KEEP },
    { path: "src/a.txt", originalSha256: SHA_A, resultSha256: SHA_RESULT_A },
    { path: "src/b.txt", originalSha256: SHA_B, resultSha256: SHA_RESULT_B },
  ])
  assert.deepEqual(output.patches, [
    { name: "first.patch", sha256: SHA_PATCH_ONE, order: 0 },
    { name: "second.patch", sha256: SHA_PATCH_TWO, order: 1 },
  ])

  assert.equal(output.hunks.length, 4)
  assert.deepEqual(output.hunks[2], {
    file: "src/a.txt",
    patchIndex: 1,
    hunkIndex: 2,
    declaredOldStart: 99,
    actualOldStart: 2,
    offset: -97,
    declaredNewStart: 99,
    oldCount: 2,
    newCount: 3,
  })

  assert.deepEqual(output.usage, {
    files: 4,
    patches: 2,
    hunks: 4,
    originalBytes: 88,
    resultBytes: 97,
    patchBytes: 277,
    intermediateBytes: 83,
    aggregateBytes: 545,
    metadataBytes: 1007,
  })
  assert.deepEqual(output.limits, DEFAULT_LIMITS)
  assertDeepFrozen(output)

  const serialized = JSON.stringify(output)
  assert.equal(serialized.includes("alpha"), false)
  assert.equal(serialized.includes("BETA"), false)
  assert.throws(() => {
    output.usage.files = 99
  })
  assert.throws(() => {
    output.hunks.push({})
  })
})

test("accepts an empty patch list when results equal originals byte for byte", () => {
  const originals = [file("plain.txt", "no final newline"), file("bom.txt", ORIGINAL_BOM)]
  const output = verifyPatchProvenance({
    originals,
    patches: [],
    results: originals.map((entry) => file(entry.path, entry.text)),
  })
  assert.equal(output.patches.length, 0)
  assert.equal(output.hunks.length, 0)
  assert.equal(output.usage.intermediateBytes, 0)
})

test("refuses reordered patches", () => {
  refusal(
    () =>
      verifyPatchProvenance(
        workload({ patches: [patch("second.patch", PATCH_TWO), patch("first.patch", PATCH_ONE)] }),
      ),
    "missingContext",
  )
})

test("refuses a hunk that appears before the previous hunk end", () => {
  const original = "one\ntwo\nthree\nfour\nfive\nsix\n"
  const reordered = lines(
    "--- a/r.txt",
    "+++ b/r.txt",
    "@@ -5,2 +5,2 @@",
    " five",
    "-six",
    "+SIX",
    "@@ -1,1 +1,1 @@",
    "-one",
    "+ONE",
  )
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("r.txt", original)],
        patches: [patch("reordered.patch", reordered)],
        results: [file("r.txt", "ONE\ntwo\nthree\nfour\nfive\nSIX\n")],
      }),
    "reorderedHunk",
  )
})

test("refuses hunk body counts that do not match the declared counts", () => {
  const short = lines("--- a/x.txt", "+++ b/x.txt", "@@ -1,3 +1,3 @@", " a", " b")
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\nb\nc\n")],
        patches: [patch("short.patch", short)],
        results: [file("x.txt", "a\nb\nc\n")],
      }),
    "badHunkCounts",
  )

  const long = lines("--- a/x.txt", "+++ b/x.txt", "@@ -1,1 +1,1 @@", " a", " b", " c")
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\nb\nc\n")],
        patches: [patch("long.patch", long)],
        results: [file("x.txt", "a\nb\nc\n")],
      }),
    "badHunkCounts",
  )
})

test("refuses ambiguous and missing context", () => {
  const ambiguous = lines("--- a/x.txt", "+++ b/x.txt", "@@ -1,1 +1,1 @@", "-same", "+diff")
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "same\nsame\n")],
        patches: [patch("ambiguous.patch", ambiguous)],
        results: [file("x.txt", "diff\nsame\n")],
      }),
    "ambiguousContext",
  )

  const missing = lines("--- a/x.txt", "+++ b/x.txt", "@@ -1,1 +1,1 @@", "-absent", "+diff")
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "present\n")],
        patches: [patch("missing.patch", missing)],
        results: [file("x.txt", "diff\n")],
      }),
    "missingContext",
  )
})

test("refuses zero, negative and overflowing hunk numbers", () => {
  const zeroStart = lines("--- a/x.txt", "+++ b/x.txt", "@@ -0,1 +1,1 @@", "-a", "+b")
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\n")],
        patches: [patch("zero.patch", zeroStart)],
        results: [file("x.txt", "b\n")],
      }),
    "badHunkHeader",
  )

  const zeroCount = lines("--- a/x.txt", "+++ b/x.txt", "@@ -1,0 +1,1 @@", "-a", "+b")
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\n")],
        patches: [patch("zero-count.patch", zeroCount)],
        results: [file("x.txt", "b\n")],
      }),
    "badHunkHeader",
  )

  const overflow = lines("--- a/x.txt", "+++ b/x.txt", "@@ -99999999999999,1 +1,1 @@", "-a", "+b")
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\n")],
        patches: [patch("overflow.patch", overflow)],
        results: [file("x.txt", "b\n")],
      }),
    "badHunkHeader",
  )
})

test("refuses extra result changes outside the hunks and changed untouched files", () => {
  const output = baseResults()
  output[0] = file("src/a.txt", `${RESULT_A}extra\n`)
  refusal(() => verifyPatchProvenance(workload({ results: output })), "resultMismatch", (error) => {
    assert.equal(error.detail.path, "src/a.txt")
  })

  const untouched = baseResults()
  untouched[2] = file("docs/keep.md", "changed untouched tail")
  refusal(() => verifyPatchProvenance(workload({ results: untouched })), "resultMismatch", (error) => {
    assert.equal(error.detail.patched, false)
  })
})

test("refuses missing, extra, duplicate and unknown paths", () => {
  const missing = baseResults().filter((entry) => entry.path !== "docs/keep.md")
  refusal(() => verifyPatchProvenance(workload({ results: missing })), "pathSetMismatch")

  const extra = [...baseResults(), file("extra.txt", "x\n")]
  refusal(() => verifyPatchProvenance(workload({ results: extra })), "pathSetMismatch")

  const duplicateOriginal = [...baseOriginals(), file("src/a.txt", ORIGINAL_A)]
  refusal(() => verifyPatchProvenance(workload({ originals: duplicateOriginal })), "duplicatePath")

  const duplicateResult = [...baseResults(), file("src/a.txt", RESULT_A)]
  refusal(() => verifyPatchProvenance(workload({ results: duplicateResult })), "duplicatePath")

  const unknownTarget = lines("--- a/src/z.txt", "+++ b/src/z.txt", "@@ -1,1 +1,1 @@", "-a", "+b")
  refusal(
    () => verifyPatchProvenance(workload({ patches: [patch("unknown.patch", unknownTarget)] })),
    "unknownPath",
  )
})

test("refuses duplicate patch names and duplicate files inside one patch", () => {
  const duplicateNames = [patch("same.patch", PATCH_ONE), patch("same.patch", PATCH_TWO)]
  refusal(() => verifyPatchProvenance(workload({ patches: duplicateNames })), "duplicatePatchName")

  const duplicateFile = lines(
    "--- a/src/a.txt",
    "+++ b/src/a.txt",
    "@@ -1,1 +1,1 @@",
    "-alpha",
    "+first",
    "--- a/src/a.txt",
    "+++ b/src/a.txt",
    "@@ -1,1 +1,1 @@",
    "-first",
    "+second",
  )
  refusal(
    () => verifyPatchProvenance(workload({ patches: [patch("twice.patch", duplicateFile)] })),
    "duplicatePathInPatch",
  )
})

test("refuses unsupported patch constructs without skipping lines", () => {
  const cases = [
    ["Binary files a/x.txt and b/x.txt differ\n", "unsupportedConstruct"],
    ["rename from x.txt\nrename to y.txt\n", "unsupportedConstruct"],
    ["old mode 100644\nnew mode 100755\n", "unsupportedConstruct"],
    ["diff --git a/x.txt b/x.txt\n", "unsupportedConstruct"],
    ["index 1111111..2222222 100644\n", "unsupportedConstruct"],
    ["--- /dev/null\n+++ b/x.txt\n@@ -1,1 +1,1 @@\n-a\n+b\n", "unsupportedAddDelete"],
    ["--- a/x.txt\n+++ b/x.txt\n@@ -1,1 +1,1 @@\n-a\n+b\n\\ No newline at end of file\n", "noNewlineSentinel"],
  ]
  for (const [text, code] of cases) {
    refusal(
      () =>
        verifyPatchProvenance({
          originals: [file("x.txt", "a\n")],
          patches: [patch("bad.patch", text)],
          results: [file("x.txt", "b\n")],
        }),
      code,
    )
  }
})

test("refuses CRLF, NUL, invalid Unicode and non-newline-terminated patches", () => {
  const valid = lines("--- a/x.txt", "+++ b/x.txt", "@@ -1,1 +1,1 @@", "-a", "+b")
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\n")],
        patches: [patch("crlf.patch", valid.replaceAll("\n", "\r\n"))],
        results: [file("x.txt", "b\n")],
      }),
    "unsupportedNewline",
  )

  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\n")],
        patches: [patch("nul.patch", `${valid}\0`)],
        results: [file("x.txt", "b\n")],
      }),
    "invalidText",
  )

  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\n")],
        patches: [patch("surrogate.patch", `${valid}\ud800`)],
        results: [file("x.txt", "b\n")],
      }),
    "invalidText",
  )

  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\n")],
        patches: [patch("unterminated.patch", valid.slice(0, -1))],
        results: [file("x.txt", "b\n")],
      }),
    "unsupportedNoFinalNewline",
  )

  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\n")],
        patches: [patch("empty.patch", "")],
        results: [file("x.txt", "a\n")],
      }),
    "unsupportedNoFinalNewline",
  )
})

test("refuses path aliases, invalid text and non-newline-terminated targets", () => {
  const badPaths = ["../x.txt", "/abs.txt", "a\\b.txt", "C:/x.txt", "", ".", "a//b.txt"]
  for (const badPath of badPaths) {
    refusal(
      () =>
        verifyPatchProvenance({
          originals: [file(badPath, "a\n")],
          patches: [],
          results: [file(badPath, "a\n")],
        }),
      "invalidPath",
    )
  }

  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\0b\n")],
        patches: [],
        results: [file("x.txt", "a\0b\n")],
      }),
    "invalidText",
  )

  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\udc00b\n")],
        patches: [],
        results: [file("x.txt", "a\udc00b\n")],
      }),
    "invalidText",
  )

  const target = lines("--- a/x.txt", "+++ b/x.txt", "@@ -1,1 +1,1 @@", "-a", "+b")
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a")],
        patches: [patch("target.patch", target)],
        results: [file("x.txt", "b")],
      }),
    "unsupportedNoFinalNewline",
  )
})

test("refuses accessor, extra, symbol, sparse and non-plain inputs without invoking getters", () => {
  let getterCalls = 0
  const options = { patches: [], results: [] }
  Object.defineProperty(options, "originals", {
    enumerable: true,
    get() {
      getterCalls += 1
      return []
    },
  })
  refusal(() => verifyPatchProvenance(options), "invalidOptions")
  assert.equal(getterCalls, 0)

  const slotted = []
  slotted.length = 1
  Object.defineProperty(slotted, "0", {
    enumerable: true,
    get() {
      getterCalls += 1
      return file("x.txt", "a\n")
    },
  })
  refusal(
    () =>
      verifyPatchProvenance({
        originals: slotted,
        patches: [],
        results: [file("x.txt", "a\n")],
      }),
    "invalidOriginals",
  )
  assert.equal(getterCalls, 0)

  const sparse = [file("x.txt", "a\n")]
  sparse.length = 2
  refusal(
    () =>
      verifyPatchProvenance({
        originals: sparse,
        patches: [],
        results: [file("x.txt", "a\n")],
      }),
    "invalidOriginals",
  )

  const extraProperty = [file("x.txt", "a\n")]
  extraProperty.extra = true
  refusal(
    () =>
      verifyPatchProvenance({
        originals: extraProperty,
        patches: [],
        results: [file("x.txt", "a\n")],
      }),
    "invalidOriginals",
  )

  const symbolRecord = { path: "x.txt", text: "a\n", [Symbol("extra")]: true }
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [symbolRecord],
        patches: [],
        results: [file("x.txt", "a\n")],
      }),
    "invalidOriginal",
  )

  class Record {
    constructor() {
      this.path = "x.txt"
      this.text = "a\n"
    }
  }
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [new Record()],
        patches: [],
        results: [file("x.txt", "a\n")],
      }),
    "invalidOriginal",
  )

  const inherited = Object.create({ path: "x.txt", text: "a\n" })
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [inherited],
        patches: [],
        results: [file("x.txt", "a\n")],
      }),
    "invalidOriginal",
  )

  refusal(
    () => verifyPatchProvenance({ ...workload(), extra: 1 }),
    "invalidOptions",
  )
})

test("reduces limits but refuses unknown, non-positive, non-integer and increased limits", () => {
  refusal(() => verifyPatchProvenance(workload({ limits: { maxFiles: 0 } })), "invalidLimit")
  refusal(() => verifyPatchProvenance(workload({ limits: { maxFiles: 1.5 } })), "invalidLimit")
  refusal(() => verifyPatchProvenance(workload({ limits: { maxFiles: 65 } })), "limitIncrease")
  refusal(() => verifyPatchProvenance(workload({ limits: { surprise: 1 } })), "unknownLimit")

  const reduced = verifyPatchProvenance(
    workload({
      limits: {
        maxFileBytes: 200,
        maxAggregateBytes: 1000,
        maxFiles: 4,
        maxHunks: 4,
        maxMetadataBytes: 2000,
        timeoutMs: 15000,
      },
    }),
  )
  assert.equal(reduced.limits.maxFiles, 4)
  assert.equal(reduced.limits.maxHunks, 4)
})

test("enforces per-file, aggregate, file-count, hunk and metadata budgets", () => {
  refusal(
    () => verifyPatchProvenance(workload({ limits: { maxFileBytes: 5 } })),
    "fileTooLarge",
    (error) => assert.equal(error.detail.field, "originals[0].text"),
  )
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\n")],
        patches: [],
        results: [file("x.txt", "longer\n")],
        limits: { maxFileBytes: 5 },
      }),
    "fileTooLarge",
    (error) => assert.equal(error.detail.field, "results[0].text"),
  )
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("a.txt", "a\n")],
        patches: [patch("p.patch", lines("--- a/a.txt", "+++ b/a.txt", "@@ -1,1 +1,1 @@", "-a", "+b"))],
        results: [file("a.txt", "b\n")],
        limits: { maxAggregateBytes: 10 },
      }),
    "aggregateBudget",
  )
  refusal(() => verifyPatchProvenance(workload({ limits: { maxFiles: 3 } })), "fileBudget")
  refusal(() => verifyPatchProvenance(workload({ limits: { maxHunks: 3 } })), "hunkBudget")
  refusal(
    () => verifyPatchProvenance(workload({ limits: { maxMetadataBytes: 1 } })),
    "metadataBudget",
  )
})

test("enforces maxFileBytes on a rebuilt intermediate, not just supplied records", () => {
  const original = Array.from({ length: 18 }, (_, index) => `a${String(index + 1).padStart(3, "0")}`).join("\n") + "\n"
  const first = lines(
    "--- a/n.txt",
    "+++ b/n.txt",
    "@@ -1,2 +1,3 @@",
    " a001",
    " a002",
    "+extra-line-xyz",
  )
  const second = lines(
    "--- a/n.txt",
    "+++ b/n.txt",
    "@@ -1,3 +1,3 @@",
    " a001",
    " a002",
    "-extra-line-xyz",
    "+short",
  )
  const result = ["a001", "a002", "short", ...Array.from({ length: 16 }, (_, index) => `a${String(index + 3).padStart(3, "0")}`)].join("\n") + "\n"
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("n.txt", original)],
        patches: [patch("grow.patch", first), patch("shrink.patch", second)],
        results: [file("n.txt", result)],
        limits: { maxFileBytes: 100, maxAggregateBytes: 4000 },
      }),
    "fileTooLarge",
    (error) => assert.equal(error.detail.field, "intermediate"),
  )
})

test("refuses an unexplained trailing line instead of skipping it", () => {
  const withJunk = lines(
    "--- a/x.txt",
    "+++ b/x.txt",
    "@@ -1,1 +1,1 @@",
    "-a",
    "+b",
    "trailing junk",
  )
  refusal(
    () =>
      verifyPatchProvenance({
        originals: [file("x.txt", "a\n")],
        patches: [patch("junk.patch", withJunk)],
        results: [file("x.txt", "b\n")],
      }),
    "unexpectedLine",
  )
})

test("refuses an already-aborted signal, a mid-run abort and a final-check abort", () => {
  refusal(() => verifyPatchProvenance(workload({ signal: { aborted: true } })), "aborted")

  let midCalls = 0
  const midSignal = {
    get aborted() {
      midCalls += 1
      return midCalls > 10
    },
  }
  refusal(() => verifyPatchProvenance(workload({ signal: midSignal })), "aborted")

  let totalCalls = 0
  const countingSignal = {
    get aborted() {
      totalCalls += 1
      return false
    },
  }
  verifyPatchProvenance(workload({ signal: countingSignal }))
  assert.ok(totalCalls > 10)

  let lateCalls = 0
  const lateSignal = {
    get aborted() {
      lateCalls += 1
      return lateCalls >= totalCalls
    },
  }
  refusal(() => verifyPatchProvenance(workload({ signal: lateSignal })), "aborted")
})

test("refuses deadlines and invalid clocks", () => {
  let clockReads = 0
  refusal(
    () =>
      verifyPatchProvenance(
        workload({
          now: () => {
            clockReads += 1
            return clockReads > 8 ? 20000 : 0
          },
          limits: { timeoutMs: 15000 },
        }),
      ),
    "deadline",
  )

  refusal(() => verifyPatchProvenance(workload({ now: () => Number.NaN })), "invalidClock")
  refusal(() => verifyPatchProvenance(workload({ now: () => "later" })), "invalidClock")

  const values = [0, 10, 5]
  let index = 0
  refusal(
    () => verifyPatchProvenance(workload({ now: () => values[Math.min(index++, values.length - 1)] })),
    "invalidClock",
  )

  refusal(
    () =>
      verifyPatchProvenance(
        workload({
          now: () => {
            throw new Error("clock exploded")
          },
        }),
      ),
    "invalidClock",
  )
})

test("deadline checks cover long forward context comparisons, not only candidate counts", () => {
  const original = "a\n".repeat(500) + "tail\n"
  const text = lines("--- a/x", "+++ b/x", "@@ -1,201 +1,201 @@", ...Array(200).fill(" a"), "-missing", "+MISSING")
  let ticks = 0
  refusal(() => verifyPatchProvenance({
    originals: [file("x", original)], results: [file("x", original)],
    patches: [patch("long.patch", text)], limits: { timeoutMs: 100 }, now: () => ticks++,
  }), "deadline")
})

test("deadline checks cover the earlier-context scan after a previous hunk", () => {
  const original = "a\n".repeat(500) + "tail\n"
  const text = lines("--- a/x", "+++ b/x", "@@ -501,1 +501,1 @@", "-tail", "+TAIL",
    "@@ -1,201 +1,201 @@", ...Array(200).fill(" a"), "-missing", "+MISSING")
  let ticks = 0
  refusal(() => verifyPatchProvenance({
    originals: [file("x", original)], results: [file("x", "a\n".repeat(500) + "TAIL\n")],
    patches: [patch("long.patch", text)], limits: { timeoutMs: 100 }, now: () => ticks++,
  }), "deadline")
})

test("returns no partial result when a later patch fails", () => {
  let output = "unset"
  const badPatches = [patch("first.patch", PATCH_ONE), patch("bad.patch", "not a diff\n")]
  try {
    output = verifyPatchProvenance(workload({ patches: badPatches }))
  } catch (error) {
    assert.ok(error instanceof PatchProvenanceError)
  }
  assert.equal(output, "unset")
})
