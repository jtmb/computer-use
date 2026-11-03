import { policyViewSchema, receivePolicySchema } from "./policy.ts"
import { LIMITS } from "./model.ts"
import { payloadSchemas } from "./result.ts"

const session = { type: "string", minLength: 5, maxLength: 100, pattern: "^ses_[a-zA-Z0-9_-]+$" }
const updateShape = { type: "object", required: ["sessionID", "target", "expectedRevision", "policy"], additionalProperties: false }
const updateFields = { sessionID: session, expectedRevision: { type: "integer", minimum: 0 } }

export const coordinationSettingsContract = {
  id: "computer-use.coordination-settings",
  methods: {
    read: {
      input: { type: "object", properties: { sessionID: session }, required: ["sessionID"], additionalProperties: false },
      output: policyViewSchema,
    },
    update: {
      input: { anyOf: [
        { ...updateShape, properties: { ...updateFields, target: { const: "project" }, policy: receivePolicySchema } },
        { ...updateShape, properties: { ...updateFields, target: { const: "chat" }, policy: { anyOf: [receivePolicySchema, { type: "null" }] } } },
      ] },
      output: policyViewSchema,
    },
  },
  events: {},
}

export const coordinationInboxContract = {
  id: "computer-use.coordination-inbox",
  methods: {
    read: {
      input: { type: "object", properties: { sessionID: session, after: { type: "string", maxLength: 100 }, limit: { type: "integer", minimum: 1, maximum: LIMITS.page }, unreadOnly: { type: "boolean" } }, required: ["sessionID"], additionalProperties: false },
      output: payloadSchemas.inbox,
    },
    seen: {
      input: { type: "object", properties: { sessionID: session, id: { type: "string", minLength: 1, maxLength: 100 } }, required: ["sessionID", "id"], additionalProperties: false },
      output: payloadSchemas.ack,
    },
    ownership: {
      input: { type: "object", properties: { sessionID: session }, required: ["sessionID"], additionalProperties: false },
      output: { type: "object", properties: { assignments: { type: "array", maxItems: LIMITS.assignments, items: payloadSchemas.watch }, total: { type: "integer", minimum: 0, maximum: LIMITS.assignments }, truncated: { type: "boolean" } }, required: ["assignments", "total", "truncated"], additionalProperties: false },
    },
  },
  events: {},
}
