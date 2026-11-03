import assert from "node:assert/strict"
import test from "node:test"

import { classifyFailure, classifyRetryMessage, shouldTrigger } from "../src/detect.ts"

test("classifies quota, account balance, and typed usage exhaustion", () => {
  for (const error of [
    { name: "APIError", data: { message: "The usage limit has been reached", statusCode: 429 } },
    { name: "APIError", data: { message: "Insufficient Balance" } },
    { name: "APIError", data: { type: "freeUsageExceeded" } },
    { name: "APIError", data: { error: { code: "go_usage_exhausted" } } },
  ]) {
    const failure = classifyFailure(error)
    assert.equal(failure?.kind, "quota", JSON.stringify(error))
    assert.equal(shouldTrigger(failure, "quota"), true)
  }
})

test("keeps transient and server failures opt-in", () => {
  const rateLimit = classifyFailure({ data: { message: "Too many requests", statusCode: 429 } })
  const serverError = classifyFailure({ data: { message: "temporary failure", statusCode: 503 } })
  assert.equal(shouldTrigger(rateLimit, "quota"), false)
  assert.equal(shouldTrigger(rateLimit, "any-retryable"), true)
  assert.equal(shouldTrigger(serverError, "quota"), false)
  assert.equal(shouldTrigger(serverError, "any-retryable"), true)
})

test("never routes aborted or unrecognized failures", () => {
  assert.equal(shouldTrigger(classifyFailure({ name: "MessageAbortedError" }), "any-retryable"), false)
  assert.equal(classifyFailure(undefined), undefined)
  assert.equal(classifyFailure({}), undefined)
  assert.equal(classifyRetryMessage(""), undefined)
  assert.equal(classifyRetryMessage("service temporarily unavailable")?.kind, "rate-limit")
})
