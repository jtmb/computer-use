import assert from "node:assert/strict"
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, symlink } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { deflateSync } from "node:zlib"

import { planGeneratedImage, readGeneratedImage, saveGeneratedImage } from "../src/output.ts"

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function crc32(value: Buffer): number {
  let crc = 0xffffffff
  for (const byte of value) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const value = Buffer.alloc(data.length + 12)
  value.writeUInt32BE(data.length, 0)
  value.write(type, 4, 4, "ascii")
  data.copy(value, 8)
  value.writeUInt32BE(crc32(value.subarray(4, 8 + data.length)), 8 + data.length)
  return value
}

function ihdrChunk(width = 1, height = 1, bitDepth = 8, colorType = 6): Buffer {
  const data = Buffer.alloc(13)
  data.writeUInt32BE(width, 0)
  data.writeUInt32BE(height, 4)
  data[8] = bitDepth
  data[9] = colorType
  return chunk("IHDR", data)
}

function idatChunk(): Buffer {
  return chunk("IDAT", deflateSync(Buffer.from([0, 0xff, 0x00, 0x00, 0xff])))
}

function iendChunk(): Buffer {
  return chunk("IEND", Buffer.alloc(0))
}

function png(): Buffer {
  return Buffer.concat([PNG_SIGNATURE, ihdrChunk(), idatChunk(), iendChunk()])
}

function refreshChunkCrc(image: Buffer, offset: number): void {
  const length = image.readUInt32BE(offset)
  const crcOffset = offset + 8 + length
  image.writeUInt32BE(crc32(image.subarray(offset + 4, crcOffset)), crcOffset)
}

async function projectFixture(): Promise<string> {
  return mkdtemp(join(tmpdir(), "chatgpt-connector-output-"))
}

function input(projectDirectory: string, bytes = png(), label?: string) {
  return {
    projectDirectory,
    imageBase64: bytes.toString("base64"),
    ...(label === undefined ? {} : { label }),
  }
}

