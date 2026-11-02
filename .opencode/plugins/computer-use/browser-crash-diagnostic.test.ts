/**
 * Offline contracts for WORKER_CRASHED diagnostics: the crash facts recorded by
 * the worker supervisor and the bounded hint rendered by the registered web tool.
 *
 * Only the child stdio/event boundary and the browser/permission dependencies are
 * faked; the production manager and tool formatter run for real. These cases do not
 * launch a browser or prove a crash cause.
 */

import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { test } from "node:test"

import { registerBrowserTools } from "./browser-tools.ts"
import { BrowserBackendError } from "../../../tools/computer-use-browser/src/errors.ts"
import { NodeWorkerHandle } from "../../../tools/computer-use-browser/src/manager.ts"
import { encodeProtocolMessage } from "../../../tools/computer-use-browser/src/protocol.ts"

class FakeChild extends EventEmitter {
  pid = 4242
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  stdin = {
    write: (_chunk: unknown, callback?: () => void) => {
      if (typeof callback === "function") callback()
      return true
    },
    destroy() {},
  }

  kill(signal?: string) {
    queueMicrotask(() => this.emit("close", null, signal))
    return true
  }

  unref() {}
}

const frame = (value: unknown) => Buffer.from(encodeProtocolMessage(value))
const ready = () => frame({ type: "ready" })
const startup = (code: string) => frame({ type: "startup-error", code, message: "startup" })
const expected = (readiness: string, childEvent: string, exitCode: number | null, signal: string | null) =>
  ({ readiness, childEvent, exitCode, signal })

test("exit before the ready frame records not-observed readiness and the child status", async () => {
  const child = new FakeChild()
  const handle = new NodeWorkerHandle(child as never)
  const waiting = handle.waitUntilReady()
  child.emit("exit", 3, null)
  await assert.rejects(waiting, (error: any) => {
    assert.equal(error.code, "WORKER_CRASHED")
    assert.deepEqual(error.crashMetadata, expected("not-observed", "exit", 3, null))
    return true
  })
})

test("exit after the ready frame records observed readiness and never claims pre-launch", async () => {
  const child = new FakeChild()
  const handle = new NodeWorkerHandle(child as never)
  child.stdout.emit("data", ready())
  await handle.waitUntilReady()
  const pending = handle.execute({ method: "tabs.list" } as never)
  child.emit("exit", 0, null)
  await assert.rejects(pending, (error: any) => {
    assert.deepEqual(error.crashMetadata, expected("observed", "exit", 0, null))
    return true
  })
})

test("exit signals are allowlisted and unknown signals fold to other", async () => {
  for (const [signal, name] of [["SIGKILL", "SIGKILL"], ["SIGUSR1", "other"]] as const) {
    const child = new FakeChild()
    const handle = new NodeWorkerHandle(child as never)
    const waiting = handle.waitUntilReady()
    child.emit("exit", null, signal)
    await assert.rejects(waiting, (error: any) => {
      assert.deepEqual(error.crashMetadata, expected("not-observed", "exit", null, name))
      return true
    })
  }
})

test("a child error event is recorded as spawn-error", async () => {
  const child = new FakeChild()
  const handle = new NodeWorkerHandle(child as never)
  const waiting = handle.waitUntilReady()
  child.emit("error", new Error("spawn ENOENT"))
  await assert.rejects(waiting, (error: any) => {
    assert.deepEqual(error.crashMetadata, expected("not-observed", "spawn-error", null, null))
    return true
  })
})

test("a startup-error frame keeps its first code and adds no crash metadata", async () => {
  const child = new FakeChild()
  const handle = new NodeWorkerHandle(child as never)
  const waiting = handle.waitUntilReady()
  child.stdout.emit("data", startup("PROFILE_INVALID"))
  child.emit("exit", 1, null)
  await assert.rejects(waiting, (error: any) => {
    assert.equal(error.code, "PROFILE_INVALID")
    assert.equal(error.crashMetadata, undefined)
    return true
  })
})

test("intentional terminate rejects work without crash metadata", async () => {
  const child = new FakeChild()
  const handle = new NodeWorkerHandle(child as never)
  child.stdout.emit("data", ready())
  await handle.waitUntilReady()
  const pending = handle.execute({ method: "tabs.list" } as never)
  await handle.terminate()
  await assert.rejects(pending, (error: any) => {
    assert.equal(error.code, "WORKER_CRASHED")
    assert.equal(error.crashMetadata, undefined)
    return true
  })
})

function openTool(failure: () => unknown) {
  const tools: any[] = []
  registerBrowserTools(
    { namespace() {}, add(tool: any) { tools.push(tool) } } as never,
    {
      assertPermission: async () => {},
      dataDirectory: "/tmp/browser-worker-diagnostic-fixture",
      createManager: () => ({
        listSessions: () => [],
        start: async () => { throw failure() },
        restart: async () => { throw new Error("unused") },
        execute: async () => { throw new Error("unused") },
        fillCredential: async () => { throw new Error("unused") },
        cancel: async () => false,
      }),
    } as never,
  )
  return tools.find((tool) => tool.name === "open")
}

