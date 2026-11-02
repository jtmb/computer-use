import assert from "node:assert/strict"
import test from "node:test"
import { checkedHandoffSettings, registerHandoffSettings } from "./automation-settings.ts"

function fixture() {
  let selection: { sessionID: string; location: { directory: string; workspaceID?: string } } | undefined = { sessionID: "source", location: { directory: "/worktree" } }
  let view = { sessionID: "source", enabled: true, configuredEnabled: true, revision: 0, role: "worker", requested: null as string | null, notice: "No pre-compaction interception" }
  let chosen: boolean | undefined = false
  let onSelect: (() => void) | undefined
  let onRead: (() => void) | undefined
  let malformed: unknown
  let failRead = false
  let failUpdate = false
  let savedPatch: Partial<typeof view> = {}
  let reads = 0
  const readPatches: Array<{ patch: Partial<typeof view>; applyAtRead: number }> = []
  let run: () => void | false | Promise<void>
  let command: Record<string, unknown> = {}
  const dialogs: unknown[] = [], writes: Array<{ sessionID: string; revision: number; enabled: boolean }> = [], notices: Array<{ message: string; variant?: string }> = []
  const calls: Array<{ kind: string; location: unknown; signal: AbortSignal }> = []
  const stop = registerHandoffSettings({
    selected: () => selection,
    keymap: { layer(factory) { command = factory().commands![0] as unknown as Record<string, unknown>; run = factory().commands![0].run } },
    toast: { show(notice) { notices.push(notice) } },
    dialog: { async select(options) { dialogs.push(options); onSelect?.(); return chosen as never } },
    async read(scope, signal) {
      calls.push({ kind: "read", location: structuredClone(scope.location), signal }); onRead?.()
      if (failRead) throw new Error("settings companion unavailable")
      if (malformed !== undefined) return malformed
      const index = reads++
      const found = readPatches.find(entry => entry.applyAtRead === index)
      return structuredClone(found ? { ...view, ...found.patch } : view)
    },
    async update(input, scope, signal) {
      calls.push({ kind: "update", location: structuredClone(scope.location), signal })
      writes.push(input)
      if (failUpdate) throw new Error("save admission uncertain")
      view = { ...view, configuredEnabled: input.enabled, enabled: input.enabled && view.role === "worker", revision: input.revision + 1 }
      return { ...view, ...savedPatch }
    },
  })
  return { stop, run: () => run(), dialogs, writes, notices, calls, command,
    choose: (value: typeof chosen) => { chosen = value },
    select: (value: typeof selection) => { selection = value },
    view: (patch: Partial<typeof view>) => { view = { ...view, ...patch } },
    onSelect: (fn: () => void) => { onSelect = fn }, onRead: (fn: () => void) => { onRead = fn },
    malformed: (value: unknown) => { malformed = value }, failRead: () => { failRead = true }, failUpdate: () => { failUpdate = true },
    saved: (patch: Partial<typeof view>) => { savedPatch = patch },
    readPatch: (patch: Partial<typeof view>, applyAtRead = 1) => { readPatches.push({ patch, applyAtRead }) },
  }
}

test("Ctrl+P settings command truthfully opens a per-chat selector and confirms OFF by readback", async () => {
  const f = fixture()
  try {
    assert.equal(f.command.title, "Handoff settings")
    assert.equal(f.command.palette, true)
    assert.equal(f.command.group, "Settings")
    assert.equal(f.command.bind, undefined)
    await f.run()
    assert.deepEqual(f.writes, [{ sessionID: "source", revision: 0, enabled: false }])
    assert.deepEqual(f.calls.map(call => call.kind), ["read", "update", "read"])
    assert.ok(f.calls.every(call => JSON.stringify(call.location) === '{"directory":"/worktree"}'))
    const success = f.notices.find(notice => notice.variant === "success")
    assert.ok(success?.message.includes("Native compaction and manual /handoff are unchanged"))
    assert.ok(success?.message.includes("Automatic handoff OFF"))
    assert.ok(success?.message.includes("confirmed configured OFF and effective OFF"))
    assert.ok(JSON.stringify(f.dialogs).includes("Stay in this chat with native compaction"))
  } finally { f.stop() }
})