test("saves a validated PNG under assets/generated with a unique name and private mode", async () => {
  const projectDirectory = await projectFixture()
  try {
    const saved = await saveGeneratedImage(input(projectDirectory, png(), "concept_art"))
    assert.match(saved.relativePath, /^assets\/generated\/concept_art-[a-f0-9]{32}\.png$/)
    assert.equal(saved.absolutePath, join(projectDirectory, saved.relativePath))
    assert.equal(saved.bytes, png().length)
    assert.equal(saved.mimeType, "image/png")
    assert.deepEqual(await readFile(saved.absolutePath), png())
    const info = await lstat(saved.absolutePath)
    assert.ok(info.isFile())
    assert.equal(info.isSymbolicLink(), false)
    assert.equal(info.mode & 0o777, 0o600)
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("authorizes the exact directories and file before creating each one", async () => {
  const projectDirectory = await projectFixture()
  const paths: string[] = []
  try {
    const saved = await saveGeneratedImage({
      ...input(projectDirectory),
      authorize: async (path) => {
        paths.push(path)
        await assert.rejects(lstat(path), { code: "ENOENT" })
      },
    })
    assert.deepEqual(paths, [join(projectDirectory, "assets"), join(projectDirectory, "assets", "generated"), saved.absolutePath])
    assert.deepEqual(await readFile(saved.absolutePath), png())
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("denied directory or file authorization makes no unauthorized output", async () => {
  const projectDirectory = await projectFixture()
  const denied = new Error("synthetic edit denial")
  try {
    await assert.rejects(saveGeneratedImage({
      ...input(projectDirectory), authorize: async () => { throw denied },
    }), (error) => error === denied)
    await assert.rejects(lstat(join(projectDirectory, "assets")), { code: "ENOENT" })

    const generated = join(projectDirectory, "assets", "generated")
    await mkdir(generated, { recursive: true })
    await assert.rejects(saveGeneratedImage({
      ...input(projectDirectory), authorize: async () => { throw denied },
    }), (error) => error === denied)
    assert.deepEqual(await readdir(generated), [])
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("refuses to write after the authorized output directory moves", async () => {
  const projectDirectory = await projectFixture()
  const generated = join(projectDirectory, "assets", "generated")
  const moved = join(projectDirectory, "moved")
  try {
    await mkdir(generated, { recursive: true })
    await assert.rejects(saveGeneratedImage({
      ...input(projectDirectory),
      authorize: async () => { await rename(generated, moved) },
    }))
    assert.deepEqual(await readdir(moved), [])
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("refuses a renamed parent or project root during file authorization", async () => {
  for (const target of ["assets", "project"] as const) {
    const container = await projectFixture()
    const projectDirectory = join(container, "project")
    const generated = join(projectDirectory, "assets", "generated")
    const moved = join(container, "moved")
    try {
      await mkdir(generated, { recursive: true })
      await assert.rejects(saveGeneratedImage({
        ...input(projectDirectory),
        authorize: async () => { await rename(target === "assets" ? join(projectDirectory, "assets") : projectDirectory, moved) },
      }))
      assert.deepEqual(await readdir(target === "assets" ? join(moved, "generated") : join(moved, "assets", "generated")), [])
    } finally {
      await rm(container, { recursive: true, force: true })
    }
  }
})

test("refuses an output directory replaced with another real directory", async () => {
  const projectDirectory = await projectFixture()
  const generated = join(projectDirectory, "assets", "generated")
  const moved = join(projectDirectory, "moved")
  try {
    await mkdir(generated, { recursive: true })
    await assert.rejects(saveGeneratedImage({
      ...input(projectDirectory),
      authorize: async () => {
        await rename(generated, moved)
        await mkdir(generated)
      },
    }))
    assert.deepEqual(await readdir(moved), [])
    assert.deepEqual(await readdir(generated), [])
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("detects a directory rename during writing and removes its own partial output", async () => {
  const projectDirectory = await projectFixture()
  const generated = join(projectDirectory, "assets", "generated")
  const moved = join(projectDirectory, "moved")
  const probe = await open(projectDirectory, "r")
  const prototype = Object.getPrototypeOf(probe) as FileHandle
  const originalWriteFile = prototype.writeFile
  try {
    await mkdir(generated, { recursive: true })
    prototype.writeFile = async function (data, options) {
      await rename(generated, moved)
      await originalWriteFile.call(this, data, options)
    }
    await assert.rejects(saveGeneratedImage(input(projectDirectory)))
    assert.deepEqual(await readdir(moved), [])
  } finally {
    prototype.writeFile = originalWriteFile
    await probe.close()
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("allocates distinct output files for concurrent saves", async () => {
  const projectDirectory = await projectFixture()
  try {
    const saved = await Promise.all([
      saveGeneratedImage(input(projectDirectory)),
      saveGeneratedImage(input(projectDirectory)),
      saveGeneratedImage(input(projectDirectory)),
    ])
    assert.equal(new Set(saved.map((entry) => entry.absolutePath)).size, saved.length)
    assert.deepEqual((await readdir(join(projectDirectory, "assets", "generated"))).toSorted(), saved.map((entry) => entry.relativePath.split("/").at(-1)!).toSorted())
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("saves only the preauthorized filename and never overwrites a collision", async () => {
  const projectDirectory = await projectFixture()
  try {
    const plan = planGeneratedImage(projectDirectory)
    const saved = await saveGeneratedImage({ ...input(projectDirectory), filename: plan.filename })
    assert.equal(saved.absolutePath, plan.absolutePath)
    assert.equal(saved.relativePath, plan.relativePath)
    await assert.rejects(saveGeneratedImage({ ...input(projectDirectory), filename: plan.filename }), /could not create/)
    assert.deepEqual(await readFile(saved.absolutePath), png())
    for (const filename of ["../escape.png", "nested/file.png", "bad.png\n", "x.jpeg", "a".repeat(98) + ".png"]) {
      await assert.rejects(saveGeneratedImage({ ...input(projectDirectory), filename }), /filename/)
    }
    assert.deepEqual(await readdir(join(projectDirectory, "assets", "generated")), [plan.filename])
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("cancellation during authorization produces no image", async () => {
  const projectDirectory = await projectFixture()
  const generated = join(projectDirectory, "assets", "generated")
  const controller = new AbortController()
  try {
    await mkdir(generated, { recursive: true })
    await assert.rejects(saveGeneratedImage({
      ...input(projectDirectory), signal: controller.signal,
      authorize: async () => { controller.abort() },
    }))
    assert.deepEqual(await readdir(generated), [])
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("cancellation during a write removes the request's partial image", async () => {
  const projectDirectory = await projectFixture()
  const generated = join(projectDirectory, "assets", "generated")
  const controller = new AbortController()
  const probe = await open(projectDirectory, "r")
  const prototype = Object.getPrototypeOf(probe) as FileHandle
  const originalWriteFile = prototype.writeFile
  try {
    prototype.writeFile = async function (data) {
      if (Buffer.isBuffer(data)) await this.write(data.subarray(0, 4), 0, 4, null)
      controller.abort()
    }
    await assert.rejects(saveGeneratedImage({ ...input(projectDirectory), signal: controller.signal }))
    assert.deepEqual(await readdir(generated), [])
  } finally {
    prototype.writeFile = originalWriteFile
    await probe.close()
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("removes a partially written file when its write fails", async () => {
  const projectDirectory = await projectFixture()
  const probe = await open(projectDirectory, "r")
  const prototype = Object.getPrototypeOf(probe) as FileHandle
  const originalWriteFile = prototype.writeFile
  try {
    try {
      prototype.writeFile = async function (data) {
        if (Buffer.isBuffer(data)) await this.write(data.subarray(0, 4), 0, 4, null)
        throw new Error("injected write failure")
      }
      await assert.rejects(saveGeneratedImage(input(projectDirectory)), /injected write failure/)
    } finally {
      prototype.writeFile = originalWriteFile
    }

    assert.deepEqual(await readdir(join(projectDirectory, "assets", "generated")), [])
  } finally {
    await probe.close().catch(() => undefined)
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("verification failure preserves another writer's replacement file", async () => {
  const projectDirectory = await projectFixture()
  const probe = await open(projectDirectory, "r")
  const prototype = Object.getPrototypeOf(probe) as FileHandle
  const originalWriteFile = prototype.writeFile
  let path = ""
  try {
    prototype.writeFile = async function (data, options) {
      await originalWriteFile.call(this, data, options)
      await rename(path, join(projectDirectory, "request-image-moved-by-other-writer.png"))
      const replacement = await open(path, "wx", 0o600)
      try {
        await originalWriteFile.call(replacement, "preserve this unrelated replacement")
      } finally {
        await replacement.close()
      }
    }
    await assert.rejects(saveGeneratedImage({
      ...input(projectDirectory), authorize: async (candidate) => { if (candidate.endsWith(".png")) path = candidate },
    }), /could not be removed/)
    assert.equal(await readFile(path, "utf8"), "preserve this unrelated replacement")
  } finally {
    prototype.writeFile = originalWriteFile
    await probe.close()
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("rejects malformed and non-canonical base64 before creating output directories", async () => {
  const projectDirectory = await projectFixture()
  try {
    for (const imageBase64 of ["", "YWJj\n", "YWJj=", "_w==", "Zh=="]) {
      await assert.rejects(
        saveGeneratedImage({ projectDirectory, imageBase64 }),
        /canonical base64|non-empty/,
      )
    }
    await assert.rejects(readdir(join(projectDirectory, "assets")), { code: "ENOENT" })
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("rejects data without the PNG signature and a structurally valid IHDR", async () => {
  const projectDirectory = await projectFixture()
  try {
    await assert.rejects(saveGeneratedImage(input(projectDirectory, Buffer.from("not a png"))), /PNG/)

    const badCrc = png()
    badCrc[32] ^= 0xff
    await assert.rejects(saveGeneratedImage(input(projectDirectory, badCrc)), /IHDR CRC/)

    const badDimensions = png()
    badDimensions.writeUInt32BE(0, 16)
    refreshChunkCrc(badDimensions, 8)
    await assert.rejects(saveGeneratedImage(input(projectDirectory, badDimensions)), /IHDR fields/)

    const badColorDepth = png()
    badColorDepth[24] = 4
    refreshChunkCrc(badColorDepth, 8)
    await assert.rejects(saveGeneratedImage(input(projectDirectory, badColorDepth)), /IHDR fields/)
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("rejects truncated PNGs and missing IDAT or IEND chunks", async () => {
  const projectDirectory = await projectFixture()
  try {
    const complete = png()
    await assert.rejects(saveGeneratedImage(input(projectDirectory, complete.subarray(0, complete.length - 1))), /truncated/)

    const withoutIDAT = Buffer.concat([PNG_SIGNATURE, ihdrChunk(), iendChunk()])
    await assert.rejects(saveGeneratedImage(input(projectDirectory, withoutIDAT)), /missing image data/)

    const withoutIEND = Buffer.concat([PNG_SIGNATURE, ihdrChunk(), idatChunk()])
    await assert.rejects(saveGeneratedImage(input(projectDirectory, withoutIEND)), /missing IEND/)
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("rejects malformed chunk lengths and CRCs", async () => {
  const projectDirectory = await projectFixture()
  try {
    const badLength = png()
    badLength.writeUInt32BE(0x7fffffff, 33)
    await assert.rejects(saveGeneratedImage(input(projectDirectory, badLength)), /chunk length/)

    const badIDATCrc = png()
    const idatOffset = 8 + 25
    const idatCrcOffset = idatOffset + 8 + badIDATCrc.readUInt32BE(idatOffset)
    badIDATCrc[idatCrcOffset] ^= 0xff
    await assert.rejects(saveGeneratedImage(input(projectDirectory, badIDATCrc)), /IDAT CRC/)
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("rejects PNG decode bombs and CRC-valid but undecodable image data", async () => {
  const projectDirectory = await projectFixture()
  try {
    const candidates = [
      Buffer.concat([PNG_SIGNATURE, ihdrChunk(100000, 100000), idatChunk(), iendChunk()]),
      Buffer.concat([PNG_SIGNATURE, ihdrChunk(), chunk("IDAT", Buffer.from("not zlib")), iendChunk()]),
      Buffer.concat([PNG_SIGNATURE, ihdrChunk(2, 1), idatChunk(), iendChunk()]),
      Buffer.concat([PNG_SIGNATURE, ihdrChunk(), chunk("IDAT", deflateSync(Buffer.from([5, 255, 0, 0, 255]))), iendChunk()]),
    ]
    for (const candidate of candidates) await assert.rejects(saveGeneratedImage(input(projectDirectory, candidate)), /PNG/)
    assert.deepEqual(await readdir(projectDirectory), [])
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("rejects images larger than 16 MiB", async () => {
  const projectDirectory = await projectFixture()
  try {
    const oversized = Buffer.alloc(16 * 1024 * 1024 + 1)
    await assert.rejects(saveGeneratedImage(input(projectDirectory, oversized)), /16 MiB|16777216/)
    await assert.rejects(readdir(join(projectDirectory, "assets")), { code: "ENOENT" })
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("rejects traversal, separators, controls, and overlong labels", async () => {
  const projectDirectory = await projectFixture()
  try {
    for (const label of ["", ".", "..", "../escape", "nested/name", "nested\\name", "bad label", "line\nbreak", "nul\0byte", "é", "a".repeat(65)]) {
      await assert.rejects(saveGeneratedImage(input(projectDirectory, png(), label)), /label/)
    }
    await assert.rejects(readdir(join(projectDirectory, "assets")), { code: "ENOENT" })
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("rejects a symlinked project root", async () => {
  const container = await projectFixture()
  const projectDirectory = join(container, "project")
  const alias = join(container, "project-link")
  try {
    await mkdir(projectDirectory)
    await symlink(projectDirectory, alias)
    await assert.rejects(saveGeneratedImage(input(alias)), /projectDirectory/)
  } finally {
    await rm(container, { recursive: true, force: true })
  }
})

test("rejects symlinks in either output directory component", async () => {
  const projectDirectory = await projectFixture()
  const external = join(projectDirectory, "external")
  try {
    await mkdir(external)
    await symlink(external, join(projectDirectory, "assets"))
    await assert.rejects(saveGeneratedImage(input(projectDirectory)), /assets\/generated.*non-symlink/)
    assert.deepEqual(await readdir(external), [])

    await rm(join(projectDirectory, "assets"))
    await mkdir(join(projectDirectory, "assets"))
    await symlink(external, join(projectDirectory, "assets", "generated"))
    await assert.rejects(saveGeneratedImage(input(projectDirectory)), /assets\/generated.*non-symlink/)
    assert.deepEqual(await readdir(external), [])
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("requires a canonical absolute project directory", async () => {
  await assert.rejects(
    saveGeneratedImage({ projectDirectory: "relative/project", imageBase64: png().toString("base64") }),
    /canonical absolute path/,
  )
})

test("reads an existing generated PNG without changing it", async () => {
  const projectDirectory = await projectFixture()
  try {
    const saved = await saveGeneratedImage(input(projectDirectory))
    const filename = saved.relativePath.slice("assets/generated/".length)
    const loaded = await readGeneratedImage({ projectDirectory, filename })
    assert.deepEqual(loaded.image, png())
    assert.equal(loaded.absolutePath, saved.absolutePath)
    assert.deepEqual(await readFile(saved.absolutePath), png())
    assert.deepEqual(await readdir(join(projectDirectory, "assets", "generated")), [filename])
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("saved-image reads refuse traversal, symlinks, missing files and malformed PNGs", async () => {
  const projectDirectory = await projectFixture()
  const generated = join(projectDirectory, "assets", "generated")
  try {
    await mkdir(generated, { recursive: true })
    const external = join(projectDirectory, "outside.png")
    const file = await open(external, "wx")
    await file.writeFile(png())
    await file.close()
    await symlink(external, join(generated, "linked.png"))
    for (const filename of ["../outside.png", external, "nested/image.png", "linked.png", "missing.png"]) {
      await assert.rejects(readGeneratedImage({ projectDirectory, filename }))
    }
    const invalid = await open(join(generated, "invalid.png"), "wx")
    await invalid.writeFile("not an image")
    await invalid.close()
    await assert.rejects(readGeneratedImage({ projectDirectory, filename: "invalid.png" }), /PNG/)
    assert.deepEqual(await readFile(external), png())
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("saved-image reads reject a directory move during reading without deleting the file", async () => {
  const projectDirectory = await projectFixture()
  const probe = await open(projectDirectory, "r")
  const prototype = Object.getPrototypeOf(probe) as FileHandle
  const originalRead = prototype.read
  const generated = join(projectDirectory, "assets", "generated")
  const moved = join(projectDirectory, "moved")
  try {
    const saved = await saveGeneratedImage(input(projectDirectory))
    const filename = saved.relativePath.slice("assets/generated/".length)
    let renamed = false
    prototype.read = (async function (this: FileHandle, ...args: unknown[]) {
      const result = await Reflect.apply(originalRead, this, args)
      if (!renamed) { renamed = true; await rename(generated, moved) }
      return result
    }) as FileHandle["read"]
    await assert.rejects(readGeneratedImage({ projectDirectory, filename }))
    prototype.read = originalRead
    assert.deepEqual(await readFile(join(moved, filename)), png())
  } finally {
    prototype.read = originalRead
    await probe.close()
    await rm(projectDirectory, { recursive: true, force: true })
  }
})

test("an already-cancelled saved-image read never touches output", async () => {
  const projectDirectory = await projectFixture()
  try {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(readGeneratedImage({ projectDirectory, filename: "test.png", signal: controller.signal }))
    assert.deepEqual(await readdir(projectDirectory), [])
  } finally {
    await rm(projectDirectory, { recursive: true, force: true })
  }
})
