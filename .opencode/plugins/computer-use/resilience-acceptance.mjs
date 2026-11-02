/**
 * Resilience acceptance for the bridge boundary: a frozen bridge daemon must produce a
 * bounded error, and the serialized surface must recover when it answers again.
 *
 *   node --experimental-strip-types resilience-acceptance.mjs \
 *     --window-id <uuid:n> --app-id <desktop-id> [--allow-effects]
 *
 * Every capture is preceded by a fresh unique ID/app match and followed by an inventory
 * comparison. Freezing the bridge child is opt-in and uses only this client's owned handle.
 */

import { registerCaptureTools } from "./capture-tool.ts"
import { withSerializedTools } from "./serialization.ts"
import { createAuthGuard, createOwnerOperationQueue } from "../../../tools/computer-use-runtime/src/index.ts"
import { registerWindowTools } from "./windows.ts"
import { ownedBridgeDaemonControl, stopBridgeDaemon } from "./bridge.ts"
import {
  captureWithStableTarget,
  parseAcceptanceArgs,
  parseInventoryText,
  runExplicitEffects,
  withOwnedDaemonSuspension,
} from "./acceptance-safety.mjs"

let acceptanceOptions
try {
  acceptanceOptions = parseAcceptanceArgs(process.argv.slice(2), { allowLaunchDesktopId: false })
} catch (error) {
  console.error("usage: resilience-acceptance.mjs --window-id <uuid:n> --app-id <desktop-id> [--allow-effects]")
  console.error(error?.message ?? error)
  process.exit(2)
}

const tools = new Map()
const editor = {
  namespace() {},
  add(tool) { tools.set(tool.name, tool) },
}
const serializedEditor = withSerializedTools(editor, "desktop", {
  queue: createOwnerOperationQueue(),
  authGuard: createAuthGuard(),
  registeredIds: new Set(),
})
const assertPermission = async () => {}
registerWindowTools(serializedEditor, { assertPermission })
registerCaptureTools(serializedEditor, { assertPermission })

const cancellation = new AbortController()
const context = {
  sessionID: "ses_resilience",
  agent: "acceptance",
  messageID: "msg_resilience",
  id: "call_resilience",
  signal: cancellation.signal,
}

let failures = 0
function report(ok, message) {
  console.log(`${ok ? "PASS" : "FAIL"} ${message}`)
  if (!ok) failures += 1
}

const textOf = (result) =>
  (result.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n")

async function call(name, input = {}) {
  const tool = tools.get(name)
  if (!tool) throw new Error(`tool ${name} is not registered`)
  return tool.execute(input, context)
}

async function callCapture() {
  const started = Date.now()
  try {
    const checked = await captureWithStableTarget({
      options: acceptanceOptions,
      inventory: async () => parseInventoryText(textOf(await call("windows"))),
      capture: (target) => call("capture", { windowId: target.id }),
    })
    const file = (checked.result.content ?? []).find((part) => part.type === "file")
    const text = textOf(checked.result)
    return {
      ok: Boolean(file),
      text,
      elapsed: Date.now() - started,
      stable: true,
    }
  } catch (error) {
    return {
      ok: false,
      text: `failed: ${error?.message ?? error}`,
      elapsed: Date.now() - started,
      stable: false,
    }
  }
}

try {
  const baseline = await callCapture()
  report(baseline.ok && baseline.elapsed < 20_000,
    `a fresh uniquely selected target capture answered in ${baseline.elapsed} ms`)
  report(baseline.stable,
    "the capture path compared post-inventory IDs, app IDs, PIDs, geometry, and focus")

  await runExplicitEffects(acceptanceOptions, async () => {
    if (!baseline.ok || !baseline.stable) {
      report(false, "the freeze step was refused because the baseline target was not safely validated")
      return
    }
    const control = ownedBridgeDaemonControl()
    if (!control?.isCurrent()) {
      report(false, "no current spawn-owned bridge daemon was available for the opt-in freeze")
      return
    }

    try {
      const frozen = await withOwnedDaemonSuspension(control, callCapture, (resume) => {
        const handler = () => { resume() }
        process.once("exit", handler)
        const cancelHandlers = new Map([
          ["SIGINT", () => { process.exitCode = 130; resume(); cancellation.abort() }],
          ["SIGTERM", () => { process.exitCode = 143; resume(); cancellation.abort() }],
          ["SIGHUP", () => { process.exitCode = 129; resume(); cancellation.abort() }],
        ])
        for (const [signal, cancel] of cancelHandlers) process.once(signal, cancel)
        return () => {
          process.removeListener("exit", handler)
          for (const [signal, cancel] of cancelHandlers) process.removeListener(signal, cancel)
        }
      })
      report(!frozen.ok && frozen.elapsed < 45_000 &&
        /timed out|timeout|failed|closed|unavailable|unable|cannot/i.test(frozen.text),
      `the owned frozen bridge returned a bounded error in ${frozen.elapsed} ms: ${frozen.text.slice(0, 120).replace(/\s+/g, " ")}`)
      report(frozen.stable,
        "the frozen-path capture attempt still compared post-inventory identity and focus")
    } catch (error) {
      report(false, `could not safely freeze/resume the owned bridge daemon: ${String(error?.message ?? error).slice(0, 120)}`)
    }

    const recovered = await callCapture()
    report(recovered.ok && recovered.elapsed < 20_000,
      `the serialized surface recovered afterwards in ${recovered.elapsed} ms`)
    report(recovered.stable,
      "the recovered capture left post-inventory IDs, app IDs, PIDs, geometry, and focus unchanged")
  })
  if (!acceptanceOptions.allowEffects)
    report(true, "daemon suspension was not dispatched without --allow-effects")
} catch (error) {
  console.error("FAIL harness crashed:", error?.message ?? error)
  failures += 1
} finally {
  stopBridgeDaemon()
  console.log(failures === 0 ? "SUMMARY: failures=0" : `SUMMARY: failures=${failures}`)
  if (process.exitCode === undefined || process.exitCode === 0)
    process.exitCode = failures === 0 ? 0 : 1
}
