const optionalString = { type: "string" } as const

export const GoalDocsRpcDefinition = {
  id: "computer-use.goal-docs",
  methods: {
    export: {
      input: {
        type: "object",
        properties: {
          sourceSessionID: { type: "string", minLength: 1, maxLength: 200 },
          goalID: { type: "string", minLength: 1, maxLength: 200 },
        },
        required: ["sourceSessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["exported", "missing", "failed"] },
          sourceSessionID: { type: "string" },
          sourceDirectory: { type: "string" },
          docsDirectory: { type: "string" },
          goalIDs: { type: "array", items: { type: "string" } },
          currentGoalID: { type: "string" },
          message: { type: "string" },
        },
        required: ["status", "sourceSessionID", "sourceDirectory", "goalIDs", "message"],
        additionalProperties: false,
      },
    },
    handoff: {
      input: {
        type: "object",
        properties: {
          sourceSessionID: { type: "string", minLength: 1, maxLength: 200 },
          goalID: { type: "string", minLength: 1, maxLength: 200 },
        },
        required: ["sourceSessionID", "goalID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          transferID: { type: "string" },
          phase: { type: "string", enum: ["export", "create", "seed", "open"] },
          outcome: { type: "string", enum: ["pending", "complete", "failed"] },
          sourceSessionID: { type: "string" },
          targetSessionID: optionalString,
          messageID: optionalString,
          docsDirectory: optionalString,
          progress: {
            type: "object",
            properties: {
              docs: { type: "string", enum: ["not_started", "complete", "possibly_partial"] },
              target: { type: "string", enum: ["not_created", "creation_unknown", "created", "recovered", "verified"] },
              seed: { type: "string", enum: ["not_sent", "unknown", "admitted"] },
            },
            required: ["docs", "target", "seed"],
            additionalProperties: false,
          },
          message: { type: "string" },
        },
        required: ["transferID", "phase", "outcome", "sourceSessionID", "progress", "message"],
        additionalProperties: false,
      },
    },
    opened: {
      input: {
        type: "object",
        properties: {
          sourceSessionID: { type: "string", minLength: 1, maxLength: 200 },
          transferID: { type: "string", minLength: 1, maxLength: 100 },
          targetSessionID: { type: "string", minLength: 1, maxLength: 200 },
        },
        required: ["sourceSessionID", "transferID", "targetSessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          transferID: { type: "string" },
          phase: { type: "string", enum: ["open"] },
          outcome: { type: "string", enum: ["complete", "failed"] },
          targetSessionID: { type: "string" },
          message: { type: "string" },
        },
        required: ["transferID", "phase", "outcome", "targetSessionID", "message"],
        additionalProperties: false,
      },
    },
  },
  events: {},
} as const
