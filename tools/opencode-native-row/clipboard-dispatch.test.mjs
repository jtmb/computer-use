import assert from "node:assert/strict"
import { createRequire } from "node:module"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { readStableFile } from "./full-graph-diagnostics.mjs"

// Explicit source verification: needs the native checkout/parser, never loads its app or clipboard package.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const native = path.resolve(process.env.NATIVE_ROW_SOURCE_CHECKOUT ?? path.join(root, "../opencode-native-row"))
const require = createRequire(path.join(native, "package.json"))
const ts = require("typescript")
const deadline = performance.now() + 10_000
let acquired = 0

function source(name, file = path.join(native, "packages/tui", name)) {
  const body = readStableFile(file, {
    maxBytes: Math.min(262_144, 2_097_152 - acquired), deadline, label: "complete clipboard source input",
  })
  acquired += body.length
  const parsed = ts.createSourceFile(name, body.toString("utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  assert.equal(parsed.parseDiagnostics.length, 0, `invalid source: ${name}`)
  return parsed
}

const files = {
  adapter: source("src/clipboard.ts"),
  session: source("src/routes/session/index.tsx"),
  palette: source("src/component/command-palette.tsx"),
  keymap: source("src/context/keymap.tsx"),
  tabs: source("src/component/session-tabs.tsx"),
  alias: source("copy-session-id/tui.js", process.env.NATIVE_ROW_COPY_PLUGIN_FILE ??
    path.join(root, ".opencode/plugins/copy-session-id/tui.js")),
}

function nodes(scope, predicate) {
  const found = []
  function visit(node) {
    if (predicate(node)) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

function only(values, label) {
  assert.equal(values.length, 1, `expected one ${label}, found ${values.length}`)
  return values[0]
}

function property(object, name) {
  return object.properties.find(item => ts.isPropertyAssignment(item) && item.name.text === name)?.initializer
}

function objectWith(scope, key, value) {
  return only(nodes(scope, node => ts.isObjectLiteralExpression(node) && property(node, key)?.text === value), value)
}

function declaration(scope, name) {
  return only(nodes(scope, node => ts.isFunctionDeclaration(node) && node.name?.text === name), name)
}

function evaluate(text, bindings = {}) {
  const result = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
  })
  assert.equal(result.diagnostics?.length ?? 0, 0)
  const context = vm.createContext({ exports: {}, ...bindings }, { codeGeneration: { strings: false, wasm: false } })
  return new vm.Script(result.outputText, { filename: "selected-clipboard-source.js" }).runInContext(context, { timeout: 100 })
}

const expression = (node, file, bindings) => evaluate(`(${node.getText(file)})`, bindings)
const createAdapter = evaluate(`${declaration(files.adapter, "createClipboardAdapter").getText(files.adapter)}\ncreateClipboardAdapter`)
const commandNode = objectWith(files.session, "id", "session.copy.id")
const commandDefaults = only(nodes(files.session, node => ts.isObjectLiteralExpression(node) &&
  property(node, "palette")?.getText(files.session) === "true as const" && property(node, "bind")), "session palette defaults")
const paletteNode = only(nodes(declaration(files.palette, "CommandPaletteDialog"), node =>
  ts.isObjectLiteralExpression(node) && property(node, "value")?.getText(files.palette) === "command.id"), "palette option")
const provider = declaration(files.keymap, "Provider")
const dispatchNode = only(nodes(provider, node => ts.isVariableDeclaration(node) && node.name.getText() === "dispatch"), "dispatch").initializer
const inputNode = only(nodes(provider, node => ts.isPropertyAssignment(node) && node.name.text === "input"), "input accessor").initializer
const commandRun = property(only(nodes(declaration(files.keymap, "useCommands"), node =>
  ts.isObjectLiteralExpression(node) && property(node, "run")), "reachable command runner"), "run")
const layerRun = property(only(nodes(declaration(files.keymap, "createLayer"), node =>
  ts.isObjectLiteralExpression(node) && property(node, "run")), "registered command runner"), "run")
const tabRun = property(objectWith(files.tabs, "title", "Copy session ID"), "run")
const aliasNode = only(files.alias.statements.filter(ts.isExportAssignment), "plugin default").expression

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const terminal = status => ({ status, capability: "unknown" })
const result = (host, status = "not-attempted") => ({ host, terminal: terminal(status) })
const id = "ses_clipboard_source_fixture"

function fixture(core) {
  const trace = [], writes = [], toasts = [], errors = [], tasks = []
  const route = { type: "session", sessionID: id }
  const adapter = createAdapter({
    read() { assert.fail("a copy command must not read any clipboard") },
    clear() { assert.fail("a copy command must not clear any clipboard") },
    writeText(text, options) {
      trace.push("write")
      writes.push({ text, options: structuredClone(options) })
      return core.writeText(text, options)
    },
    dispose: core.dispose ?? (() => Promise.resolve()),
  })
  const clipboard = {
    write(text) {
      const task = adapter.write(text)
      tasks.push(task)
      return task
    },
  }
  const toast = {
    show(value) { toasts.push(structuredClone(value)) },
    error(error) { errors.push(error) },
  }
  const dialog = { clear() { trace.push("clear") } }
  const raw = expression(commandNode, files.session, { clipboard, route, toast, dialog })
  const command = expression(commandDefaults, files.session, { command: raw })
  let registered
  const dispatch = evaluate(`let invocation;\nconst dispatch = (${dispatchNode.getText(files.keymap)});\n` +
    `const input = (${inputNode.getText(files.keymap)});\n({ dispatch, input })`, {
      keymap: {
        dispatchCommand(name) {
          assert.equal(name, "session.copy.id", "the alias and palette must reach the actual native ID")
          trace.push("dispatch")
          registered({ event: { name: "return" } })
        },
      },
    })
  registered = expression(layerRun, files.keymap, { id: command.id, run: command.run, value: dispatch })
  const reachable = expression(commandRun, files.keymap, { entry: { command: { name: command.id } }, value: dispatch })
  const select = expression(property(paletteNode, "onSelect"), files.palette, { command: { run: reachable } })
  let layer
  expression(aliasNode, files.alias, { Plugin: { define: plugin => plugin } }).setup({
    ui: { router: { current: () => route } },
    keymap: { dispatch: dispatch.dispatch, layer: factory => { layer = factory() } },
  })
  return {
    route, trace, writes, toasts, errors, adapter, command, alias: layer.commands[0],
    select: () => select(dialog),
    tab: expression(tabRun, files.tabs, { clipboard, sessionID: id, toast }),
    async settled() {
      await Promise.allSettled(tasks)
      // Observe the command's existing then/catch continuation, not a timer or a polling loop.
      await Promise.resolve()
    },
  }
}

test("clipboard palette dispatch finishes before the deferred sink and retains the invoked session ID", async () => {
  const pending = deferred()
  const sample = fixture({ writeText: () => pending.promise })
  assert.equal(sample.command.palette, true)
  assert.equal(sample.command.group, "Session")
  assert.equal(sample.select(), undefined)
  assert.deepEqual(sample.trace, ["clear", "dispatch", "write", "clear"])
  assert.deepEqual(sample.writes, [{ text: id, options: { destination: "all-available", selection: "clipboard" } }])
  assert.deepEqual(sample.toasts, [], "dispatch/dialog clearing is not write completion")
  sample.route.sessionID = "ses_different_source_fixture"
  pending.resolve(result({ status: "written" }))
  await sample.settled()
  assert.deepEqual(sample.toasts, [{ message: "Session ID copied to clipboard!", variant: "success" }])
  assert.equal(sample.writes.length, 1)
  assert.equal(sample.writes[0].text, id)
})

test("clipboard slash alias reaches the native handler and delayed rejection/cancellation produces only its error toast", async () => {
  for (const name of ["Error", "AbortError"]) {
    const pending = deferred()
    const sample = fixture({ writeText: () => pending.promise })
    assert.equal(sample.alias.slash.name, "copy_session_id")
    assert.equal(sample.alias.enabled(), true)
    assert.equal(sample.alias.run(), undefined)
    assert.deepEqual(sample.trace, ["dispatch", "write", "clear"])
    assert.deepEqual(sample.toasts, [])
    const failure = Object.assign(new Error("synthetic sink failure; must not become toast content"), { name })
    pending.reject(failure)
    await sample.settled()
    assert.deepEqual(sample.toasts, [{ message: "Failed to copy session ID", variant: "error" }])
    assert.equal(sample.writes.length, 1)
    sample.route.type = "home"
    assert.equal(sample.alias.enabled(), false)
  }
})

test("clipboard route cancellation, timeout and no-route results reject unless a terminal attempt was already accepted", async () => {
  for (const status of ["cancelled", "timed-out", "unsupported", "not-attempted"]) {
    const sample = fixture({ writeText: async () => result({ status }, "local-failure") })
    sample.alias.run()
    await sample.settled()
    assert.deepEqual(sample.toasts, [{ message: "Failed to copy session ID", variant: "error" }], status)
  }
  for (const status of ["cancelled", "timed-out", "failed"]) {
    const host = status === "failed" ? { status, error: new Error("synthetic host failure") } : { status }
    const sample = fixture({ writeText: async () => result(host, "attempted") })
    sample.alias.run()
    await sample.settled()
    assert.deepEqual(sample.toasts, [{ message: "Session ID copied to clipboard!", variant: "success" }])
    assert.deepEqual(sample.writes[0].options, { destination: "all-available", selection: "clipboard" })
  }
})

test("clipboard adapter preserves a rejected host error and forwards the exact disposal promise and failure", async () => {
  const failure = new Error("synthetic host error")
  const ending = deferred()
  let disposals = 0
  const adapter = createAdapter({
    async writeText() { return result({ status: "failed", error: failure }, "local-failure") },
    dispose() { disposals++; return ending.promise },
  })
  await assert.rejects(adapter.write(id), error => error === failure)
  const disposed = adapter.dispose()
  assert.equal(disposed, ending.promise, "adapter must not pretend shutdown is already complete")
  assert.equal(disposals, 1)
  const cleanupFailure = new Error("synthetic cooperative cleanup failure")
  const checked = assert.rejects(disposed, error => error === cleanupFailure)
  ending.reject(cleanupFailure)
  await checked
})

test("clipboard pending command has no caller signal; injected service shutdown cancellation is not hidden by dialog clearing", async () => {
  const pending = deferred(), ending = deferred()
  let disposals = 0
  const sample = fixture({
    writeText: () => pending.promise,
    dispose() { disposals++; pending.resolve(result({ status: "cancelled" })); return ending.promise },
  })
  sample.select()
  assert.deepEqual(sample.toasts, [])
  assert.equal(Object.hasOwn(sample.writes[0].options, "signal"), false)
  assert.equal(disposals, 0, "closing the palette did not invoke service disposal")
  const disposed = sample.adapter.dispose()
  assert.equal(disposed, ending.promise)
  await sample.settled()
  assert.deepEqual(sample.toasts, [{ message: "Failed to copy session ID", variant: "error" }])
  assert.equal(disposals, 1)
  ending.resolve()
  await disposed
})

test("clipboard tab-menu action uses its captured ID and forwards delayed errors through toast.error", async () => {
  const pending = deferred()
  const sample = fixture({ writeText: () => pending.promise })
  assert.equal(sample.tab(), undefined)
  assert.deepEqual(sample.writes, [{ text: id, options: { destination: "all-available", selection: "clipboard" } }])
  sample.route.sessionID = "ses_other_source_fixture"
  const failure = new Error("synthetic tab copy failure")
  pending.reject(failure)
  await sample.settled()
  assert.deepEqual(sample.toasts, [])
  assert.deepEqual(sample.errors, [failure])
})
