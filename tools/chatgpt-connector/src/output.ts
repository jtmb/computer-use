import { randomBytes } from "node:crypto"
import { constants } from "node:fs"
import { mkdir, open, unlink } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { inflateSync } from "node:zlib"

const MAX_IMAGE_BYTES = 16 * 1024 * 1024
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024
const MAX_DECODED_BYTES = 64 * 1024 * 1024
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4
const MAX_PNG_CHUNKS = 65_536
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
const FILE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW
const READ_FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const OUTPUT_RELATIVE_PATH = "assets/generated"
const PNG_BIT_DEPTHS: Record<number, readonly number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
}
const CRC_TABLE = new Uint32Array(256)

for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  CRC_TABLE[index] = crc >>> 0
}

type SaveGeneratedImageInput = {
  projectDirectory: string
  imageBase64: string
  label?: string
  authorize?: (absolutePath: string) => Promise<void>
  /** Preallocate this name when permission must run before generation. Never overwrites. */
  filename?: string
  signal?: AbortSignal
  check?: () => Promise<void>
}

type SaveGeneratedImageResult = {
  absolutePath: string
  relativePath: string
  bytes: number
  mimeType: "image/png"
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? code : undefined
}

function descriptorPath(directory: FileHandle, name: string): string {
  return `/proc/self/fd/${directory.fd}/${name}`
}

function validatedProjectDirectory(value: unknown): string {
  if (
    typeof value !== "string" || value.length === 0 || value.length > 4096 ||
    value.includes("\0") || !isAbsolute(value) || resolve(value) !== value
  ) {
    throw new Error("projectDirectory must be a canonical absolute path")
  }
  return value
}

function validatedLabel(value: unknown): string {
  if (value === undefined) return "generated"
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new Error("label must contain 1-64 ASCII letters, digits, underscores, or hyphens and start with a letter or digit")
  }
  return value
}

export function validateGeneratedFilename(value: string): string {
  if (typeof value !== "string" || /^[A-Za-z0-9][A-Za-z0-9_-]{0,96}\.png$/.exec(value)?.[0] !== value) {
    throw new Error("filename must be a single safe PNG filename")
  }
  return value
}

export function planGeneratedImage(projectDirectory: string, label?: string) {
  const directory = validatedProjectDirectory(projectDirectory)
  const filename = `${validatedLabel(label)}-${randomBytes(16).toString("hex")}.png`
  const relativePath = `${OUTPUT_RELATIVE_PATH}/${filename}`
  return {
    filename,
    relativePath,
    absolutePath: join(directory, relativePath),
    directories: [join(directory, "assets"), join(directory, OUTPUT_RELATIVE_PATH)],
  }
}

function hasCanonicalBase64Shape(value: string): boolean {
  if (value.length % 4 !== 0) return false
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0
  const dataLength = value.length - padding
  if ((padding === 2 && dataLength % 4 !== 2) || (padding === 1 && dataLength % 4 !== 3)) return false

  for (let index = 0; index < dataLength; index += 1) {
    const code = value.charCodeAt(index)
    const valid = (code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) || code === 43 || code === 47
    if (!valid) return false
  }
  return true
}

function decodeImage(value: unknown): Buffer {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("imageBase64 must be a non-empty canonical base64 string")
  }
  if (value.length > MAX_BASE64_LENGTH) {
    throw new Error(`image exceeds the ${MAX_IMAGE_BYTES}-byte limit`)
  }
  if (!hasCanonicalBase64Shape(value)) throw new Error("imageBase64 is not canonical base64")

  const image = Buffer.from(value, "base64")
  if (image.toString("base64") !== value) throw new Error("imageBase64 is not canonical base64")
  if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
    throw new Error(`image must decode to 1-${MAX_IMAGE_BYTES} bytes`)
  }
  return image
}

