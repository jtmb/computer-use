import { lstat, open } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { performance } from "node:perf_hooks"
import { Plugin } from "@opencode/plugin"

import { createCredentialSafety } from "../../../.opencode/plugins/computer-use/credential-safety.ts"
import { registerBrowserTools } from "../../../.opencode/plugins/computer-use/browser-tools.ts"
import { applyCodemodeDefault } from "../../../.opencode/plugins/computer-use/codemode.ts"
import { withSerializedTools } from "../../../.opencode/plugins/computer-use/serialization.ts"
import {
  createAuthGuard,
  createOwnerOperationQueue,
} from "../../computer-use-runtime/src/index.ts"
import { createBrowserManager } from "../src/index.ts"
import {
  attestModelDispatch,
  connectedCredentialIntegrationIDs,
  verifyDispatchExposure,
  EXPECTED_BROWSER_TOOLS,
  BENCHMARK_LIMITS,
} from "./contract.mjs"
import { makeToolCallMetric } from "../efficiency-acceptance.mjs"
import { verifyOwnedRunRoot } from "../isolated-model-benchmark.mjs"
import { parseMeasureOptions, type MeasureOptions } from "./options.ts"
import { createReceiptWriter } from "./receipt.ts"

type BaseOptions = {
  runRoot: string
  runID: string
  scratchParent: string
  approvedScratchRoots: string[]
  profileRoot: string
  receiptPath: string
}
type Options = BaseOptions & ({ mode: "catalog" } | MeasureOptions)

async function checkedOptions(value: unknown): Promise<Options> {
  if (!value || typeof value !== "object") throw new TypeError("benchmark plugin options are required")
  const options = value as Partial<BaseOptions> & { mode?: unknown }
  if (options.mode !== "catalog" && options.mode !== "measure") throw new TypeError("invalid benchmark plugin mode")
  if (typeof options.scratchParent !== "string" || !isAbsolute(options.scratchParent) || resolve(options.scratchParent) !== options.scratchParent) {
    throw new TypeError("scratchParent must be an absolute normalized path")
  }
  if (!Array.isArray(options.approvedScratchRoots) || options.approvedScratchRoots.length !== 1 ||
      options.approvedScratchRoots[0] !== options.scratchParent) {
    throw new TypeError("approvedScratchRoots must contain only the exact task scratch parent")
  }
  if (typeof options.runRoot !== "string" || !isAbsolute(options.runRoot) || resolve(options.runRoot) !== options.runRoot ||
      dirname(options.runRoot) !== options.scratchParent || !basename(options.runRoot).startsWith("computer-use-browser-model-bench-")) {
    throw new TypeError("runRoot is outside the task-owned benchmark root")
  }
  if (typeof options.runID !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(options.runID)) {
    throw new TypeError("runID must identify the task-owned run")
  }
  const expectedRoots = {
    HOME: join(options.runRoot, "home"),
    OPENCODE_CONFIG_DIR: join(options.runRoot, "config"),
    XDG_CONFIG_HOME: join(options.runRoot, "config"),
    OPENCODE_DATA_DIR: join(options.runRoot, "data", "opencode"),
    XDG_DATA_HOME: join(options.runRoot, "data"),
    XDG_STATE_HOME: join(options.runRoot, "state"),
    XDG_CACHE_HOME: join(options.runRoot, "cache"),
    TMPDIR: join(options.runRoot, "tmp"),
    OPENCODE_BROWSER_PROFILE_ROOT: join(options.runRoot, "profile"),
  }
  if (Object.entries(expectedRoots).some(([name, path]) => process.env[name] !== path) ||
      process.env.PATH !== "/usr/bin:/bin" || process.env.OPENCODE_DISABLE_AUTOUPDATE !== "1" ||
      process.cwd() !== join(options.runRoot, "workspace")) {
    throw new TypeError("OpenCode process environment and workspace must be confined to runRoot")
  }
  if (typeof options.profileRoot !== "string" || options.profileRoot !== expectedRoots.OPENCODE_BROWSER_PROFILE_ROOT) {
    throw new TypeError("profileRoot must be the task-owned browser profile root")
  }
  if (typeof options.receiptPath !== "string" || !isAbsolute(options.receiptPath) || resolve(options.receiptPath) !== options.receiptPath) {
    throw new TypeError("receiptPath must be an absolute normalized path")
  }
  const receiptRelative = relative(options.runRoot, options.receiptPath)
  if (dirname(options.receiptPath) !== options.runRoot || !/^[A-Za-z0-9._-]{1,128}$/u.test(basename(options.receiptPath)) ||
      receiptRelative === "" || receiptRelative === ".." || receiptRelative.startsWith(`..${sep}`) || isAbsolute(receiptRelative)) {
    throw new TypeError("receiptPath is outside the task-owned benchmark root")
  }
  const { info: rootInfo } = await verifyOwnedRunRoot({
    runRoot: options.runRoot,
    runID: options.runID,
    scratchParent: options.scratchParent,
    approvedRoots: options.approvedScratchRoots,
  })
  for (const path of [...Object.values(expectedRoots), process.cwd()]) {
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== rootInfo.uid || (info.mode & 0o077) !== 0) {
      throw new TypeError("task-owned benchmark subdirectory is not private")
    }
  }
  if (options.mode === "catalog") return options as BaseOptions & { mode: "catalog" }
  return { ...options, ...parseMeasureOptions(value) } as BaseOptions & MeasureOptions
}

