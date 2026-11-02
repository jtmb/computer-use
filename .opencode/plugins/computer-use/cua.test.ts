import assert from "node:assert/strict"
import test from "node:test"
import { CuaSession, createCuaSessions } from "./cua.ts"

const APPS = [
  { index: 1, appId: `app:${"1".repeat(64)}`, name: "Calculator", role: "application", children: 1 },
  { index: 2, appId: `app:${"2".repeat(64)}`, name: "Google Chrome", role: "application", children: 3 },
  { index: 3, appId: `app:${"3".repeat(64)}`, name: "Google Chrome", role: "application", children: 3 },
]

function json(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] }
}

function makeSession(calls = []) {
  const call = async (key, input) => {
    calls.push({ key, input })
    switch (key) {
      case "desktop:apps":
        return json(APPS)
      case "desktop:windows":
        return json({ windows: [{ id: "w:1", title: "Calculator" }], monitors: [] })
      case "desktop:tree":
        return json({ traversal: { complete: true }, results: [{ name: "7", role: "push button", bounds: [0, 0, 20, 20] }], input })
      case "desktop:find":
        return json({ results: [{ name: "7", role: "push button", actions: ["click"] }], input })
      case "desktop:act":
        return json(input.apply ? { dispatched: true, token: input.expectToken } : { dry_run: true, target_token: "tok-1", target: { name: "7" } })
      case "desktop:capture":
        return { content: [{ type: "text", text: "captured" }, { type: "file", uri: "data:image/png;base64,AAAA", mime: "image/png", name: "w.png" }] }
      case "web:open":
        return json({ tabId: "t1", url: "https://example.com/", title: "Example" })
      case "web:snapshot":
        return json({ tabId: "t1", generation: 1, snapshot: "- generic [ref=e1]" })
      case "web:act":
        // The real tool returns the tab and the generation it consumed; a
        // permissive fake here previously hid the missing generation argument.
        if (input.generation !== 1) {
          return { content: [{ type: "text", text: "The supplied element ref is not from this tab's current snapshot generation; take a fresh snapshot." }] }
        }
        return json({ acted: true, tabId: input.tabId, generation: input.generation })
      default:
        return json({ ok: true, key, input })
    }
  }
  return { session: new CuaSession({ call }), calls }
}

const ctx = { sessionID: "s", agent: "a", messageID: "m", id: "c" }

test("top-level await bindings persist and can be redeclared", async () => {
  const { session } = makeSession()
  const first = await session.execute('const app = await cua.getApp("Calculator"); app.name', ctx)
  assert.match(first.text, /Calculator/)
  const second = await session.execute("app.name", ctx)
  assert.equal(second.text, "Calculator")
  const third = await session.execute('const app = 42; app', ctx)
  assert.equal(third.text, "42")
  const fourth = await session.execute("app", ctx)
  assert.equal(fourth.text, "42")
})

test("index binding selects one of two identically named applications", async () => {
  const { session } = makeSession()
  const out = await session.execute("const chrome = await cua.getApp(3); chrome.name", ctx)
  assert.match(out.text, /Google Chrome/)
  const calls = await session.execute("chrome.selector", ctx)
  assert.match(calls.text, /"appId": "app:3{64}"/)
})

test("an ambiguous name fails with the index workaround", async () => {
  const { session } = makeSession()
  const out = await session.execute('await cua.getApp("Google Chrome")', ctx)
  assert.match(out.text, /ambiguous/)
  assert.match(out.text, /cua\.getApp\(<index>\)/)
})

test("app.tree displays the tree and returns it", async () => {
  const { session, calls } = makeSession()
  const out = await session.execute("const app = await cua.getApp(1); await app.tree({ maxDepth: 5 })", ctx)
  assert.match(out.text, /push button/)
  const tree = calls.find((c) => c.key === "desktop:tree")
  assert.equal(tree.input.appId, APPS[0].appId)
  assert.equal(tree.input.maxDepth, 5)
})

