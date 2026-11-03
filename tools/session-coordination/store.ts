import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { hash, LIMITS, record, validateState, type Scope, type State } from "./model.ts"

const LOCK_HELPER = "/usr/bin/flock"
const LOCK_WAIT_MS = 2000
const LOCK_CONFLICT_EXIT = 75 // util-linux conflict/timeout code; other exits are helper failures.

export function checkAbort(signal?: AbortSignal): void { signal?.throwIfAborted() }
export async function bounded<T>(action: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, ms = 5000): Promise<T> {
  checkAbort(signal)
  const controller = new AbortController()
  let rejectBound!: (reason: unknown) => void
  const stopped = new Promise<never>((_resolve, reject) => { rejectBound = reject })
  const cancel = () => { const reason = signal?.reason ?? new Error("coordination operation cancelled"); controller.abort(reason); rejectBound(reason) }
  signal?.addEventListener("abort", cancel, { once: true })
  const timer = setTimeout(() => { const error = new Error(`coordination request exceeded ${ms}ms; outcome may be unknown`); controller.abort(error); rejectBound(error) }, ms)
  try { return await Promise.race([Promise.resolve().then(() => { checkAbort(controller.signal); return action(controller.signal) }), stopped]) }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel) }
}

function lockBusy(): Error {
  return new Error("coordination store busy; another operation holds the lock; retry same operation ID, never remove room.lock")
}
function lockHelperFailure(detail: string): Error {
  return new Error(`coordination lock helper failed (${detail}); retry same operation ID, never remove room.lock`)
}
async function acquireRoomLock(fd: number, signal?: AbortSignal): Promise<void> {
  checkAbort(signal)
  let helper: ReturnType<typeof spawn>
  try {
    // The helper locks the inherited open-file description; its exit leaves that lock held by our fd.
    helper = spawn(LOCK_HELPER, ["--exclusive", "--timeout", String(LOCK_WAIT_MS / 1000), "--conflict-exit-code", String(LOCK_CONFLICT_EXIT), "3"], {
      stdio: ["ignore", "ignore", "ignore", fd], timeout: LOCK_WAIT_MS + 1000, killSignal: "SIGKILL", signal,
    })
  } catch (error) { throw lockHelperFailure((error as Error).message) }
  const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>(resolve => {
    let spawnError: Error | undefined
    helper.once("error", error => { spawnError = error; if (helper.pid === undefined) resolve({ code: null, signal: null, error }) })
    helper.once("close", (code, exitSignal) => resolve({ code, signal: exitSignal, error: spawnError }))
  })
  checkAbort(signal)
  if (outcome.code === 0) return
  if (outcome.code === LOCK_CONFLICT_EXIT) throw lockBusy()
  throw lockHelperFailure(outcome.error?.message ?? (outcome.code === null ? `signal ${outcome.signal ?? "unknown"}` : `exit ${outcome.code}`))
}

export class Store {
  readonly directory: string
  readonly scope: Scope
  constructor(directory: string, scope: Scope) {
    this.directory = path.resolve(directory); this.scope = scope
    const relative = path.relative(scope.directory, this.directory)
    if (!path.isAbsolute(directory) || !relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("state directory must be explicitly inside this worktree")
  }
  async inspect(create: boolean): Promise<boolean> {
    if (await realpath(this.scope.directory) !== this.scope.directory) throw new Error("worktree root must be canonical, not symlinked")
    let current = this.scope.directory
    for (const part of path.relative(current, this.directory).split(path.sep)) {
      current = path.join(current, part)
      let info
      try { info = await lstat(current) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        if (!create) return false
        await mkdir(current, { mode: 0o700 }); info = await lstat(current)
      }
      if (info.isSymbolicLink() || !info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o022)) throw new Error("unsafe coordination directory; permissions were not changed")
    }
    return true
  }
  async read(): Promise<State> {
    if (!await this.inspect(false)) return { version: 1, scope: this.scope, messages: [], claims: [], assignments: [] }
    let file
    try { file = await open(path.join(this.directory, "room.json"), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, scope: this.scope, messages: [], claims: [], assignments: [] }; throw error }
    try {
      const info = await file.stat()
      if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o077) || info.size > LIMITS.state) throw new Error("unsafe or oversized coordination state")
      const buffer = Buffer.alloc(LIMITS.state + 1)
      let size = 0
      while (size < buffer.length) { const read = await file.read(buffer, size, buffer.length - size, size); if (!read.bytesRead) break; size += read.bytesRead }
      if (size > LIMITS.state) throw new Error("coordination state grew beyond byte budget")
      const wrapped: unknown = JSON.parse(buffer.subarray(0, size).toString("utf8"))
      if (!record(wrapped) || wrapped.checksum !== hash(wrapped.state)) throw new Error("coordination state checksum mismatch; retained unchanged")
      validateState(wrapped.state, this.scope)
      return wrapped.state
    } finally { await file.close() }
  }
  async mutate<T>(change: (state: State) => T, signal?: AbortSignal): Promise<T> {
    checkAbort(signal)
    await this.inspect(true)
    const lockPath = path.join(this.directory, "room.lock")
    const lock = await open(lockPath, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600)
    try {
      const info = await lock.stat()
      if (!info.isFile() || info.nlink !== 1 || info.size !== 0 || (info.mode & 0o077)) throw new Error("unsafe coordination lock")
      await acquireRoomLock(lock.fd, signal)
      checkAbort(signal)
      const current = await lstat(lockPath)
      if (current.ino !== info.ino || current.dev !== info.dev || current.isSymbolicLink()) throw new Error("coordination lock path changed")
      const state = await this.read()
      const previous = hash(state)
      const result = change(state)
      validateState(state, this.scope)
      if (hash(state) === previous) return result
      const bytes = Buffer.from(JSON.stringify({ state, checksum: hash(state) }) + "\n")
      if (bytes.length > LIMITS.state) throw new Error("coordination store at capacity; no history was removed")
      const temporary = path.join(this.directory, `write-${randomUUID()}.tmp`)
      const output = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      try {
        await output.writeFile(bytes); await output.sync(); checkAbort(signal)
        await this.inspect(false)
        await rename(temporary, path.join(this.directory, "room.json"))
        const directory = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
        try { await directory.sync() } finally { await directory.close() }
      } finally {
        await output.close()
        await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error })
      }
      return result
    } finally { await lock.close() }
  }
}
