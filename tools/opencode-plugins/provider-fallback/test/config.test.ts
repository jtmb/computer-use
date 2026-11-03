import assert from "node:assert/strict"
import test from "node:test"

import { hasConfiguredChain, parseOptions, resolveEffective } from "../src/config.ts"

test("leaves the fallback chain empty and routing inactive by default", () => {
  const config = parseOptions(undefined)
  assert.equal(config.valid, true)
  assert.deepEqual(config.defaultChain, [])
  assert.equal(config.triggerOn, "quota")
  assert.equal(hasConfiguredChain(config), false)
  assert.deepEqual(resolveEffective(undefined, config), {
    enabled: false,
    chain: [],
    triggerOn: "quota",
    failureCooldownSeconds: 300,
    sourceCooldownSeconds: 10_800,
  })
})

test("validates ordered chains and per-agent overrides", () => {
  const config = parseOptions({
    defaultChain: ["deepseek/deepseek-v4-flash", "openrouter/anthropic/claude-sonnet-4#fast"],
    agents: {
      plan: { mode: "off" },
      build: {
        mode: "chain",
        chain: ["fake/tier-1#balanced", "fake/tier-2"],
        triggerOn: "any-retryable",
        failureCooldownSeconds: 45,
        sourceCooldownSeconds: 900,
      },
    },
  })

  assert.equal(config.valid, true)
  assert.equal(hasConfiguredChain(config), true)
  assert.equal(resolveEffective("plan", config).enabled, false)
  assert.deepEqual(resolveEffective("build", config), {
    enabled: true,
    chain: [
      { providerID: "fake", modelID: "tier-1", variant: "balanced" },
      { providerID: "fake", modelID: "tier-2" },
    ],
    triggerOn: "any-retryable",
    failureCooldownSeconds: 45,
    sourceCooldownSeconds: 900,
  })
  assert.equal(resolveEffective("unknown", config).chain.length, 2)
})

test("rejects malformed or duplicate entries instead of partially activating", () => {
  const malformed = parseOptions({ defaultChain: ["fake/tier-1", "not-a-model"] })
  assert.equal(malformed.valid, false)
  assert.deepEqual(malformed.defaultChain, [])
  assert.equal(hasConfiguredChain(malformed), false)

  const duplicate = parseOptions({ defaultChain: ["fake/tier-1", "fake/tier-1#fast"] })
  assert.equal(duplicate.valid, false)
  assert.equal(resolveEffective(undefined, duplicate).enabled, false)
})

test("rejects unknown and proactive OAuth options as a whole", () => {
  const config = parseOptions({ defaultChain: ["fake/tier-1"], proactive: true })
  assert.equal(config.valid, false)
  assert.deepEqual(config.defaultChain, [])
  assert.ok(config.errors.some((error) => error.includes("unsupported option: proactive")))
  assert.equal(hasConfiguredChain(config), false)
})

test("rejects invalid cooldowns, triggers, and agent configuration", () => {
  for (const options of [
    { failureCooldownSeconds: 0 },
    { sourceCooldownSeconds: 1.5 },
    { triggerOn: "sometimes" },
    { agents: { build: { unexpected: true } } },
    { agents: [] },
  ]) {
    assert.equal(parseOptions(options).valid, false, JSON.stringify(options))
  }
})
