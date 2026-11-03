import { closeSync, openSync, writeSync } from "node:fs"
import { lstat, mkdtemp } from "node:fs/promises"
import { join } from "node:path"

// Approved scratch root. Workspaces are always freshly allocated here; existing paths are never
// reused, deleted or chmod-ed, so unrelated or earlier work is preserved by construction.
export const SCRATCH_ROOT = "/tmp/opencode"
export const OUTPUT_LIMIT = 256 * 1024
export const DEADLINE_MS = 45_000

export class Refused extends Error {}

export async function requireDirectory(path: string) {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw new Refused(`missing directory: ${path}`)
    throw error
  })
  if (info.isSymbolicLink()) throw new Refused(`refusing symlinked path: ${path}`)
  if (!info.isDirectory()) throw new Refused(`refusing non-directory: ${path}`)
}

export async function assertAbsent(path: string) {
  try {
    await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
  throw new Refused(`refusing existing path: ${path}`)
}

export async function allocateWorkspace(root = SCRATCH_ROOT) {
  await requireDirectory(root)
  return mkdtemp(join(root, "title-cas-"))
}

/** `wx` fails for existing files and symlinks, so a log can never overwrite or follow a link. */
export function writeExclusive(path: string, content: string | Uint8Array) {
  const fd = openSync(path, "wx", 0o600)
  try {
    const bytes = typeof content === "string" ? Buffer.from(content) : content
    let offset = 0
    while (offset < bytes.byteLength) {
      const written = writeSync(fd, bytes, offset, bytes.byteLength - offset)
      if (written < 1) throw new Error("exclusive log write made no progress")
      offset += written
    }
  } finally {
    closeSync(fd)
  }
}

export type BoundedRun = {
  readonly kind: "ok" | "timeout" | "output-limit" | "capture-error"
  readonly exitCode: number | null
  readonly output: Buffer
  readonly bytes: number
  readonly rootExitObserved: boolean
  readonly streamsComplete: boolean
}

type BoundedInput = {
  readonly file: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Record<string, string>
  readonly deadlineMs?: number
  readonly outputLimit?: number
}

/**
 * Runs one process we own, stopping it at the acquisition bounds instead of writing without limit:
 * stdout and stderr share the output budget, and only the terminated capture is returned.
 */
export async function runBounded(input: BoundedInput): Promise<BoundedRun> {
  const limit = input.outputLimit ?? OUTPUT_LIMIT
  const deadline = input.deadlineMs ?? DEADLINE_MS
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > OUTPUT_LIMIT)
    throw new Refused("output limit must be a positive integer no greater than 256 KiB")
  if (!Number.isSafeInteger(deadline) || deadline < 1 || deadline > DEADLINE_MS)
    throw new Refused("deadline must be a positive integer no greater than 45 seconds")
  const proc = Bun.spawn([input.file, ...input.args], {
    cwd: input.cwd,
    env: input.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const chunks: Uint8Array[] = []
  let bytes = 0
  let stopped: "timeout" | "output-limit" | "capture-error" | undefined
  let rootExitObserved = false
  let exitCode: number | null = null
  let streamsComplete = 0
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = []
  const cancelReaders = () => {
    for (const reader of readers) void reader.cancel().catch(() => undefined)
  }
  const stop = (reason: Exclude<BoundedRun["kind"], "ok">) => {
    if (stopped) return
    stopped = reason
    if (!rootExitObserved) {
      try { proc.kill("SIGTERM") } catch { /* exit may race the owned handle signal */ }
    }
    cancelReaders()
  }
  const terminate = setTimeout(() => stop("timeout"), Math.max(1, deadline - Math.min(1_000, deadline / 10)))
  const completion = proc.exited.then(code => {
    rootExitObserved = true
    exitCode = code
  }, () => {
    stop("capture-error")
  })
  let kill: ReturnType<typeof setTimeout>
  const cutoff = new Promise<void>(resolve => {
    kill = setTimeout(() => {
      stop("timeout")
      if (!rootExitObserved) {
        try { proc.kill("SIGKILL") } catch { /* exit may race the owned handle signal */ }
      }
      cancelReaders()
      resolve()
    }, deadline)
  })
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader()
    readers.push(reader)
    try {
      while (!stopped) {
        const chunk = await reader.read()
        if (chunk.done) {
          if (!stopped) streamsComplete++
          return
        }
        if (stopped) return
        if (bytes + chunk.value.length > limit) {
          const keep = chunk.value.subarray(0, limit - bytes)
          if (keep.length > 0) {
            chunks.push(keep)
            bytes += keep.length
          }
          stop("output-limit")
          return
        }
        chunks.push(chunk.value)
        bytes += chunk.value.length
      }
    } catch {
      if (!stopped) stop("capture-error")
    }
  }
  try {
    await Promise.race([Promise.all([pump(proc.stdout!), pump(proc.stderr!), completion]), cutoff])
  } finally {
    clearTimeout(terminate)
    clearTimeout(kill!)
    cancelReaders()
    if (!rootExitObserved) proc.unref()
  }
  return {
    kind: stopped ?? "ok",
    exitCode,
    output: Buffer.concat(chunks),
    bytes,
    rootExitObserved,
    streamsComplete: streamsComplete === 2,
  }
}

const USAGE = `usage:
  runner.ts allocate
  runner.ts assert-fresh <path>
  runner.ts exec --cwd <dir> --log <path> [--deadline <ms>] -- <command> [args...]`

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2)
  if (command === "allocate") {
    process.stdout.write(await allocateWorkspace())
  } else if (command === "assert-fresh") {
    await assertAbsent(rest[0])
  } else if (command === "exec") {
    const split = rest.indexOf("--")
    if (split < 0) throw new Refused(USAGE)
    const flags = new Map<string, string>()
    for (let index = 0; index < split; index += 2) flags.set(rest[index], rest[index + 1])
    const cwd = flags.get("--cwd")
    const log = flags.get("--log")
    if (!cwd || !log) throw new Refused(USAGE)
    const deadline = flags.has("--deadline") ? Number(flags.get("--deadline")) : DEADLINE_MS
    if (!Number.isSafeInteger(deadline) || deadline < 1 || deadline > DEADLINE_MS)
      throw new Refused(`invalid deadline: ${flags.get("--deadline")}`)
    const [file, ...args] = rest.slice(split + 1)
    await assertAbsent(log)
    const run = await runBounded({ file, args, cwd, env: process.env as Record<string, string>, deadlineMs: deadline })
    writeExclusive(log, run.output)
    process.stdout.write(`kind=${run.kind} exit=${run.exitCode} bytes=${run.bytes} log=${log}\n`)
    process.exitCode = run.kind === "ok" ? 0 : run.kind === "timeout" ? 3 : run.kind === "output-limit" ? 4 : 5
  } else {
    throw new Refused(USAGE)
  }
}
