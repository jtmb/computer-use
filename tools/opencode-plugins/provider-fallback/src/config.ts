import { isRecord, parseModelKey, modelKey, type ModelRef } from "./model.ts"

export type TriggerMode = "quota" | "any-retryable"

export type AgentFallbackConfig = {
  mode?: "chain" | "off"
  chain?: ModelRef[]
  triggerOn?: TriggerMode
  failureCooldownSeconds?: number
  sourceCooldownSeconds?: number
}

export type FallbackConfig = {
  valid: boolean
  errors: string[]
  defaultChain: ModelRef[]
  agents: Map<string, AgentFallbackConfig>
  triggerOn: TriggerMode
  failureCooldownSeconds: number
  sourceCooldownSeconds: number
}

export type EffectiveFallback = {
  enabled: boolean
  chain: ModelRef[]
  triggerOn: TriggerMode
  failureCooldownSeconds: number
  sourceCooldownSeconds: number
}

const DEFAULT_FAILURE_COOLDOWN_SECONDS = 300
const DEFAULT_SOURCE_COOLDOWN_SECONDS = 10_800
const MAX_COOLDOWN_SECONDS = 7 * 24 * 60 * 60
const GLOBAL_KEYS = new Set([
  "defaultChain",
  "agents",
  "triggerOn",
  "failureCooldownSeconds",
  "sourceCooldownSeconds",
])
const AGENT_KEYS = new Set([
  "mode",
  "chain",
  "triggerOn",
  "failureCooldownSeconds",
  "sourceCooldownSeconds",
])

type ChainResult = { chain: ModelRef[]; errors: string[] }

function parseChain(value: unknown, path: string): ChainResult {
  if (value === undefined) return { chain: [], errors: [] }
  if (!Array.isArray(value)) return { chain: [], errors: [`${path} must be an array`] }

  const chain: ModelRef[] = []
  const seen = new Set<string>()
  const errors: string[] = []
  for (const [index, entry] of value.entries()) {
    const model = parseModelKey(entry)
    if (!model) {
      errors.push(`${path}[${index}] must be a valid provider/model[#variant] ID`)
      continue
    }
    const key = modelKey(model)
    if (seen.has(key)) {
      errors.push(`${path} contains duplicate model ${key}`)
      continue
    }
    seen.add(key)
    chain.push(model)
  }

  return { chain: errors.length === 0 ? chain : [], errors }
}

function parseCooldown(value: unknown, path: string, fallback: number, errors: string[]): number {
  if (value === undefined) return fallback
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_COOLDOWN_SECONDS
  ) {
    errors.push(`${path} must be an integer from 1 to ${MAX_COOLDOWN_SECONDS}`)
    return fallback
  }
  return value
}

function parseTrigger(value: unknown, path: string, fallback: TriggerMode, errors: string[]): TriggerMode {
  if (value === undefined) return fallback
  if (value === "quota" || value === "any-retryable") return value
  errors.push(`${path} must be "quota" or "any-retryable"`)
  return fallback
}

function invalidConfig(errors: string[]): FallbackConfig {
  return {
    valid: false,
    errors,
    defaultChain: [],
    agents: new Map(),
    triggerOn: "quota",
    failureCooldownSeconds: DEFAULT_FAILURE_COOLDOWN_SECONDS,
    sourceCooldownSeconds: DEFAULT_SOURCE_COOLDOWN_SECONDS,
  }
}

