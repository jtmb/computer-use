import { LIMITS, OPERATIONS, PURPOSES, record, type Operation, type Scope } from "./model.ts"
import type { Call } from "./service.ts"
import { outputSchema, present } from "./result.ts"
import { rpcValue } from "./rpc-compatible.ts"

const id = { type: "string", minLength: 1, maxLength: 100, pattern: "^[a-zA-Z0-9_-]+$" }
const operation = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false })
export const schema = { oneOf: [
  operation({ op: { const: "read" }, after: id, threadID: id, limit: { type: "integer", minimum: 1, maximum: LIMITS.page }, claimsAfter: id }, ["op"]),
  operation({ op: { const: "inbox" }, after: id, threadID: id, limit: { type: "integer", minimum: 1, maximum: LIMITS.page }, unreadOnly: { type: "boolean", default: true } }, ["op"]),
  operation({ op: { const: "post" }, id, parentID: id, recipients: { type: "array", minItems: 1, maxItems: LIMITS.recipients, uniqueItems: true, items: { ...id, pattern: "^ses_[a-zA-Z0-9_-]+$" } },
    purpose: { type: "string", enum: PURPOSES }, body: { type: "string", minLength: 1, maxLength: LIMITS.body } }, ["op", "id", "recipients", "purpose", "body"]),
  operation({ op: { const: "deliver" }, id }, ["op", "id"]),
  operation({ op: { const: "ack" }, id }, ["op", "id"]),
  operation({ op: { const: "claim" }, id, paths: { type: "array", minItems: 1, maxItems: 16, items: { type: "string", minLength: 1, maxLength: 500 } } }, ["op", "id", "paths"]),
  operation({ op: { const: "release" }, id, evidence: { type: "string", minLength: 1, maxLength: 1000 } }, ["op", "id", "evidence"]),
  operation({ op: { const: "watch" }, id, worker: { ...id, pattern: "^ses_[a-zA-Z0-9_-]+$" }, task: { type: "string", minLength: 1, maxLength: 500 }, expectedResult: { type: "string", minLength: 1, maxLength: 1000 },
    inactivityMs: { type: "integer", minimum: 1000, maximum: 86400000 }, wallMs: { type: "integer", minimum: 1000, maximum: 86400000 } }, ["op", "id", "worker", "task", "expectedResult"]),
  operation({ op: { const: "progress" }, id, evidence: { type: "string", minLength: 1, maxLength: 1000 }, waitingReason: { type: "string", minLength: 1, maxLength: 500 } }, ["op", "id", "evidence"]),
  operation({ op: { const: "unwatch" }, id }, ["op", "id"]),
  operation({ op: { const: "status" } }, ["op"]),
  operation({ op: { const: "policy" } }, ["op"]),
  operation({ op: { const: "message" }, id, offset: { type: "integer", minimum: 0, maximum: LIMITS.body - 1 } }, ["op", "id"]),
  operation({ op: { const: "ownership" }, id, pathIndex: { type: "integer", minimum: 0, maximum: 15 }, offset: { type: "integer", minimum: 0, maximum: 499 } }, ["op", "id"]),
] }
export interface CoordinationToolDefinition {
  name: "coordination"; description: string; input: Record<string, unknown>; output: Record<string, unknown>
  options: { codemode: false }
  execute(input: unknown, call: Call): Promise<ReturnType<typeof present>>
}
export function definition(execute: (input: unknown, call: Call) => Promise<unknown>, scope: Scope): CoordinationToolDefinition {
  return { name: "coordination", description: "Dedicated structured peer-session communication output. Every call requires an explicit op; message writes require op: \"post\" and malformed input is never inferred. Inbox shows current-session unread messages without marking seen. Exact-worktree peer threads and ownership. Post stores; deliver follows recipient operator policy (default inbox-only/no wake). Policy is read-only here. Read or inbox summaries show at most a 120-character preview; op: \"message\" with an exact id and optional Unicode-codepoint offset returns one bounded visible body chunk with nextOffset, never an ACK. Read summaries also disclose visible active claim IDs, owners and path counts; op: \"ownership\" with an exact claim id returns one bounded JSON-escaped literal path chunk with nextOffset/nextPathIndex and never grants edit authority. Native permissions still apply; explicit ACK is seen-only, never task acceptance. Never auto-reply or reassign unknown owners.", input: schema, output: outputSchema,
    options: { codemode: false },
    execute: async (input: unknown, call: Call) => {
      if (!record(input)) throw new Error('coordination input must be an object with an explicit op; message writes require op: "post". Nothing was executed.')
      if (input.op === undefined) throw new Error('missing coordination operation: include an explicit op; for message writes use op: "post". No operation was inferred or executed.')
      if (typeof input.op !== "string" || !OPERATIONS.includes(input.op as Operation)) {
        const received = typeof input.op === "string"
          ? ` ${JSON.stringify(input.op.slice(0, 80))}${input.op.length > 80 ? "…" : ""}`
          : ` (${input.op === null ? "null" : typeof input.op})`
        throw new Error(`unsupported coordination operation${received}; use a supported op explicitly (message writes require op: "post"). Nothing was executed.`)
      }
      return rpcValue(present(input.op as Operation, await execute(input, call), scope, call.sessionID))
    },
  }
}
