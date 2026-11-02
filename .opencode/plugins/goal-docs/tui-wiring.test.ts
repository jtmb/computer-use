import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import test from "node:test"
import { sourceHandoffRequest } from "./source-handoff.ts"

const hooks = registerHooks({
  resolve(specifier, context, next) {
    const source = specifier === "solid-js"
      ? "export const createSignal = x => [() => x, v => { x = v }]; export const createEffect = f => f(); export const untrack = f => f()"
      : specifier === "@opencode/plugin/tui" ? "export const Plugin = { define: x => x }"
      : specifier === "@opencode/plugin/rpc" ? "export const Rpc = { define: x => x }" : undefined
    return source === undefined ? next(specifier, context) : { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
  },
})
let plugin: typeof import("./tui.ts").default
try { plugin = (await import("./tui.ts")).default } finally { hooks.deregister() }

function fixture(options: { collision?: boolean; inventoryFailure?: boolean; sendFailure?: boolean; unverifiedAdmission?: boolean; moveDuringSync?: boolean; selectedScope?: boolean; directory?: string; home?: boolean } = {}) {
  const prompts: Array<Record<string, unknown>> = []
  const notices: string[] = []
  const settingsCalls: Array<{ method: string; input: unknown; location: unknown }> = []
  let settings = { sessionID: "source", revision: 0, enabled: true, configuredEnabled: true, role: "worker", requested: null, notice: "Native compaction unchanged" }
  let route = options.home ? { type: "home", sessionID: "source" } : { type: "session", sessionID: "source" }
  let directory = options.directory ?? "/fixture/worktree"
  let layer: () => { commands: Array<{ run(): Promise<void> }> }
  let settingsLayer: typeof layer
  const cleanup = plugin.setup({
    location: { directory: "/fixture/worktree" }, options: { scope: options.selectedScope ? "selected-session" : "project" },
    keymap: { layer(factory: typeof layer) { if ((factory().commands[0] as { id?: string })?.id === "goal-docs.handoff.settings") settingsLayer = factory; else layer = factory } },
    data: {
      on() { return () => {} },
      location: { command: {
        invalidate() {},
        async sync() { if (options.inventoryFailure) throw new Error("inventory failed") },
        list: () => options.collision ? [{ name: "handoff" }] : [],
      } },
      session: {
        get: (id: string) => ({ id, location: { directory } }),
        async sync() { if (options.moveDuringSync) directory = "/other" },
      },
    },
    client: {
      rpc(definition: { id: string; methods: { read: { output: { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean } } } }) {
        assert.equal(definition.id, "computer-use.source-handoff-settings", "Legacy goal-transfer RPC must not run")
        const output = definition.methods.read.output
        assert.deepEqual(output.properties.configuredEnabled, { type: "boolean" }, "Configured policy is a required wire field")
        assert.ok(output.required.includes("configuredEnabled"))
        assert.equal(output.additionalProperties, false)
        return {
          async read(input: unknown, options: { location: unknown }) { settingsCalls.push({ method: "read", input, location: options.location }); return settings },
          async update(input: { enabled: boolean; revision: number }, options: { location: unknown }) {
            settingsCalls.push({ method: "update", input, location: options.location })
            settings = { ...settings, configuredEnabled: input.enabled, enabled: input.enabled && settings.role === "worker", revision: input.revision + 1 }; return settings
          },
        }
      },
      session: {
        async prompt(input: Record<string, unknown>) {
          if (options.sendFailure) throw new Error("send failed")
          prompts.push(input)
          return options.unverifiedAdmission ? {} : { id: "admitted", sessionID: input.sessionID }
        },
        create() { throw new Error("The current chat must compose the handoff first") },
      },
    },
    ui: { router: { current: () => route }, toast: { show: ({ message }: { message: string }) => notices.push(message) }, dialog: { async select() { return false } } },
  } as never) as () => void
  return { prompts, notices, settingsCalls, cleanup, commands: () => layer().commands, settings: () => settingsLayer().commands[0], home: () => { route = { type: "home", sessionID: "source" } } }
}

async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve() }

