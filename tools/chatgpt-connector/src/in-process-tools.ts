import { isAbsolute, relative, sep } from "node:path"

import { CHATGPT_TOOLS, createCallToolHandler, parseToolInput, type ChatgptRpcInput } from "./mcp.ts"
import { saveGeneratedImage } from "./output.ts"

export const IN_PROCESS_NAMESPACE = "chatgpt_direct"

export type InProcessCall = {
  sessionID: string
  agent: string
  messageID: string
  id: string
  signal?: AbortSignal
}

export type InProcessPermission = {
  assert: (request: {
    sessionID: string
    agent: string
    source: { type: "tool"; messageID: string; id: string }
    action: string
    resources: string[]
    save: string[]
  }) => Promise<void>
}

export type InProcessDependencies = {
  permission: InProcessPermission
  sessionDirectory: (sessionID: string) => Promise<string>
  execute: (input: ChatgptRpcInput, signal: AbortSignal) => Promise<unknown>
  ensureAvailable?: () => void
  saveImage?: (input: Parameters<typeof saveGeneratedImage>[0] & { authorize: (absolutePath: string) => Promise<void> }) => ReturnType<typeof saveGeneratedImage>
}

function liveSignal(signal: AbortSignal | undefined): AbortSignal {
  if (!signal || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function") {
    throw new Error("In-process ChatGPT tools require OpenCode cancellation support.")
  }
  if (signal.aborted) throw new Error("ChatGPT request was cancelled.")
  return signal
}

export function createInProcessTools(dependencies: InProcessDependencies) {
  const saveImage = dependencies.saveImage ?? saveGeneratedImage
  return CHATGPT_TOOLS.map((definition) => ({
    name: definition.name,
    description: definition.description,
    input: definition.inputSchema,
    options: { namespace: IN_PROCESS_NAMESPACE, codemode: true as const },
    execute: async (input: unknown, call: InProcessCall) => {
      const signal = liveSignal(call.signal)
      const ensureActive = () => {
        dependencies.ensureAvailable?.()
        liveSignal(signal)
      }
      ensureActive()
      try {
        parseToolInput(definition.name, input)
      } catch {
        return { content: "ChatGPT tool arguments are invalid." }
      }

      const directory = await dependencies.sessionDirectory(call.sessionID)
      ensureActive()
      await dependencies.permission.assert({
        sessionID: call.sessionID,
        agent: call.agent,
        source: { type: "tool", messageID: call.messageID, id: call.id },
        action: `chatgpt.${definition.name}`,
        resources: ["chatgpt.com"],
        save: ["chatgpt.com"],
      })
      ensureActive()

      const permissionFailure: { occurred: boolean; error?: unknown } = { occurred: false }
      const handle = createCallToolHandler({
        sessionDirectory: async () => directory,
        callRpc: (request) => dependencies.execute(request, signal),
        saveImage: async (request) => {
          ensureActive()
          if (await dependencies.sessionDirectory(call.sessionID) !== directory) {
            throw new Error("The invoking session location changed.")
          }
          ensureActive()
          return saveImage({
            ...request,
            authorize: async (absolutePath) => {
              ensureActive()
              if (!isAbsolute(absolutePath)) throw new Error("The generated image path must be absolute.")
              const resource = relative(directory, absolutePath)
              if (!resource || resource === ".." || resource.startsWith(`..${sep}`) || isAbsolute(resource) || /[?*\\]/.test(resource)) {
                throw new Error("The generated image path is outside the invoking session location.")
              }
              try {
                await dependencies.permission.assert({
                  sessionID: call.sessionID,
                  agent: call.agent,
                  source: { type: "tool", messageID: call.messageID, id: call.id },
                  action: "edit",
                  resources: [resource],
                  save: [resource],
                })
              } catch (error) {
                permissionFailure.occurred = true
                permissionFailure.error = error
                throw error
              }
              ensureActive()
              if (await dependencies.sessionDirectory(call.sessionID) !== directory) {
                throw new Error("The invoking session location changed.")
              }
              ensureActive()
            },
          })
        },
      })
      const result = await handle({
        params: { name: definition.name, arguments: input, _meta: { "ai.opencode/sessionID": call.sessionID } },
      })
      if (permissionFailure.occurred) throw permissionFailure.error
      ensureActive()
      return { content: `${result.isError ? "ChatGPT tool error: " : ""}${result.content.map((item) => item.text).join("\n")}` }
    },
  }))
}
