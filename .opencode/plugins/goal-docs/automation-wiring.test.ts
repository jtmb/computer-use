import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import test from "node:test"

const modules = registerHooks({
  resolve(specifier, context, next) {
    const source = specifier === "@opencode/plugin" ? "export const Plugin = { define: value => value }"
      : specifier === "@opencode/plugin/rpc" ? "export const Rpc = { define: value => value }"
      : context.parentURL?.endsWith("/goal-docs/index.ts") && specifier === "./observer.ts" ? "export const startGoalObserver = () => () => {}"
      : context.parentURL?.endsWith("/goal-docs/index.ts") && specifier === "./state.ts" ? "export const resolveGoalPluginVersion = async () => '0.1.67'; export const readGoalStateForSession = async () => null"
      : undefined
    return source === undefined ? next(specifier, context) : { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
  },
})
let plugin: typeof import("./index.ts").default
try { plugin = (await import("./index.ts")).default } finally { modules.deregister() }

test("server registers only supported context/title hooks; settings OFF preserves normal context and compaction", async () => {
  const hooks = new Map<string, (event: { sessionID: string; agent: string; system: unknown[]; result?: string }) => Promise<void>>()
  const rpcs = new Map<string, Record<string, (input: unknown) => Promise<unknown>>>()
  const storage = new Map<string, unknown>()
  const disposed: string[] = []
  const updates: unknown[] = []
  const id = "ses_worker_0123456789abcdef0123456789abcdef"
  let title = "Fix controls — Goal handoff abcdef123456"
  const cleanup = await plugin.setup({
    location: { directory: "/worktree" },
    plugin: {},
    session: {
      async get(input: { sessionID: string }) { return input.sessionID === "ses_source" ? { id: "ses_source", projectID: "project", title: "Reviewer Session", location: { directory: "/worktree" } } :
        { id, projectID: "project", title, agent: "build", location: { directory: "/worktree" },
          metadata: { handoffOrigin: { role: "independent-worker", hash: "abcdef123456", sourceSessionID: "ses_source" } } } },
      async context() { return [{ id: "msg_usage", type: "assistant", time: { created: 1, completed: 2 }, tokens: { input: 500_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }] },
      async capabilities() { return { conditionalTitleUpdate: 1 } },
      async update(value: { sessionID: string; title: string; expectedTitle?: string }) {
        assert.equal(value.expectedTitle, title, "wired publication forwards its last-read title")
        updates.push({ sessionID: value.sessionID, title: value.title }); title = value.title
      },
      async hook(name: string, callback: (event: { sessionID: string; agent: string; system: unknown[] }) => Promise<void>) {
        hooks.set(name, callback); return { async dispose() { disposed.push(name) } }
      },
      create() { throw new Error("Policy must not create a session") },
      prompt() { throw new Error("Policy must not admit recursive prompts") },
      compact() { throw new Error("Policy must not replace compaction") },
      interrupt() { throw new Error("Policy must not interrupt execution") },
    },
    rpc: { async register(definition: { id: string }, handlers: Record<string, (input: unknown) => Promise<unknown>>) {
      rpcs.set(definition.id, handlers); return { async dispose() { disposed.push(definition.id) } }
    } },
    storage: { async get(key: string) { return structuredClone(storage.get(key)) }, async set(key: string, value: unknown) { storage.set(key, structuredClone(value)) } },
  } as never) as () => Promise<void>
  try {
    assert.deepEqual([...hooks.keys()], ["context", "title"])
    assert.ok(rpcs.has("computer-use.goal-docs"), "legacy exporter RPC remains separately registered")
    const settings = rpcs.get("computer-use.source-handoff-settings")! as unknown as Record<string, (input: unknown, context: { signal: AbortSignal }) => Promise<unknown>>
    const rpcContext = { signal: new AbortController().signal }
    const initial = await settings.read({ sessionID: id }, rpcContext) as { revision: number }
    const off = await settings.update({ sessionID: id, revision: initial.revision, enabled: false }, rpcContext) as { revision: number }
    const event = { sessionID: id, agent: "build", system: [{ type: "text", text: "Native instructions" }], result: undefined as string | undefined }
    await hooks.get("context")!(event)
    assert.deepEqual(event.system, [{ type: "text", text: "Native instructions" }])
    assert.equal(hooks.has("compaction"), false, "No interception of native compaction in either mode")
    await settings.update({ sessionID: id, revision: off.revision, enabled: true }, rpcContext)
    await hooks.get("context")!(event)
    assert.equal(event.system.length, 2)
    assert.ok(JSON.stringify(event.system[1]).includes("actual conversation context"))
    await hooks.get("context")!(event)
    assert.equal(event.system.length, 2, "no automatic repeat, even after another model boundary")
    await hooks.get("title")!(event)
    assert.equal(event.result, `Fix controls · ${id}`)
    assert.deepEqual(updates, [{ sessionID: id, title: `Fix controls · ${id}` }])
  } finally { await cleanup() }
  assert.ok(disposed.includes("context"))
  assert.ok(disposed.includes("title"))
  assert.ok(disposed.includes("computer-use.source-handoff-settings"))
})
