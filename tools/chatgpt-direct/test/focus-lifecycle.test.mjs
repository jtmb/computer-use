import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { createRequire } from "node:module"
import path from "node:path"
import { setImmediate as nextTurn } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import test from "node:test"
import { readStableFile } from "../../opencode-native-row/full-graph-diagnostics.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const selected = path.resolve(process.env.IMAGE_FOCUS_SOURCE_ROOT ?? root)
const require = createRequire(path.join(root, "tools/chatgpt-connector/package.json"))
const ts = require("typescript")
const deadline = performance.now() + 10_000
let acquired = 0

function source(name) {
  const body = readStableFile(path.join(selected, name), {
    maxBytes: Math.min(262_144, 2_097_152 - acquired), deadline, label: "complete image focus source",
  })
  acquired += body.length
  const parsed = ts.createSourceFile(name, body.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  assert.equal(parsed.parseDiagnostics.length, 0, name)
  return parsed
}

function compile(parsed, statements = parsed.statements.filter(node => !ts.isImportDeclaration(node))) {
  const result = ts.transpileModule(statements.map(node => node.getText(parsed)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
  })
  assert.equal(result.diagnostics?.length ?? 0, 0)
  return new vm.Script(result.outputText + "\nexports", { filename: parsed.fileName })
}

const actionSource = source("tools/chatgpt-connector/src/image-preview.ts")
const action = actionSource.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "createOriginalAction")
assert.equal(action.length, 1)
const modules = {
  action: compile(actionSource, action),
  layout: compile(source("tools/chatgpt-direct/preview-layout.ts")),
  card: compile(source("tools/chatgpt-direct/image-preview.ts")),
  tui: compile(source("tools/chatgpt-direct/tui.tsx")),
}

