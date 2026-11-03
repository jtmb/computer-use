import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { defaultPolicy, policyViewSchema, receivePolicySchema, validatePolicy } from "../policy.ts"
import { coordinationSettingsContract } from "../rpc-contract.ts"
import { SETTINGS_COMMAND, registerSettings } from "../settings.ts"
import { makeService, type Dependencies } from "../service.ts"
import { createSettingsHost, type SettingsRpcMethods } from "../tui-host.ts"
import type { Context } from "@opencode/plugin/tui/context"

test("the native settings RPC reuses strict policy schemas and rejects authority-shaped fields", () => {
  const { methods } = coordinationSettingsContract
  assert.equal(coordinationSettingsContract.id, "computer-use.coordination-settings")
  assert.deepEqual(methods.read.input.required, ["sessionID"])
  assert.equal(methods.read.input.additionalProperties, false)
  assert.equal(methods.read.output, policyViewSchema)
  const [project, chat] = methods.update.input.anyOf
  for (const branch of [project, chat]) {
    assert.deepEqual(branch.required, ["sessionID", "target", "expectedRevision", "policy"])
    assert.equal(branch.additionalProperties, false)
  }
  assert.equal(project.properties.target.const, "project")
  assert.equal(project.properties.policy, receivePolicySchema)
  assert.equal(chat.properties.target.const, "chat")
  assert.deepEqual(chat.properties.policy, { anyOf: [receivePolicySchema, { type: "null" }] })

  for (const policy of [
    { ...defaultPolicy(), mode: "off" },
    defaultPolicy(),
    { ...defaultPolicy(), mode: "steer-running" },
    { ...defaultPolicy(), mode: "steer-running", idleWake: true },
  ]) assert.doesNotThrow(() => validatePolicy(policy))
  assert.throws(() => validatePolicy({ ...defaultPolicy(), idleWake: true }), /invalid recipient policy/)
  assert.throws(() => validatePolicy({ ...defaultPolicy(), authority: "human" }), /unexpected input field/)
})

test("the native TUI host binds the selected session and worktree to the registered RPC and propagates cancellation", async t => {
  const directory = await mkdtemp("/tmp/opencode/coordination-native-tui-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const scope = { directory, projectID: "native-tui-fixture" }
  const calls: { method: string; input: unknown; options: unknown }[] = []
  const dependencies: Dependencies = {
    scope,
    stateDirectory: path.join(directory, "state"),
    session: {
      get: async ({ sessionID }) => ({ id: sessionID, projectID: scope.projectID, location: { directory } }),
      prompt: async () => { throw new Error("settings RPC must never prompt a participant") },
    },
    assert: async input => { assert.equal(input.source, undefined, "operator RPC must not forge native tool provenance") },
  }
  const service = makeService(dependencies)
  const methods: SettingsRpcMethods = {
    read: async (input, options) => {
      calls.push({ method: "read", input, options })
      return service.settingsRead(input, options.signal)
    },
    update: async (input, options) => {
      calls.push({ method: "update", input, options })
      return service.settingsUpdate(input, options.signal)
    },
  }
  const definition = { id: coordinationSettingsContract.id }
  const client = {
    rpc(received: typeof definition) { assert.equal(received, definition); return methods },
  }
  let route: { type: "session"; sessionID: string } | { type: "home" } = { type: "session", sessionID: "ses_bob" }
  let command: { id: string; run(): Promise<void> } | undefined
  const toasts: { message?: string; variant?: string }[] = []
  const answers: unknown[] = ["chat", "steer-running", false, "ses_alice", 2, true]
  const context = {
    ui: {
      dialog: {
        select: async () => answers.shift(),
        prompt: async () => answers.shift(),
        confirm: async () => answers.shift(),
        alert: async () => {},
      },
      toast: { show: (value: { message?: string; variant?: string }) => { toasts.push(value) } },
      router: { current: () => route },
    },
    keymap: { layer(factory: () => { commands?: { id: string; run(): Promise<void> }[] }) {
      command = factory().commands?.find(item => item.id === SETTINGS_COMMAND)
    } },
    data: { session: { get: (sessionID: string) => ({ id: sessionID, location: { directory } }) } },
  } as unknown as Pick<Context, "ui" | "keymap" | "data">

  const host = createSettingsHost(context, client.rpc(definition))
  const selected = host.selected()!
  const cancelled = new AbortController()
  cancelled.abort(new Error("TUI unloaded"))
  await assert.rejects(host.read(selected, cancelled.signal), /TUI unloaded/)
  assert.equal((calls[0].options as { signal: AbortSignal }).signal, cancelled.signal)
  calls.length = 0

  const dispose = registerSettings(host)
  t.after(dispose)
  assert.ok(command)
  await command.run()

  assert.deepEqual(calls.map(call => call.method), ["read", "update", "read"])
  for (const call of calls) {
    const options = call.options as { location: { directory: string }; signal: AbortSignal }
    assert.deepEqual(options.location, { directory })
    assert.ok(options.signal instanceof AbortSignal)
  }
  assert.deepEqual(calls[1].input, { sessionID: "ses_bob", target: "chat", expectedRevision: 0,
    policy: { mode: "steer-running", idleWake: false, allowedSenders: ["ses_alice"], steerLimit: 2 } })
  assert.equal((await service.settingsRead({ sessionID: "ses_bob" })).effective.mode, "steer-running")
  assert.equal(toasts.at(-1)?.variant, "success")

  route = { type: "home" }
  assert.equal(host.selected(), undefined)
})
