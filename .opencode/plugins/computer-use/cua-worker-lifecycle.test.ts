import assert from "node:assert/strict"
import test from "node:test"
import { CuaSession, createCuaSessions } from "./cua.ts"

const context = { sessionID: "worker-lifecycle", agent: "build", messageID: "m", id: "c" }

test("a permanently disposed session cannot be resurrected by reset", async () => {
  const session = new CuaSession({ call: async () => ({ content: [] }) })
  session.dispose()
  assert.throws(() => session.reset(), /disposed and cannot be reset/)
  await assert.rejects(session.execute("1", context), /disposed/)
})

test("idle liveness checks preserve ordinary bindings", async t => {
  const session = new CuaSession({ call: async () => ({ content: [] }) })
  t.after(() => session.dispose())
  await session.execute("const remembered = 42", context)
  await new Promise(resolve => setTimeout(resolve, 1200))
  assert.equal((await session.execute("remembered", context)).text, "42")
})

test("eviction aborts a real running worker and refuses its queued cell", async t => {
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  let signal: AbortSignal | undefined
  const store = createCuaSessions(async (_key, _input, actual) => {
    signal = actual.signal
    started()
    return new Promise(() => {})
  }, 1)
  t.after(() => store.dispose())
  const old = store.get("old")
  const running = old.execute("await cua.getState()", context)
  const queued = assert.rejects(old.execute("1", context), /disposed/)
  await ready
  const fresh = store.get("new")
  assert.match((await running).text, /cancelled/)
  await queued
  assert.equal(signal?.aborted, true)
  assert.match((await fresh.execute("42", context)).text, /42$/)
})

test("store unload stops running workers and permanently refuses further retrieval", async () => {
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  let signal: AbortSignal | undefined
  const store = createCuaSessions(async (_key, _input, actual) => {
    signal = actual.signal
    started()
    return new Promise(() => {})
  })
  const running = store.get("unload").execute("await cua.getState()", context)
  await ready
  store.dispose()
  assert.equal(signal?.aborted, true)
  assert.match((await running).text, /cancelled/)
  assert.throws(() => store.get("unload"), /disposed on plugin unload/)
})

test("a backend-call burst is bounded before dispatch and aborts its unfinished work", async t => {
  const signals: AbortSignal[] = []
  const session = new CuaSession({ call: async (_key, _input, actual) => {
    signals.push(actual.signal!)
    return new Promise(() => {})
  } })
  t.after(() => session.dispose())
  const result = await session.execute("await Promise.all(Array.from({length:20}, () => cua.getState()))", context)
  assert.match(result.text, /too many outstanding backend calls/)
  assert.ok(signals.length <= 4)
  assert.ok(signals.every(signal => signal.aborted))
})