function crc32(value: Buffer, start: number, end: number): number {
  let crc = 0xffffffff
  for (let index = start; index < end; index += 1) {
    crc = CRC_TABLE[(crc ^ value[index]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function validateIHDR(image: Buffer, dataOffset: number) {
  const width = image.readUInt32BE(dataOffset)
  const height = image.readUInt32BE(dataOffset + 4)
  const bitDepth = image[dataOffset + 8]!
  const colorType = image[dataOffset + 9]!
  const compressionMethod = image[dataOffset + 10]
  const filterMethod = image[dataOffset + 11]
  const interlaceMethod = image[dataOffset + 12]

  if (
    width === 0 || width > 0x7fffffff || height === 0 || height > 0x7fffffff ||
    !PNG_BIT_DEPTHS[colorType]?.includes(bitDepth) || compressionMethod !== 0 ||
    filterMethod !== 0 || (interlaceMethod !== 0 && interlaceMethod !== 1)
  ) {
    throw new Error("PNG IHDR fields are invalid")
  }
  if (width > 8192 || height > 8192 || width * height > MAX_IMAGE_PIXELS) {
    throw new Error("PNG dimensions exceed the image size limit")
  }
  return { width, height, bitDepth, colorType, interlaceMethod }
}

function isChunkType(image: Buffer, typeOffset: number): boolean {
  for (let index = 0; index < 4; index += 1) {
    const code = image[typeOffset + index]!
    if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122))) return false
  }
  const reservedBit = image[typeOffset + 2]!
  return reservedBit >= 65 && reservedBit <= 90
}

function validatePng(image: Buffer): void {
  if (image.length < PNG_SIGNATURE.length || !image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("image is not a PNG")
  }

  let offset = PNG_SIGNATURE.length
  let chunkCount = 0
  let sawIHDR = false
  let sawPLTE = false
  let sawIDAT = false
  let idatEnded = false
  let sawIEND = false
  let idatBytes = 0
  let colorType: number | undefined
  let bitDepth: number | undefined
  let header: ReturnType<typeof validateIHDR> | undefined
  const imageData: Buffer[] = []

  while (offset < image.length) {
    chunkCount += 1
    if (chunkCount > MAX_PNG_CHUNKS) throw new Error("PNG contains too many chunks")
    if (image.length - offset < 12) throw new Error("PNG chunk is truncated")

    const length = image.readUInt32BE(offset)
    if (length > 0x7fffffff || length > image.length - offset - 12) {
      throw new Error("PNG chunk length exceeds the image bounds")
    }
    const typeOffset = offset + 4
    const dataOffset = offset + 8
    const crcOffset = dataOffset + length
    const nextOffset = crcOffset + 4
    if (!isChunkType(image, typeOffset)) throw new Error("PNG chunk type is invalid")

    const type = image.toString("ascii", typeOffset, typeOffset + 4)
    if (image.readUInt32BE(crcOffset) !== crc32(image, typeOffset, crcOffset)) {
      throw new Error(`PNG ${type} CRC is invalid`)
    }

    if (!sawIHDR) {
      if (type !== "IHDR" || length !== 13) throw new Error("PNG must begin with a 13-byte IHDR chunk")
      header = validateIHDR(image, dataOffset)
      colorType = header.colorType
      bitDepth = header.bitDepth
      sawIHDR = true
    } else if (type === "IHDR") {
      throw new Error("PNG must contain exactly one IHDR chunk")
    }

    if (type !== "IHDR" && type !== "PLTE" && type !== "IDAT" && type !== "IEND" &&
      image[typeOffset]! >= 65 && image[typeOffset]! <= 90) {
      throw new Error(`PNG contains unsupported critical chunk ${type}`)
    }

    if (type === "PLTE") {
      const entries = length / 3
      if (
        sawPLTE || sawIDAT || length === 0 || length > 768 || length % 3 !== 0 ||
        colorType === 0 || colorType === 4 ||
        (colorType === 3 && bitDepth !== undefined && entries > 2 ** bitDepth)
      ) {
        throw new Error("PNG PLTE chunk is invalid")
      }
      sawPLTE = true
    }

    if (type === "IDAT") {
      if (idatEnded) throw new Error("PNG IDAT chunks must be consecutive")
      sawIDAT = true
      idatBytes += length
      imageData.push(image.subarray(dataOffset, crcOffset))
    } else if (sawIDAT && type !== "IEND") {
      idatEnded = true
    }

    if (type === "IEND") {
      if (length !== 0) throw new Error("PNG IEND chunk must be empty")
      if (!sawIDAT || idatBytes === 0) throw new Error("PNG is missing image data")
      if (colorType === 3 && !sawPLTE) throw new Error("indexed PNG is missing its PLTE chunk")
      if (nextOffset !== image.length) throw new Error("PNG has trailing data after IEND")
      sawIEND = true
      break
    }

    offset = nextOffset
  }

  if (!sawIEND) throw new Error("PNG is truncated or missing IEND")
  const { width, height, interlaceMethod } = header!
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType!]!
  const passes = interlaceMethod === 0 ? [[0, 0, 1, 1]] : [
    [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
    [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
  ]
  const rows = passes.flatMap(([x, y, dx, dy]) => {
    const columns = Math.max(0, Math.ceil((width - x!) / dx!))
    const count = Math.max(0, Math.ceil((height - y!) / dy!))
    return columns && count ? [{ count, bytes: 1 + Math.ceil(columns * channels * bitDepth! / 8) }] : []
  })
  const expectedBytes = rows.reduce((total, row) => total + row.count * row.bytes, 0)
  if (expectedBytes > MAX_DECODED_BYTES) throw new Error("decoded PNG exceeds the image size limit")
  let decoded: Buffer
  try {
    decoded = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedBytes + 1 })
  } catch {
    throw new Error("PNG compressed image data is invalid or oversized")
  }
  if (decoded.length !== expectedBytes) throw new Error("PNG decoded image data does not match its dimensions")
  let rowOffset = 0
  for (const row of rows) {
    for (let index = 0; index < row.count; index += 1) {
      if (decoded[rowOffset]! > 4) throw new Error("PNG scanline filter is invalid")
      rowOffset += row.bytes
    }
  }
}