test("click previews then applies with the fresh token", async () => {
  const { session, calls } = makeSession()
  const out = await session.execute('const app = await cua.getApp(1); await app.click({ name: "7" })', ctx)
  assert.match(out.text, /dispatched/)
  const acts = calls.filter((c) => c.key === "desktop:act")
  assert.equal(acts.length, 2)
  assert.equal(acts[0].input.apply, undefined)
  assert.equal(acts[1].input.apply, true)
  assert.equal(acts[1].input.expectToken, "tok-1")
})

test("images emitted by an API call are returned as file parts", async () => {
  const { session } = makeSession()
  const out = await session.execute('const win = await cua.getWindow("Calculator"); await win.capture()', ctx)
  assert.equal(out.files.length, 1)
  assert.equal(out.files[0].mime, "image/png")
  assert.match(out.text, /captured/)
})

test("browser tab act returns a fresh snapshot in the same call", async () => {
  const { session, calls } = makeSession()
  const out = await session.execute('const b = await cua.browser(); const tab = await b.open("https://example.com/"); await tab.snapshot(); await tab.act({ ref: "e1", action: "click" })', ctx)
  assert.match(out.text, /acted/)
  assert.match(out.text, /generic \[ref=e1\]/)
  assert.ok(calls.some((c) => c.key === "web:snapshot"))
})

test("nodeRepl.write and console are captured", async () => {
  const { session } = makeSession()
  const out = await session.execute('nodeRepl.write("written"); console.log("logged")', ctx)
  assert.match(out.text, /written/)
  assert.match(out.text, /logged/)
})

test("a syntax error is reported without losing the session", async () => {
  const { session } = makeSession()
  const bad = await session.execute("const broken = ", ctx)
  assert.match(bad.text, /SyntaxError|Unexpected/)
  const good = await session.execute("1 + 1", ctx)
  assert.equal(good.text, "2")
})

test("a timed-out cell aborts and blocks late output", async () => {
  const { session } = makeSession()
  const out = await session.execute("await new Promise(() => {})", ctx, 1_000)
  assert.match(out.text, /timed out/i)
  const next = await session.execute("'after'", ctx)
  assert.equal(next.text, "after")
})

test("reset clears bindings", async () => {
  const { session } = makeSession()
  await session.execute("const keep = 1", ctx)
  session.reset()
  const out = await session.execute("typeof keep", ctx)
  assert.match(out.text, /undefined$/)
})

test("comments, strings and templates do not hide or create declarations", async () => {
  const { session } = makeSession()
  const out = await session.execute(
    [
      'const note = "const fake = 1"',
      "// const commented = 2",
      "const tpl = `const inside = 3`",
      "const re = /const fake/",
      "note + '|' + tpl + '|' + re.source",
    ].join("\n"),
    ctx,
  )
  assert.match(out.text, /const fake = 1\|const inside = 3\|const fake$/)
  const leaked = await session.execute("typeof fake + typeof commented + typeof inside", ctx)
  assert.equal(leaked.text, "undefinedundefinedundefined")
})

test("the first cell returns the API manual and later cells do not", async () => {
  const { session } = makeSession()
  const first = await session.execute("'one'", ctx)
  assert.match(first.text, /cua — persistent desktop and browser control/)
  assert.match(first.text, /Entry points/)
  const second = await session.execute("'two'", ctx)
  assert.doesNotMatch(second.text, /Entry points/)
  const docs = await session.execute("await cua.docs()", ctx)
  assert.match(docs.text, /App handle/)
})

test("a declaration inside a block is scoped normally", async () => {
  const { session } = makeSession()
  await session.execute("if (true) { const local = 1 }", ctx)
  const out = await session.execute("typeof local", ctx)
  assert.equal(out.text, "undefined")
})

test("the session store is bounded and evicts the least recently used", async () => {
  const { session: _unused } = makeSession()
  const { createCuaSessions } = await import("./cua.ts")
  const sessions = createCuaSessions(async () => ({ content: [{ type: "text", text: "{}" }] }), 2)
  const first = sessions.get("a")
  const second = sessions.get("b")
  sessions.get("a")
  sessions.get("c")
  assert.equal(sessions.size(), 2)
  // "a" was used most recently, so "b" is the evicted entry.
  assert.equal(sessions.get("a"), first)
  assert.notEqual(sessions.get("b"), second)
})