test("reviewers and already-issued source requests cannot be enabled in the selector", async () => {
  for (const patch of [{ role: "reviewer", enabled: false }, { role: "unclassified", enabled: false }, { requested: "milestone" }]) {
    const f = fixture(); f.view(patch); f.choose(undefined)
    try {
      await f.run()
      const dialog = f.dialogs[0] as { options: Array<{ value: boolean; disabled?: boolean }> }
      assert.equal(dialog.options.find(option => option.value)?.disabled, true)
      assert.deepEqual(f.writes, [])
    } finally { f.stop() }
  }
})

test("a configured ON masked by role is shown as configured/effective OFF distinct and explicit OFF clears it", async () => {
  const f = fixture()
  f.view({ enabled: false, configuredEnabled: true, role: "reviewer" })
  f.choose(false)
  try {
    await f.run()
    const dialog = f.dialogs[0] as { current: boolean; title: string; options: Array<{ value: boolean; description: string }> }
    assert.equal(dialog.current, true, "the palette reflects the configured policy, not the masked effective value")
    assert.match(dialog.title, /configured ON · effective OFF \(ineligible role\)/)
    assert.match(dialog.options.find(option => !option.value)!.description, /clear the configured ON policy/)
    assert.deepEqual(f.writes, [{ sessionID: "source", revision: 0, enabled: false }])
    const success = f.notices.find(notice => notice.variant === "success")
    assert.ok(success?.message.includes("Automatic handoff OFF"))
    assert.ok(success?.message.includes("confirmed configured OFF and effective OFF"))
  } finally { f.stop() }
})

test("a suspended configured ON is not presented as an effective ON or as a stored OFF", async () => {
  const f = fixture()
  f.view({ enabled: false, configuredEnabled: true, role: "worker" })
  f.choose(undefined)
  try {
    await f.run()
    const dialog = f.dialogs[0] as { current: boolean; title: string; options: Array<{ value: boolean; disabled?: boolean; description: string }> }
    assert.equal(dialog.current, true)
    assert.match(dialog.title, /configured ON · effective OFF \(suspended\)/)
    const on = dialog.options.find(option => option.value)!
    assert.equal(on.disabled, true)
    assert.match(on.description, /inactive after an error/)
    assert.deepEqual(f.writes, [])
  } finally { f.stop() }
})

test("an explicit OFF still saves and confirms OFF when configured and effective values are already false", async () => {
  const f = fixture()
  f.view({ configuredEnabled: false, enabled: false })
  f.choose(false)
  try {
    await f.run()
    assert.deepEqual(f.writes, [{ sessionID: "source", revision: 0, enabled: false }])
    assert.deepEqual(f.calls.map(call => call.kind), ["read", "update", "read"])
    assert.ok(f.notices.some(notice => notice.variant === "success" && notice.message.includes("configured OFF and effective OFF")))
  } finally { f.stop() }
})

test("a request latched while the selector is open prevents stale re-enablement", async () => {
  const f = fixture()
  f.view({ enabled: false, configuredEnabled: false })
  f.choose(true)
  f.onSelect(() => f.view({ requested: "milestone" }))
  try {
    await f.run()
    assert.deepEqual(f.calls.map(call => call.kind), ["read", "read"])
    assert.deepEqual(f.writes, [])
    assert.ok(f.notices.some(notice => notice.variant === "error" && notice.message.includes("request was already issued")))
  } finally { f.stop() }
})

test("a masked configured change with an unchanged effective flag still invalidates the stale dialog", async () => {
  const f = fixture()
  f.view({ enabled: false, configuredEnabled: false })
  f.choose(true)
  f.onSelect(() => f.view({ configuredEnabled: true }))
  try {
    await f.run()
    assert.deepEqual(f.calls.map(call => call.kind), ["read", "read"])
    assert.deepEqual(f.writes, [])
    assert.ok(f.notices.some(notice => notice.variant === "error" && notice.message.includes("settings changed")))
  } finally { f.stop() }
})

test("dialog cancellation, same configured value and no selected session never write", async () => {
  for (const mode of ["cancel", "unchanged", "home"]) {
    const f = fixture()
    if (mode === "cancel") f.choose(undefined)
    if (mode === "unchanged") f.choose(true)
    if (mode === "home") f.select(undefined)
    try { await f.run(); assert.deepEqual(f.writes, []) } finally { f.stop() }
  }
})