const evaluate = (script, bindings) => script.runInNewContext({ exports: {}, ...bindings }, {
  timeout: 100, contextCodeGeneration: { strings: false, wasm: false },
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const image = name => ({ filename: name, uri: `synthetic:${name}`, width: 1536, height: 1024, sha256: "synthetic-not-a-file" })

function fixture(t) {
  const timers = [], effects = [], loads = [], notices = [], cached = new Map()
  const timeouts = [], images = []
  const stopped = { renderer: 0, asked: 0, ended: 0 }
  const sessions = new Map([
    ["ses_source_a", { location: { directory: "/synthetic/a" } }],
    ["ses_source_b", { location: { directory: "/synthetic/b" } }],
  ])
  let route = { type: "session", sessionID: "ses_source_a" }, mode = "normal", render, command
  const renderer = { width: 80, height: 24 }
  class Node extends EventEmitter {
    constructor(host, options = {}) {
      super()
      this.renderer = host
      this.children = []
      this.parent = null
      this.visible = true
      this.isDestroyed = false
      this.focused = false
      this.focusCalls = 0
      this.screenX = 2
      this.screenY = 2
      this.cellAspectRatio = 2
      Object.assign(this, options)
    }
    add(child) { this.children.push(child); child.parent = this }
    remove(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null }
    focus() {
      this.focusCalls++
      this.focused = !this.isDestroyed && !this.refuseFocus
    }
    destroyRecursively() {
      if (this.isDestroyed) return
      this.isDestroyed = true
      this.emit("destroyed")
      for (const child of this.children) child.destroyRecursively()
    }
  }
  class Box extends Node {}
  class Text extends Node {}
  class Image extends Node {
    constructor(host, options) { super(host, options); images.push(this) }
  }
  renderer.root = new Box(renderer)
  const signals = {
    any: inputs => AbortSignal.any(inputs),
    // Drive expiry explicitly; never wait thirty seconds or patch global timers.
    timeout: milliseconds => {
      assert.equal(milliseconds, 30_000)
      const controller = new AbortController()
      timeouts.push(controller)
      return controller.signal
    },
  }
  const { createOriginalAction } = evaluate(modules.action)
  const { previewDimensions } = evaluate(modules.layout)
  const cards = evaluate(modules.card, {
    AbortController, AbortSignal: signals, createOriginalAction, previewDimensions,
    BoxRenderable: Box, TextRenderable: Text, ImageRenderable: Image, RenderableEvents: { DESTROYED: "destroyed" },
  })
  const plugin = evaluate(modules.tui, {
    AbortController, AbortSignal: signals, ...cards, RenderableEvents: { DESTROYED: "destroyed" },
    Plugin: { define: value => value }, createEffect: effect => { effects.push(effect); effect() },
    setTimeout: (callback, milliseconds) => { timers.push({ callback, milliseconds }) },
    createPermissionRefresher: () => ({ asked() {}, async interrupted() {} }),
    findGeneratedPreview: (_messages, token) => cached.get(token),
    recoverGeneratedPreview: (token, session, options) => {
      const pending = deferred()
      loads.push({ token, session, signal: options.signal, pending })
      return pending.promise
    },
    openOriginalImage: () => assert.fail("focusing must never launch a viewer or access an original"),
  }).default
  const options = {}
  const dispose = plugin.setup({
    options, renderer,
    ui: { router: { current: () => route }, toast: { show: value => notices.push(structuredClone(value)) } },
    keymap: { mode: { current: () => mode }, layer: factory => { command = factory().commands[0] } },
    data: {
      session: {
        get: id => sessions.get(id), message: { list: () => [] },
        permission: { list: () => [], invalidate() {}, async sync() {} },
      },
      on: name => () => { stopped[name === "permission.asked" ? "asked" : "ended"]++ },
    },
    client: { message: { list: () => assert.fail("no real history API is available in this fixture") } },
    markdown: { registerCodeBlockRenderer: (name, callback) => {
      assert.equal(name, "chatgpt-image")
      render = callback
      return () => { stopped.renderer++ }
    } },
  })
  let disposed = false
  const close = () => {
    if (disposed) return
    disposed = true
    dispose()
    renderer.root.destroyRecursively()
  }
  t.after(close)
  return {
    command, options, renderer, loads, notices, timers, stopped, Text, Image, close, timeouts, images,
    expireRecovery() {
      assert.equal(timeouts.length, 1, "each recovering container must own its deadline signal")
      timeouts[0].abort(new DOMException("synthetic recovery deadline", "TimeoutError"))
    },
    route(next) { route = next; for (const effect of effects) effect() },
    directory(value) { sessions.get(route.sessionID).location.directory = value; for (const effect of effects) effect() },
    modal() { mode = "modal" },
    render(token, known = true) {
      if (known) cached.set(token, image(token))
      const node = render({ text: token }, { defaultRender: () => ({ default: true }) })
      if (node instanceof Node) renderer.root.add(node)
      return node
    },
    async release(pending) {
      assert.equal(timers.length, 1, "a focus invocation must defer exactly once")
      const timer = timers.shift()
      assert.equal(timer.milliseconds, 1)
      timer.callback()
      await pending
    },
  }
}

test("image focus: one deferred focus is inert until released and never opens an original", async t => {
  const sample = fixture(t)
  assert.equal(sample.command.id, "chatgpt.direct.image-preview.focus")
  assert.equal(sample.command.palette, true)
  assert.equal(sample.command.enabled(), true)
  sample.options.images = false
  assert.equal(sample.command.enabled(), false)
  assert.deepEqual(sample.render("disabled.png"), { default: true })
  sample.options.images = true
  const card = sample.render("visible.png")
  const pending = sample.command.run()
  assert.equal(card.focusCalls, 0, "native palette restoration must finish before focus")
  await sample.release(pending)
  assert.equal(card.focusCalls, 1)
  assert.equal(sample.notices.at(-1).variant, "success")
  assert.equal(sample.loads.length, 0)
})

test("image focus: route and directory changes cancel pending focus and do not revive old targets", async t => {
  for (const change of [sample => sample.route({ type: "session", sessionID: "ses_source_b" }),
    sample => sample.directory("/synthetic/moved")]) {
    const sample = fixture(t), card = sample.render("old.png"), pending = sample.command.run()
    change(sample)
    await sample.release(pending)
    assert.equal(card.focusCalls, 0)
    assert.deepEqual(sample.notices, [], "owner cancellation must not focus or toast from the old invocation")
    await sample.release(sample.command.run())
    assert.equal(sample.notices.at(-1).variant, "error", "owner change must forget the old target")
  }
  const sample = fixture(t)
  sample.render("home.png")
  sample.route({ type: "home" })
  assert.equal(sample.command.enabled(), false)
  sample.route({ type: "session", sessionID: "ses_source_a" })
  await sample.release(sample.command.run())
  assert.equal(sample.notices.at(-1).variant, "error")
})

test("image focus: older destruction cannot clear a newer card or redirect an in-flight target", async t => {
  const sample = fixture(t), first = sample.render("first.png"), second = sample.render("second.png")
  first.destroyRecursively()
  await sample.release(sample.command.run())
  assert.equal(second.focusCalls, 1, "destroying an old card must retain the newer candidate")
  const pending = sample.command.run(), replacement = sample.render("replacement.png")
  await sample.release(pending)
  assert.equal(second.focusCalls, 1, "an in-flight focus must not use a superseded candidate")
  assert.equal(replacement.focusCalls, 0, "an in-flight focus must not silently switch cards")
  assert.equal(sample.notices.at(-1).variant, "error")
  second.destroyRecursively()
  await sample.release(sample.command.run())
  assert.equal(replacement.focusCalls, 1)
  replacement.destroyRecursively()
  await sample.release(sample.command.run())
  assert.equal(sample.notices.at(-1).variant, "error")
})

test("image focus: teardown and modal transitions stop deferred focus without stale feedback", async t => {
  for (const stop of [sample => sample.close(), sample => sample.modal()]) {
    const sample = fixture(t), card = sample.render("pending.png"), pending = sample.command.run()
    stop(sample)
    await sample.release(pending)
    assert.equal(card.focusCalls, 0)
    assert.deepEqual(sample.notices, [], "cancelled deferred focus must stay silent")
  }
  const sample = fixture(t)
  sample.close()
  assert.deepEqual(sample.stopped, { renderer: 1, asked: 1, ended: 1 })
  assert.equal(sample.command.enabled(), false)
})

test("image focus: hidden detached offscreen and cyclic-ancestor targets are refused", async t => {
  for (const invalidate of [card => { card.parent = null }, card => { card.visible = false },
    card => { card.width = 0 }, card => { card.height = 0 },
    card => { card.screenX = -card.width }, card => { card.screenY = -card.height },
    (card, sample) => { card.screenX = sample.renderer.width },
    (card, sample) => { card.screenY = sample.renderer.height },
    card => { card.parent.visible = false }, card => { card.parent.parent = card.parent }]) {
    const sample = fixture(t), card = sample.render("invalid.png")
    invalidate(card, sample)
    await sample.release(sample.command.run())
    assert.equal(card.focusCalls, 0, "invalid targets must never reach the renderer focus boundary")
    assert.equal(sample.notices.at(-1).variant, "error")
  }
  const sample = fixture(t), card = sample.render("intersecting.png")
  card.screenX = -1
  await sample.release(sample.command.run())
  assert.equal(card.focusCalls, 1, "a still-visible intersecting rectangle remains eligible")
})

test("image focus: recovered readiness registers a target but an old-route result cannot replace it", async t => {
  const sample = fixture(t), box = sample.render("recover.png", false)
  await nextTurn()
  assert.equal(sample.loads.length, 1)
  sample.loads[0].pending.resolve(image("recover.png"))
  await nextTurn()
  const card = box.children[0]
  assert.ok(card instanceof sample.Image)
  await sample.release(sample.command.run())
  assert.equal(card.focusCalls, 1, "the actual recovery ready callback must register the card")

  const stale = fixture(t), oldBox = stale.render("late.png", false)
  await nextTurn()
  stale.route({ type: "session", sessionID: "ses_source_b" })
  assert.equal(stale.loads[0].signal.aborted, true, "route change must abort the outstanding recovery")
  const current = stale.render("current.png")
  stale.loads[0].pending.resolve(image("late.png"))
  await nextTurn()
  assert.ok(oldBox.children[0] instanceof stale.Text, "late old-route data must not publish a card")
  await stale.release(stale.command.run())
  assert.equal(current.focusCalls, 1)
})

test("image focus: recovering-container destruction prevents late registration and clears recovered targets", async t => {
  const sample = fixture(t), box = sample.render("disposed.png", false)
  await nextTurn()
  box.destroyRecursively()
  assert.equal(sample.loads[0].signal.aborted, true)
  sample.loads[0].pending.resolve(image("disposed.png"))
  await nextTurn()
  assert.ok(box.children[0] instanceof sample.Text)
  await sample.release(sample.command.run())
  assert.equal(sample.notices.at(-1).variant, "error")

  const live = fixture(t), readyBox = live.render("ready.png", false)
  await nextTurn()
  live.loads[0].pending.resolve(image("ready.png"))
  await nextTurn()
  const card = readyBox.children[0]
  assert.ok(card instanceof live.Image)
  readyBox.destroyRecursively()
  await live.release(live.command.run())
  assert.equal(card.focusCalls, 0)
  assert.equal(live.notices.at(-1).variant, "error")
})

function finishExpiredRecovery(sample, outcome) {
  if (outcome === "success") sample.loads[0].pending.resolve(image("expired.png"))
  else sample.loads[0].pending.reject(new Error("synthetic late rejection must not leak"))
}

for (const outcome of ["success", "rejection"]) {
  test(`image recovery timeout: late ${outcome} cannot publish or focus and the current owner becomes unavailable`, async t => {
    const sample = fixture(t), box = sample.render("pending.png", false), status = box.children[0]
    await nextTurn()
    assert.equal(sample.loads.length, 1)
    sample.expireRecovery()
    assert.equal(sample.loads[0].signal.aborted, true, "pending recovery must observe deadline expiry")
    finishExpiredRecovery(sample, outcome)
    await nextTurn()
    assert.equal(box.children.length, 1)
    assert.equal(box.children[0], status)
    assert.equal(sample.images.length, 0, "expired recovery must not publish a card or ready target")
    assert.ok(status.content.includes("Image preview unavailable."), "current owner must receive the unavailable recovery status")
    assert.equal(status.content.includes("synthetic late rejection"), false)
    assert.deepEqual(sample.notices, [], "recovery feedback belongs in its current status, not an extra stale toast")
    await sample.release(sample.command.run())
    assert.equal(sample.notices.at(-1).variant, "error", "an expired result must not register a focusable target")
  })
}

test("image recovery timeout: navigation suppresses late success and rejection feedback", async t => {
  for (const outcome of ["success", "rejection"]) {
    const sample = fixture(t), box = sample.render("old-route.png", false), status = box.children[0]
    await nextTurn()
    sample.expireRecovery()
    sample.route({ type: "session", sessionID: "ses_source_b" })
    const current = sample.render("current-after-expiry.png")
    finishExpiredRecovery(sample, outcome)
    await nextTurn()
    assert.equal(box.children[0], status)
    assert.equal(status.content, "Loading image preview…", "expired old-route work must not update stale feedback")
    assert.deepEqual(sample.images, [current], "expired old-route work must not publish or register another card")
    assert.equal(current.focusCalls, 0)
    assert.deepEqual(sample.notices, [])
    await sample.release(sample.command.run())
    assert.equal(current.focusCalls, 1, "only a new deliberate command may focus the current route target")
  }
})

test("image recovery timeout: container and plugin disposal suppress late success and rejection feedback", async t => {
  for (const outcome of ["success", "rejection"]) for (const dispose of [
    (_sample, box) => box.destroyRecursively(), sample => sample.close(),
  ]) {
    const sample = fixture(t), box = sample.render("disposed-after-expiry.png", false), status = box.children[0]
    await nextTurn()
    sample.expireRecovery()
    assert.equal(sample.loads[0].signal.aborted, true)
    dispose(sample, box)
    finishExpiredRecovery(sample, outcome)
    await nextTurn()
    assert.equal(status.content, "Loading image preview…", "disposed expired work must not update stale feedback")
    assert.equal(sample.images.length, 0)
    assert.deepEqual(sample.notices, [])
  }
})

test("image recovery timeout: expiry before the load microtask prevents a request", async t => {
  const sample = fixture(t), box = sample.render("not-started.png", false)
  sample.expireRecovery()
  await nextTurn()
  assert.equal(sample.loads.length, 0, "pre-expired recovery must not call the history boundary")
  assert.equal(sample.images.length, 0)
  assert.ok(box.children[0].content.includes("Image preview unavailable."))
  await sample.release(sample.command.run())
  assert.equal(sample.notices.at(-1).variant, "error")
})

test("image recovery timeout: a completed preview remains eligible after its recovery deadline expires", async t => {
  const sample = fixture(t), box = sample.render("completed.png", false)
  await nextTurn()
  sample.loads[0].pending.resolve(image("completed.png"))
  await nextTurn()
  const card = box.children[0]
  assert.ok(card instanceof sample.Image)
  sample.expireRecovery()
  assert.equal(sample.loads[0].signal.aborted, true)
  await sample.release(sample.command.run())
  assert.equal(card.focusCalls, 1, "a recovery-only deadline must not invalidate an already-ready card")
  assert.equal(card.isDestroyed, false)
  assert.equal(sample.notices.at(-1).variant, "success")
})
