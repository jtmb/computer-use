import assert from "node:assert/strict"
import test from "node:test"

import { createOriginalAction } from "../../chatgpt-connector/src/image-preview.ts"
import { previewDimensions } from "../preview-layout.ts"

test("original action is inert until activated and coalesces pending activations", async () => {
  const states: string[] = []
  let calls = 0
  let finish: () => void = () => undefined
  const open = createOriginalAction({
    alive: () => true, state: (value) => { states.push(value) },
    open: () => { calls++; return new Promise<void>((resolve) => { finish = resolve }) },
  })
  assert.equal(calls, 0)
  const first = open()
  assert.equal(open(), first)
  await Promise.resolve()
  assert.equal(calls, 1)
  assert.deepEqual(states, ["opening"])
  finish()
  await first
  assert.deepEqual(states, ["opening", "idle"])
})

test("original action displays launch failure and permits a deliberate retry", async () => {
  const states: string[] = []
  let calls = 0
  const open = createOriginalAction({
    alive: () => true, state: (value) => { states.push(value) },
    open: async () => { if (++calls === 1) throw new Error("viewer failure") },
  })
  await open()
  assert.equal(states.at(-1), "error")
  await open()
  assert.equal(calls, 2)
  assert.equal(states.at(-1), "idle")
})

test("disposed previews neither open a viewer nor update stale state", async () => {
  let alive = false
  let calls = 0
  const states: string[] = []
  const open = createOriginalAction({ alive: () => alive, state: (value) => { states.push(value) }, open: async () => { calls++ } })
  await open()
  assert.deepEqual(states, [])
  alive = true
  const pending = open()
  alive = false
  await pending
  assert.equal(calls, 0)
  assert.deepEqual(states, ["opening"])
})

test("disposing during a failed launch consumes the rejection without updating the old preview", async () => {
  let alive = true
  let reject: (error: Error) => void = () => undefined
  const states: string[] = []
  const open = createOriginalAction({
    alive: () => alive, state: (value) => { states.push(value) },
    open: () => new Promise<void>((_, failure) => { reject = failure }),
  })
  const pending = open()
  await Promise.resolve()
  alive = false
  reject(new Error("viewer failure"))
  await pending
  assert.deepEqual(states, ["opening"])
})

test("preview bounds hug landscape, portrait and panoramic images instead of an 80-column card", () => {
  assert.deepEqual(previewDimensions(1536, 1024, 120), { width: 36, height: 12 })
  assert.deepEqual(previewDimensions(1024, 1536, 120), { width: 16, height: 12 })
  assert.deepEqual(previewDimensions(4096, 512, 120), { width: 80, height: 5 })
})

test("narrow previews reduce height as well as width, without side gutters", () => {
  assert.deepEqual(previewDimensions(1536, 1024, 18), { width: 18, height: 6 })
  assert.deepEqual(previewDimensions(1536, 1024, 9), { width: 9, height: 3 })
})

test("preview sizing uses measured terminal cell proportions and a bounded fallback", () => {
  assert.deepEqual(previewDimensions(1536, 1024, 120, 1.8), { width: 32, height: 12 })
  assert.deepEqual(previewDimensions(1536, 1024, 120, Number.NaN), { width: 36, height: 12 })
  assert.deepEqual(previewDimensions(1536, 1024, 0), { width: 1, height: 1 })
})

test("invalid image geometry is refused instead of producing unbounded layout", () => {
  for (const [width, height] of [[0, 10], [10, -1], [Number.NaN, 10], [10, Infinity]]) {
    assert.throws(() => previewDimensions(width, height, 80), /positive and finite/)
  }
})
