import { Effect } from "effect"

import { CHATGPT_TOOLS, createCallToolHandler, parseToolInput, type ChatgptRpcInput } from "./mcp.ts"
import { executeImageTool, executeShowImageTool, parseShowImageInput } from "./image-tool.ts"
import type { saveGeneratedImage } from "./output.ts"

export const IN_PROCESS_NAMESPACE = "chatgpt_direct"

export type EffectToolCall = {
  sessionID: string
  agent: string
  messageID: string
  id: string
}

export type PermissionRequest = {
  sessionID: string
  agent: string
  source: { type: "tool"; messageID: string; id: string }
  action: string
  resources: string[]
  save: string[]
}

export type EffectToolDependencies = {
  assertPermission: (request: PermissionRequest) => Effect.Effect<void, unknown>
  sessionDirectory: (sessionID: string) => Effect.Effect<string, unknown>
  execute: (input: ChatgptRpcInput, signal: AbortSignal) => Promise<unknown>
  ensureAvailable?: () => void
  onError?: (error: unknown) => void
  enableImages?: boolean
  saveImage?: typeof saveGeneratedImage
  /** Called when the call is interrupted so a client can refresh its permission cache. */
  onCancelled?: (sessionID: string, tool: string) => void
}

/**
 * Effect-native direct tools.
 *
 * The permission assertion runs inside the tool's own Effect, so interrupting the
 * call interrupts that assertion. The Promise adapter's `assert` runs outside the
 * tool signal and would leave its request pending after cancellation.
 */
export function createEffectTools(dependencies: EffectToolDependencies) {
  const definitions = [
    ...CHATGPT_TOOLS.filter((definition) => definition.name !== "generate_image" || dependencies.enableImages === true),
    ...(dependencies.enableImages === true ? [{
      name: "show_image" as const,
      description: "Show an existing PNG from this session project's assets/generated directory as an image attachment in this chat. No generation, account request, or image allowance. Supply only the filename, not a path.",
      inputSchema: {
        type: "object", properties: { filename: { type: "string", minLength: 1, maxLength: 101 } },
        required: ["filename"], additionalProperties: false,
      },
    }] : []),
  ]
  return definitions.map((definition) => ({
    name: definition.name,
    description: definition.name === "generate_image"
      ? "Generate a ChatGPT image through the existing OpenAI OAuth connection, save a validated PNG under assets/generated, and return the actual image as a chat attachment. One request can consume image allowance; failures are not automatically retried."
      : definition.description,
    input: definition.inputSchema,
    options: { namespace: IN_PROCESS_NAMESPACE, codemode: true as const },
    execute: (input: unknown, call: EffectToolCall) =>
      Effect.gen(function* () {
        yield* Effect.sync(() => dependencies.ensureAvailable?.())
        const parsed = yield* Effect.sync(() => {
          try {
            return definition.name === "show_image" ? parseShowImageInput(input) : parseToolInput(definition.name, input)
          } catch {
            return undefined
          }
        })
        if (!parsed) return { content: "ChatGPT tool arguments are invalid." }

        return yield* Effect.onInterrupt(
          Effect.gen(function* () {
            const directory = yield* dependencies.sessionDirectory(call.sessionID)
            if (parsed.action === "show_image") {
              return yield* executeShowImageTool(parsed.filename, directory, call, dependencies)
            }
            yield* dependencies.assertPermission({
              sessionID: call.sessionID,
              agent: call.agent,
              source: { type: "tool", messageID: call.messageID, id: call.id },
              action: `chatgpt.${definition.name}`,
              resources: ["chatgpt.com"],
              save: ["chatgpt.com"],
            })
            yield* Effect.sync(() => dependencies.ensureAvailable?.())

            if (parsed.action === "generate_image") {
              return yield* executeImageTool(parsed.prompt!, directory, call, dependencies)
            }

            const handle = createCallToolHandler({
              sessionDirectory: async () => directory,
              callRpc: (request, _directory, requestSignal) =>
                dependencies.execute(request, requestSignal ?? new AbortController().signal),
              // Image output is not registered here; every write still needs its own edit permission.
              saveImage: async () => {
                throw new Error("Direct image output is not enabled.")
              },
              onError: dependencies.onError,
            })
            const request = {
              params: {
                name: definition.name,
                arguments: input,
                _meta: { "ai.opencode/sessionID": call.sessionID },
              },
            }
            // Effect.callback's signal is aborted when the tool is interrupted, so the
            // in-flight backend read stops with the call instead of outliving it.
            const response = yield* Effect.callback<Awaited<ReturnType<typeof handle>>, unknown>((resume, signal) => {
              void handle(request, signal).then(
                (value) => resume(Effect.succeed(value)),
                (error) => resume(Effect.fail(error)),
              )
            })
            return {
              content: `${response.isError ? "ChatGPT tool error: " : ""}${response.content
                .map((item) => item.text)
                .join("\n")}`,
            }
          }),
          () =>
            Effect.sync(() => {
              dependencies.onCancelled?.(call.sessionID, definition.name)
            }),
        )
      }),
  }))
}
