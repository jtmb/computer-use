import { Plugin } from "@opencode/plugin"

import { parseOptions } from "./config.ts"
import { createFallbackRouter } from "./router.ts"
import { ProviderFallback } from "./rpc.ts"
import { createFallbackState } from "./state.ts"

const RETRY_DELAY_MS = 250

type StatusRpcRegistration = {
  dispose(): Promise<void>
  events: {
    emit(name: "changed", input: { sessionID: string }): Promise<void>
  }
}

function modelFromEvent(model: { providerID: string; id: string; variant?: string }) {
  return {
    providerID: String(model.providerID),
    modelID: String(model.id),
    ...(typeof model.variant === "string" && model.variant ? { variant: model.variant } : {}),
  }
}

export default Plugin.define({
  id: "computer-use.provider-fallback",
  async setup(ctx) {
    const config = parseOptions(ctx.options)
    const state = createFallbackState()
    const router = createFallbackRouter(config, state, async (sessionID, model) => {
      await ctx.session.switchModel({
        sessionID,
        model: {
          providerID: model.providerID,
          id: model.modelID,
          ...(model.variant ? { variant: model.variant } : {}),
        },
      })
    })
    let emitStatusUpdate: ((sessionID: string) => Promise<void>) | undefined

    const contextRegistration = await ctx.session.hook("context", (event) => {
      router.noteSession(String(event.sessionID), String(event.agent))
    })
    const retryRegistration = await ctx.session.hook("retry", async (event) => {
      try {
        const routed = await router.retry({
          sessionID: String(event.sessionID),
          agent: String(event.agent),
          model: modelFromEvent(event.model),
          error: event.error,
          attempt: event.attempt,
        })
        if (routed) {
          event.decision = { retry: true, delay: RETRY_DELAY_MS }
          await emitStatusUpdate?.(String(event.sessionID))
        }
      } catch {
        // A failed switch leaves the OpenCode retry decision unchanged.
      }
    })

    let rpcRegistration: StatusRpcRegistration | undefined
    try {
      rpcRegistration = await ctx.rpc.register(ProviderFallback, {
        status: async (input) => {
          const value = input as { sessionID?: unknown }
          return router.status(typeof value.sessionID === "string" ? value.sessionID : undefined)
        },
      })
    } catch (error) {
      await retryRegistration.dispose()
      await contextRegistration.dispose()
      throw error
    }
    const registration = rpcRegistration
    if (!registration) throw new Error("status RPC registration did not complete")
    emitStatusUpdate = async (sessionID) => {
      await registration.events.emit("changed", { sessionID })
    }

    return async () => {
      emitStatusUpdate = undefined
      await Promise.all([
        retryRegistration.dispose(),
        contextRegistration.dispose(),
        registration.dispose(),
      ])
    }
  },
})