test("selection/workspace changes at read or dialog boundaries never apply to another chat", async () => {
  for (const stage of ["read", "select"]) {
    const f = fixture()
    const move = () => f.select({ sessionID: "source", location: { directory: "/worktree", workspaceID: "other" } })
    if (stage === "read") f.onRead(move)
    else f.onSelect(move)
    try { await f.run(); assert.deepEqual(f.writes, []); assert.ok(f.notices.some(notice => notice.variant === "error")) } finally { f.stop() }
  }
})

test("foreign, legacy/mixed-version and inconsistent settings fail visibly without saving", async () => {
  const base = { sessionID: "source", revision: 0, role: "worker", requested: null, notice: "notice" }
  for (const value of [{ sessionID: "other" }, {}, { enabled: "yes" }, null,
    { ...base, enabled: true }, { ...base, enabled: false, configuredEnabled: "no" },
    { ...base, enabled: true, configuredEnabled: false }, { ...base, role: "reviewer", enabled: true, configuredEnabled: true }]) {
    assert.throws(() => checkedHandoffSettings(value, "source"))
  }
  for (const value of [
    { ...base, enabled: true },
    { ...base, enabled: true, configuredEnabled: false },
    { ...base, role: "reviewer", enabled: true, configuredEnabled: true },
  ]) {
    const f = fixture(); f.malformed(value)
    try {
      await f.run()
      assert.equal(f.dialogs.length, 0)
      assert.deepEqual(f.writes, [])
      assert.ok(f.notices.some(notice => notice.variant === "error"))
      assert.ok(!f.notices.some(notice => notice.variant === "success"))
    } finally { f.stop() }
  }
  const f = fixture(); f.failRead()
  try { await f.run(); assert.deepEqual(f.writes, []); assert.equal(f.dialogs.length, 0); assert.ok(f.notices.some(notice => notice.message === "settings companion unavailable")) } finally { f.stop() }
})

test("an uncertain save is not retried or reported successful", async () => {
  const f = fixture(); f.failUpdate()
  try {
    await f.run()
    assert.equal(f.writes.length, 1)
    assert.ok(f.notices.some(notice => notice.message === "save admission uncertain"))
    assert.ok(!f.notices.some(notice => notice.variant === "success"))
  } finally { f.stop() }
})

test("JSON role arrays cannot be coerced into a valid settings role or reach a save", async () => {
  for (const role of [["worker"], ["reviewer"], ["unclassified"]]) {
    const value = { sessionID: "source", revision: 0, role, requested: null,
      notice: "notice", enabled: false, configuredEnabled: true }
    assert.throws(() => checkedHandoffSettings(value, "source"))
    const f = fixture(); f.malformed(value)
    try {
      await f.run()
      assert.equal(f.dialogs.length, 0)
      assert.deepEqual(f.writes, [])
      assert.ok(f.notices.some(notice => notice.variant === "error"))
      assert.ok(!f.notices.some(notice => notice.variant === "success"))
    } finally { f.stop() }
  }
})

test("a save that does not confirm the configured and effective values is not reported successful", async () => {
  for (const patch of [{ configuredEnabled: true }, { enabled: true }, { revision: 7 }]) {
    const f = fixture(); f.choose(false); f.saved(patch)
    try {
      await f.run()
      assert.equal(f.writes.length, 1)
      assert.ok(f.notices.some(notice => notice.variant === "error"))
      assert.ok(!f.notices.some(notice => notice.variant === "success"))
    } finally { f.stop() }
  }
})

test("a readback that disagrees with the saved configured or effective value is rejected", async () => {
  for (const patch of [{ configuredEnabled: true }, { revision: 9 }, { requested: "latched" }]) {
    const f = fixture(); f.choose(false); f.readPatch(patch)
    try {
      await f.run()
      assert.equal(f.writes.length, 1)
      assert.ok(f.notices.some(notice => notice.variant === "error" && notice.message.includes("after save")))
      assert.ok(!f.notices.some(notice => notice.variant === "success"))
    } finally { f.stop() }
  }
})

test("concurrent settings opens deduplicate; disposal cancels request signals and stale dialog writes", async () => {
  const f = fixture(); f.onSelect(f.stop)
  await Promise.all([f.run(), f.run()])
  assert.equal(f.dialogs.length, 1)
  assert.deepEqual(f.writes, [])
  assert.equal(f.calls[0].signal.aborted, true)
  await f.run()
  assert.equal(f.dialogs.length, 1)
})
