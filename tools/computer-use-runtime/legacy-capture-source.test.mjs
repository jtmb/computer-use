import assert from "node:assert/strict"
import { appendFile, lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { deflateSync } from "node:zlib"
import test from "node:test"

import {
  captureOnce,
  liveCaptureDeps,
  MAX_ATTACHMENT_BYTES,
  pngDimensions,
} from "../../.opencode/plugins/computer-use/screenshot.ts"

const SCRATCH_ROOT = "/tmp/opencode"
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const result = Buffer.alloc(12 + data.length)
  result.writeUInt32BE(data.length, 0)
  result.write(type, 4, "ascii")
  data.copy(result, 8)
  result.writeUInt32BE(crc32(result.subarray(4, 8 + data.length)), 8 + data.length)
  return result
}

function png(extraBytes = 0) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(1, 0)
  header.writeUInt32BE(1, 4)
  header[8] = 8
  header[9] = 6
  const chunks = [chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.alloc(5)))]
  if (extraBytes > 0) chunks.push(chunk("tEXt", Buffer.alloc(extraBytes, 0x61)))
  chunks.push(chunk("IEND", Buffer.alloc(0)))
  return Buffer.concat([SIGNATURE, ...chunks])
}

async function scratchDirectory(t) {
  const directory = await mkdtemp(path.join(SCRATCH_ROOT, "legacy-capture-source."))
  t.after(async () => rm(directory, { recursive: true, force: true }))
  return directory
}

function makeDeps(directory, trigger, options = {}) {
  const deps = liveCaptureDeps(directory, "", options.signal, trigger)
  deps.delay = options.delay ?? (async () => {})
  deps.now = options.now ?? (() => 0)
  deps.waitMs = options.waitMs ?? 10
  deps.pollMs = options.pollMs ?? 1
  return deps
}

test("a claimed complete PNG is read and only the claimed disposable file is removed", async (t) => {
  const directory = await scratchDirectory(t)
  const oldBytes = png()
  await writeFile(path.join(directory, "existing.png"), oldBytes)
  let deps
  deps = makeDeps(directory, async () => {
    await writeFile(path.join(directory, "owned.png"), png())
    return (await deps.list()).find((entry) => entry.name === "owned.png")
  })

  const result = await captureOnce("screen", deps)

  assert.equal(result.status, "captured")
  assert.deepEqual(pngDimensions(result.bytes), { width: 1, height: 1 })
  assert.deepEqual((await readdir(directory)).sort(), ["existing.png"])
  assert.deepEqual(await readFile(path.join(directory, "existing.png")), oldBytes)
})

test("a new but unclaimed screenshot is retained without being read or removed", async (t) => {
  const directory = await scratchDirectory(t)
  const bytes = png()
  let reads = 0
  let removals = 0
  const deps = makeDeps(directory, async () => {
    await writeFile(path.join(directory, "concurrent.png"), bytes)
    return undefined
  })
  const read = deps.read
  const remove = deps.remove
  deps.read = async (...args) => {
    reads += 1
    return read(...args)
  }
  deps.remove = async (...args) => {
    removals += 1
    return remove(...args)
  }

  assert.deepEqual(await captureOnce("window", deps), { status: "unowned" })
  assert.equal(reads, 0)
  assert.equal(removals, 0)
  assert.deepEqual(await readFile(path.join(directory, "concurrent.png")), bytes)
})

test("a pre-existing filename cannot be claimed or deleted", async (t) => {
  const directory = await scratchDirectory(t)
  const bytes = png()
  await writeFile(path.join(directory, "same-name.png"), bytes)
  let deps
  deps = makeDeps(directory, async () => (await deps.list()).find((entry) => entry.name === "same-name.png"))

  assert.deepEqual(await captureOnce("screen", deps), { status: "unowned" })
  assert.deepEqual(await readFile(path.join(directory, "same-name.png")), bytes)
})

test("unrelated concurrent PNGs survive when the injected trigger claims its exact output", async (t) => {
  const directory = await scratchDirectory(t)
  const unrelated = png()
  let deps
  deps = makeDeps(directory, async () => {
    await writeFile(path.join(directory, "owned.png"), png())
    await writeFile(path.join(directory, "other.png"), unrelated)
    return (await deps.list()).find((entry) => entry.name === "owned.png")
  })

  const result = await captureOnce("screen", deps)

  assert.equal(result.status, "captured")
  assert.deepEqual((await readdir(directory)).sort(), ["other.png"])
  assert.deepEqual(await readFile(path.join(directory, "other.png")), unrelated)
})

test("a claimed path replaced before read is retained and not attached", async (t) => {
  const directory = await scratchDirectory(t)
  const replacement = Buffer.from("replacement belongs to another writer")
  let deps
  deps = makeDeps(directory, async () => {
    await writeFile(path.join(directory, "capture.png"), png())
    return (await deps.list()).find((entry) => entry.name === "capture.png")
  }, {
    delay: async () => writeFile(path.join(directory, "capture.png"), replacement),
  })

  const result = await captureOnce("screen", deps)

  assert.equal(result.status, "retained")
  assert.deepEqual(await readFile(path.join(directory, "capture.png")), replacement)
})

test("truncated PNG bytes are rejected", async (t) => {
  const directory = await scratchDirectory(t)
  const truncated = png().subarray(0, -12)
  let deps
  deps = makeDeps(directory, async () => {
    await writeFile(path.join(directory, "truncated.png"), truncated)
    return (await deps.list()).find((entry) => entry.name === "truncated.png")
  })

  const result = await captureOnce("screen", deps)
  assert.deepEqual(result, { status: "invalid", name: "truncated.png" })
  assert.equal(pngDimensions(png().subarray(0, -12)), undefined)
})