export function decodeGeneratedPng(value: unknown): Buffer {
  const image = decodeImage(value)
  validatePng(image)
  return image
}

async function openProjectDirectory(path: string): Promise<FileHandle> {
  let current: FileHandle
  try {
    current = await open("/", DIRECTORY_FLAGS)
  } catch (error) {
    throw new Error("could not open the filesystem root", { cause: error })
  }

  for (const component of path.slice(1).split("/").filter(Boolean)) {
    let child: FileHandle | undefined
    try {
      child = await open(descriptorPath(current, component), DIRECTORY_FLAGS)
      const info = await child.stat()
      if (!info.isDirectory()) throw new Error("path component is not a directory")
    } catch (error) {
      await child?.close().catch(() => undefined)
      await current.close().catch(() => undefined)
      throw new Error("projectDirectory must contain only existing non-symlink directories", { cause: error })
    }

    await current.close()
    current = child
  }
  return current
}

async function verifyDirectoryBinding(path: string, expected: FileHandle): Promise<void> {
  const current = await openProjectDirectory(path)
  try {
    const actual = await current.stat()
    const held = await expected.stat()
    if (actual.dev !== held.dev || actual.ino !== held.ino) {
      throw new Error("authorized image directory was moved or replaced")
    }
  } finally {
    await current.close()
  }
}

