import assert from "node:assert/strict"
import test from "node:test"

import { modelKey, modelLabel, parseModelKey, sameModel } from "../src/model.ts"

test("parses provider/model references and preserves variants", () => {
  const model = { providerID: "openrouter", modelID: "anthropic/claude-sonnet-4", variant: "fast" }
  assert.deepEqual(parseModelKey("openrouter/anthropic/claude-sonnet-4#fast"), model)
  assert.equal(modelKey(model), "openrouter/anthropic/claude-sonnet-4")
  assert.equal(modelLabel(model), "openrouter/anthropic/claude-sonnet-4#fast")
})

test("rejects malformed references without normalizing user input", () => {
  for (const value of [
    undefined,
    "",
    " provider/model",
    "provider/ model",
    "/model",
    "provider/",
    "provider//model",
    "provider/model#",
    "provider/model#fast#slow",
    "provider/model\n",
    "provider/model with spaces",
  ]) {
    assert.equal(parseModelKey(value), undefined, String(value))
  }
})

test("compares model variants as part of the selected model", () => {
  assert.equal(sameModel({ providerID: "a", modelID: "b", variant: "fast" }, { providerID: "a", modelID: "b", variant: "fast" }), true)
  assert.equal(sameModel({ providerID: "a", modelID: "b", variant: "fast" }, { providerID: "a", modelID: "b", variant: "slow" }), false)
  assert.equal(sameModel(undefined, undefined), false)
})
