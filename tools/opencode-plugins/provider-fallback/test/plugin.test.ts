import assert from "node:assert/strict"
import test from "node:test"

import plugin from "../src/index.ts"
import { ProviderFallback } from "../src/rpc.ts"

type Hook = (event: Record<string, any>) => Promise<void> | void

async function harness(options: Record<string, unknown> = {}) {
  const hooks = new Map<string, Hook>()
  const switches: Array<{ sessionID: string; model: { providerID: string; id: string; variant?: string } }> = []
  const statusEvents: Array<{ name: string; sessionID: string }> = []
  let statusHandler: ((input: unknown) => Promise<unknown>) | undefined
  let disposed = 0
  const context = {
    options,
    session: {
      hook: async (name: string, callback: Hook) => {
        hooks.set(name, callback)
        return { dispose: async () => { hooks.delete(name); disposed += 1 } }
      },
      switchModel: async (input: (typeof switches)[number]) => {
        switches.push(input)
      },
    },
    rpc: {
      register: async (_contract: unknown, handlers: { status(input: unknown): Promise<unknown> }) => {
        statusHandler = handlers.status
        return {
          events: {
            emit: async (name: string, input: { sessionID: string }) => {
              statusEvents.push({ name, sessionID: input.sessionID })
            },
          },
          dispose: async () => { statusHandler = undefined; disposed += 1 },
        }
      },
    },
  }
  const cleanup = await plugin.setup(context as never)
  return {
    hooks,
    switches,
    statusEvents,
    async status(input: unknown = {}) {
      assert.ok(statusHandler)
      return statusHandler(input)
    },
    async dispose() {
      await cleanup?.()
      return disposed
    },
  }
}

function event(model: { providerID: string; id: string; variant?: string }, error: unknown, attempt = 1) {
  return {
    sessionID: "ses_plugin_fixture",
    agent: "build",
    model,
    error,
    attempt,
    decision: { retry: false },
  }
}

test("default load registers read-only status and no fallback chain or provider actions", async () => {
  const setup = await harness()
  try {
    assert.deepEqual(await setup.status(), {
      state: "inactive",
      chainLength: 0,
      lastFallback: null,
    })
    assert.equal(setup.switches.length, 0)

    const retry = event({ providerID: "openai", id: "gpt-5.3-codex" }, {
      message: "usage limit reached",
      statusCode: 429,
    })
    await setup.hooks.get("retry")?.(retry)
    assert.deepEqual(retry.decision, { retry: false })
    assert.equal(setup.switches.length, 0)
  } finally {
    assert.equal(await setup.dispose(), 3)
  }
})

test("RPC contract exposes only the read-only status method", () => {
  assert.deepEqual(Object.keys(ProviderFallback.methods), ["status"])
  assert.deepEqual(Object.keys(ProviderFallback.events), ["changed"])
})

test("configured status does not switch providers; a real retry failure does", async () => {
  const setup = await harness({ defaultChain: ["fake/tier-1#fast"] })
  try {
    assert.deepEqual(await setup.status({ sessionID: "ses_plugin_fixture" }), {
      state: "configured",
      chainLength: 1,
      lastFallback: null,
    })
    assert.equal(setup.switches.length, 0)

    const contextEvent = { sessionID: "ses_plugin_fixture", agent: "build" }
    await setup.hooks.get("context")?.(contextEvent)
    const retry = event({ providerID: "openai", id: "gpt-5.3-codex" }, {
      message: "usage limit reached",
      statusCode: 429,
    })
    await setup.hooks.get("retry")?.(retry)

    assert.deepEqual(retry.decision, { retry: true, delay: 250 })
    assert.deepEqual(setup.switches, [
      { sessionID: "ses_plugin_fixture", model: { providerID: "fake", id: "tier-1", variant: "fast" } },
    ])
    assert.deepEqual(setup.statusEvents, [{ name: "changed", sessionID: "ses_plugin_fixture" }])
    const status = await setup.status({ sessionID: "ses_plugin_fixture" }) as {
      state: string
      lastFallback: { source: string; target: string; recordedAt: number } | null
    }
    assert.equal(status.state, "last-fallback")
    assert.deepEqual(status.lastFallback, {
      source: "openai/gpt-5.3-codex",
      target: "fake/tier-1#fast",
      recordedAt: status.lastFallback!.recordedAt,
    })
  } finally {
    await setup.dispose()
  }
})

test("invalid legacy proactive options disable routing and status without credential reads", async () => {
  const setup = await harness({ defaultChain: ["fake/tier-1"], proactive: true })
  try {
    assert.equal(((await setup.status()) as { state: string }).state, "inactive")
    const retry = event({ providerID: "openai", id: "gpt-5.3-codex" }, {
      message: "usage limit reached",
      statusCode: 429,
    })
    await setup.hooks.get("retry")?.(retry)
    assert.deepEqual(retry.decision, { retry: false })
    assert.equal(setup.switches.length, 0)
  } finally {
    await setup.dispose()
  }
})

test("read-only status RPC is isolated per session and never triggers a provider action", async () => {
  const setup = await harness({ defaultChain: ["fake/tier-1"] })
  try {
    await setup.hooks.get("context")?.({ sessionID: "ses_one", agent: "plan" })
    const before = setup.switches.length
    const status = await setup.status({ sessionID: "ses_one" }) as { state: string; chainLength: number }
    const unknown = await setup.status({ sessionID: "ses_two" }) as { state: string; chainLength: number }
    assert.equal(status.state, "configured")
    assert.equal(status.chainLength, 1)
    assert.equal(unknown.state, "configured")
    assert.equal(unknown.chainLength, 1)
    assert.equal(setup.switches.length, before)
  } finally {
    await setup.dispose()
  }
})