async function openOutputDirectory(
  parent: FileHandle,
  name: string,
  authorize: () => Promise<void>,
  verify: () => Promise<void>,
): Promise<FileHandle> {
  await verify()
  const path = descriptorPath(parent, name)
  let directory: FileHandle
  try {
    directory = await open(path, DIRECTORY_FLAGS)
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw new Error(`${OUTPUT_RELATIVE_PATH} must be a non-symlink directory path`, { cause: error })
    }
    await authorize()
    await verify()
    try {
      await mkdir(path, { mode: 0o700 })
    } catch (mkdirError) {
      if (errorCode(mkdirError) !== "EEXIST") {
        throw new Error(`could not create ${OUTPUT_RELATIVE_PATH}`, { cause: mkdirError })
      }
    }
    try {
      directory = await open(path, DIRECTORY_FLAGS)
    } catch (openError) {
      throw new Error(`${OUTPUT_RELATIVE_PATH} must be a non-symlink directory path`, { cause: openError })
    }
  }

  try {
    if (!(await directory.stat()).isDirectory()) throw new Error("not a directory")
    return directory
  } catch (error) {
    await directory.close().catch(() => undefined)
    throw new Error(`${OUTPUT_RELATIVE_PATH} must be a non-symlink directory path`, { cause: error })
  }
}

async function writeUniqueImage(
  projectDirectory: string,
  outputDirectory: FileHandle,
  label: string,
  image: Buffer,
  authorize: (absolutePath: string) => Promise<void>,
  verify: () => Promise<void>,
  signal?: AbortSignal,
  plannedFilename?: string,
): Promise<SaveGeneratedImageResult> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const filename = plannedFilename ?? `${label}-${randomBytes(16).toString("hex")}.png`
    await authorize(join(projectDirectory, OUTPUT_RELATIVE_PATH, filename))
    await verify()
    let file: FileHandle
    try {
      file = await open(descriptorPath(outputDirectory, filename), FILE_FLAGS, 0o600)
    } catch (error) {
      if (errorCode(error) === "EEXIST" && plannedFilename === undefined) continue
      throw new Error("could not create a unique generated image file", { cause: error })
    }

    let identity: { dev: number; ino: number } | undefined
    try {
      const created = await file.stat()
      identity = { dev: created.dev, ino: created.ino }
      if (!created.isFile() || created.isSymbolicLink()) throw new Error("generated image is not a regular file")
      await verify()
      await file.chmod(0o600)
      await file.writeFile(image, { signal })
      await verify()
      const written = await file.stat()
      if (
        !written.isFile() || written.isSymbolicLink() || written.size !== image.length ||
        written.dev !== created.dev || written.ino !== created.ino || (written.mode & 0o777) !== 0o600
      ) {
        throw new Error("generated image did not retain its private regular-file mode")
      }
      const pathHandle = await open(descriptorPath(outputDirectory, filename), READ_FILE_FLAGS)
      try {
        const linked = await pathHandle.stat()
        if (!linked.isFile() || linked.dev !== created.dev || linked.ino !== created.ino) {
          throw new Error("generated image path no longer identifies the created file")
        }
      } finally {
        await pathHandle.close().catch(() => undefined)
      }
      const relativePath = `${OUTPUT_RELATIVE_PATH}/${filename}`
      const result: SaveGeneratedImageResult = {
        absolutePath: join(projectDirectory, relativePath),
        relativePath,
        bytes: image.length,
        mimeType: "image/png",
      }
      await file.close()
      await verify()
      return result
    } catch (error) {
      await file.close().catch(() => undefined)
      try {
        // Never remove another writer's replacement while cleaning up this request.
        const linked = await open(descriptorPath(outputDirectory, filename), READ_FILE_FLAGS)
        try {
          const info = await linked.stat()
          if (!identity || info.dev !== identity.dev || info.ino !== identity.ino) {
            throw new Error("generated image cleanup path was replaced; replacement was preserved")
          }
        } finally {
          await linked.close()
        }
        await unlink(descriptorPath(outputDirectory, filename))
      } catch (unlinkError) {
        if (errorCode(unlinkError) !== "ENOENT") {
          throw new Error("generated image failed verification and its partial file could not be removed", { cause: unlinkError })
        }
      }
      throw error
    }
  }
  throw new Error("could not allocate a unique generated image filename")
}

