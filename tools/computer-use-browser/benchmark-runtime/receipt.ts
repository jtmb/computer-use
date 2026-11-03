import type { FileHandle } from "node:fs/promises"

type ReceiptFile = Pick<FileHandle, "truncate" | "write" | "sync">

export function createReceiptWriter(handle: ReceiptFile) {
  let pending = Promise.resolve()
  return async (value: unknown) => {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8")
    if (bytes.length > 1_048_576) throw new Error("benchmark receipt exceeded the one-megabyte bound")
    // Idle events and tool hooks share one descriptor; a failed save poisons the queue.
    pending = pending.then(async () => {
      await handle.truncate(0)
      let offset = 0
      while (offset < bytes.length) {
        const remaining = bytes.length - offset
        const { bytesWritten } = await handle.write(bytes, offset, remaining, offset)
        if (!Number.isSafeInteger(bytesWritten) || bytesWritten < 1 || bytesWritten > remaining) {
          throw new Error("benchmark receipt write made invalid progress")
        }
        offset += bytesWritten
      }
      await handle.truncate(bytes.length)
      await handle.sync()
    })
    return pending
  }
}