function instrumentManager(manager: ReturnType<typeof createBrowserManager>, currentCall: { value: null | { backendMethods: Array<{ method: string; wallMs: number }> } }) {
  return new Proxy(manager, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (!["start", "restart", "execute", "cancel"].includes(String(property)) || typeof value !== "function") {
        return typeof value === "function" ? value.bind(target) : value
      }
      return async (...args: unknown[]) => {
        const started = performance.now()
        try {
          return await value.apply(target, args)
        } finally {
          currentCall.value?.backendMethods.push({ method: String(property), wallMs: performance.now() - started })
        }
      }
    },
  })
}

function jsonSafeTool(tool: { id?: string; options?: { namespace?: string; codemode?: boolean }; input?: unknown }) {
  return {
    id: typeof tool.id === "string" ? tool.id : null,
    namespace: typeof tool.options?.namespace === "string" ? tool.options.namespace : null,
    codemode: tool.options?.codemode === true,
    schemaBytes: Buffer.byteLength(JSON.stringify(tool.input ?? null), "utf8"),
  }
}

export default Plugin.define({
  id: "computer-use-browser.isolated-model-benchmark",
  async setup(ctx) {
    const options = await checkedOptions(ctx.options)
    const writeInitialFile = async (value: unknown) => {
      const handle = await open(options.receiptPath, "wx", 0o600)
      try {
        const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8")
        await handle.writeFile(bytes)
        await handle.sync()
      } finally {
        await handle.close()
      }
    }
    if (options.mode === "catalog") {
      const [models, defaultModel, providers, integrations] = await Promise.all([
        ctx.model.list(), ctx.model.default(), ctx.provider.list(), ctx.integration.list(),
      ])
      const connectedIntegrations = connectedCredentialIntegrationIDs(integrations.data)
      const catalog = {
        schemaVersion: 1,
        directory: ctx.location.directory,
        projectID: ctx.location.project.id,
        defaultModel: defaultModel.data ? {
          providerID: defaultModel.data.providerID,
          id: defaultModel.data.id,
          variant: null,
        } : null,
        models: models.data.map((model) => ({
          providerID: model.providerID,
          id: model.id,
          enabled: model.enabled,
          capabilities: { tools: model.capabilities.tools },
          settings: { reasoningEffort: model.settings?.reasoningEffort ?? null },
          variants: model.variants.map((variant) => ({
            id: variant.id,
            settings: { reasoningEffort: variant.settings?.reasoningEffort ?? null },
          })),
        })),
        providers: providers.data.map((provider) => ({
          id: provider.id,
          activation: provider.activation,
          authReady: provider.integrationID
            ? connectedIntegrations.has(provider.integrationID)
            : ["ollama", "lmstudio"].includes(provider.id) && provider.activation !== "disabled",
        })),
      }
      await writeInitialFile(catalog)
      return
    }
    const guard = createAuthGuard()
    const credentialSafety = createCredentialSafety()
    const queue = createOwnerOperationQueue()
    const registeredIds = new Set<string>()
    const callState: { value: null | { backendMethods: Array<{ method: string; wallMs: number }> } } = { value: null }
    const manager = instrumentManager(createBrowserManager({ authGuard: guard }), callState)
    const receiptHandle = await open(options.receiptPath, "wx", 0o600)
    const receipt = {
      schemaVersion: 1,
      directory: ctx.location.directory,
      projectID: ctx.location.project.id,
      scenario: options.scenario,
      directTools: options.directTools,
      expectedModel: options.expectedModel,
      variantPolicy: options.variantPolicy,
      registeredTools: [] as ReturnType<typeof jsonSafeTool>[],
      dispatches: [] as Array<{ sessionID: string; model: MeasureOptions["expectedModel"]; visibleTools: string[]; exposure: ReturnType<typeof verifyDispatchExposure> }>,
      calls: [] as Array<{
        name: string; inputJsonUtf8Bytes: number; resultContentJsonUtf8Bytes: number;
        toolExecuteWallMs: number; backendMethods: Array<{ method: string; wallMs: number }>;
        snapshotHeadingObserved: boolean | null;
        outcome: "result" | "browser-error" | "tool-error"; startedAtMs: number; finishedAtMs: number;
      }>,
      permissionChecks: 0,
      failureToRecoveryMs: null as number | null,
      sessionIdle: false,
      promptToIdleMs: null as number | null,
      session: null as null | Record<string, unknown>,
      cleanup: { managerSessionsRemaining: null as number | null, ok: false },
      violations: [] as string[],
    }
    const startedAt = performance.now()
    let promptStartedAt: number | null = null
    let failureAt: number | null = null
    let ownTabID: string | null = null
    const writeReceipt = createReceiptWriter(receiptHandle)
    const saveReceipt = () => writeReceipt(receipt)

    try {
      const assertBenchmarkPermission = async (request: { sessionID: string; action: string; resources: string[] }) => {
        if (request.sessionID !== options.expectedSessionID || request.resources.length !== 1) {
          throw new Error("benchmark browser scope rejected")
        }
        receipt.permissionChecks += 1
        const resource = request.resources[0]
        const allowed = request.action === "browser_open"
          ? resource === `web/url/${encodeURIComponent(options.fixtureUrl)}`
          : request.action === "browser_read"
            ? ownTabID !== null && resource === `web/tab/${ownTabID}`
            : request.action === "browser_close"
              ? resource === `web/session/${options.expectedSessionID}`
              : false
        if (!allowed) throw new Error("benchmark permits only the exact loopback page, text snapshot, and task-owned close operation")
        await ctx.permission.assert(request as Parameters<typeof ctx.permission.assert>[0])
      }

      await ctx.tool.transform((editor) => {
        const serialized = withSerializedTools(editor, "web", {
          queue,
          authGuard: guard,
          allowDuringSignIn: new Set(["close"]),
          registeredIds,
        })
        registerBrowserTools(serialized, {
          assertPermission: assertBenchmarkPermission,
          dataDirectory: process.env.OPENCODE_DATA_DIR,
          authGuard: guard,
          credentialSafety,
          manager,
        })
      })

      await ctx.tool.transform((editor) => {
        const allowed = new Set([
          "execute",
          ...EXPECTED_BROWSER_TOOLS.map((name) => `web_${name}`),
        ])
        for (const tool of editor.list()) if (!allowed.has(tool.id)) editor.remove(tool.id)
      })

      await ctx.tool.transform((editor) => {
        applyCodemodeDefault(editor, { directTools: options.directTools, only: registeredIds })
      })

      await ctx.tool.transform((editor) => {
        for (const tool of editor.list()) {
          if (!registeredIds.has(tool.id)) continue
          editor.update(tool.id, (draft) => {
            const execute = draft.execute
            if (typeof execute !== "function") throw new TypeError(`registered tool ${tool.id} has no executable`)
            const name = tool.id.slice("web_".length)
            draft.execute = async (input, context) => {
              if (receipt.calls.length >= BENCHMARK_LIMITS.maxDispatches) {
                receipt.violations.push("browser tool-call count exceeded the hard bound")
                await saveReceipt()
                throw new Error("benchmark browser tool-call limit exceeded")
              }
              const metric = { backendMethods: [] as Array<{ method: string; wallMs: number }> }
              callState.value = metric
              const started = performance.now()
              try {
                const result = await execute(input, context)
                const text = (result as { content?: Array<{ type?: string; text?: string }> } | undefined)?.content
                  ?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") ?? ""
                const browserError = /^Browser error \(/u.test(text)
                const measured = makeToolCallMetric(name, input, result, performance.now() - started, metric.backendMethods)
                const finishedAtMs = performance.now() - startedAt
                const call = {
                  ...measured,
                  snapshotHeadingObserved: name === "snapshot" ? text.includes(`Benchmark ${options.scenario} fixture`) : null,
                  outcome: browserError ? "browser-error" as const : "result" as const,
                  startedAtMs: Number((started - startedAt).toFixed(3)),
                  finishedAtMs: Number(finishedAtMs.toFixed(3)),
                }
                if (name === "open" && !browserError) {
                  let opened: { tabId?: unknown; url?: unknown }
                  try {
                    opened = JSON.parse(text) as { tabId?: unknown; url?: unknown }
                  } catch {
                    receipt.violations.push("production open result was not valid JSON")
                    throw new Error("benchmark open result did not match the exact fixture")
                  }
                  if (typeof opened.tabId !== "string" || opened.url !== options.fixtureUrl) {
                    receipt.violations.push("production open result did not identify the exact synthetic fixture and owned tab")
                    throw new Error("benchmark open result did not match the exact fixture")
                  }
                  ownTabID = opened.tabId
                }
                receipt.calls.push(call)
                if (browserError) failureAt ??= performance.now()
                else if (name === "open" && failureAt !== null) {
                  receipt.failureToRecoveryMs ??= Number((performance.now() - failureAt).toFixed(3))
                  failureAt = null
                }
                await saveReceipt()
                return result
              } catch (error) {
                if (!(error instanceof Error && error.message === "benchmark open result did not match the exact fixture")) {
                  const measured = makeToolCallMetric(name, input, undefined, performance.now() - started, metric.backendMethods)
                  receipt.calls.push({
                    ...measured,
                    snapshotHeadingObserved: name === "snapshot" ? false : null,
                    outcome: "tool-error",
                    startedAtMs: Number((started - startedAt).toFixed(3)),
                    finishedAtMs: Number((performance.now() - startedAt).toFixed(3)),
                  })
                }
                await saveReceipt()
                throw error
              } finally {
                callState.value = null
              }
            }
          })
        }
      })

      const loaded = await ctx.tool.list()
      receipt.registeredTools = loaded.filter((tool) => registeredIds.has(tool.id)).map(jsonSafeTool)
      const registeredNames = receipt.registeredTools.map((tool) => tool.id?.slice("web_".length)).sort()
      if (JSON.stringify(registeredNames) !== JSON.stringify([...EXPECTED_BROWSER_TOOLS].sort())) {
        receipt.violations.push("loaded production browser tool registrations differ from the expected source set")
      }
      if (receipt.registeredTools.some((tool) => tool.codemode !== !options.directTools)) {
        receipt.violations.push("loaded production browser registration codemode options do not match the selected condition")
      }
      await saveReceipt()

      await ctx.session.hook("context", async (event) => {
        try {
          attestModelDispatch({
            directTools: options.directTools === true,
            registeredTools: receipt.registeredTools.map((tool) => ({ name: tool.id?.slice("web_".length), namespace: tool.namespace })),
            event,
            expectedSessionID: options.expectedSessionID,
            expectedModel: options.expectedModel,
            variantPolicy: options.variantPolicy,
            dispatches: receipt.dispatches,
          })
        } catch (error) {
          receipt.violations.push(error instanceof Error ? error.message : "model-dispatch attestation failed")
          await saveReceipt()
          throw error
        }
        await saveReceipt()
      })

      await ctx.session.hook("prompt", async (event) => {
        if (event.sessionID !== options.expectedSessionID) {
          receipt.violations.push("prompt hook observed a session outside the exact task-owned session")
          await saveReceipt()
          throw new Error("benchmark prompt session mismatch")
        }
        promptStartedAt ??= performance.now()
      })
    } catch (error) {
      await receiptHandle.close()
      throw error
    }

    let resolveIdle!: () => void
    const idleObserved = new Promise<void>((resolvePromise) => { resolveIdle = resolvePromise })
    const eventAbort = new AbortController()
    const eventTask = (async () => {
      for await (const event of ctx.event.subscribe({ signal: eventAbort.signal })) {
        const value = event as { type?: string; data?: { sessionID?: string } }
        if (value.type !== "session.idle" || value.data?.sessionID !== options.expectedSessionID || promptStartedAt === null) continue
        receipt.sessionIdle = true
        receipt.promptToIdleMs = promptStartedAt === null
          ? null
          : Number((performance.now() - promptStartedAt).toFixed(3))
        await saveReceipt()
        resolveIdle()
        return
      }
    })().catch(async (error: unknown) => {
      if (!eventAbort.signal.aborted) {
        receipt.violations.push(`native idle-event observation failed (${error instanceof Error ? error.name : "unknown error"})`)
        await saveReceipt().catch(() => undefined)
      }
    })

    return async () => {
      try {
        for (const session of manager.listSessions()) await manager.cancel(session.sessionId)
        receipt.cleanup.managerSessionsRemaining = manager.listSessions().length
        receipt.cleanup.ok = receipt.cleanup.managerSessionsRemaining === 0
        if (!receipt.cleanup.ok) receipt.violations.push("production browser manager retained a session after plugin cleanup")
        if (!receipt.sessionIdle) {
          await Promise.race([idleObserved, new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 1_000))])
        }
        eventAbort.abort()
        await eventTask
        if (!receipt.sessionIdle) receipt.violations.push("native session.idle event was not observed for the exact benchmark session")
        try {
          const session = await ctx.session.get({ sessionID: options.expectedSessionID })
          receipt.sessionIdle = receipt.sessionIdle && typeof session.time?.idle === "number"
          receipt.session = {
            id: session.id,
            projectID: session.projectID,
            location: { directory: session.location?.directory },
            model: session.model,
            tokens: session.tokens,
            cost: session.cost,
            time: session.time,
            outcome: session.outcome,
          }
          if (session.projectID !== ctx.location.project.id || session.location?.directory !== join(options.runRoot, "workspace")) {
            receipt.violations.push("native session metadata did not match the exact private project and workspace")
          }
        } catch (error) {
          receipt.violations.push(`native private session counters were unavailable (${error instanceof Error ? error.name : "unknown error"})`)
        }
        await saveReceipt()
      } finally {
        await receiptHandle.close()
      }
    }
  },
})
