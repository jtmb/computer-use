import assert from "node:assert/strict"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createComponent, createRoot, createSignal } from "solid-js"
import { RGBA, setRenderLibPath } from "@opentui/core"
import renderLibrary from "@opentui/core-linux-x64"
import { testRender } from "@opentui/solid"
import { Host } from "./host.jsx"

const source = process.env.OPENCODE_NATIVE_SOURCE
const state = await import(pathToFileURL(`${source}/packages/tui/src/component/prompt/orchestration-state.ts`))
const { PromptMetadataRow } = await import(pathToFileURL(`${source}/packages/tui/src/component/prompt/metadata.tsx`))
const { usePromptOrchestration } = await import(pathToFileURL(`${source}/packages/tui/src/component/prompt/orchestration.tsx`))
const tick = () => new Promise(resolve => setImmediate(resolve))
const settle = async () => { for (let index = 0; index < 5; index++) await tick() }
let fixtureCount = 0
setRenderLibPath(renderLibrary)

test("actual state code preserves exact per-chat settings and excludes inherited child locks", () => {
  for (const method of state.orchestrationMethods) {
    const value = state.orchestrationValue(method.id, "ses_a")
    assert.equal(state.readOrchestration([{ key: state.ORCHESTRATION_KEY, value }], "ses_a").id, method.id)
    assert.equal(state.readOrchestration([{ key: state.ORCHESTRATION_KEY, value }], "ses_child"), undefined)
    assert.match(value.instruction, /does not broaden the task/)
    assert.match(value.instruction, /until the user explicitly changes/)
    const reordered = Object.fromEntries(Object.entries(value).reverse())
    assert.equal(state.readOrchestration([{ key: state.ORCHESTRATION_KEY, value: reordered }], "ses_a").id, method.id)
  }
  assert.equal(state.readOrchestration([], "ses_a"), undefined)
  for (const value of [null, [], {}, "background", { ...state.orchestrationValue("solo", "ses_a"), instruction: "spawn anyway" }]) {
    assert.throws(() => state.readOrchestration([{ key: state.ORCHESTRATION_KEY, value }], "ses_a"))
  }
  const entry = { key: state.ORCHESTRATION_KEY, value: state.orchestrationValue("solo", "ses_a") }
  assert.throws(() => state.readOrchestration([entry, entry], "ses_a"))
  assert.equal(state.cycleOrchestration("foreground", 1).id, "solo")
  assert.equal(state.cycleOrchestration("solo", -1).id, "foreground")
})

function fixture(options = {}) {
  const initial = options.id ?? `ses_fixture_${++fixtureCount}`
  const store = options.store ?? new Map()
  const calls = []
  const lists = []
  const commands = []
  const notices = []
  let renderMenu
  const read = options.read ?? (async ({ sessionID }) => store.has(sessionID)
    ? [{ key: state.ORCHESTRATION_KEY, value: store.get(sessionID) }]
    : [])
  const host = {
    commands,
    client: { api: { session: { instructions: { entry: {
      list: async (input) => { lists.push(input.sessionID); return read(input) },
      put: async (input) => { calls.push(input); store.set(input.sessionID, input.value) },
    } } } } },
    dialog: { replace: render => { renderMenu = render }, clear() {} },
    toast: { show: value => notices.push(value) },
  }
  const [session, changeSession] = createSignal(initial)
  let controller, dispose
  createRoot(stop => {
    dispose = stop
    createComponent(Host.Provider, { value: host, get children() {
      controller = usePromptOrchestration(session)
      return null
    } })
  })
  return { id: initial, store, host, calls, lists, commands, notices, changeSession, controller, dispose, menu: () => renderMenu }
}

test("a prompt mount reads and shows the persisted method without user action", async () => {
  const id = `ses_hydrated_${++fixtureCount}`
  const store = new Map([[id, state.orchestrationValue("background", id)]])
  const f = fixture({ id, store })
  try {
    await settle()
    assert.equal(f.controller.label(), "Background")
    assert.deepEqual(f.lists, [id])
    assert.equal(f.calls.length, 0)
  } finally { f.dispose() }
})

test("actual controller saves only the explicit instruction key and reads it back", async () => {
  const f = fixture()
  try {
    await settle()
    assert.equal(f.controller.label(), "Orchestration")
    assert.deepEqual(f.lists, [f.id], "mount reads the durable entry")
    f.controller.cycle(1)
    await settle()
    assert.equal(f.controller.label(), "Solo")
    assert.deepEqual(f.lists, [f.id, f.id, f.id], "fresh cycle read, then save readback")
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].sessionID, f.id)
    assert.equal(f.calls[0].key, "orchestration-method")
    assert.deepEqual(f.calls[0].value, state.orchestrationValue("solo", f.id))
    assert.equal(f.commands[0].commands[0].slash.name, "orchestration")
    f.commands[0].commands[0].run()
    assert.equal(typeof f.menu(), "function")
  } finally { f.dispose() }
})

