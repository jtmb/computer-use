/** Focused tests for the computer-use plugin's bounded logic. */

import assert from "node:assert/strict"
import { test } from "node:test"
import { deflateSync } from "node:zlib"

import {
  buildDesktopArgs,
  describeDesktopFailure,
  MAX_DEPTH_LIMIT,
  MAX_TEXT_LENGTH,
} from "./desktop.ts"
import {
  captureOnce,
  isAttachmentSize,
  isSafeEntryName,
  MAX_ATTACHMENT_BYTES,
  newScreenshots,
  pngDimensions,
  planCapture,
  KEY_SEQUENCES,
  type CaptureDeps,
  type CaptureFileEntry,
} from "./screenshot.ts"

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const result = Buffer.alloc(12 + data.length)
  result.writeUInt32BE(data.length, 0)
  result.write(type, 4, "ascii")
  data.copy(result, 8)
  result.writeUInt32BE(crc32(result.subarray(4, 8 + data.length)), 8 + data.length)
  return result
}

function png(width: number, height: number, extraBytes = 0): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const pixels = Buffer.alloc(Math.max(0, height * (1 + width * 4)))
  const chunks = [chunk("IHDR", header), chunk("IDAT", deflateSync(pixels))]
  if (extraBytes > 0) chunks.push(chunk("tEXt", Buffer.alloc(extraBytes, 0x61)))
  chunks.push(chunk("IEND", Buffer.alloc(0)))
  return Buffer.concat([PNG_HEADER, ...chunks])
}

/** In-memory capture dependencies with a controllable clock. */
function fakeDeps(initial: string[], created: Record<string, Buffer>): CaptureDeps & {
  removed: string[]
  files: Set<string>
  identities: Map<string, string>
} {
  const files = new Set(initial)
  const identities = new Map(initial.map((name) => [name, `initial:${name}`]))
  const removed: string[] = []
  let clock = 0
  return {
    files,
    removed,
    identities,
    async list() {
      return [...files].sort().map((name): CaptureFileEntry => ({
        name,
        identity: identities.get(name)!,
      }))
    },
    async trigger() {
      for (const [name, bytes] of Object.entries(created)) {
        files.add(name)
        identities.set(name, `created:${name}`)
        void bytes
      }
      const names = Object.keys(created)
      return names.length === 1
        ? { name: names[0]!, identity: identities.get(names[0]!)! }
        : undefined
    },
    async read(name, identity, maxBytes) {
      if (identities.get(name) !== identity) throw new Error("capture identity changed")
      const bytes = created[name]
      if (!bytes) throw new Error("unexpected read")
      return bytes.subarray(0, maxBytes + 1)
    },
    async remove(name, identity) {
      if (identities.get(name) !== identity) throw new Error("capture identity changed before removal")
      removed.push(name)
      files.delete(name)
      identities.delete(name)
    },
    async delay() {
      clock += 250
    },
    now: () => clock,
    waitMs: 1_000,
    pollMs: 250,
  }
}

test("capture key sequences match GNOME's screenshot shortcuts", () => {
  assert.deepEqual(KEY_SEQUENCES.screen, ["42:1", "99:1", "99:0", "42:0"])
  assert.deepEqual(KEY_SEQUENCES.window, ["56:1", "99:1", "99:0", "56:0"])
})

test("newScreenshots reports only newly created names", () => {
  assert.deepEqual(newScreenshots(["a.png", "b.png"], ["b.png", "a.png"]), [])
  assert.deepEqual(newScreenshots(["a.png"], ["a.png", "c.png", "b.png"]), [
    "b.png",
    "c.png",
  ])
})

test("planCapture distinguishes none, one, and ambiguous results", () => {
  assert.deepEqual(planCapture(["a.png"], ["a.png"]), { status: "none" })
  assert.deepEqual(planCapture(["a.png"], ["a.png", "b.png"]), {
    status: "captured",
    name: "b.png",
  })
  assert.deepEqual(planCapture([], ["a.png", "b.png"]), {
    status: "ambiguous",
    names: ["a.png", "b.png"],
  })
})

