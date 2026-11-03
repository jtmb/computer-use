/**
 * Serializes Docker gateway mutations with an advisory `flock` held on an
 * inherited open-file description. The lock file is checked before and after
 * acquisition so a symlink, foreign owner or replaced inode cannot be treated
 * as the reviewed lock.
 *
 * `flock` excludes cooperating processes only; it is not a security boundary
 * against a writer that ignores the lock.
 */
import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { lstat, mkdir, open } from "node:fs/promises"
import { dirname, join, parse } from "node:path"

async function privateDirectory(directory) {
  const parts = []
  for (let path = directory; path !== parse(path).root; path = dirname(path)) parts.unshift(path)
  for (const path of parts) {
    let info
    try { info = await lstat(path) }
    catch (error) {
      if (error.code !== "ENOENT" || path !== directory) throw new Error("Gateway lock parent is unavailable.")
      await mkdir(path, { mode: 0o700 })
      info = await lstat(path)
    }
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Gateway lock path must not contain symlinks.")
    if (path === directory && (info.uid !== process.getuid() || info.mode & 0o077)) {
      throw new Error("Gateway lock directory must be private and owned by the current user.")
    }
  }
}

export async function withGatewayLock(directory, signal, operation) {
  await privateDirectory(directory)
  const filename = join(directory, "operation.lock")
  const handle = await open(filename, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600)
  try {
    const initial = await handle.stat()
    if (!initial.isFile() || initial.uid !== process.getuid() || initial.nlink !== 1 || initial.mode & 0o077) {
      throw new Error("Gateway lock is not a private owned regular file.")
    }
    await new Promise((resolve, reject) => {
      // flock uses the inherited open-file description, retained by handle above.
      const child = spawn("flock", ["--exclusive", "--nonblock", "3"], {
        stdio: ["ignore", "ignore", "ignore", handle.fd], signal,
      })
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Gateway lock acquisition timed out.")) }, 3000)
      child.once("error", () => { clearTimeout(timer); reject(new Error("Gateway lock is unavailable or cancelled.")) })
      child.once("exit", code => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error("Another Docker web action holds the gateway lock; retry after it finishes."))
      })
    })
    const verify = async () => {
      const current = await lstat(filename)
      if (!current.isFile() || current.ino !== initial.ino || current.dev !== initial.dev || current.nlink !== 1
        || current.uid !== initial.uid || current.mode & 0o077 || signal?.aborted) {
        throw new Error("Gateway lock identity changed or the operation was cancelled.")
      }
    }
    await verify()
    return await operation(verify)
  } finally { await handle.close() }
}
