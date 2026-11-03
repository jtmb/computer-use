import assert from "node:assert/strict"
import test from "node:test"

import { BrowserBackendError, asBrowserError } from "../src/errors.ts"

test("a passed-through browser error keeps its own code and message", () => {
  const original = new BrowserBackendError("FOREIGN_TAB", "That tab belongs to another session.")
  assert.equal(asBrowserError(original, "OPERATION_FAILED"), original)
})

test("a Chromium network failure is named without leaking anything else", () => {
  const error = new Error(
    "page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://127.0.0.1:8443/login?token=secret-value\nCall log: …",
  )
  const typed = asBrowserError(error, "OPERATION_FAILED")
  assert.equal(typed.code, "OPERATION_FAILED")
  assert.equal(typed.message, "network failure: ERR_CERT_AUTHORITY_INVALID")
})

test("any other failure stays generic instead of echoing its text", () => {
  for (const error of [
    new Error("locator resolved to a secret-looking string sk-live-1234567890"),
    "plain failure with a value 1234567890",
    undefined,
  ]) {
    const typed = asBrowserError(error, "OPERATION_FAILED")
    assert.equal(typed.message, "The browser operation failed.")
    assert.equal(typed.code, "OPERATION_FAILED")
  }
})