test("a fresh controller gets the durable choice from the entry, not a module hint", async () => {
  const store = new Map()
  const first = fixture({ store })
  try {
    await settle()
    first.controller.cycle(1)
    await settle()
    assert.equal(first.controller.label(), "Solo")
  } finally { first.dispose() }
  const second = fixture({ id: first.id, store })
  try {
    await settle()
    assert.equal(second.controller.label(), "Solo")
    assert.deepEqual(second.lists, [first.id], "the new controller reads the stored entry")
  } finally { second.dispose() }
})

test("chat navigation reads each exact chat and never carries a method across", async () => {
  const first = `ses_nav_a_${++fixtureCount}`
  const second = `ses_nav_b_${++fixtureCount}`
  const store = new Map([
    [first, state.orchestrationValue("solo", first)],
    [second, state.orchestrationValue("foreground", second)],
  ])
  const f = fixture({ id: first, store })
  try {
    await settle()
    assert.equal(f.controller.label(), "Solo")
    f.changeSession(second)
    await settle()
    assert.equal(f.controller.label(), "Foreground")
    assert.deepEqual(f.lists, [first, second])
  } finally { f.dispose() }
})

test("an external change after a read is honored before cycling", async () => {
  const id = `ses_external_${++fixtureCount}`
  const store = new Map([[id, state.orchestrationValue("solo", id)]])
  const f = fixture({ id, store })
  try {
    await settle()
    assert.equal(f.controller.label(), "Solo")
    store.set(id, state.orchestrationValue("foreground", id))
    f.controller.cycle(1)
    await settle()
    assert.equal(f.lists.length, 3, "cycle re-reads the entry before writing")
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].value.method, "solo", "foreground + 1 wraps to solo, not the stale next value")
    assert.equal(f.store.get(id).method, "solo")
  } finally { f.dispose() }
})

test("a failed read is unconfirmed and cannot cycle from a stale method", async () => {
  const id = `ses_readfail_${++fixtureCount}`
  const store = new Map([[id, state.orchestrationValue("solo", id)]])
  const f = fixture({ id, store })
  try {
    await settle()
    assert.equal(f.controller.label(), "Solo")
    f.host.client.api.session.instructions.entry.list = async () => { throw new Error("synthetic read rejection") }
    f.controller.cycle(1)
    await settle()
    assert.equal(f.controller.label(), "Orchestration!")
    assert.equal(f.calls.length, 0)
    assert.equal(f.store.get(id).method, "solo")
  } finally { f.dispose() }
})

test("late reads cannot put another chat's selection into the current chat", async () => {
  let complete
  const first = `ses_late_a_${++fixtureCount}`
  const second = `ses_late_b_${++fixtureCount}`
  const store = new Map([[second, state.orchestrationValue("background", second)]])
  const f = fixture({
    id: first,
    store,
    read: ({ sessionID }) => sessionID === first
      ? new Promise(resolve => { complete = resolve })
      : Promise.resolve([{ key: state.ORCHESTRATION_KEY, value: store.get(sessionID) }]),
  })
  try {
    await settle()
    f.changeSession(second)
    await settle()
    assert.equal(f.controller.label(), "Background")
    complete([{ key: state.ORCHESTRATION_KEY, value: state.orchestrationValue("foreground", first) }])
    await settle()
    assert.equal(f.controller.label(), "Background", "the late first-chat read is ignored")
    assert.deepEqual(f.lists, [first, second])
  } finally { f.dispose() }
})

test("the chooser names the supported methods and saves its explicit selection", async () => {
  const f = fixture()
  let closeMenu
  try {
    await settle()
    f.store.set(f.id, state.orchestrationValue("foreground", f.id))
    f.controller.open()
    await settle()
    createRoot(stop => {
      closeMenu = stop
      createComponent(Host.Provider, { value: f.host, get children() { return f.menu()() } })
    })
    const menu = f.host.selectDialog
    assert.equal(menu.title, "Orchestration method")
    assert.equal(menu.current, "foreground", "opening re-reads the entry")
    assert.deepEqual(menu.options.map(item => item.title), ["Solo", "Background subagents", "Foreground subagent"])
    menu.onSelect(menu.options[1])
    await settle()
    assert.equal(f.controller.label(), "Background")
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].value.method, "background")
  } finally { closeMenu?.(); f.dispose() }
})

