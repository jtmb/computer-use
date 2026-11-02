/**
 * Worker entrypoint for one persistent cua session.
 *
 * Model code, bindings and handles live here; backend tools stay on the main
 * thread. `CuaWorkerRuntime` is imported from the plugin module so the transform,
 * API shape and manual have one source.
 */

import { isMainThread, parentPort, workerData } from "node:worker_threads"
import {
  CuaWorkerRuntime,
  type CuaWorkerInbound,
  type CuaWorkerOutbound,
} from "./cua.ts"

if (isMainThread) {
  throw new Error("cua-worker.ts must be started as a worker thread.")
}

// A model cell may leave a rejected promise unobserved. That is cell behaviour,
// not a reason to kill the worker and lose every binding; cell lifetime is
// controlled by the main-thread watchdog.
process.on("unhandledRejection", () => {})

const port = parentPort
if (!port) throw new Error("cua-worker.ts has no parent port.")

const maxOutputChars = typeof workerData?.maxOutputChars === "number"
  ? workerData.maxOutputChars
  : 25_000

const runtime = new CuaWorkerRuntime({
  maxOutputChars,
  post: (message: CuaWorkerOutbound) => port.postMessage(message),
})

port.on("message", (message: CuaWorkerInbound) => {
  if (!message || typeof message !== "object") return
  if (message.type === "idle-check") {
    port.postMessage({ type: "idle-ready", checkId: message.checkId } satisfies CuaWorkerOutbound)
    return
  }
  if (message.type === "cell") {
    void runtime.runCell(message).catch((error) => {
      // A worker-side failure must still settle the cell; otherwise the main
      // thread would wait for its watchdog instead of reporting the cause.
      try {
        port.postMessage({
          type: "cell-result",
          cellId: message.cellId,
          epoch: message.epoch,
          text: `cua worker cell failed: ${error instanceof Error ? error.message : String(error)}`,
          files: [],
        } satisfies CuaWorkerOutbound)
      } catch {
        // The port is already closed; the main thread terminated the worker.
      }
    })
    return
  }
  if (message.type === "backend-result") {
    runtime.handleBackendResult(message)
  }
})

port.postMessage({ type: "ready" } satisfies CuaWorkerOutbound)
