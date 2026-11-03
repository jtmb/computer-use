import { pickTier } from "./chain.ts"
import { hasConfiguredChain, resolveEffective, type FallbackConfig } from "./config.ts"
import { classifyFailure, classifyRetryMessage, shouldTrigger } from "./detect.ts"
import { modelKey, type ModelRef } from "./model.ts"
import type { ProviderFallbackStatus } from "./rpc.ts"
import type { FallbackState } from "./state.ts"

export type RetryInput = {
  sessionID: string
  agent?: string
  model: ModelRef
  error?: unknown
  message?: string
  attempt?: number | string
}

export type SwitchModel = (sessionID: string, model: ModelRef) => Promise<void>

function attemptToken(input: RetryInput): string | undefined {
  if (input.attempt === undefined) return undefined
  return `${String(input.attempt)}:${modelKey(input.model)}#${input.model.variant ?? ""}`
}

export function createFallbackRouter(
  config: FallbackConfig,
  state: FallbackState,
  switchModel: SwitchModel,
  now: () => number = Date.now,
) {
  const inFlight = new Set<string>()

  return {
    noteSession(sessionID: string, agent: string) {
      state.setAgent(sessionID, agent)
    },
    status(sessionID?: string): ProviderFallbackStatus {
      const agent = sessionID ? state.getAgent(sessionID) : undefined
      const effective = resolveEffective(agent, config)
      const lastFallback = sessionID ? state.lastFallback(sessionID) : undefined
      const configuredSomewhere = hasConfiguredChain(config)
      const stateName = lastFallback
        ? "last-fallback"
        : effective.enabled || (!agent && configuredSomewhere)
          ? "configured"
          : "inactive"

      const chainLength = agent
        ? effective.chain.length
        : config.defaultChain.length > 0
          ? config.defaultChain.length
          : configuredSomewhere
            ? null
            : 0

      return {
        state: stateName,
        chainLength,
        lastFallback: lastFallback ?? null,
      }
    },
    async retry(input: RetryInput): Promise<boolean> {
      if (!input.sessionID || !config.valid) return false
      if (input.agent) state.setAgent(input.sessionID, input.agent)

      const agent = input.agent ?? state.getAgent(input.sessionID)
      const effective = resolveEffective(agent, config)
      if (!effective.enabled) return false

      const failure = input.error !== undefined
        ? classifyFailure(input.error)
        : classifyRetryMessage(input.message)
      if (!shouldTrigger(failure, effective.triggerOn)) return false

      const token = attemptToken(input)
      if (token && state.hasAttempt(input.sessionID, token)) return false
      if (inFlight.has(input.sessionID)) return false
      inFlight.add(input.sessionID)

      try {
        const failedKey = modelKey(input.model)
        const cooldownSeconds = failure?.kind === "quota"
          ? effective.sourceCooldownSeconds
          : effective.failureCooldownSeconds
        state.setCooldown(failedKey, now() + cooldownSeconds * 1000)

        const chainIndex = effective.chain.findIndex((tier) => modelKey(tier) === failedKey)
        const next = pickTier({
          chain: effective.chain,
          startIndex: chainIndex >= 0 ? chainIndex + 1 : 0,
          wrap: true,
          isCooling: (key) => state.isCooling(key),
        })
        if (!next.tier || modelKey(next.tier) === failedKey) return false

        if (token) state.markAttempt(input.sessionID, token)
        await switchModel(input.sessionID, next.tier)
        state.recordFallback(input.sessionID, input.model, next.tier)
        return true
      } finally {
        inFlight.delete(input.sessionID)
      }
    },
  }
}