test("a complete PNG with a corrupt image-data CRC is rejected", async (t) => {
  const directory = await scratchDirectory(t)
  const corrupted = png()
  assert.deepEqual(pngDimensions(corrupted), { width: 1, height: 1 })
  // Change the stored IDAT checksum, leaving the payload and framing intact.
  const crcOffset = 8 + 25 + 8 + corrupted.readUInt32BE(8 + 25)
  corrupted[crcOffset] ^= 1
  assert.equal(pngDimensions(corrupted), undefined)
  let deps
  deps = makeDeps(directory, async () => {
    await writeFile(path.join(directory, "bad-crc.png"), corrupted)
    return (await deps.list()).find((entry) => entry.name === "bad-crc.png")
  })
  assert.deepEqual(await captureOnce("screen", deps), { status: "invalid", name: "bad-crc.png" })
})

test("oversized files are read only to the cap plus one byte", async (t) => {
  const directory = await scratchDirectory(t)
  const oversized = png(MAX_ATTACHMENT_BYTES + 1024)
  let deps
  deps = makeDeps(directory, async () => {
    await writeFile(path.join(directory, "large.png"), oversized)
    return (await deps.list()).find((entry) => entry.name === "large.png")
  })
  const read = deps.read
  let observedBound
  let observedReadBytes
  deps.read = async (name, identity, maxBytes) => {
    observedBound = maxBytes
    const bytes = await read(name, identity, maxBytes)
    observedReadBytes = bytes.length
    return bytes
  }

  const result = await captureOnce("screen", deps)

  assert.deepEqual(result, {
    status: "oversized",
    name: "large.png",
    bytes: MAX_ATTACHMENT_BYTES + 1,
  })
  assert.equal(observedBound, MAX_ATTACHMENT_BYTES)
  assert.equal(observedReadBytes, MAX_ATTACHMENT_BYTES + 1)
  assert.equal((await readdir(directory)).length, 0)
})

test("growth after a bounded read defeats cleanup and the bytes are not returned", async (t) => {
  const directory = await scratchDirectory(t)
  const suffix = Buffer.from("later growth")
  let deps
  deps = makeDeps(directory, async () => {
    await writeFile(path.join(directory, "growing.png"), png())
    return (await deps.list()).find((entry) => entry.name === "growing.png")
  })
  const read = deps.read
  deps.read = async (name, identity, maxBytes) => {
    const bytes = await read(name, identity, maxBytes)
    await appendFile(path.join(directory, name), suffix)
    return bytes
  }

  const result = await captureOnce("screen", deps)

  assert.equal(result.status, "retained")
  assert.equal("bytes" in result, false)
  assert.ok((await readFile(path.join(directory, "growing.png"))).subarray(-suffix.length).equals(suffix))
})

test("cancellation during polling removes only the exact claimed fixture", async (t) => {
  const directory = await scratchDirectory(t)
  const oldBytes = png()
  await writeFile(path.join(directory, "existing.png"), oldBytes)
  const controller = new AbortController()
  let deps
  deps = makeDeps(directory, async () => {
    await writeFile(path.join(directory, "owned.png"), png())
    return (await deps.list()).find((entry) => entry.name === "owned.png")
  }, {
    signal: controller.signal,
    delay: async () => controller.abort(),
  })

  assert.deepEqual(await captureOnce("screen", deps), { status: "cancelled" })
  assert.deepEqual((await readdir(directory)).sort(), ["existing.png"])
  assert.deepEqual(await readFile(path.join(directory, "existing.png")), oldBytes)
})

test("pre-aborted requests do not trigger or inspect a screenshot", async (t) => {
  const directory = await scratchDirectory(t)
  const controller = new AbortController()
  controller.abort()
  let triggers = 0
  const deps = makeDeps(directory, async () => {
    triggers += 1
    return undefined
  }, { signal: controller.signal })
  let listings = 0
  deps.list = async () => {
    listings += 1
    throw new Error("pre-aborted requests must not inspect the capture directory")
  }

  assert.deepEqual(await captureOnce("screen", deps), { status: "cancelled" })
  assert.equal(triggers, 0)
  assert.equal(listings, 0)
  assert.deepEqual(await readdir(directory), [])
})

test("failed cleanup reports retention and withholds otherwise valid PNG bytes", async (t) => {
  const directory = await scratchDirectory(t)
  let deps
  deps = makeDeps(directory, async () => {
    await writeFile(path.join(directory, "kept.png"), png())
    return (await deps.list()).find((entry) => entry.name === "kept.png")
  })
  deps.remove = async () => {
    const error = new Error("fixture cleanup refused")
    error.code = "EACCES"
    throw error
  }

  const result = await captureOnce("screen", deps)

  assert.equal(result.status, "retained")
  assert.equal("bytes" in result, false)
  assert.deepEqual(await readdir(directory), ["kept.png"])
})

test("the held default trigger cannot claim an output (source-only assertion)", async () => {
  const source = await readFile(new URL("../../.opencode/plugins/computer-use/screenshot.ts", import.meta.url), "utf8")
  assert.match(source, /await runYdotool\(mode, socket, signal\)\s+return undefined/u)
})

test("filesystem listing excludes symlinked PNG paths", async (t) => {
  const directory = await scratchDirectory(t)
  const outside = path.join(directory, "preserved.bin")
  await writeFile(outside, Buffer.from("preserve"))
  const link = path.join(directory, "linked.png")
  const { symlink } = await import("node:fs/promises")
  await symlink(outside, link)
  const deps = makeDeps(directory, async () => undefined)

  assert.deepEqual((await deps.list()).map((entry) => entry.name), [])
  assert.equal((await lstat(link)).isSymbolicLink(), true)
  assert.deepEqual(await readFile(outside), Buffer.from("preserve"))
})