test("pngDimensions validates the signature and IHDR", () => {
  assert.deepEqual(pngDimensions(png(3, 2)), { width: 3, height: 2 })
  assert.equal(pngDimensions(Buffer.from("not a png at all, definitely")), undefined)
  assert.equal(pngDimensions(Buffer.alloc(4)), undefined)
  assert.equal(pngDimensions(png(0, 900)), undefined)
  assert.equal(pngDimensions(png(1440, 0)), undefined)
  assert.equal(pngDimensions(png(3, 2).subarray(0, -12)), undefined)
  const corrupt = png(3, 2)
  corrupt[corrupt.length - 1] ^= 0xff
  assert.equal(pngDimensions(corrupt), undefined)
})

test("isAttachmentSize enforces the 6 MiB attachment cap", () => {
  assert.equal(isAttachmentSize(0), false)
  assert.equal(isAttachmentSize(1), true)
  assert.equal(isAttachmentSize(MAX_ATTACHMENT_BYTES), true)
  assert.equal(isAttachmentSize(MAX_ATTACHMENT_BYTES + 1), false)
})

test("isSafeEntryName rejects path separators and empty names", () => {
  assert.equal(isSafeEntryName("Screenshot From 2026-10-26 20-56-19.png"), true)
  assert.equal(isSafeEntryName("../secret.png"), false)
  assert.equal(isSafeEntryName("nested/a.png"), false)
  assert.equal(isSafeEntryName(""), false)
})

test("captureOnce returns the image and deletes exactly that file", async () => {
  const deps = fakeDeps(["old.png"], { "new.png": png(2, 2) })
  const outcome = await captureOnce("window", deps)

  assert.equal(outcome.status, "captured")
  assert.deepEqual(deps.removed, ["new.png"])
  assert.equal(deps.files.has("new.png"), false)
  assert.equal(deps.files.has("old.png"), true)
})

test("captureOnce refuses unclaimed PNGs and preserves them", async () => {
  const deps = fakeDeps([], {
    "one.png": png(10, 10),
    "two.png": png(10, 10),
  })
  const outcome = await captureOnce("screen", deps)

  assert.deepEqual(outcome, { status: "unowned" })
  assert.deepEqual(deps.removed, [])
  assert.equal(deps.files.size, 2)
})

test("captureOnce reports no capture after the wait budget", async () => {
  const deps = fakeDeps(["old.png"], {})
  deps.trigger = async () => ({ name: "not-yet-written.png", identity: "future-identity" })
  const outcome = await captureOnce("screen", deps)

  assert.deepEqual(outcome, { status: "none" })
  assert.deepEqual(deps.removed, [])
})

test("captureOnce deletes an oversized capture", async () => {
  const deps = fakeDeps([], {
    "huge.png": png(1, 1, MAX_ATTACHMENT_BYTES + 1),
  })
  const outcome = await captureOnce("screen", deps)

  assert.equal(outcome.status, "oversized")
  assert.deepEqual(deps.removed, ["huge.png"])
})

test("captureOnce deletes a capture that is not a valid PNG", async () => {
  const deps = fakeDeps([], { "junk.png": Buffer.from("definitely not png") })
  const outcome = await captureOnce("screen", deps)

  assert.deepEqual(outcome, { status: "invalid", name: "junk.png" })
  assert.deepEqual(deps.removed, ["junk.png"])
})

test("captureOnce still deletes the file when reading fails", async () => {
  const deps = fakeDeps([], {})
  deps.trigger = async () => {
    deps.files.add("ghost.png")
    deps.identities.set("ghost.png", "owned:ghost")
    return { name: "ghost.png", identity: "owned:ghost" }
  }
  deps.read = async () => {
    throw new Error("permission denied")
  }
  const outcome = await captureOnce("screen", deps)

  assert.equal(outcome.status, "unreadable")
  assert.deepEqual(deps.removed, ["ghost.png"])
  assert.equal(deps.files.has("ghost.png"), false)
})

