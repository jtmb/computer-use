import { Rpc } from "@opencode/plugin/rpc"

const sessionID = { type: "string", minLength: 1, maxLength: 200 } as const
const nullableText = { type: ["string", "null"] } as const

/** Read-only diagnostics distinguish a missing hook, an attempted refresh and a preserved manual title. */
export const TaskTitlesRpc = Rpc.define({
  id: "computer-use.task-titles",
  methods: {
    status: {
      input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false },
      output: {
        type: "object",
        properties: {
          sessionID, eligible: { type: "boolean" }, suspended: { type: "boolean" }, pending: { type: "boolean" },
          taskKey: nullableText, attemptedTaskKey: nullableText, currentTitle: nullableText, recordedTitle: nullableText,
          action: { type: ["string", "null"], enum: ["attempted", "preserved", "generated", "manual", null] },
          publicationCapability: { type: "string", enum: ["unavailable", "conditional-title-v1"] },
        },
        required: ["sessionID", "eligible", "suspended", "pending", "taskKey", "attemptedTaskKey", "currentTitle", "recordedTitle", "action", "publicationCapability"],
        additionalProperties: false,
      },
    },
  },
  events: {},
})
