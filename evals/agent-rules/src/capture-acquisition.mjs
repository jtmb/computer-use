export const CAPTURE_BYTE_LIMIT = 2 * 1024 * 1024
export const CAPTURE_DURATION_MS = 120_000
const CHUNK_BYTES = 64 * 1024

export class CaptureAcquisitionError extends Error {
  constructor(code) {
    super(`Capture acquisition refused: ${code}`)
    this.name = "CaptureAcquisitionError"
    this.code = code
  }
}

/** Bound client-visible byte acquisition, not HTTP/socket buffering or event semantics. */
export function createCaptureAcquisition({
  byteLimit = CAPTURE_BYTE_LIMIT,
  durationMs = CAPTURE_DURATION_MS,
  signal,
  now = () => performance.now(),
} = {}) {
  for (const [value, maximum] of [[byteLimit, CAPTURE_BYTE_LIMIT], [durationMs, CAPTURE_DURATION_MS]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new RangeError("Capture limits may only be reduced from the fixed envelope")
    }
  }
  const started = now()
  const abort = new AbortController()
  const readers = new Set()
  let bytes = 0
  let failure = null
  let closed = false
  let queue = Promise.resolve()
  const cancelReaders = () => {
    for (const reader of readers) void reader.cancel().catch(() => {})
  }
  const refuse = code => {
    failure ??= code
    abort.abort()
    cancelReaders()
    return new CaptureAcquisitionError(failure)
  }
  const onAbort = () => { refuse("aborted") }
  const timer = setTimeout(() => { refuse("deadline") }, durationMs)
  signal?.addEventListener("abort", onAbort, { once: true })
  if (signal?.aborted) onAbort()
  const check = () => {
    if (closed) throw new CaptureAcquisitionError("closed")
    if (failure) throw new CaptureAcquisitionError(failure)
    if (now() - started >= durationMs) throw refuse("deadline")
  }
  const read = reader => {
    // Serialize all bodies so an outstanding read cannot spend another body's
    // remaining allowance. BYOB bounds the requested view before acquisition.
    const operation = queue.then(async () => {
      check()
      const remaining = byteLimit - bytes
      if (remaining === 0) throw refuse("byte-limit")
      const requested = Math.min(CHUNK_BYTES, remaining)
      let listener
      const interrupted = new Promise((_, reject) => {
        listener = () => reject(new CaptureAcquisitionError(failure ?? "closed"))
        abort.signal.addEventListener("abort", listener, { once: true })
      })
      let result
      try {
        result = await Promise.race([reader.read(new Uint8Array(requested)), interrupted])
      } catch (error) {
        if (error instanceof CaptureAcquisitionError) throw error
        throw refuse("read-failed")
      } finally {
        abort.signal.removeEventListener("abort", listener)
      }
      const length = result.value?.byteLength ?? 0
      bytes += length
      check()
      if (!(result.value === undefined || result.value instanceof Uint8Array) ||
          length > requested || (!result.done && length === 0)) {
        throw refuse("invalid-read")
      }
      return result
    })
    queue = operation.catch(() => {})
    return operation
  }
  const wrapResponse = response => {
    check()
    if (!response.body) return response
    let reader
    try {
      reader = response.body.getReader({ mode: "byob" })
    } catch {
      // A default reader/TransformStream would acquire an arbitrary upstream
      // chunk before checking its size; there is deliberately no such fallback.
      throw refuse("byte-reader-unavailable")
    }
    readers.add(reader)
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const result = await read(reader)
          if (result.value?.byteLength) controller.enqueue(result.value)
          if (result.done) {
            readers.delete(reader)
            reader.releaseLock()
            controller.close()
          }
        } catch (error) {
          readers.delete(reader)
          void reader.cancel().catch(() => {})
          controller.error(error)
        }
      },
      cancel() {
        readers.delete(reader)
        void reader.cancel().catch(() => {})
      },
    }, { highWaterMark: 0 })
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  }
  return Object.freeze({
    get bytes() { return bytes },
    get failure() { return failure },
    wrapResponse,
    close() {
      closed = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      abort.abort()
      cancelReaders()
      readers.clear()
    },
  })
}
