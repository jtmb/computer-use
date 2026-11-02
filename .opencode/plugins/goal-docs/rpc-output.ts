import { GoalDocsRpcDefinition } from "./rpc-definition.ts"
import type { GoalDocsRpcClient } from "./rpc.ts"

interface OutputSchema {
  readonly type: string
  readonly enum?: readonly string[]
  readonly properties?: Readonly<Record<string, OutputSchema>>
  readonly required?: readonly string[]
  readonly items?: OutputSchema
  readonly additionalProperties?: boolean
}

function matches(value: unknown, schema: OutputSchema): boolean {
  if (schema.type === "string") return typeof value === "string" && (!schema.enum || schema.enum.includes(value))
  if (schema.type === "array") {
    const items = schema.items
    return Array.isArray(value) && items !== undefined && value.every((item) => matches(item, items))
  }
  if (schema.type !== "object" || typeof value !== "object" || value === null || Array.isArray(value)) return false
  const object = value as Record<string, unknown>
  const properties = schema.properties ?? {}
  if (schema.required?.some((key) => !Object.hasOwn(object, key))) return false
  return Object.entries(object).every(([key, item]) => Object.hasOwn(properties, key)
    ? matches(item, properties[key])
    : schema.additionalProperties !== false)
}

export function decodeGoalDocsRpcOutput<Method extends keyof GoalDocsRpcClient>(
  method: Method,
  value: unknown,
): Awaited<ReturnType<GoalDocsRpcClient[Method]>> {
  // The SDK intentionally types JSON Schema results as unknown. Validate the
  // shared wire schema before narrowing; never trust a client-side cast alone.
  if (!matches(value, GoalDocsRpcDefinition.methods[method].output)) {
    throw new Error(`Invalid goal-docs ${method} RPC output; this response cannot confirm handoff progress.`)
  }
  return value as Awaited<ReturnType<GoalDocsRpcClient[Method]>>
}
