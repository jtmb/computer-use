import { CAPTURE_BYTE_LIMIT, CAPTURE_DURATION_MS, createCaptureAcquisition } from "./capture-acquisition.mjs"

// Reusable source for future capture clients; no dependency on a generated
// acceptance checkout that disappears during normal cleanup.
export function createCaptureTransport(fetchImpl, options = {}) {
  const acquisition = createCaptureAcquisition(options)
  let closed = false
  return {
    async fetch(input, init) {
      if (closed) throw new Error("Capture transport is closed")
      const response = await fetchImpl(input, init)
      return acquisition.wrapResponse(response)
    },
    metrics() {
      return { bytes: acquisition.bytes, byteLimit: options.byteLimit ?? CAPTURE_BYTE_LIMIT,
        recordLimit: 2048, durationLimitMs: options.durationMs ?? CAPTURE_DURATION_MS }
    },
    close() {
      closed = true
      acquisition.close()
    },
  }
}