test("a trailing line comment does not break the returned expression", async () => {
  const { session } = makeSession()
  const out = await session.execute("await cua.getState() // list everything", ctx)
  assert.match(out.text, /Calculator|Google Chrome/)
})

// ---------------------------------------------------------------------------
// Regression coverage for the cell transform and cell lifecycle
// ---------------------------------------------------------------------------

function sessionWith(
  handler: (key: string, input: Record<string, unknown>) => Promise<unknown> | unknown,
  options: { maxOutputChars?: number } = {},
) {
  const calls: Array<{ key: string; input: Record<string, unknown> }> = []
  const session = new CuaSession({
    call: async (key, input) => {
      calls.push({ key, input })
      return await handler(key, input)
    },
    ...options,
  })
  return { session, calls }
}

test("a declaration after a newline survives the async wrapper", async () => {
  const { session } = sessionWith((key) =>
    key === "desktop:apps" ? json([APPS[0]]) : json({ ok: true }))
  const first = await session.execute(
    'const x = 1\nconst app = await cua.getApp("Calculator")\napp.name',
    ctx,
  )
  assert.match(first.text, /Calculator/)
  const second = await session.execute("typeof app", ctx)
  assert.equal(second.text, "object")
})

test("await inside try and inside a block selects the async wrapper", async () => {
  const { session } = sessionWith(() => json({ ok: true }))
  const out = await session.execute(
    [
      "try {",
      "  const value = await Promise.resolve(7)",
      '  nodeRepl.write("value=" + value)',
      "} catch (error) {",
      '  nodeRepl.write("caught")',
      "}",
    ].join("\n"),
    ctx,
  )
  assert.match(out.text, /value=7/)
  assert.doesNotMatch(out.text, /SyntaxError/)
})

test("regex literals are skipped rather than parsed as code", async () => {
  const { session } = sessionWith(() => json({ ok: true }))
  // Braces and declaration keywords inside a regex used to change the scanner's
  // depth and statement split, producing a SyntaxError.
  const out = await session.execute("const re = /[}{]const let/\nre.source", ctx)
  assert.ok(out.text.endsWith("[}{]const let"), out.text.slice(-120))
  const after = await session.execute("typeof re", ctx)
  assert.equal(after.text, "object")
})

test("nested destructuring bindings survive the async wrapper", async () => {
  const { session } = sessionWith(() => json({ ok: true }))
  await session.execute(
    '"use strict";\nconst { a: { b }, x: [first, ...rest] } = { a: { b: 1 }, x: [2, 3, 4] }; await Promise.resolve()',
    ctx,
  )
  const out = await session.execute("b + first + rest.length", ctx)
  assert.equal(out.text, "5")
})

test("a compile error does not poison later declarations", async () => {
  const { session } = sessionWith(() => json({ ok: true }))
  const broken = await session.execute("const ghost = ", ctx)
  assert.match(broken.text, /SyntaxError|Unexpected/)
  // The failed cell must not mark `ghost` as already declared. If it did, the
  // later `const` would be rewritten without a `let` prefix; this strict-mode
  // assignment then fails because no binding exists.
  const first = await session.execute('"use strict";\nconst ghost = 1\nghost', ctx)
  assert.equal(first.text, "1")
  const second = await session.execute('"use strict";\nconst ghost = 2\nghost', ctx)
  assert.equal(second.text, "2")
})

test("overlapping cells are serialized and keep their own output", async () => {
  const { session } = sessionWith(() => json({ ok: true }))
  const first = session.execute(
    'nodeRepl.write("a-start"); await Promise.resolve(); await Promise.resolve(); nodeRepl.write("a-end")',
    ctx,
  )
  const second = session.execute('nodeRepl.write("b-only")', ctx)
  const [one, two] = await Promise.all([first, second])
  assert.match(one.text, /a-start/)
  assert.match(one.text, /a-end/)
  assert.doesNotMatch(one.text, /b-only/)
  assert.match(two.text, /b-only/)
  assert.doesNotMatch(two.text, /a-start|a-end/)
})