test("buildDesktopArgs accepts valid read-only and preview requests", () => {
  assert.deepEqual(buildDesktopArgs({ verb: "apps" }), { args: ["apps"] })
  assert.deepEqual(
    buildDesktopArgs({ verb: "tree", app: "update-notifier", maxDepth: 2 }),
    { args: ["tree", "--app", "update-notifier", "--max-depth", "2"] },
  )
  assert.deepEqual(
    buildDesktopArgs({
      verb: "find",
      app: "app",
      name: "Open",
      role: "push button",
      showing: true,
      nth: 2,
    }),
    {
      args: [
        "find",
        "--app",
        "app",
        "--name",
        "Open",
        "--role",
        "push button",
        "--showing",
        "--nth",
        "2",
      ],
    },
  )
  assert.deepEqual(
    buildDesktopArgs({
      verb: "action",
      app: "app",
      name: "Save",
      action: "click",
      apply: true,
      expectToken: "123:abc",
    }),
    {
      args: [
        "action",
        "--app",
        "app",
        "--name",
        "Save",
        "--action",
        "click",
        "--expect-token",
        "123:abc",
        "--apply",
      ],
    },
  )
})

test("buildDesktopArgs rejects unsafe or incomplete mutations", () => {
  const invalid = (input: Parameters<typeof buildDesktopArgs>[0]) => {
    const result = buildDesktopArgs(input)
    assert.ok("error" in result, `expected an error for ${JSON.stringify(input)}`)
    return result.error
  }

  assert.match(invalid({ verb: "action", app: "app" }), /requires a name/)
  assert.match(
    invalid({ verb: "action", app: "app", name: "Save", apply: true }),
    /requires expectToken/,
  )
  assert.match(
    invalid({
      verb: "focus",
      app: "app",
      name: "Save",
      expectToken: "t",
    }),
    /only valid together with apply/,
  )
  assert.match(invalid({ verb: "set-text", app: "app", name: "Field" }), /requires text/)
  assert.match(
    invalid({ verb: "set-text", app: "app", name: "Field", text: "x".repeat(MAX_TEXT_LENGTH + 1) }),
    /longer than/,
  )
  assert.match(
    invalid({ verb: "tree", app: "app", maxDepth: MAX_DEPTH_LIMIT + 1 }),
    /maxDepth must be/,
  )
  assert.match(
    invalid({ verb: "find", app: "app", name: "x", waitSeconds: 1 }),
    /waitSeconds is only valid/,
  )
  assert.match(
    invalid({ verb: "find", app: "app", name: "x".repeat(300) }),
    /longer than/,
  )
})

test("describeDesktopFailure explains timeouts, cancellation, and stderr", () => {
  assert.match(describeDesktopFailure({ killed: true }), /timed out/)
  assert.match(describeDesktopFailure({ name: "AbortError" }), /cancelled/)
  assert.match(
    describeDesktopFailure({ code: 1, stderr: " application not found: nope\n" }),
    /application not found: nope/,
  )
  assert.match(
    describeDesktopFailure({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }),
    /narrow the query/,
  )
})

test("appIndex binds one instance of a repeated application name", () => {
  assert.deepEqual(buildDesktopArgs({ verb: "tree", appIndex: 9, maxDepth: 4 }).args, [
    "tree",
    "--app-index",
    "9",
    "--max-depth",
    "4",
  ])
  assert.deepEqual(buildDesktopArgs({ verb: "find", appIndex: 9, name: "OK" }).args, [
    "find",
    "--app-index",
    "9",
    "--name",
    "OK",
  ])

  const both = buildDesktopArgs({ verb: "action", app: "Chrome", appIndex: 9, name: "OK" })
  assert.ok("error" in both)
  assert.match(both.error, /app or appIndex, not both/)

  const neither = buildDesktopArgs({ verb: "tree" })
  assert.ok("error" in neither)
  assert.match(neither.error, /name or appIndex/)

  const outOfRange = buildDesktopArgs({ verb: "tree", appIndex: 0 })
  assert.ok("error" in outOfRange)
  assert.match(outOfRange.error, /appIndex must be an integer/)
})
