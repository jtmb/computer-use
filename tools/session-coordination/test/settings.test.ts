import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import type { DialogSelectOptions, KeymapLayer } from "@opencode/plugin/tui/context"
import { makeService, type Dependencies } from "../service.ts"
import { defaultPolicy } from "../policy.ts"
import { registerSettings, SETTINGS_COMMAND, type Selection, type SettingsHost } from "../settings.ts"

async function fixture(t: test.TestContext, answers: unknown[] = []) {
  const directory = await mkdtemp("/tmp/opencode/coordination-settings-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const deps: Dependencies = { scope: { directory, projectID: "settings-fixture" }, stateDirectory: path.join(directory, "state"),
    session: { get: async ({ sessionID }) => ({ id: sessionID, projectID: "settings-fixture", location: { directory } }), prompt: async () => { throw new Error("settings must never prompt a model") } },
    assert: async () => {} }
  const service = makeService(deps), toasts: { message: string; variant?: string }[] = [], dialogs: string[] = [], writes: unknown[] = []
  let selected: Selection | undefined = { sessionID: "ses_bob", directory }
  let layer: KeymapLayer | undefined, beforeConfirm = () => {}
  const host: SettingsHost = {
    selected: () => selected, keymap: { layer: factory => { layer = factory(); assert.deepEqual(factory(), layer, "keymap factory is pure") } },
    dialog: { select: async <Value>(options: DialogSelectOptions<Value>) => { dialogs.push(options.title); return answers.shift() as Value | undefined },
      prompt: async options => { dialogs.push(options.title); return answers.shift() as string | undefined },
      confirm: async options => { dialogs.push(options.title); beforeConfirm(); return answers.shift() as boolean | undefined }, alert: async options => { dialogs.push(options.message) } },
    toast: { show: value => { toasts.push(value) } },
    read: (selection, signal) => service.settingsRead({ sessionID: selection.sessionID }, signal),
    update: (input, _selection, signal) => { writes.push(structuredClone(input)); return service.settingsUpdate(input, signal) },
  }
  const dispose = registerSettings(host); t.after(dispose)
  const command = layer?.commands?.find(item => item.id === SETTINGS_COMMAND)
  assert.ok(command)
  return { service, deps, host, toasts, dialogs, writes, command, dispose,
    select: (value: Selection | undefined) => { selected = value }, beforeConfirm: (action: () => void) => { beforeConfirm = action } }
}
test("Ctrl+P palette command saves server-backed chat override and reads back effective policy without binding over Ctrl+P", async t => {
  const f = await fixture(t, ["chat", "steer-running", true, "ses_alice", 3, true])
  assert.equal(f.command.title, "Cross-session communication settings"); assert.equal(f.command.palette, true)
  assert.equal(f.command.bind, undefined, "do not replace built-in palette navigation")
  await f.command.run()
  assert.deepEqual(f.writes, [{ sessionID: "ses_bob", target: "chat", expectedRevision: 0,
    policy: { mode: "steer-running", idleWake: true, allowedSenders: ["ses_alice"], steerLimit: 3 } }])
  const readback = await makeService(f.deps).settingsRead({ sessionID: "ses_bob" })
  assert.equal(readback.inherited, false); assert.equal(readback.revision, 1); assert.equal(readback.effective.idleWake, true)
  assert.equal(f.toasts.at(-1)?.variant, "success")
  assert.match(f.toasts.at(-1)!.message, /Saved revision 1/)
})
test("project policy and inherit actions preserve exact targets and never mutate unrelated chat overrides", async t => {
  const f = await fixture(t, ["project", "off", "*", 4, true])
  await f.service.settingsUpdate({ sessionID: "ses_alice", target: "chat", expectedRevision: 0, policy: defaultPolicy() })
  await f.command.run()
  assert.equal((f.writes[0] as { target: string }).target, "project")
  assert.equal((await f.service.settingsRead({ sessionID: "ses_bob" })).effective.mode, "off")
  assert.equal((await f.service.settingsRead({ sessionID: "ses_alice" })).effective.mode, "inbox-only")
  const g = await fixture(t, ["inherit", true])
  await g.service.settingsUpdate({ sessionID: "ses_bob", target: "chat", expectedRevision: 0, policy: { ...defaultPolicy(), mode: "off" } })
  await g.command.run()
  assert.equal((await g.service.settingsRead({ sessionID: "ses_bob" })).inherited, true)
  assert.equal((g.writes[0] as { policy: unknown }).policy, null)
})
test("cancel at every wizard boundary performs no policy write", async t => {
  const steps: unknown[] = ["chat", "steer-running", false, "*", 4, true]
  for (let stop = 0; stop < steps.length; stop++) {
    const f = await fixture(t, steps.slice(0, stop))
    await f.command.run()
    assert.deepEqual(f.writes, [], `cancel at step ${stop}`)
    assert.equal((await f.service.store.read()).policies, undefined)
    assert.equal(f.toasts.length, 0)
  }
})
test("no selected session or missing server companion cannot write or activate anything", async t => {
  const f = await fixture(t); f.select(undefined)
  await f.command.run(); assert.equal(f.dialogs.length, 0); assert.equal(f.writes.length, 0)
  assert.equal(f.toasts[0].variant, "warning")
  const g = await fixture(t)
  g.host.read = async () => { throw new Error("RPC companion unavailable") }
  await g.command.run()
  assert.deepEqual(g.writes, []); assert.equal(g.dialogs.length, 0); assert.match(g.toasts[0].message, /companion unavailable/)
})
test("changed selected route and unload during dialog prevent delayed writes", async t => {
  const f = await fixture(t, ["chat", "inbox-only", "", 1, true])
  f.beforeConfirm(() => f.select({ sessionID: "ses_carol", directory: f.deps.scope.directory }))
  await f.command.run(); assert.equal(f.writes.length, 0); assert.match(f.toasts[0].message, /Selected chat\/location changed/)
  const g = await fixture(t, ["inherit", true]); g.beforeConfirm(g.dispose)
  await g.command.run(); assert.equal(g.writes.length, 0); assert.equal(g.toasts.length, 0)
})
test("revision conflict and moved native session refuse save without automatic retry", async t => {
  const f = await fixture(t, ["inherit", true])
  f.beforeConfirm(() => { f.host.update = async (input, selected, signal) => {
    await f.service.settingsUpdate({ ...input, target: "project", policy: defaultPolicy() }, signal)
    f.writes.push(input)
    return f.service.settingsUpdate(input, signal)
  } })
  await f.command.run(); assert.equal(f.writes.length, 1); assert.match(f.toasts[0].message, /revision conflict/)
  assert.equal((await f.service.store.read()).policies!.revision, 1)
  const g = await fixture(t, ["inherit", true])
  g.beforeConfirm(() => { g.deps.session.get = async ({ sessionID }) => ({ id: sessionID, projectID: "moved", location: { directory: g.deps.scope.directory } }) })
  await g.command.run(); assert.match(g.toasts[0].message, /outside/); assert.equal((await g.service.store.read()).policies, undefined)
})
test("invalid allowlist and native denial are surfaced and do not weaken settings permissions", async t => {
  const f = await fixture(t, ["chat", "steer-running", false, "not-a-session", 4, true])
  await f.command.run(); assert.deepEqual(f.writes, []); assert.match(f.toasts[0].message, /invalid recipient policy/)
  const g = await fixture(t, ["inherit", true])
  g.deps.assert = async input => { if (input.action === "edit") throw new Error("native edit deny") }
  await g.command.run(); assert.match(g.toasts[0].message, /native edit deny/); assert.equal((await g.service.store.read()).policies, undefined)
})
