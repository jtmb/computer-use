import assert from "node:assert/strict"
import test from "node:test"

import { createFallbackState } from "../src/state.ts"

test("tracks isolated session status, cooldowns, and duplicate attempts", () => {
  let now = 1_000
  const first = createFallbackState(() => now)
  const second = createFallbackState(() => now)

  first.setAgent("ses_alpha", "build")
  first.recordFallback(
    "ses_alpha",
    { providerID: "openai", modelID: "gpt-5.3-codex" },
    { providerID: "fake", modelID: "tier-1", variant: "fast" },
  )
  first.setCooldown("openai/gpt-5.3-codex", now + 500)
  first.markAttempt("ses_alpha", "attempt-1")

  assert.equal(first.getAgent("ses_alpha"), "build")
  assert.deepEqual(first.lastFallback("ses_alpha"), {
    source: "openai/gpt-5.3-codex",
    target: "fake/tier-1#fast",
    recordedAt: now,
  })
  assert.equal(first.isCooling("openai/gpt-5.3-codex"), true)
  assert.equal(first.hasAttempt("ses_alpha", "attempt-1"), true)
  assert.equal(second.getAgent("ses_alpha"), undefined)
  assert.equal(second.lastFallback("ses_alpha"), undefined)

  now += 501
  assert.equal(first.isCooling("openai/gpt-5.3-codex"), false)
  first.clearSession("ses_alpha")
  assert.equal(first.getAgent("ses_alpha"), undefined)
  assert.equal(first.hasAttempt("ses_alpha", "attempt-1"), false)
})

test("status reads return detached values and do not mutate stored fallback records", () => {
  const state = createFallbackState(() => 10)
  state.recordFallback(
    "ses_readonly",
    { providerID: "primary", modelID: "source" },
    { providerID: "fake", modelID: "target" },
  )
  const returned = state.lastFallback("ses_readonly")!
  returned.target = "changed/model"
  assert.equal(state.lastFallback("ses_readonly")?.target, "fake/target")
})
