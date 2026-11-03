import { Rpc } from "@opencode/plugin/rpc"

export type ProviderFallbackStatus = {
  state: "inactive" | "configured" | "last-fallback"
  chainLength: number | null
  lastFallback: {
    source: string
    target: string
    recordedAt: number
  } | null
}

export const ProviderFallback = Rpc.define({
  id: "computer-use.provider-fallback",
  methods: {
    status: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string", minLength: 1, maxLength: 512 },
        },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["inactive", "configured", "last-fallback"] },
          chainLength: {
            anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
          },
          lastFallback: {
            anyOf: [
              {
                type: "object",
                properties: {
                  source: { type: "string" },
                  target: { type: "string" },
                  recordedAt: { type: "number" },
                },
                required: ["source", "target", "recordedAt"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
          },
        },
        required: ["state", "chainLength", "lastFallback"],
        additionalProperties: false,
      },
    },
  },
  events: {
    changed: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string", minLength: 1, maxLength: 512 },
        },
        required: ["sessionID"],
        additionalProperties: false,
      },
    },
  },
} as const)
