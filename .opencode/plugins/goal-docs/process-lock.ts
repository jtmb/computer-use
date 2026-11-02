import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { lstat, open } from "node:fs/promises"

import { throwIfAborted } from "./abort.ts"

export class ProcessLockError extends Error {
  readonly code: "concurrent" | "symlink" | "io"

  constructor(code: ProcessLockError["code"], message: string) {
    super(message)
    this.name = "ProcessLockError"
    this.code = code
  }
}

export async function acquireProcessLock(filePath: string, signal?: AbortSignal): Promise<() => Promise<void>> {
  throwIfAborted(signal)
  if (process.platform !== "linux") throw new ProcessLockError("io", "goal-docs requires the Linux flock adapter; no unsafe lock fallback is available")
  const handle = await open(filePath, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size !== 0) {
      throw new ProcessLockError("io", "goal-docs process lock must be an empty, singly linked regular file; existing contents were preserved")
    }
    throwIfAborted(signal)
    await new Promise<void>((resolve, reject) => {
      // flock and this process share the inherited open-file description. The
      // kernel lock survives the helper's exit until our handle is closed.
      const child = spawn("/usr/bin/flock", ["--exclusive", "--nonblock", "3"], {
        stdio: ["ignore", "ignore", "ignore", handle.fd], signal, timeout: 3_000, killSignal: "SIGKILL",
      })
      let failure: Error | undefined
      child.once("error", (error) => { failure = error })
      child.once("close", (code) => {
        if (failure) reject(new ProcessLockError("io", `goal-docs process lock helper failed: ${failure.message}`))
        else if (code === 1) reject(new ProcessLockError("concurrent", "another goal-docs process holds the documentation lock"))
        else if (code !== 0) reject(new ProcessLockError("io", "goal-docs process lock helper failed or timed out; no unsafe fallback was attempted"))
        else resolve()
      })
    })
    throwIfAborted(signal)
    const current = await lstat(filePath)
    if (current.isSymbolicLink() || current.dev !== metadata.dev || current.ino !== metadata.ino) {
      throw new ProcessLockError("symlink", "goal-docs process lock path changed during acquisition")
    }
    // Never unlink this inode: replacing it would allow two independent locks.
    return () => handle.close()
  } catch (error) {
    await handle.close()
    if (signal?.aborted) throwIfAborted(signal)
    throw error
  }
}