export async function saveGeneratedImage(input: SaveGeneratedImageInput): Promise<SaveGeneratedImageResult> {
  if (typeof input !== "object" || input === null) throw new Error("input must be an object")

  const projectDirectory = validatedProjectDirectory(input.projectDirectory)
  const label = validatedLabel(input.label)
  const filename = input.filename === undefined ? undefined : validateGeneratedFilename(input.filename)
  const image = decodeGeneratedPng(input.imageBase64)
  const authorize = input.authorize ?? (async () => {})
  input.signal?.throwIfAborted()

  const project = await openProjectDirectory(projectDirectory)
  let assets: FileHandle | undefined
  let generated: FileHandle | undefined
  const verify = async () => {
    input.signal?.throwIfAborted()
    await input.check?.()
    // Pinning prevents symlink redirection; reopening checks that approval still
    // names those inodes. Post-write checks detect moves during an awaited write.
    await verifyDirectoryBinding(projectDirectory, project)
    if (assets) await verifyDirectoryBinding(join(projectDirectory, "assets"), assets)
    if (generated) await verifyDirectoryBinding(join(projectDirectory, OUTPUT_RELATIVE_PATH), generated)
    input.signal?.throwIfAborted()
  }
  try {
    assets = await openOutputDirectory(project, "assets", () => authorize(join(projectDirectory, "assets")), verify)
    generated = await openOutputDirectory(assets, "generated", () => authorize(join(projectDirectory, OUTPUT_RELATIVE_PATH)), verify)
    return await writeUniqueImage(projectDirectory, generated, label, image, authorize, verify, input.signal, filename)
  } finally {
    await generated?.close().catch(() => undefined)
    await assets?.close().catch(() => undefined)
    await project.close().catch(() => undefined)
  }
}

export async function readGeneratedImage(input: {
  projectDirectory: string
  filename: string
  signal?: AbortSignal
  check?: () => Promise<void>
}) {
  const projectDirectory = validatedProjectDirectory(input.projectDirectory)
  const filename = validateGeneratedFilename(input.filename)
  const directoryPath = join(projectDirectory, OUTPUT_RELATIVE_PATH)
  input.signal?.throwIfAborted()
  await input.check?.()
  const directory = await openProjectDirectory(directoryPath)
  let file: FileHandle | undefined
  try {
    file = await open(descriptorPath(directory, filename), READ_FILE_FLAGS)
    const before = await file.stat()
    if (!before.isFile() || before.size === 0 || before.size > MAX_IMAGE_BYTES) {
      throw new Error("saved image must be a bounded regular PNG file")
    }
    // One extra byte detects growth without readFile allocating from an unbounded stream.
    const buffer = Buffer.alloc(before.size + 1)
    let length = 0
    while (length < buffer.length) {
      input.signal?.throwIfAborted()
      const result = await file.read(buffer, length, buffer.length - length, length)
      if (result.bytesRead === 0) break
      length += result.bytesRead
    }
    const after = await file.stat()
    if (length !== before.size || after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
      throw new Error("saved image changed while being read")
    }
    await verifyDirectoryBinding(directoryPath, directory)
    const linked = await open(descriptorPath(directory, filename), READ_FILE_FLAGS)
    try {
      const current = await linked.stat()
      if (!current.isFile() || current.dev !== before.dev || current.ino !== before.ino) {
        throw new Error("saved image path was replaced while being read")
      }
    } finally {
      await linked.close()
    }
    const image = decodeGeneratedPng(buffer.subarray(0, length).toString("base64"))
    await input.check?.()
    input.signal?.throwIfAborted()
    return {
      image,
      filename,
      absolutePath: join(directoryPath, filename),
      relativePath: `${OUTPUT_RELATIVE_PATH}/${filename}`,
    }
  } finally {
    await file?.close().catch(() => undefined)
    await directory.close().catch(() => undefined)
  }
}
