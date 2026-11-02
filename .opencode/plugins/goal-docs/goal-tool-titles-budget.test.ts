import assert from "node:assert/strict"
import test from "node:test"

import { registerGoalToolTitleRefresh } from "./goal-tool-titles.ts"

const MAX_RECEIPT_BYTES = 2_000_000
const success = { goal: { id: "goal-one" } }

async function receiptHarness(signal?: AbortSignal) {
  let after: ((event: { tool: string; sessionID: string; status: string; result?: unknown }) => Promise<void>) | undefined
  const refreshed: string[] = []
  await registerGoalToolTitleRefresh({ async hook(_name, callback) {
    after = callback
    return { async dispose() {} }
  } }, { async context(sessionID) { refreshed.push(sessionID) } }, signal)
  assert.ok(after)
  const hook = after
  return {
    refreshed,
    async execute(result: unknown, patch: Partial<{ tool: string; sessionID: string; status: string }> = {}) {
      await hook({ tool: "update_goal_plan", sessionID: "ses_receipt_budget", status: "completed", result, ...patch })
    },
  }
}

function receiptTextBytes(bytes: number, character = "a"): string {
  const prefix = '{"goal":{"id":"goal-one"},"padding":"'
  const suffix = '"}'
  const remaining = bytes - Buffer.byteLength(prefix + suffix, "utf8")
  const characterBytes = Buffer.byteLength(character, "utf8")
  assert.ok(Number.isSafeInteger(remaining) && remaining >= 0)
  const text = prefix + character.repeat(Math.floor(remaining / characterBytes)) + "a".repeat(remaining % characterBytes) + suffix
  assert.equal(Buffer.byteLength(text, "utf8"), bytes)
  return text
}

function messageParts(text: string, count: number): unknown[] {
  return [{ type: "text", text }, ...Array.from({ length: count - 1 }, (_, index) =>
    index % 3 === 0 ? null : index % 3 === 1 ? { type: "file" } : { type: "text", text: "" })]
}

test("every nonnull wrapper error rejects a successful-looking receipt without coercion", async () => {
  const harness = await receiptHarness()
  for (const error of [false, 0, "", [], {}, new Error("failure")]) {
    await harness.execute({ error, content: JSON.stringify(success) })
  }
  assert.deepEqual(harness.refreshed, [])
  await harness.execute({ error: null, content: JSON.stringify(success) })
  await harness.execute({ content: JSON.stringify(success) })
  assert.equal(harness.refreshed.length, 2)
})

test("oversized ASCII and UTF8 wrapper states and output reject before string normalization", async () => {
  const harness = await receiptHarness()
  const originalTrim = String.prototype.trim
  let oversizedNormalizations = 0
  String.prototype.trim = function (this: string): string {
    if (Buffer.byteLength(String(this), "utf8") > MAX_RECEIPT_BYTES) {
      oversizedNormalizations += 1
      throw new Error("oversized wrapper reached trim")
    }
    return Reflect.apply(originalTrim, this, [])
  }
  try {
    for (const oversized of [" ".repeat(MAX_RECEIPT_BYTES + 1), "é".repeat(MAX_RECEIPT_BYTES / 2 + 1)]) {
      for (const wrapper of [
        { state: oversized }, { status: oversized },
        { metadata: { state: oversized } }, { metadata: { status: oversized } },
        { output: oversized },
      ]) await harness.execute({ content: JSON.stringify(success), ...wrapper })
    }
  } finally {
    String.prototype.trim = originalTrim
  }
  assert.equal(oversizedNormalizations, 0)
  assert.deepEqual(harness.refreshed, [])
})

test("bounded wrapper failure states and textual error markers remain excluded", async () => {
  const harness = await receiptHarness()
  for (const state of [" AbOrTeD ", " RUNNING ", " error ", "Partial", "timed_out"]) {
    await harness.execute({ state, content: JSON.stringify(success) })
    await harness.execute({ metadata: { status: state }, content: JSON.stringify(success) })
  }
  for (const output of ["State: FAILED\nignored", " <ERROR>failure", " Error: failure", "state: interrupted"]) {
    await harness.execute({ output, content: JSON.stringify(success) })
  }
  assert.deepEqual(harness.refreshed, [])
  await harness.execute({ state: " completed ", metadata: { status: "success" }, content: JSON.stringify(success) })
  assert.equal(harness.refreshed.length, 1)
})