async function openText(failure: () => unknown) {
  const result = await openTool(failure).execute({ url: "https://example.test/" }, {
    sessionID: "ses_diag", agent: "agent", messageID: "msg_1", id: "call_1",
  })
  return result.content[0].text as string
}

test("WORKER_CRASHED renders only validated crash metadata and no raw detail", async () => {
  const text = await openText(() => new BrowserBackendError(
    "WORKER_CRASHED",
    "worker exited at /home/james/private https://example.test/?token=secret",
    { readiness: "not-observed", childEvent: "exit", exitCode: 1, signal: null },
  ))
  assert.equal(text,
    "Browser error (WORKER_CRASHED): The browser worker stopped unexpectedly; reopen the browser session. [readiness=not-observed child=exit exit=1 signal=null]")
  for (const leak of ["/home/", "example.test", "secret", "worker exited"]) assert.ok(!text.includes(leak), leak)
})

test("legacy two-argument crash errors keep the generic line", async () => {
  const text = await openText(() => new BrowserBackendError("WORKER_CRASHED", "raw /home/x secret"))
  assert.equal(text, "Browser error (WORKER_CRASHED): The browser worker stopped unexpectedly; reopen the browser session.")
})

test("foreign errors keep the withheld-details line", async () => {
  const text = await openText(() => new Error("raw secret"))
  assert.equal(text, "Browser operation failed. Raw backend details were withheld.")
})

test("forged metadata values never render or throw", async () => {
  const error = new BrowserBackendError("WORKER_CRASHED", "raw")
  Object.defineProperty(error, "crashMetadata", {
    value: {
      readiness: { toString() { throw new Error("boom") } },
      childEvent: "exit",
      exitCode: 2,
      signal: null,
    },
    enumerable: false,
  })
  const text = await openText(() => error)
  assert.equal(text, "Browser error (WORKER_CRASHED): The browser worker stopped unexpectedly; reopen the browser session.")
})

test("a throwing metadata getter is never invoked", async () => {
  const error = new BrowserBackendError("WORKER_CRASHED", "raw")
  Object.defineProperty(error, "crashMetadata", {
    get() { throw new Error("getter") },
    enumerable: false,
  })
  const text = await openText(() => error)
  assert.equal(text, "Browser error (WORKER_CRASHED): The browser worker stopped unexpectedly; reopen the browser session.")
})

test("oversized or non-allowlisted metadata renders nothing", async () => {
  const text = await openText(() => new BrowserBackendError("WORKER_CRASHED", "raw", {
    readiness: "observed", childEvent: "exit", exitCode: 1, signal: "A".repeat(9000),
  }))
  assert.equal(text, "Browser error (WORKER_CRASHED): The browser worker stopped unexpectedly; reopen the browser session.")
  assert.ok(!text.includes("AAAA"))
})

test("out-of-range exit codes are refused", async () => {
  const text = await openText(() => new BrowserBackendError("WORKER_CRASHED", "raw", {
    readiness: "observed", childEvent: "exit", exitCode: 256, signal: null,
  }))
  assert.equal(text, "Browser error (WORKER_CRASHED): The browser worker stopped unexpectedly; reopen the browser session.")
})

test("not-observed readiness does not claim a pre-browser-launch state", async () => {
  const text = await openText(() => new BrowserBackendError("WORKER_CRASHED", "raw", {
    readiness: "not-observed", childEvent: "spawn-error", exitCode: null, signal: null,
  }))
  assert.match(text, /readiness=not-observed child=spawn-error exit=null signal=null/)
  assert.doesNotMatch(text, /pre-?launch|before launch/i)
})

test("foreign crash-shaped objects cannot forge supervisor observations", async () => {
  const text = await openText(() => ({
    code: "WORKER_CRASHED", message: "untrusted raw detail",
    crashMetadata: { readiness: "observed", childEvent: "exit", exitCode: 7, signal: "SIGKILL" },
  }))
  assert.equal(text, "Browser error (WORKER_CRASHED): The browser worker stopped unexpectedly; reopen the browser session.")
})

test("crash renderer does not inspect the raw message even through a getter", async () => {
  let reads = 0
  const error = new BrowserBackendError("WORKER_CRASHED", "unused", {
    readiness: "not-observed", childEvent: "exit", exitCode: 1, signal: null,
  })
  Object.defineProperty(error, "message", { get() { reads++; return "private-detail-sentinel" } })
  const text = await openText(() => error)
  assert.ok(text.includes("readiness=not-observed"))
  assert.ok(!text.includes("private-detail-sentinel"))
  assert.equal(reads, 0, "WORKER_CRASHED rendering must not acquire raw message data")
})
