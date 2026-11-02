import assert from "node:assert/strict"
import test from "node:test"
import { collectAssistantMessages } from "../src/assistant-audit.mjs"

const sessionID = "ses_synthetic"
const message = id => ({ id: `msg_${id}`, type: "assistant", content: [{ type: "text", text: "synthetic" }] })
const page = (ids, next = null) => ({ data: ids.map(message), cursor: { next } })

test("selected assistant pagination preserves SDK query semantics and stops at the declared end", async () => {
  const calls = []
  const signal = new AbortController().signal
  const pages = [page(["one", "two"], "cursor-a"), page(["three"])]
  const result = await collectAssistantMessages({ sessionID, signal, pageSize: 2, list: async (...args) => {
    calls.push(args)
    return pages.shift()
  } })
  assert.deepEqual(calls, [
    [{ sessionID, type: "assistant", limit: 2, order: "asc" }, { signal }],
    [{ sessionID, type: "assistant", limit: 2, cursor: "cursor-a" }, { signal }],
  ])
  assert.equal(result.pages, 2)
  assert.equal(result.completeAssistantPagination, true)
  assert.equal(result.completeLiveTrace, false)
  assert.deepEqual(result.messages.map(item => item.id), ["msg_one", "msg_two", "msg_three"])
})

test("repeated messages refuse instead of inflating coverage or silently deduplicating", async () => {
  const pages = [page(["one"], "cursor-a"), page(["one"])]
  await assert.rejects(collectAssistantMessages({ sessionID, list: async () => pages.shift() }), { code: "duplicate-message" })
})

test("repeated cursors fail before another read even when the messages differ", async () => {
  let calls = 0
  await assert.rejects(collectAssistantMessages({ sessionID, list: async () => {
    calls++
    return page([String(calls)], "unchanged-cursor")
  } }), { code: "repeated-cursor" })
  assert.equal(calls, 2)
})

test("a live next cursor at the page ceiling is incomplete, never accepted coverage", async () => {
  let calls = 0
  await assert.rejects(collectAssistantMessages({ sessionID, maxPages: 2, list: async () => {
    calls++
    return page([String(calls)], `cursor-${calls}`)
  } }), { code: "page-limit" })
  assert.equal(calls, 2)
})

test("mixed, malformed and oversized pages refuse instead of changing the requested scope", async () => {
  for (const result of [null, { data: [], cursor: null }, page(["1", "2", "3", "4", "5", "6"]),
    { data: [{ ...message("user"), type: "user" }], cursor: {} },
    { data: [{ ...message("broken"), content: null }], cursor: {} }]) {
    await assert.rejects(collectAssistantMessages({ sessionID, list: async () => result }), { name: "AssistantAuditError" })
  }
})

test("invalid cursors and expanded limits refuse without exposing their contents", async () => {
  for (const next of [false, "", "sensitive-marker".repeat(1000)]) {
    await assert.rejects(collectAssistantMessages({ sessionID, list: async () => page([], next) }), error => {
      assert.equal(error.code, "invalid-cursor")
      assert.equal(error.message.includes("sensitive-marker"), false)
      return true
    })
  }
  let calls = 0
  for (const limits of [{ maxPages: 5 }, { maxPages: 0 }, { pageSize: 6 }, { pageSize: 1.1 }]) {
    await assert.rejects(collectAssistantMessages({ sessionID, ...limits, list: async () => { calls++; return page([]) } }), { code: "invalid-limits" })
  }
  assert.equal(calls, 0)
})

test("cancellation before and after a page prevents accepting a late result", async () => {
  const abort = new AbortController()
  abort.abort()
  let calls = 0
  await assert.rejects(collectAssistantMessages({ sessionID, signal: abort.signal, list: async () => { calls++; return page([]) } }), { code: "aborted" })
  assert.equal(calls, 0)
  const after = new AbortController()
  await assert.rejects(collectAssistantMessages({ sessionID, signal: after.signal, list: async () => {
    after.abort()
    return page(["late"])
  } }), { code: "aborted" })
})

test("transport errors are fixed non-echoing failures, not partial success", async () => {
  await assert.rejects(collectAssistantMessages({ sessionID, list: async () => { throw Error("sensitive-marker".repeat(1000)) } }), error => {
    assert.equal(error.code, "transport-failed")
    assert.equal(error.message.includes("sensitive-marker"), false)
    assert.ok(error.message.length < 100)
    return true
  })
})

test("explicit native session IDs with underscores are not rejected as if only generated IDs existed", async () => {
  const result = await collectAssistantMessages({ sessionID: "ses_goal_docs_synthetic", list: async input => {
    assert.equal(input.sessionID, "ses_goal_docs_synthetic")
    return page([])
  } })
  assert.equal(result.messages.length, 0)
  assert.equal(result.completeAssistantPagination, true)
})