test("a late image from a timed-out cell cannot enter the next cell", async () => {
  let appsCalls = 0
  const { session } = sessionWith((key) => {
    if (key !== "desktop:apps") return json({ ok: true })
    appsCalls++
    const delay = appsCalls === 1 ? 1_200 : 400
    return new Promise((resolve) => setTimeout(() => resolve(json([{ index: 1, name: "Late" }])), delay))
  })
  const first = await session.execute(
    'await cua.getState(); nodeRepl.write("late"); await nodeRepl.emitImage("data:image/png;base64,AAAA")',
    ctx,
    1_000,
  )
  assert.match(first.text, /timed out/i)
  const next = await session.execute('await cua.getState(); "clean"', ctx)
  assert.match(next.text, /clean/)
  assert.doesNotMatch(next.text, /late/)
  assert.equal(next.files.length, 0)
})

test("host cancellation aborts a pending cell promptly", async () => {
  const { session } = sessionWith(() =>
    new Promise((resolve) => setTimeout(() => resolve(json({ ok: true })), 1_000)))
  const controller = new AbortController()
  const started = Date.now()
  const pending = session.execute("await cua.getState()", { ...ctx, signal: controller.signal })
  setTimeout(() => controller.abort(), 20)
  const out = await pending
  assert.match(out.text, /cancel/i)
  assert.ok(Date.now() - started < 500, `cancellation took ${Date.now() - started} ms`)
})

test("a cross-realm Uint8Array is attached as an image", async () => {
  const { session } = sessionWith(() => json({ ok: true }))
  const out = await session.execute("new Uint8Array([65, 66, 67])", ctx)
  assert.equal(out.files.length, 1)
  assert.equal(out.files[0].mime, "image/png")
  assert.match(out.files[0].uri, /^data:image\/png;base64,/)
})

test("output is capped while writing, not after joining", async () => {
  const { session } = sessionWith(() => json({ ok: true }), { maxOutputChars: 50 })
  const out = await session.execute('nodeRepl.write("a".repeat(80)); nodeRepl.write("b".repeat(80)); 1', ctx)
  assert.ok(out.text.length <= 50, `output length ${out.text.length}`)
})

test("a backend failure is not reported as a missing application", async () => {
  const failed = sessionWith(() => ({
    content: [{ type: "text", text: "Desktop error: the bridge is unavailable" }],
  }))
  const out = await failed.session.execute('await cua.getApp("Calculator")', ctx)
  assert.match(out.text, /application list was unavailable/i)
  assert.doesNotMatch(out.text, /No accessible application matches/)

  const empty = sessionWith(() => json([]))
  const none = await empty.session.execute('await cua.getApp("Calculator")', ctx)
  assert.match(none.text, /No accessible application matches/)
})

test("ambiguous window titles are refused and an exact id selects one", async () => {
  const windows = {
    windows: [
      { id: "w:1", title: "Terminal" },
      { id: "w:2", title: "Terminal" },
    ],
    monitors: [],
  }
  const { session } = sessionWith((key) => key === "desktop:windows" ? json(windows) : json({ ok: true }))
  const ambiguous = await session.execute('await cua.getWindow("Terminal")', ctx)
  assert.match(ambiguous.text, /ambiguous/i)
  assert.match(ambiguous.text, /w:1/)
  assert.match(ambiguous.text, /w:2/)
  const exact = await session.execute('const w = await cua.getWindow("w:2"); w.id', ctx)
  assert.equal(exact.text, "w:2")
})

test("dispose refuses queued cells and cancels the running one", async () => {
  const { session } = sessionWith(() =>
    new Promise((resolve) => setTimeout(() => resolve(json({ ok: true })), 1_000)))
  const running = session.execute("await cua.getState()", ctx)
  const queued = session.execute('"never"', ctx)
  await new Promise((resolve) => setImmediate(resolve))
  session.dispose()
  const cancelled = await running
  assert.match(cancelled.text, /Cell cancelled/)
  await assert.rejects(queued, /disposed|did not run/)
  await assert.rejects(session.execute('"after"', ctx), /disposed|did not run/)
})

