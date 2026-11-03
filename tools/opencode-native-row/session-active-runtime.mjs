import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const root = process.env.NATIVE_ROW_SOURCE_CHECKOUT, overlay = process.env.NATIVE_ACTIVE_OVERLAY
const require = createRequire(join(root, "packages/plugin/package.json"))
const { Effect } = await import(pathToFileURL(require.resolve("effect")).href)
const { fromPromise } = await import(pathToFileURL(join(root, "packages/plugin/src/promise/adapter.ts")).href)
const ts = require("typescript"), mode = process.env.NATIVE_ACTIVE_MODE
const source = ts.createSourceFile("host.ts", readFileSync(join(overlay, "packages/core/src/plugin/host.ts"), "utf8"), ts.ScriptTarget.ESNext, true)
const mappings = []
function find(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(source) === "session" && ts.isObjectLiteralExpression(node.initializer)) {
    for (const child of node.initializer.properties) if (ts.isPropertyAssignment(child) && child.name.getText(source) === "active") mappings.push(child.initializer)
  }
  ts.forEachChild(node, find)
}
find(source)
assert.equal(mappings.length, 1, "native session.active mapping missing or ambiguous")
const expression = ts.transpileModule(`const actual = ${mappings[0].getText(source)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const running = new Set(["ses_foreground"])
const sessions = { active: Effect.sync(() => new Set(running)) }
const actual = new Function("Effect", "sessions", `${expression}; return actual`)(Effect, sessions)
let calls = 0, stopped = false, started
const began = new Promise(resolve => { started = resolve })
const noOp = new Proxy(() => Effect.succeed(undefined), { get: () => undefined })
const domain = new Proxy({}, { get: () => noOp })
const host = new Proxy({ app: {}, location: {}, options: {}, session: {
  active: () => {
    calls++
    if (mode === "failure") return Effect.fail(new Error("synthetic native active failure"))
    if (mode === "invalid-output") return Effect.succeed({ ses_foreground: { type: "idle" } })
    if (mode === "mid-abort") return Effect.sync(started).pipe(Effect.andThen(Effect.never), Effect.ensuring(Effect.sync(() => { stopped = true })))
    return actual()
  },
} }, { get(target, key) {
  if (Reflect.has(target, key)) return Reflect.get(target, key)
  return key === "rpc" ? { client: {}, register: noOp } : domain
} })
const plugin = fromPromise({ id: "native-active-source-test", async setup(context) {
  if (mode === "pre-abort") {
    const controller = new AbortController(); controller.abort(new Error("pre-cancelled"))
    await assert.rejects(context.session.active({ signal: controller.signal }))
    assert.equal(calls, 0, "pre-abort must not invoke the native method")
  } else if (mode === "mid-abort") {
    const controller = new AbortController()
    const pending = context.session.active({ signal: controller.signal })
    const rejection = assert.rejects(pending)
    await began; controller.abort(); await rejection
    assert.equal(stopped, true, "the native Effect's cleanup must have run before rejection settles")
    assert.equal(calls, 1)
  } else if (mode === "failure" || mode === "invalid-output") {
    await assert.rejects(context.session.active(), mode === "failure" ? /synthetic native active failure/ : undefined)
  } else {
    const first = await context.session.active()
    assert.deepEqual(first, { ses_foreground: { type: "running" } })
    first.ses_foreground.type = "changed"
    running.add("ses_later")
    const second = await context.session.active()
    assert.deepEqual(second, { ses_foreground: { type: "running" }, ses_later: { type: "running" } })
    assert.notStrictEqual(first, second)
    running.clear()
    assert.deepEqual(await context.session.active(), {})
    assert.equal("allWorkStopped" in second, false)
    console.log("native-map-and-schema-pass")
    return
  }
  console.log(`${mode}-pass`)
} })
await Effect.runPromise(Effect.scoped(plugin.effect(host)))
