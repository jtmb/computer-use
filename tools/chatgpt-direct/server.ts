import { Plugin } from "@opencode/plugin/effect"
import { Effect, Stream, type Scope } from "effect"

import { createEffectTools } from "../chatgpt-connector/src/effect-tools.ts"
import { setupChatGPTServer } from "../chatgpt-connector/src/server.ts"

/** Iterate a server stream until the consumer aborts, so plugin cleanup cannot hang. */
async function* untilAborted<Value>(
  source: AsyncIterable<Value>,
  signal?: AbortSignal,
): AsyncGenerator<Value, void, undefined> {
  const iterator = source[Symbol.asyncIterator]()
  try {
    while (!signal?.aborted) {
      const next = await iterator.next()
      if (next.done) return
      yield next.value
    }
  } finally {
    await iterator.return?.(undefined)
  }
}

export default Plugin.define({
  id: "chatgpt.direct",
  effect: (ctx) =>
    Effect.gen(function* () {
      const runtime = yield* Effect.context<Scope.Scope>()
      const run = Effect.runPromiseWith(runtime)
      const events = Stream.toAsyncIterableWith(ctx.event.subscribe(), runtime)

      const cleanup = yield* Effect.tryPromise({
        try: () =>
          setupChatGPTServer(
            {
              app: ctx.app,
              location: ctx.location,
              options: { inProcessTools: true },
              // Reached only if a caller bypasses the Effect registrar; fail closed.
              permission: {
                assert: () => {
                  throw new Error("ChatGPT permission must be asserted inside the tool Effect.")
                },
              },
              session: { get: (input: { sessionID: string }) => run(ctx.session.get(input as never)) },
              provider: { list: () => run(ctx.provider.list()) },
              model: { list: () => run(ctx.model.list()) },
              integration: {
                list: () => run(ctx.integration.list()),
                connection: {
                  active: (integrationID: string) => run(ctx.integration.connection.active(integrationID)),
                  resolve: (connection: Parameters<typeof ctx.integration.connection.resolve>[0]) =>
                    run(ctx.integration.connection.resolve(connection)),
                },
              },
              event: {
                subscribe: (options?: { signal?: AbortSignal }) => untilAborted(events, options?.signal),
              },
              rpc: {
                register: () => {
                  throw new Error("Direct mode does not register the legacy RPC.")
                },
              },
              tool: {
                transform: () => {
                  throw new Error("Direct tools are registered by the Effect plugin.")
                },
              },
            } as never,
            {
              registerInProcessTools: (dependencies) =>
                run(
                  Effect.gen(function* () {
                    const tools = createEffectTools({
                      enableImages: ctx.options.images === undefined || ctx.options.images === true,
                      assertPermission: (request) => ctx.permission.assert(request as never),
                      sessionDirectory: (sessionID) =>
                        Effect.tryPromise({
                          try: () => dependencies.sessionDirectory(sessionID),
                          catch: (cause) => cause,
                        }),
                      execute: dependencies.execute,
                      ensureAvailable: dependencies.ensureAvailable,
                      onError: (error) =>
                        void run(
                          Effect.logWarning("chatgpt direct tool failed", {
                            message: error instanceof Error ? error.message : String(error),
                          }),
                        ),
                    })
                    const registration = yield* ctx.tool.transform((editor) => {
                      editor.namespace({
                        name: "chatgpt_direct",
                        description: "Direct in-process ChatGPT connector tools",
                      })
                      for (const tool of tools) editor.add(tool as never)
                    })
                    return { dispose: () => run(registration.dispose) }
                  }),
                ),
            },
          ),
        catch: (cause) => cause,
      }).pipe(Effect.orDie)

      yield* Effect.addFinalizer(() => Effect.promise(() => cleanup()))
    }),
})