test("a rejected save is not displayed as a successful lock", async () => {
  const f = fixture()
  try {
    await settle()
    f.host.client.api.session.instructions.entry.put = async () => { throw new Error("synthetic native rejection") }
    f.controller.cycle(1)
    await settle()
    assert.equal(f.controller.label(), "Orchestration!")
    assert.equal(f.notices[0].variant, "error")
    assert.equal(f.store.size, 0)
  } finally { f.dispose() }
})

test("a save admitted for the old chat never becomes a write or selection for a new chat", async () => {
  const f = fixture()
  let finish
  try {
    await settle()
    f.host.client.api.session.instructions.entry.put = input => {
      f.calls.push(input)
      return new Promise(resolve => { finish = resolve })
    }
    f.controller.cycle(1)
    await settle()
    f.changeSession(f.id + "-next")
    await settle()
    finish()
    await settle()
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].sessionID, f.id)
    assert.equal(f.controller.label(), "Orchestration")
    assert.equal(f.notices.length, 0)
  } finally { f.dispose() }
})

test("Home does not guess a chat or write an inherited setting", async () => {
  const f = fixture()
  try {
    f.changeSession(undefined)
    await settle()
    f.controller.open()
    f.controller.cycle(1)
    await settle()
    assert.equal(f.calls.length, 0)
    assert.equal(f.notices[0].variant, "warning")
  } finally { f.dispose() }
})

for (const width of [44, 80, 120]) {
  test(`real production metadata row adds only an inline control at ${width} columns`, async () => {
    const color = RGBA.fromInts(180, 180, 180)
    const host = { theme: { text: { muted: color, base: color, action: { primary: { base: color } }, feedback: { warning: { base: color } } } } }
    const [enabled, setEnabled] = createSignal(false)
    let clicks = 0
    const ui = await testRender(() => createComponent(Host.Provider, { value: host, get children() {
      return createComponent(PromptMetadataRow, {
        mode: "normal", agent: "Build", auto: true, model: "GPT-6.1 Sol", provider: "OpenAI", variant: "high",
        muted: false, highlight: color, agentAlpha: 1, modelAlpha: 1, variantAlpha: 1,
        get orchestration() { return enabled() ? { label: "Background", busy: false, open: () => clicks++, cycle() {} } : undefined },
      })
    } }), { width, height: 3 })
    try {
      await ui.renderOnce()
      const before = ui.captureCharFrame()
      assert.match(before, /Build.*GPT/)
      assert.doesNotMatch(before, /Background/)
      setEnabled(true)
      await ui.renderOnce()
      const after = ui.captureCharFrame()
      assert.match(after, /Build.*Background.*GPT/)
      assert.match(after, /high/)
      assert.equal(after.split("\n").filter(line => line.trim()).length, 1)
      if (width >= 80) {
        const index = after.indexOf("Background")
        await ui.mockMouse.click(index + 1, 0)
        assert.equal(clicks, 1)
      }
      setEnabled(false)
      await ui.renderOnce()
      assert.equal(ui.captureCharFrame(), before, "removing the added control restores the native row exactly")
    } finally { ui.renderer.destroy() }
  })
}

test("production metadata row forwards real click and wheel events to the selector", async () => {
  const color = RGBA.fromInts(180, 180, 180)
  const host = { theme: { text: { muted: color, base: color, action: { primary: { base: color } }, feedback: { warning: { base: color } } } } }
  const [busy, setBusy] = createSignal(false)
  let clicks = 0
  const cycles = []
  const ui = await testRender(() => createComponent(Host.Provider, { value: host, get children() {
    return createComponent(PromptMetadataRow, {
      mode: "normal", agent: "Build", auto: true, model: "GPT-6.1 Sol", provider: "OpenAI", variant: "high",
      muted: false, highlight: color, agentAlpha: 1, modelAlpha: 1, variantAlpha: 1,
      orchestration: { label: "Solo", get busy() { return busy() }, open: () => clicks++, cycle: direction => cycles.push(direction) },
    })
  } }), { width: 80, height: 3 })
  try {
    await ui.renderOnce()
    const index = ui.captureCharFrame().indexOf("Solo")
    await ui.mockMouse.click(index + 1, 0)
    assert.equal(clicks, 1)
    await ui.mockMouse.scroll(index + 1, 0, "down")
    assert.deepEqual(cycles, [1])
    await ui.mockMouse.scroll(index + 1, 0, "up")
    assert.deepEqual(cycles, [1, -1])
    setBusy(true)
    await ui.renderOnce()
    await ui.mockMouse.scroll(index + 1, 0, "down")
    assert.deepEqual(cycles, [1, -1], "a busy selector ignores wheel changes")
  } finally { ui.renderer.destroy() }
})
