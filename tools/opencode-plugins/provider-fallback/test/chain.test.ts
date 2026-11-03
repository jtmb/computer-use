import assert from "node:assert/strict"
import test from "node:test"

import { pickTier } from "../src/chain.ts"
import type { ModelRef } from "../src/model.ts"

const chain: ModelRef[] = [
  { providerID: "fake", modelID: "tier-1" },
  { providerID: "fake", modelID: "tier-2" },
  { providerID: "other", modelID: "tier-3" },
]

test("selects the next non-cooling tier and reports skipped entries", () => {
  const result = pickTier({
    chain,
    startIndex: 0,
    wrap: true,
    isCooling: (key) => key === "fake/tier-1" || key === "fake/tier-2",
  })
  assert.deepEqual(result.tier, chain[2])
  assert.deepEqual(result.skipped.map((item) => item.reason), ["cooldown", "cooldown"])
})

test("wraps once and terminates when all configured tiers are cooling", () => {
  const result = pickTier({
    chain,
    startIndex: 2,
    wrap: true,
    isCooling: () => true,
  })
  assert.equal(result.tier, undefined)
  assert.equal(result.skipped.length, chain.length)
})