test("the session store disposes cleared sessions", async () => {
  const sessions = createCuaSessions(async () => ({ content: [{ type: "text", text: "{}" }] }))
  const session = sessions.get("a")
  sessions.clear("a")
  await assert.rejects(session.execute('"x"', ctx), /disposed/)
  assert.equal(sessions.size(), 0)
})

test("goto sends only a url; act requires or inherits a generation", async () => {
  const { session, calls } = makeSession()
  await session.execute(
    'const b = await cua.browser(); const t = await b.open("https://example.com/"); await t.goto("https://example.org/")',
    ctx,
  )
  const navigate = calls.find((call) => call.key === "web:navigate")
  assert.deepEqual(navigate?.input, { tabId: "t1", url: "https://example.org/" })

  calls.length = 0
  const missing = await session.execute(
    'const b = await cua.browser(); const t = await b.open("https://example.com/"); await t.act({ ref: "e1", action: "click" })',
    ctx,
  )
  assert.match(missing.text, /needs a snapshot generation/)
  assert.equal(calls.filter((call) => call.key === "web:act").length, 0)

  calls.length = 0
  await session.execute(
    'const b = await cua.browser(); const t = await b.open("https://example.com/"); await t.snapshot(); await t.act({ ref: "e1", action: "click" })',
    ctx,
  )
  const act = calls.find((call) => call.key === "web:act")
  assert.equal(act?.input.generation, 1)
  assert.equal(calls.filter((call) => call.key === "web:snapshot").length, 2)
})

test("a failed act does not trigger a fresh snapshot", async () => {
  const { session, calls } = makeSession()
  const out = await session.execute(
    'const b = await cua.browser(); const t = await b.open("https://example.com/"); await t.snapshot(); await t.act({ ref: "e1", action: "click", generation: 99 })',
    ctx,
  )
  assert.match(out.text, /not from this tab's current snapshot generation/)
  assert.equal(calls.filter((call) => call.key === "web:snapshot").length, 1)
})

test("app.act is preview-only and refuses unknown selectors", async () => {
  const { session, calls } = makeSession()
  await session.execute("const app = await cua.getApp(1)", ctx)
  calls.length = 0
  const out = await session.execute('await app.act({ name: "7" })', ctx)
  assert.match(out.text, /dry_run/)
  assert.equal(calls[0]?.input.apply, undefined)
  const refused = await session.execute('await app.act({ x: 1 })', ctx)
  assert.match(refused.text, /unsupported option/)
  assert.match(refused.text, /name\/role\/nth/)
})

test("a timeout rejects cells queued behind it", async () => {
  const { session } = sessionWith(() => json({ ok: true }))
  const running = session.execute("while(true){}", ctx, 1_000)
  const queued = session.execute('"queued"', ctx).then(
    () => "resolved",
    (error) => `rejected:${error instanceof Error ? error.message : String(error)}`,
  )
  const timed = await running
  assert.match(timed.text, /timed out/)
  assert.match(await queued, /rejected:.*(reset|did not run)/)
  session.dispose()
})

test("reset during a running cell settles it and keeps the next cell usable", async () => {
  const { session } = sessionWith(() => new Promise(() => {}))
  const running = session.execute("await cua.getState()", ctx, 5_000)
  await new Promise((resolve) => setImmediate(resolve))
  session.reset()
  const stopped = await running
  assert.match(stopped.text, /reset/)
  const after = await session.execute('"after"', ctx)
  assert.match(after.text, /after$/)
  session.dispose()
})

test("model code has no process, require or fetch globals", async () => {
  const { session } = sessionWith(() => json({ ok: true }))
  const out = await session.execute(
    "typeof process + '|' + typeof require + '|' + typeof fetch",
    ctx,
  )
  assert.equal(out.text.split("\n").pop(), "undefined|undefined|undefined")
  session.dispose()
})
