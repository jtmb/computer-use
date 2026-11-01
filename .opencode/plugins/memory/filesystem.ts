import { randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { lstat, mkdir, open, opendir, rename, unlink } from "node:fs/promises"
import type { Dir, Dirent } from "node:fs"
import type { FileHandle } from "node:fs/promises"
import path from "node:path"

export interface FileStat {
  size: number
  nlink: number
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
}

export interface DirectoryHandle {
  read(): Promise<Dirent | null>
  close(): Promise<void>
}

export interface MemoryFileSystem {
  lstat(filePath: string): Promise<FileStat>
  openDirectory(filePath: string): Promise<DirectoryHandle>
  readBounded(filePath: string, limit: number, signal?: AbortSignal): Promise<{ text: string; bytes: number }>
  openExclusive(filePath: string, mode: number): Promise<{ write(content: string): Promise<void>; sync(): Promise<void>; close(): Promise<void> }>
  mkdir(filePath: string, mode: number): Promise<void>
  rename(from: string, to: string): Promise<void>
  unlink(filePath: string): Promise<void>
}

export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafePathError"
  }
}

export class BoundedReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BoundedReadError"
  }
}

function abortError(signal?: AbortSignal): Error | undefined {
  if (!signal?.aborted) return undefined
  return signal.reason instanceof Error ? signal.reason : new Error("memory operation cancelled")
}

async function readHandle(handle: FileHandle, limit: number, filePath: string, signal?: AbortSignal): Promise<{ text: string; bytes: number }> {
  const metadata = await handle.stat()
  if (!metadata.isFile()) throw new UnsafePathError(`${filePath} is not a regular file`)
  if (metadata.nlink !== 1) throw new UnsafePathError(`${filePath} has multiple hard links`)
  if (metadata.size > limit) throw new BoundedReadError(`${filePath} exceeds the ${limit}-byte read limit`)
  const buffer = Buffer.allocUnsafe(limit + 1)
  let bytesRead = 0
  while (bytesRead < buffer.length) {
    const aborted = abortError(signal)
    if (aborted) throw aborted
    const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
    if (result.bytesRead === 0) break
    bytesRead += result.bytesRead
  }
  if (bytesRead > limit) throw new BoundedReadError(`${filePath} grew beyond the ${limit}-byte read limit`)
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead))
  return { text, bytes: bytesRead }
}

export const liveFileSystem: MemoryFileSystem = {
  lstat: async (filePath) => lstat(filePath),
  openDirectory: async (filePath) => {
    const directory: Dir = await opendir(filePath)
    return { read: () => directory.read(), close: () => directory.close() }
  },
  readBounded: async (filePath, limit, signal) => {
    const handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK)
    try {
      return await readHandle(handle, limit, filePath, signal)
    } finally {
      await handle.close()
    }
  },
  openExclusive: async (filePath, mode) => {
    const handle = await open(filePath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, mode)
    return {
      write: async (content) => { await handle.writeFile(content, "utf8") },
      sync: async () => { await handle.sync() },
      close: async () => { await handle.close() },
    }
  },
  mkdir: async (filePath, mode) => mkdir(filePath, { mode }),
  rename,
  unlink,
}

export async function inspectSafePath(
  filePath: string,
  authorizeRead: (absolutePath: string) => Promise<void>,
  fs: MemoryFileSystem,
): Promise<{ missingAt?: string; stat?: FileStat }> {
  if (!path.isAbsolute(filePath) || filePath.length > 4_096 || /\0/.test(filePath) || path.normalize(filePath) !== filePath) {
    throw new UnsafePathError("path must be a normalized absolute path no longer than 4096 characters")
  }
  const absolute = filePath
  const parsed = path.parse(absolute)
  let current = parsed.root
  const parts = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)
  if (parts.length > 128) throw new UnsafePathError("path exceeds the 128-component safety limit")
  if (parts.length === 0) return { stat: await fs.lstat(parsed.root) }
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index])
    await authorizeRead(current)
    let stat: FileStat
    try {
      stat = await fs.lstat(current)
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") return { missingAt: current }
      throw error
    }
    if (stat.isSymbolicLink()) throw new UnsafePathError(`${current} is a symlink`)
    if (index < parts.length - 1 && !stat.isDirectory()) throw new UnsafePathError(`${current} is not a directory`)
    if (index === parts.length - 1) return { stat }
  }
  throw new Error("unreachable path validation state")
}

export async function writeAtomically(
  targetPath: string,
  lockPath: string,
  temporaryPath: string,
  content: string,
  fs: MemoryFileSystem,
  signal?: AbortSignal,
  verifyCurrent?: () => Promise<void>,
): Promise<void> {
  const aborted = abortError(signal)
  if (aborted) throw aborted
  const lockContents = `${process.pid}\n${randomUUID()}\n`
  let lock: Awaited<ReturnType<MemoryFileSystem["openExclusive"]>> | undefined
  let temporary: Awaited<ReturnType<MemoryFileSystem["openExclusive"]>> | undefined
  let lockOwned = false
  let temporaryOwned = false
  try {
    lock = await fs.openExclusive(lockPath, 0o600)
    lockOwned = true
    await lock.write(lockContents)
    await lock.sync()
    await verifyCurrent?.()
    temporary = await fs.openExclusive(temporaryPath, 0o600)
    temporaryOwned = true
    await temporary.write(content)
    await temporary.sync()
    await temporary.close()
    temporary = undefined
    const beforeRename = await fs.lstat(targetPath).catch((error) => {
      if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") return undefined
      throw error
    })
    if (beforeRename?.isSymbolicLink() || (beforeRename && !beforeRename.isFile()) || (beforeRename && beforeRename.nlink !== 1)) {
      throw new UnsafePathError(`${targetPath} changed to an unsafe file before replacement`)
    }
    await verifyCurrent?.()
    const afterOpen = abortError(signal)
    if (afterOpen) throw afterOpen
    await fs.rename(temporaryPath, targetPath)
    temporaryOwned = false
  } finally {
    if (temporary) await temporary.close().catch(() => undefined)
    if (temporaryOwned) await unlinkIfOwned(fs, temporaryPath, content).catch(() => undefined)
    if (lock) await lock.close().catch(() => undefined)
    if (lockOwned) await unlinkIfOwned(fs, lockPath, lockContents).catch(() => undefined)
  }
}

export async function removeUnderLock(
  targetPath: string,
  lockPath: string,
  fs: MemoryFileSystem,
  signal?: AbortSignal,
  verifyCurrent?: () => Promise<void>,
): Promise<void> {
  const aborted = abortError(signal)
  if (aborted) throw aborted
  const lockContents = `${process.pid}\n${randomUUID()}\n`
  const lock = await fs.openExclusive(lockPath, 0o600)
  try {
    await lock.write(lockContents)
    await lock.sync()
    await verifyCurrent?.()
    const current = await fs.lstat(targetPath)
    if (current.isSymbolicLink() || !current.isFile() || current.nlink !== 1) throw new UnsafePathError(`${targetPath} changed to an unsafe file before removal`)
    const afterOpen = abortError(signal)
    if (afterOpen) throw afterOpen
    await fs.unlink(targetPath)
  } finally {
    await lock.close().catch(() => undefined)
    await unlinkIfOwned(fs, lockPath, lockContents).catch(() => undefined)
  }
}

async function unlinkIfOwned(fs: MemoryFileSystem, filePath: string, expected: string): Promise<void> {
  const current = await fs.readBounded(filePath, Math.max(256, Buffer.byteLength(expected)))
  if (current.text !== expected) return
  const stat = await fs.lstat(filePath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return
  await fs.unlink(filePath)
}
