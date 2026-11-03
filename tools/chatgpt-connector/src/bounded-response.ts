/**
 * Bounded response acquisition shared by the connector transports. It caps the
 * bytes this reader consumes, propagates cancellation, and disposes of a body
 * whose fetch resolves after abort instead of leaving it owned by nobody.
 *
 * These limits bound this reader only; they do not cap buffering inside fetch
 * or the network stack.
 */
const MAX_BODY_BYTES = 24 * 1024 * 1024
const READ_BYTES = 64 * 1024

export class ResponseAcquisitionError extends Error {
  readonly code: "byte-limit" | "byte-reader" | "aborted" | "read-failed" | "invalid-utf8"

  constructor(code: ResponseAcquisitionError["code"]) {
    super(`Response acquisition refused: ${code}`)
    this.code = code
  }
}

export function cancelResponse(response: Response): void {
  void response.body?.cancel().catch(() => undefined)
}

export async function waitForAbortable<Value>(pending: Promise<Value>, signal: AbortSignal, discard?: (value: Value) => void): Promise<Value> {
  let onAbort!: () => void
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new ResponseAcquisitionError("aborted"))
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
  try {
    const value = await Promise.race([pending, interrupted])
    if (signal.aborted) throw new ResponseAcquisitionError("aborted")
    return value
  } catch (error) {
    // A fetch implementation may ignore abort and resolve later; do not leave that body owned by nobody.
    if (signal.aborted) void pending.then(discard, () => undefined).catch(() => undefined)
    throw error
  }
  finally { signal.removeEventListener("abort", onAbort) }
}

/** Limits bytes delivered to this reader, not buffering inside fetch or the network stack. */
export async function readBoundedResponse(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BODY_BYTES) {
    throw new RangeError("Response byte limit is outside the fixed envelope")
  }
  const check = () => { if (signal.aborted) throw new ResponseAcquisitionError("aborted") }
  let reader: ReadableStreamBYOBReader | undefined
  let complete = false
  try {
    check()
    const length = response.headers.get("content-length")
    if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes) {
      throw new ResponseAcquisitionError("byte-limit")
    }
    if (!response.body) return ""
    try { reader = response.body.getReader({ mode: "byob" }) }
    catch { throw new ResponseAcquisitionError("byte-reader") }
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      check()
      const remaining = maxBytes - total
      if (remaining === 0) {
        // No limit-plus-one EOF probe: an exactly spent body must close without another acquisition.
        await waitForAbortable(reader.closed, signal)
        check()
        break
      }
      let result: ReadableStreamReadResult<Uint8Array>
      try { result = await waitForAbortable(reader.read(new Uint8Array(Math.min(READ_BYTES, remaining))), signal) }
      catch (error) {
        if (error instanceof ResponseAcquisitionError) throw error
        throw new ResponseAcquisitionError("read-failed")
      }
      check()
      const size = result.value?.byteLength ?? 0
      if (size > Math.min(READ_BYTES, remaining) || (!result.done && size === 0)) {
        throw new ResponseAcquisitionError("read-failed")
      }
      if (size > 0) { chunks.push(result.value!); total += size }
      if (result.done) break
    }
    check()
    let text: string
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total)) }
    catch { throw new ResponseAcquisitionError("invalid-utf8") }
    complete = true
    return text
  } catch (error) {
    if (signal.aborted) throw new ResponseAcquisitionError("aborted")
    if (error instanceof ResponseAcquisitionError) throw error
    throw new ResponseAcquisitionError("read-failed")
  } finally {
    if (!complete) {
      if (reader) void reader.cancel().catch(() => undefined)
      else void response.body?.cancel().catch(() => undefined)
    }
    try { reader?.releaseLock() } catch { /* Cancellation may still be completing an outstanding read. */ }
  }
}