test("/handoff steers the current chat, without exports, goal RPCs, target creation or navigation", async () => {
  const state = fixture()
  try {
    await settle()
    assert.equal(state.commands().length, 1)
    await state.commands()[0].run()
    assert.equal(state.prompts.length, 1)
    assert.equal(state.prompts[0].sessionID, "source")
    assert.equal(state.prompts[0].delivery, "steer")
    assert.equal(state.prompts[0].resume, true)
    assert.equal(state.prompts[0].text, sourceHandoffRequest("source", "/fixture/worktree"))
    assert.ok(state.notices.some(x => x.startsWith("Asked this chat")))
  } finally { state.cleanup() }
})

for (const options of [{ collision: true }, { inventoryFailure: true }, { home: true }, { directory: "/other" }]) {
  test(`command unavailable for ${JSON.stringify(options)}`, async () => {
    const state = fixture(options)
    try { await settle(); assert.equal(state.commands().length, 0); assert.deepEqual(state.prompts, []) } finally { state.cleanup() }
  })
}

test("selected-session scope uses the selected worktree without requiring goal RPC companion", async () => {
  const state = fixture({ selectedScope: true, directory: "/other" })
  try {
    await settle(); await state.commands()[0].run()
    assert.equal(state.prompts[0].text, sourceHandoffRequest("source", "/other"))
  } finally { state.cleanup() }
})

test("changing worktrees during synchronization prevents sending", async () => {
  const state = fixture({ moveDuringSync: true })
  try { await settle(); await state.commands()[0].run(); assert.deepEqual(state.prompts, []) } finally { state.cleanup() }
})

test("send failure is reported without claiming admission", async () => {
  const state = fixture({ sendFailure: true })
  try {
    await settle(); await state.commands()[0].run()
    assert.ok(state.notices.includes("send failed"))
    assert.ok(!state.notices.some(x => x.startsWith("Asked this chat")))
  } finally { state.cleanup() }
})

test("missing admission identity is not reported as a successful request", async () => {
  const state = fixture({ unverifiedAdmission: true })
  try {
    await settle(); await state.commands()[0].run()
    assert.ok(state.notices.some(x => x.includes("admission could not be verified")))
    assert.ok(!state.notices.some(x => x.startsWith("Asked this chat")))
  } finally { state.cleanup() }
})

test("concurrent command invocations send only one request", async () => {
  const state = fixture()
  try {
    await settle()
    const command = state.commands()[0]
    await Promise.all([command.run(), command.run()])
    assert.equal(state.prompts.length, 1)
  } finally { state.cleanup() }
})

test("navigation away and plugin disposal prevent a stale command from sending", async () => {
  for (const action of ["home", "dispose"]) {
    const state = fixture()
    await settle()
    const command = state.commands()[0]
    if (action === "home") state.home()
    else state.cleanup()
    await command.run()
    assert.equal(state.prompts.length, 0)
    state.cleanup()
  }
})

test("continuation request includes the handoff link, immediate delivery and unchanged goal/approval boundaries", () => {
  const text = sourceHandoffRequest("source", "/fixture/worktree")
  for (const expected of ["actual conversation context", "Markdown link and exact local path", "HANDOFF.md", "very next action", "delivery:steer and resume:true", "Do not create, migrate, rebind, resume or replace goals", "Never include secrets", "Do not require /handoff_resume"]) assert.ok(text.includes(expected), expected)
})

test("actual TUI settings wiring uses the captured selected-worktree RPC; OFF does not remove manual /handoff", async () => {
  const state = fixture({ selectedScope: true, directory: "/other" })
  try {
    await settle()
    await state.settings().run()
    assert.deepEqual(state.settingsCalls.map(call => call.method), ["read", "update", "read"])
    assert.ok(state.settingsCalls.every(call => JSON.stringify(call.location) === '{"directory":"/other"}'))
    await state.commands()[0].run()
    assert.equal(state.prompts.length, 1)
    assert.equal(state.prompts[0].text, sourceHandoffRequest("source", "/other"))
  } finally { state.cleanup() }
})
