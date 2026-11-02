import assert from "node:assert/strict"
import test from "node:test"
import { CuaSession } from "./cua.ts"

function deferred() {
  let resolve!: (value?: unknown) => void
  const promise = new Promise(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

test("caught late work cannot write text, attach images, or dispatch as a newer cell", async () => {
  const oldGate = deferred()
  const newGate = deferred()
  const newStarted = deferred()
  const calls = []
  let appCalls = 0
  const session = new CuaSession({ call: async (key, _input, context) => {
    calls.push({ key, id: context.id })
    if (key === "desktop:apps") {
      appCalls++
      if (appCalls === 1) await oldGate.promise
      if (appCalls === 2) { newStarted.resolve(); await newGate.promise }
      return { content: [{ type: "text", text: '[]' }] }
    }
    return { content: [{ type: "text", text: '{"windows":[]}' }] }
  } })
  const context = { sessionID: "late-work", agent: "build", messageID: "m-old", id: "old" }
  const timed = await session.execute('try { await cua.getState() } catch {} console.log("late-note"); await nodeRepl.emitImage("data:image/png;base64,AAAA"); await cua.getState()', context, 1000)
  assert.match(timed.text, /timed out/)
  const newer = session.execute('await cua.getState()', { ...context, messageID: "m-new", id: "new" })
  await newStarted.promise
  oldGate.resolve()
  for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve))
  newGate.resolve()
  const result = await newer
  assert.doesNotMatch(result.text, /late-note/)
  assert.deepEqual(result.files, [])
  assert.equal(appCalls, 2, "a finished cell must not dispatch under the newer caller identity")
  session.dispose()
})

test("late work after normal completion cannot write or dispatch into the next cell", async () => {
  const oldGate = deferred()
  const newGate = deferred()
  const newStarted = deferred()
  const calls = []
  let appCalls = 0
  const session = new CuaSession({ call: async (key, _input, context) => {
    calls.push({ key, id: context.id })
    if (key === "desktop:apps") {
      appCalls++
      if (appCalls === 1) await oldGate.promise
      if (appCalls === 2) { newStarted.resolve(); await newGate.promise }
      return { content: [{ type: "text", text: "[]" }] }
    }
    return { content: [{ type: "text", text: '{"windows":[]}' }] }
  } })
  const context = { sessionID: "late-normal", agent: "build", messageID: "m-old", id: "old" }
  // No `await` token: the cell finishes immediately and the promise stays dangling.
  const finished = await session.execute(
    'const pending = cua.getState().then(() => { nodeRepl.write("late-normal"); return cua.getState() }); 1',
    context,
  )
  assert.match(finished.text, /1$/)
  const newer = session.execute('await cua.getState()', { ...context, messageID: "m-new", id: "new" })
  await newStarted.promise
  oldGate.resolve()
  for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve))
  newGate.resolve()
  const result = await newer
  assert.doesNotMatch(result.text, /late-normal/)
  assert.deepEqual(result.files, [])
  assert.equal(appCalls, 2, "a finished cell must not dispatch under the newer caller identity")
  session.dispose()
})
