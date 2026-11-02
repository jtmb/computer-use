/** Bounded GNOME screenshot capture shared by the desktop tool plugin. */

import { execFile } from "node:child_process"
import { constants as fsConstants } from "node:fs"
import { lstat, open, readdir, unlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

/** Largest PNG returned to the model; larger captures are deleted and refused. */
export const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024
/** How long to wait for GNOME to write the new PNG. */
export const CAPTURE_WAIT_MS = 10_000
/** Poll interval while waiting for the new PNG. */
export const CAPTURE_POLL_MS = 250
/** Upper bound for the ydotool shortcut process. */
export const YDOTOOL_TIMEOUT_MS = 5_000

export type CaptureMode = "screen" | "window"

/**
 * Linux evdev key sequences for GNOME's built-in screenshot shortcuts.
 * "screen" is Left Shift + Print; "window" is Left Alt + Print.
 */
export const KEY_SEQUENCES: Record<CaptureMode, readonly string[]> = {
  screen: ["42:1", "99:1", "99:0", "42:0"],
  window: ["56:1", "99:1", "99:0", "56:0"],
}

export function keySequence(mode: CaptureMode): string[] {
  return [...KEY_SEQUENCES[mode]]
}

export function screenshotDir(): string {
  return path.join(os.homedir(), "Pictures", "Screenshots")
}

/** Private ydotool socket, or "" when the runtime directory is unset. */
export function socketPath(): string {
  const runtime = process.env.XDG_RUNTIME_DIR
  return runtime ? path.join(runtime, ".ydotool_socket") : ""
}

export function isScreenshotName(name: string): boolean {
  return name.toLowerCase().endsWith(".png")
}

/** Names present after a capture but not before it. */
export function newScreenshots(
  before: readonly string[],
  after: readonly string[],
): string[] {
  const known = new Set(before)
  return after.filter((name) => !known.has(name)).sort()
}

/**
 * Decide what a single capture produced.
 *
 * More than one new PNG is ambiguous: the user may have taken their own
 * screenshot at the same time, so the caller must refuse to guess.
 */
export type CapturePlan =
  | { status: "none" }
  | { status: "ambiguous"; names: string[] }
  | { status: "captured"; name: string }

export function planCapture(
  before: readonly string[],
  after: readonly string[],
): CapturePlan {
  const created = newScreenshots(before, after)
  if (created.length === 0) return { status: "none" }
  if (created.length > 1) return { status: "ambiguous", names: created }
  return { status: "captured", name: created[0] }
}

export function isAttachmentSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_ATTACHMENT_BYTES
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return crc >>> 0
})

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Dimensions from a complete, CRC-checked PNG, or undefined for incomplete data. */
export function pngDimensions(
  bytes: Buffer,
): { width: number; height: number } | undefined {
  if (bytes.length < PNG_SIGNATURE.length + 12) return undefined
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined

  let offset = PNG_SIGNATURE.length
  let width = 0
  let height = 0
  let sawHeader = false
  let sawImageData = false

  while (offset <= bytes.length - 12) {
    const length = bytes.readUInt32BE(offset)
    if (length > bytes.length - offset - 12) return undefined
    const type = bytes.toString("ascii", offset + 4, offset + 8)
    const dataStart = offset + 8
    const crcOffset = dataStart + length
    const expectedCrc = bytes.readUInt32BE(crcOffset)
    if (crc32(bytes.subarray(offset + 4, crcOffset)) !== expectedCrc) return undefined

    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return undefined
      width = bytes.readUInt32BE(dataStart)
      height = bytes.readUInt32BE(dataStart + 4)
      if (width === 0 || height === 0) return undefined
      sawHeader = true
    } else if (type === "IHDR") {
      return undefined
    }

    if (type === "IDAT") sawImageData = true
    offset = crcOffset + 4

    if (type === "IEND") {
      if (length !== 0 || !sawImageData || offset !== bytes.length) return undefined
      return { width, height }
    }
  }

  return undefined
}

/** A file name that is safe to join under the screenshot directory. */
export function isSafeEntryName(name: string): boolean {
  return name.length > 0 && path.basename(name) === name && !name.includes("\0")
}

