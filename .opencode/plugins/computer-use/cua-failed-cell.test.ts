/**
 * Contract regressions for a failed Code Mode (cua) cell.
 *
 * A cell that throws is the ordinary failure path: the next cell must start with
 * a fresh abort signal and caller identity, must not receive output from the dead
 * cell, and must not inherit a half-declared binding from a compile failure. A
 * handle bound before the failure stays usable on purpose — it is a live handle,
 * not a leaked capability, and every later call is re-attributed and re-authorized
 * under the calling cell.
 */

import assert from "node:assert/strict"
import test from "node:test"

const ROOT = process.env.ISOLATION_SOURCE_ROOT ?? "/home/james/repos/computer-use"
const CUA = new URL(`${ROOT}/.opencode/plugins/computer-use/cua.ts`, "file://").href

const { CuaSession } = await import(CUA)

interface Call {
  key: string
  signal: AbortSignal
  context: { sessionID: string; messageID: string; id: string; signal: AbortSignal }
  abortedAtDispatch: boolean
  completed: boolean
}

const ctx = (id: string) => ({ sessionID: "ses_failed_cell", agent: "build", messageID: `m-${id}`, id })

const json = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value) }] })
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function makeSession(behaviour: (key: string) => Promise<unknown> | unknown = () => json({ ok: true })) {
  const calls: Call[] = []
  const call = async (key: string, _input: unknown, context: Call["context"]) => {
    const entry: Call = { key, signal: context.signal, context, abortedAtDispatch: context.signal.aborted, completed: false }
    calls.push(entry)
    const result = await behaviour(key)
    entry.completed = true
    return result as any
  }
  return { session: new CuaSession({ call }), calls }
}

test("a failed cell aborts work it started and the next cell gets a fresh signal and identity", async (t) => {
  const { session, calls } = makeSession(async (key) => {
    if (key === "web:tabs") return json({ tabs: [] })
    return json({})
  })
  t.after(() => session.dispose())
  const first = await session.execute(
    'const b = await cua.browser(); const pending = b.tabs(); throw new Error("stop here")',
    ctx("first"),
  )
  assert.match(first.text, /stop here/i)
  const started = calls.find((entry) => entry.key === "web:tabs")
  assert.ok(started, "the backend call was dispatched before the throw")
  assert.equal(started.signal.aborted, true, "the failed cell's signal must be aborted")

  const second = await session.execute("await (await cua.browser()).tabs()", ctx("second"))
  assert.match(second.text, /tabs/)
  const later = calls.filter((entry) => entry.key === "web:tabs").at(-1)!
  assert.equal(later.abortedAtDispatch, false, "a new cell must not start on the dead cell's aborted signal")
  assert.notEqual(later.signal, started.signal, "each cell owns its own abort signal")
  assert.equal(later.context.id, "second")
  assert.equal(later.context.messageID, "m-second")
})

test("a backend result that arrives after the cell ended cannot reach the next cell", async (t) => {
  let release: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const { session } = makeSession(async (key) => {
    if (key === "web:tabs") {
      await held
      return json({ tabs: [{ id: "late-tab" }] })
    }
    return json({ ok: true })
  })
  t.after(() => session.dispose())
  const first = await session.execute(
    'const b = await cua.browser(); void b.tabs(); throw new Error("done")',
    ctx("first"),
  )
  assert.match(first.text, /done/i)
  release?.()
  await delay(50)
  const second = await session.execute('"clean"', ctx("second"))
  assert.equal(second.text.includes("late-tab"), false)
  assert.match(second.text, /clean/)
})

test("a handle bound in a failed cell is reusable, and its calls carry the calling cell's identity", async (t) => {
  const { session, calls } = makeSession((key) => {
    if (key === "web:open") return json({ tabId: "tab-1", url: "https://example.com/", title: "E" })
    if (key === "web:snapshot") return json({ tabId: "tab-1", generation: 2, snapshot: "- text [ref=e1]" })
    return json({})
  })
  t.after(() => session.dispose())
  const failed = await session.execute(
    'const b = await cua.browser(); const tab = await b.open("https://example.com/"); throw new Error("stop")',
    ctx("first"),
  )
  assert.match(failed.text, /stop/i)
  const later = await session.execute("await tab.snapshot()", ctx("second"))
  assert.match(later.text, /generation/)
  const snapshot = calls.filter((entry) => entry.key === "web:snapshot").at(-1)!
  assert.equal(snapshot.context.messageID, "m-second", "authorization is re-asserted for the calling cell")
  assert.equal(snapshot.abortedAtDispatch, false, "the calling cell's signal is live when the call is dispatched")
})

test("a compile-failed cell does not mark its binding as already declared for later cells", async (t) => {
  const { session } = makeSession()
  t.after(() => session.dispose())
  const broken = await session.execute("const halfDeclared = ", ctx("first"))
  assert.match(broken.text, /SyntaxError|Unexpected/i)
  // The later declaration must still be hoisted into a lexical binding. If the
  // failed cell committed the name, the rewrite becomes a bare assignment and the
  // value lands on the sandbox global instead.
  const later = await session.execute(
    'const halfDeclared = 1; Object.prototype.hasOwnProperty.call(globalThis, "halfDeclared")',
    ctx("second"),
  )
  assert.equal(later.text, "false", "the failed cell must not poison later declarations")
})
