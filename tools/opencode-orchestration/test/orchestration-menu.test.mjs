import assert from "node:assert/strict"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createComponent, createRoot } from "solid-js"
import { RGBA, setRenderLibPath } from "@opentui/core"
import renderLibrary from "@opentui/core-linux-x64"
import { testRender } from "@opentui/solid"
import { Host } from "./host.jsx"

// OPENCODE_REAL_DIALOG=1 keeps packages/tui/src/ui/dialog-select.tsx real; only its
// layout/config/theme collaborators come from this test host.
if (process.env.OPENCODE_REAL_DIALOG !== "1")
  throw new Error("run this file with OPENCODE_REAL_DIALOG=1 (see npm run test:menu)")
const source = process.env.OPENCODE_NATIVE_SOURCE
const state = await import(pathToFileURL(`${source}/packages/tui/src/component/prompt/orchestration-state.ts`))
const { usePromptOrchestration } = await import(pathToFileURL(`${source}/packages/tui/src/component/prompt/orchestration.tsx`))
const tick = () => new Promise(resolve => setImmediate(resolve))
setRenderLibPath(renderLibrary)

const color = RGBA.fromInts(180, 180, 180)
const dialogTheme = {
  text: {
    base: color, muted: color, faint: color, formfield: { focused: color, selected: color },
    action: { primary: { focused: color, base: color, disabled: color }, secondary: { focused: color } },
  },
  background: {
    raised: { high: color }, formfield: { focused: color },
    action: { primary: { focused: color, hovered: color }, secondary: { hovered: color } },
  },
  hue: { accent: { 200: color } },
  surface: () => dialogTheme,
}

function fixture() {
  const entries = new Map()
  const calls = []
  const commands = []
  const notices = []
  let renderMenu
  const host = {
    theme: dialogTheme,
    config: { data: { cursor: "block", scroll: { acceleration: true, speed: 1 } } },
    commands,
    client: { api: { session: { instructions: { entry: {
      list: async ({ sessionID }) => entries.has(sessionID) ? [{ key: state.ORCHESTRATION_KEY, value: entries.get(sessionID) }] : [],
      put: async input => { calls.push(input); entries.set(input.sessionID, input.value) },
    } } } } },
    dialog: { size: "medium", replace: render => { renderMenu = render }, clear() {} },
    toast: { show: value => notices.push(value) },
  }
  let controller, dispose
  createRoot(stop => {
    dispose = stop
    createComponent(Host.Provider, { value: host, get children() {
      controller = usePromptOrchestration(() => "ses_a")
      return null
    } })
  })
  return { host, entries, calls, commands, notices, controller, dispose, menu: () => renderMenu }
}

async function openMenu(f) {
  await tick()
  f.controller.open()
  const ui = await testRender(() => createComponent(Host.Provider, { value: f.host, get children() { return f.menu()() } }), { width: 80, height: 20 })
  await ui.renderOnce()
  return ui
}

function layerCommand(commands, id) {
  return commands.flatMap(layer => layer.commands ?? []).find(command => command.id === id)
}

test("real native DialogSelect shows the full method names and one lock note", async () => {
  const f = fixture()
  let ui
  try {
    ui = await openMenu(f)
    const frame = ui.captureCharFrame()
    assert.match(frame, /Orchestration method/)
    assert.match(frame, /Solo/)
    assert.match(frame, /Background subagents/)
    assert.match(frame, /Foreground subagent/)
    assert.equal(frame.split("no auto-switching").length - 1, 1, "one dialog-level note, not one truncated footer per row")
  } finally { ui?.renderer.destroy(); f.dispose() }
})

test("real native DialogSelect selection and submit save the chosen method", async () => {
  const f = fixture()
  let ui
  try {
    ui = await openMenu(f)
    const next = layerCommand(f.commands, "dialog.select.next")
    const submit = layerCommand(f.commands, "dialog.select.submit")
    assert.ok(next && submit, "the real dialog registers its own move and submit commands")
    next.run()
    submit.run()
    await tick()
    assert.equal(f.controller.label(), "Background")
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].key, "orchestration-method")
    assert.equal(f.calls[0].value.method, "background")
    assert.equal(f.entries.get("ses_a").method, "background")
  } finally { ui?.renderer.destroy(); f.dispose() }
})

test("clicking a real native DialogSelect row saves that method", async () => {
  const f = fixture()
  let ui
  try {
    ui = await openMenu(f)
    const frame = ui.captureCharFrame()
    const lines = frame.split("\n")
    const row = lines.findIndex(line => line.includes("Foreground subagent"))
    assert.ok(row >= 0)
    await ui.mockMouse.click(lines[row].indexOf("Foreground") + 2, row)
    await tick()
    assert.equal(f.controller.label(), "Foreground")
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].value.method, "foreground")
  } finally { ui?.renderer.destroy(); f.dispose() }
})