export function pngDataUri(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`
}

/**
 * Side effects used by `captureOnce`. Injected so the capture flow can be
 * tested without touching the real desktop or screenshot directory.
 */
export interface CaptureDeps {
  list(): Promise<CaptureFileEntry[]>
  trigger(mode: CaptureMode): Promise<CaptureClaim | undefined>
  read(name: string, identity: string, maxBytes: number): Promise<Buffer>
  remove(name: string, identity: string): Promise<void>
  delay(ms: number, signal?: AbortSignal): Promise<void>
  now(): number
  waitMs?: number
  pollMs?: number
  signal?: AbortSignal
}

export interface CaptureFileEntry {
  name: string
  identity: string
}

/** A trigger may claim only a file it can identify as its own output. */
export interface CaptureClaim extends CaptureFileEntry {}

export type CaptureOutcome =
  | { status: "none" }
  | { status: "unowned" }
  | { status: "cancelled" }
  | { status: "ambiguous"; names: string[] }
  | { status: "unreadable"; name: string; reason: string }
  | { status: "retained"; name: string; reason: string }
  | { status: "oversized"; name: string; bytes: number }
  | { status: "invalid"; name: string }
  | {
      status: "captured"
      name: string
      bytes: Buffer
      width: number
      height: number
    }

/**
 * Read only a file explicitly claimed by the trigger. The legacy ydotool
 * shortcut cannot identify which PNG it created, so it deliberately cannot
 * return or delete a file discovered only by comparing directory names.
 */
export async function captureOnce(
  mode: CaptureMode,
  deps: CaptureDeps,
): Promise<CaptureOutcome> {
  if (deps.signal?.aborted) return { status: "cancelled" }
  const before = await deps.list()
  if (deps.signal?.aborted) return { status: "cancelled" }

  let claim: CaptureClaim | undefined
  try {
    claim = await deps.trigger(mode)
  } catch (error) {
    if (deps.signal?.aborted || (error instanceof Error && error.name === "AbortError"))
      return { status: "cancelled" }
    throw error
  }
  if (!claim) return { status: "unowned" }
  if (!isSafeEntryName(claim.name) || typeof claim.identity !== "string" || claim.identity.length === 0) {
    return { status: "invalid", name: claim.name }
  }
  if (before.some((entry) => entry.name === claim!.name)) return { status: "unowned" }

  const waitMs = deps.waitMs ?? CAPTURE_WAIT_MS
  const pollMs = deps.pollMs ?? CAPTURE_POLL_MS
  const deadline = deps.now() + waitMs

  let candidate: CaptureFileEntry | undefined
  for (;;) {
    if (deps.signal?.aborted) {
      await removeClaim(deps, claim)
      return { status: "cancelled" }
    }
    try {
      await deps.delay(pollMs, deps.signal)
    } catch (error) {
      if (deps.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        await removeClaim(deps, claim)
        return { status: "cancelled" }
      }
      throw error
    }
    if (deps.signal?.aborted) {
      await removeClaim(deps, claim)
      return { status: "cancelled" }
    }
    const found = (await deps.list()).find((entry) => entry.name === claim!.name)
    if (found) {
      if (found.identity !== claim.identity) {
        return {
          status: "retained",
          name: claim.name,
          reason: "the claimed path changed identity; the current file was preserved",
        }
      }
      candidate = found
      break
    }
    if (deps.now() >= deadline) return { status: "none" }
  }
  if (!candidate) return { status: "none" }

  let bytes: Buffer | undefined
  let readError: unknown
  try {
    bytes = await deps.read(candidate.name, candidate.identity, MAX_ATTACHMENT_BYTES)
  } catch (error) {
    readError = error
  }

  let cleanupError: unknown
  try {
    await deps.remove(candidate.name, candidate.identity)
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      cleanupError = error
    }
  }
  if (cleanupError) {
    return {
      status: "retained",
      name: candidate.name,
      reason: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    }
  }
  if (readError !== undefined || !bytes) {
    return {
      status: "unreadable",
      name: candidate.name,
      reason: readError instanceof Error ? readError.message : String(readError ?? "capture returned no bytes"),
    }
  }
  if (deps.signal?.aborted) return { status: "cancelled" }

  if (!isAttachmentSize(bytes.length)) {
    return { status: "oversized", name: candidate.name, bytes: bytes.length }
  }
  const dimensions = pngDimensions(bytes)
  if (!dimensions) return { status: "invalid", name: candidate.name }

  return {
    status: "captured",
    name: candidate.name,
    bytes,
    width: dimensions.width,
    height: dimensions.height,
  }
}

/** Run the screenshot shortcut through the private ydotool socket. */
export function runYdotool(
  mode: CaptureMode,
  socket: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "ydotool",
      ["key", ...keySequence(mode)],
      {
        timeout: YDOTOOL_TIMEOUT_MS,
        env: { ...process.env, YDOTOOL_SOCKET: socket },
        signal,
      },
      (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      },
    )
  })
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error("capture cancelled")
      error.name = "AbortError"
      reject(error)
      return
    }
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      const error = new Error("capture cancelled")
      error.name = "AbortError"
      reject(error)
    }
    const timer = setTimeout(finish, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

async function removeClaim(deps: CaptureDeps, claim: CaptureClaim): Promise<void> {
  try {
    const current = (await deps.list()).find((entry) => entry.name === claim.name)
    if (current?.identity === claim.identity) await deps.remove(claim.name, claim.identity)
  } catch {
    // Cancellation must not turn into an attempt to remove an unverified path.
  }
}

type CaptureStat = {
  dev: bigint
  ino: bigint
  size: bigint
  mtimeNs: bigint
  ctimeNs: bigint
  mode: bigint
}

function fileIdentity(stat: CaptureStat): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":")
}

function isRegularFile(stat: CaptureStat): boolean {
  return Number(stat.mode & BigInt(fsConstants.S_IFMT)) === fsConstants.S_IFREG
}

async function readBoundedFile(dir: string, name: string, expectedIdentity: string, maxBytes: number): Promise<Buffer> {
  if (!isSafeEntryName(name)) throw new Error("unsafe screenshot file name")
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("invalid screenshot read bound")
  const absolute = path.join(dir, name)
  const before = await lstat(absolute, { bigint: true })
  if (!isRegularFile(before) || fileIdentity(before) !== expectedIdentity)
    throw new Error("screenshot file changed before reading")

  const handle = await open(
    absolute,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
  )
  try {
    const opened = await handle.stat({ bigint: true })
    if (!isRegularFile(opened) || fileIdentity(opened) !== expectedIdentity)
      throw new Error("screenshot file changed while opening")

    const chunks: Buffer[] = []
    let total = 0
    const limit = maxBytes + 1
    while (total < limit) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, limit - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) break
      chunks.push(chunk.subarray(0, bytesRead))
      total += bytesRead
    }

    const afterRead = await handle.stat({ bigint: true })
    const afterPath = await lstat(absolute, { bigint: true })
    if (fileIdentity(afterRead) !== expectedIdentity || fileIdentity(afterPath) !== expectedIdentity)
      throw new Error("screenshot file changed during reading")
    return Buffer.concat(chunks, total)
  } finally {
    await handle.close()
  }
}

/** Filesystem-backed dependencies; the legacy shortcut intentionally makes no ownership claim. */
export function liveCaptureDeps(
  dir: string,
  socket: string,
  signal?: AbortSignal,
  trigger: (mode: CaptureMode) => Promise<CaptureClaim | undefined> = async (mode) => {
    await runYdotool(mode, socket, signal)
    return undefined
  },
): CaptureDeps {
  return {
    async list() {
      const entries = await readdir(dir)
      const files: CaptureFileEntry[] = []
      for (const name of entries.sort()) {
        if (!isScreenshotName(name) || !isSafeEntryName(name)) continue
        try {
          const stat = await lstat(path.join(dir, name), { bigint: true })
          if (isRegularFile(stat)) files.push({ name, identity: fileIdentity(stat) })
        } catch (error) {
          if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
            throw error
        }
      }
      return files
    },
    trigger,
    read: (name, identity, maxBytes) => readBoundedFile(dir, name, identity, maxBytes),
    async remove(name, identity) {
      if (!isSafeEntryName(name)) throw new Error("unsafe screenshot file name")
      const absolute = path.join(dir, name)
      const stat = await lstat(absolute, { bigint: true })
      if (!isRegularFile(stat) || fileIdentity(stat) !== identity)
        throw new Error("screenshot file changed before cleanup")
      await unlink(absolute)
    },
    delay,
    now: () => Date.now(),
    ...(signal ? { signal } : {}),
  }
}
