import assert from "node:assert/strict"
import test from "node:test"

import { parseOptions } from "../src/config.ts"
import { createFallbackRouter } from "../src/router.ts"
import { createFallbackState } from "../src/state.ts"

const quotaError = { name: "APIError", data: { message: "usage limit reached", statusCode: 429 } }

test("routes only after a qualifying retry and records the successful switch", async () => {
  let now = 1_000
  const state = createFallbackState(() => now)
  const config = parseOptions({ defaultChain: ["fake/tier-1#fast", "fake/tier-2#deep"] })
  const switches: string[] = []
  const router = createFallbackRouter(config, state, async (_sessionID, model) => {
    switches.push(`${model.providerID}/${model.modelID}#${model.variant}`)
  }, () => now)

  assert.equal(router.status("ses_route").state, "configured")
  assert.equal(switches.length, 0)
  const routed = await router.retry({
    sessionID: "ses_route",
    agent: "build",
    model: { providerID: "primary", modelID: "source" },
    error: quotaError,
    attempt: 1,
  })

  assert.equal(routed, true)
  assert.deepEqual(switches, ["fake/tier-1#fast"])
  assert.deepEqual(router.status("ses_route"), {
    state: "last-fallback",
    chainLength: 2,
    lastFallback: {
      source: "primary/source",
      target: "fake/tier-1#fast",
      recordedAt: now,
    },
  })

  now += 1
  const nextTier = await router.retry({
    sessionID: "ses_route",
    agent: "build",
    model: { providerID: "fake", modelID: "tier-1", variant: "fast" },
    error: quotaError,
    attempt: 2,
  })
  assert.equal(nextTier, true)
  assert.deepEqual(switches, ["fake/tier-1#fast", "fake/tier-2#deep"])
})

test("does not duplicate an attempt or route a non-qualifying error by default", async () => {
  const state = createFallbackState()
  const config = parseOptions({ defaultChain: ["fake/tier-1"] })
  let switchCount = 0
  const router = createFallbackRouter(config, state, async () => {
    switchCount += 1
  })
  const input = {
    sessionID: "ses_errors",
    model: { providerID: "primary", modelID: "source" },
    error: quotaError,
    attempt: 7,
  }

  assert.equal(await router.retry({ ...input, error: { message: "ordinary failure" } }), false)
  assert.equal(await router.retry(input), true)
  assert.equal(await router.retry(input), false)
  assert.equal(switchCount, 1)
})

test("requires explicit any-retryable configuration for transient failures", async () => {
  const state = createFallbackState()
  const config = parseOptions({ defaultChain: ["fake/tier-1"], triggerOn: "any-retryable" })
  let switchCount = 0
  const router = createFallbackRouter(config, state, async () => {
    switchCount += 1
  })
  assert.equal(
    await router.retry({
      sessionID: "ses_retryable",
      model: { providerID: "primary", modelID: "source" },
      error: { message: "service temporarily unavailable", statusCode: 503 },
      attempt: 1,
    }),
    true,
  )
  assert.equal(switchCount, 1)
})

test("fails closed for invalid config, disabled agents, cooling chains, and failed switches", async () => {
  let switchCount = 0
  const invalid = parseOptions({ defaultChain: ["fake/tier-1"], proactive: true })
  const invalidRouter = createFallbackRouter(invalid, createFallbackState(), async () => {
    switchCount += 1
  })
  assert.equal(invalidRouter.status().state, "inactive")

  const off = parseOptions({ defaultChain: ["fake/tier-1"], agents: { plan: { mode: "off" } } })
  const offRouter = createFallbackRouter(off, createFallbackState(), async () => {
    switchCount += 1
  })
  assert.equal(await offRouter.retry({ sessionID: "ses_off", agent: "plan", model: { providerID: "primary", modelID: "source" }, error: quotaError }), false)

  const allCoolingState = createFallbackState(() => 1)
  allCoolingState.setCooldown("fake/tier-1", 10_000)
  const coolingRouter = createFallbackRouter(
    parseOptions({ defaultChain: ["fake/tier-1"] }),
    allCoolingState,
    async () => {
      switchCount += 1
    },
    () => 1,
  )
  assert.equal(await coolingRouter.retry({ sessionID: "ses_cooling", model: { providerID: "primary", modelID: "source" }, error: quotaError }), false)

  const failedSwitchRouter = createFallbackRouter(
    parseOptions({ defaultChain: ["fake/tier-2"] }),
    createFallbackState(),
    async () => {
      throw new Error("fixture switch failure")
    },
  )
  await assert.rejects(
    failedSwitchRouter.retry({ sessionID: "ses_switch_error", model: { providerID: "primary", modelID: "source" }, error: quotaError }),
    /fixture switch failure/,
  )
  assert.equal(failedSwitchRouter.status("ses_switch_error").lastFallback, null)
  assert.equal(switchCount, 0)
})