export function parseOptions(raw: unknown): FallbackConfig {
  if (raw === undefined) raw = {}
  if (!isRecord(raw)) return invalidConfig(["plugin options must be an object"])

  const errors: string[] = []
  for (const key of Object.keys(raw)) {
    if (!GLOBAL_KEYS.has(key)) errors.push(`unsupported option: ${key}`)
  }

  const chain = parseChain(raw.defaultChain, "defaultChain")
  errors.push(...chain.errors)
  const triggerOn = parseTrigger(raw.triggerOn, "triggerOn", "quota", errors)
  const failureCooldownSeconds = parseCooldown(
    raw.failureCooldownSeconds,
    "failureCooldownSeconds",
    DEFAULT_FAILURE_COOLDOWN_SECONDS,
    errors,
  )
  const sourceCooldownSeconds = parseCooldown(
    raw.sourceCooldownSeconds,
    "sourceCooldownSeconds",
    DEFAULT_SOURCE_COOLDOWN_SECONDS,
    errors,
  )
  const agents = new Map<string, AgentFallbackConfig>()

  if (raw.agents !== undefined && !isRecord(raw.agents)) errors.push("agents must be an object keyed by agent ID")
  if (isRecord(raw.agents)) {
    for (const [name, rawAgent] of Object.entries(raw.agents)) {
      if (!name || name.length > 80 || /[\s\u0000-\u001f\u007f]/.test(name)) {
        errors.push("agents contains an invalid agent ID")
        continue
      }
      if (!isRecord(rawAgent)) {
        errors.push(`agents.${name} must be an object`)
        continue
      }
      for (const key of Object.keys(rawAgent)) {
        if (!AGENT_KEYS.has(key)) errors.push(`unsupported option: agents.${name}.${key}`)
      }

      let mode: "chain" | "off" | undefined
      if (rawAgent.mode !== undefined) {
        if (rawAgent.mode === "chain" || rawAgent.mode === "off") mode = rawAgent.mode
        else errors.push(`agents.${name}.mode must be "chain" or "off"`)
      }

      const agentChain = parseChain(rawAgent.chain, `agents.${name}.chain`)
      errors.push(...agentChain.errors)
      const agentTrigger = parseTrigger(rawAgent.triggerOn, `agents.${name}.triggerOn`, triggerOn, errors)
      const agentFailureCooldown = parseCooldown(
        rawAgent.failureCooldownSeconds,
        `agents.${name}.failureCooldownSeconds`,
        failureCooldownSeconds,
        errors,
      )
      const agentSourceCooldown = parseCooldown(
        rawAgent.sourceCooldownSeconds,
        `agents.${name}.sourceCooldownSeconds`,
        sourceCooldownSeconds,
        errors,
      )

      agents.set(name, {
        ...(mode ? { mode } : {}),
        ...(rawAgent.chain !== undefined ? { chain: agentChain.chain } : {}),
        ...(rawAgent.triggerOn !== undefined ? { triggerOn: agentTrigger } : {}),
        ...(rawAgent.failureCooldownSeconds !== undefined
          ? { failureCooldownSeconds: agentFailureCooldown }
          : {}),
        ...(rawAgent.sourceCooldownSeconds !== undefined
          ? { sourceCooldownSeconds: agentSourceCooldown }
          : {}),
      })
    }
  }

  if (errors.length > 0) return invalidConfig(errors)
  return {
    valid: true,
    errors: [],
    defaultChain: chain.chain,
    agents,
    triggerOn,
    failureCooldownSeconds,
    sourceCooldownSeconds,
  }
}

export function resolveEffective(agentName: string | undefined, config: FallbackConfig): EffectiveFallback {
  const override = agentName ? config.agents.get(agentName) : undefined
  const chain = override?.chain ?? config.defaultChain
  const disabled = !config.valid || override?.mode === "off"

  return {
    enabled: !disabled && chain.length > 0,
    chain: disabled ? [] : chain,
    triggerOn: override?.triggerOn ?? config.triggerOn,
    failureCooldownSeconds: override?.failureCooldownSeconds ?? config.failureCooldownSeconds,
    sourceCooldownSeconds: override?.sourceCooldownSeconds ?? config.sourceCooldownSeconds,
  }
}

export function hasConfiguredChain(config: FallbackConfig): boolean {
  if (!config.valid) return false
  if (config.defaultChain.length > 0) return true
  for (const agent of config.agents.values()) {
    if (agent.mode !== "off" && (agent.chain?.length ?? 0) > 0) return true
  }
  return false
}