test("single textual receipts honor exact UTF8 byte boundaries rather than character counts", async () => {
  const harness = await receiptHarness()
  for (const character of ["a", "é", "界"]) {
    const exact = receiptTextBytes(MAX_RECEIPT_BYTES, character)
    const overflow = receiptTextBytes(MAX_RECEIPT_BYTES + 1, character)
    if (character !== "a") assert.ok(overflow.length < MAX_RECEIPT_BYTES)
    const before = harness.refreshed.length
    await harness.execute({ content: exact })
    assert.equal(harness.refreshed.length, before + 1)
    await harness.execute({ content: overflow })
    assert.equal(harness.refreshed.length, before + 1)
  }
})

test("129parts reject before reading their contents while128bounded slots remain supported", async () => {
  const harness = await receiptHarness()
  const tooMany = new Array(129)
  let inspectedParts = 0
  Object.defineProperty(tooMany, 0, { get() {
    inspectedParts += 1
    throw new Error("oversized part array was inspected")
  } })
  await harness.execute({ content: tooMany })
  assert.equal(inspectedParts, 0)
  assert.deepEqual(harness.refreshed, [])
  await harness.execute({ content: messageParts(JSON.stringify(success), 128) })
  assert.equal(harness.refreshed.length, 1)
})

test("all128slot separators are reserved before joining even for empty and nontext slots", async () => {
  const harness = await receiptHarness()
  const exact = receiptTextBytes(MAX_RECEIPT_BYTES - 127)
  await harness.execute({ content: messageParts(exact, 128) })
  assert.equal(harness.refreshed.length, 1)

  const overflow = receiptTextBytes(MAX_RECEIPT_BYTES - 126)
  const originalJoin = Array.prototype.join
  let oversizedJoins = 0
  Array.prototype.join = function (this: unknown[], separator?: string): string {
    if (separator === "\n" && this.length === 128 && this[0] === overflow) {
      oversizedJoins += 1
      throw new Error("separator-overflow receipt reached join")
    }
    return Reflect.apply(originalJoin, this, [separator])
  }
  try {
    await harness.execute({ content: messageParts(overflow, 128) })
  } finally {
    Array.prototype.join = originalJoin
  }
  assert.equal(oversizedJoins, 0)
  assert.equal(harness.refreshed.length, 1)
})

test("multibyte part overflow rejects before join and exact byte totals still pass", async () => {
  const harness = await receiptHarness()
  const exact = receiptTextBytes(MAX_RECEIPT_BYTES - 1, "界")
  const emptySlots = [null, { type: "file" }, { type: "text", text: "" }]
  await harness.execute({ content: messageParts(exact, 2) })
  for (const slot of emptySlots) {
    await harness.execute({ content: [slot, { type: "text", text: exact }] })
  }
  assert.equal(harness.refreshed.length, 4)

  const overflow = receiptTextBytes(MAX_RECEIPT_BYTES, "界")
  assert.ok(overflow.length + 1 < MAX_RECEIPT_BYTES)
  const originalJoin = Array.prototype.join
  let oversizedJoins = 0
  Array.prototype.join = function (this: unknown[], separator?: string): string {
    if (separator === "\n" && this.length === 2 && this.includes(overflow)) {
      oversizedJoins += 1
      throw new Error("UTF8-overflow receipt reached join")
    }
    return Reflect.apply(originalJoin, this, [separator])
  }
  try {
    await harness.execute({ content: messageParts(overflow, 2) })
    for (const slot of emptySlots) {
      await harness.execute({ content: [slot, { type: "text", text: overflow }] })
    }
  } finally {
    Array.prototype.join = originalJoin
  }
  assert.equal(oversizedJoins, 0)
  assert.equal(harness.refreshed.length, 4)
})

test("root title refresh requires completed mutations and bounded session identities", async () => {
  const harness = await receiptHarness()
  for (const patch of [
    { tool: "get_goal" }, { tool: "unrelated" }, { status: "error" },
    { status: "running" }, { sessionID: "" }, { sessionID: "s".repeat(201) },
  ]) await harness.execute({ content: JSON.stringify(success) }, patch)
  assert.deepEqual(harness.refreshed, [])
  await harness.execute({ content: JSON.stringify(success) }, { sessionID: "s".repeat(200) })
  assert.deepEqual(harness.refreshed, ["s".repeat(200)])

  const controller = new AbortController()
  controller.abort(new Error("plugin disposed"))
  const stopped = await receiptHarness(controller.signal)
  await stopped.execute({ content: JSON.stringify(success) })
  assert.deepEqual(stopped.refreshed, [])
})
