import { Rpc } from "@opencode/plugin/rpc"

const sessionID = { type: "string", minLength: 1, maxLength: 200 } as const
const output = {
  type: "object",
  properties: {
    sessionID, revision: { type: "integer", minimum: 0 }, enabled: { type: "boolean" },
    configuredEnabled: { type: "boolean" },
    role: { type: "string", enum: ["worker", "reviewer", "unclassified"] },
    requested: { type: ["string", "null"] }, notice: { type: "string" },
  },
  required: ["sessionID", "revision", "enabled", "configuredEnabled", "role", "requested", "notice"],
  additionalProperties: false,
} as const

export const HandoffSettingsRpc = Rpc.define({
  id: "computer-use.source-handoff-settings",
  methods: {
    read: { input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false }, output },
    update: { input: {
      type: "object", properties: { sessionID, revision: { type: "integer", minimum: 0 }, enabled: { type: "boolean" } },
      required: ["sessionID", "revision", "enabled"], additionalProperties: false,
    }, output },
  },
  events: {},
})
