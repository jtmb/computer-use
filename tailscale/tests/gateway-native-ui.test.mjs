import assert from "node:assert/strict"
import { test } from "node:test"
import { registerDockerWeb } from "../../.opencode/plugins/tailscale-web/controller.mjs"

const server = { pid: 1234, version: "2.1.1", urls: ["http://127.0.0.1:51947"] }
const token = "synthetic_pairing_code"

function setup(options = {}) {
  let command, infoCount = 0, pairCount = 0, startCount = 0, stopCount = 0, disposed = 0
  const alerts = [], toasts = [], requests = []
  const route = { type: "session", sessionID: "ses_existing_chat" }
  const context = {
    keymap: { layer: factory => { command = factory().commands[0] } },
    client: { server: {
      info: async () => { infoCount++; return options.info ? options.info(infoCount) : server },
      pair: async () => { pairCount++; if (options.pair) return options.pair(); return { code: token, expires_in: 300 } },
    } },
    ui: { router: { current: () => route }, toast: { show: value => toasts.push(value) },
      dialog: { alert: async value => alerts.push(value) } },
  }
  const cleanup = registerDockerWeb(context, {
    start: async request => {
      startCount++; requests.push(request)
      await options.start?.(route)
      return { url: "https://gateway.example.ts.net/web", instance: { pid: server.pid, version: server.version, target: server.urls[0] } }
    },
    stop: async () => { stopCount++ }, dispose: () => { disposed++ },
  })
  return { command, cleanup, alerts, toasts, requests, route, counts: () => ({ infoCount, pairCount, startCount, stopCount, disposed }) }
}

test("native pairing is explicit and single-use link appears only in the user's dialog", async () => {
  const f = setup()
  assert.deepEqual(f.counts(), { infoCount: 0, pairCount: 0, startCount: 0, stopCount: 0, disposed: 0 })
  await f.command.run()
  assert.deepEqual(f.requests, [{ server, sessionID: "ses_existing_chat" }])
  assert.equal(f.counts().pairCount, 1)
  assert.match(f.alerts[0].message, /https:\/\/gateway\.example\.ts\.net\/auth\/connect\/synthetic_pairing_code/)
  assert.match(f.alerts[0].message, /existing OpenCode instance/)
  assert.equal(JSON.stringify(f.toasts).includes(token), false)
})

test("stop does not discover the backend or issue a pairing token", async () => {
  const f = setup()
  await f.command.run("stop")
  assert.equal(f.counts().infoCount + f.counts().pairCount + f.counts().startCount, 0)
})

test("instance changes suppress pairing, hide a newly issued link and stop only the gateway", async () => {
  for (const changeAt of [2, 3]) {
    const f = setup({ info: count => count >= changeAt ? { ...server, pid: 999 } : server })
    await f.command.run()
    assert.equal(f.alerts.length, 0)
    assert.equal(f.counts().pairCount, changeAt === 2 ? 0 : 1)
    assert.equal(f.counts().stopCount, 1)
    assert.equal(JSON.stringify(f.toasts).includes(token), false)
    assert.match(f.toasts.at(-1).message, /instance changed/)
  }
})

test("an unverifiable backend after start stops the gateway instead of leaving its route published", async () => {
  const f = setup({ info: count => { if (count < 2) return server; throw new Error(token) } })
  await f.command.run()
  assert.equal(f.counts().startCount, 1)
  assert.equal(f.counts().stopCount, 1)
  assert.equal(f.alerts.length, 0)
  assert.equal(JSON.stringify(f.toasts).includes(token), false)
  assert.match(f.toasts.at(-1).message, /changed or could not be re-verified/)
})

test("selected-chat changes suppress a stale pairing request without stopping the valid gateway", async () => {
  const f = setup({ start: route => { route.sessionID = "ses_other_chat" } })
  await f.command.run()
  assert.equal(f.counts().pairCount, 0)
  assert.equal(f.counts().stopCount, 0)
  assert.equal(f.alerts.length, 0)
})

test("chat navigation cannot hide a backend change after start or pairing", async () => {
  for (const changeAt of [2, 3]) {
    const f = setup({
      info: count => count >= changeAt ? { ...server, pid: 999 } : server,
      start: route => { if (changeAt === 2) route.sessionID = "ses_other_chat" },
      pair: () => { f.route.sessionID = "ses_other_chat"; return { code: token, expires_in: 300 } },
    })
    await f.command.run()
    assert.equal(f.counts().stopCount, 1)
    assert.equal(f.counts().pairCount, changeAt === 2 ? 0 : 1)
    assert.equal(f.alerts.length, 0)
    assert.equal(JSON.stringify(f.toasts).includes(token), false)
  }
})

test("a pairing failure rechecks backend identity before leaving the gateway running", async () => {
  const f = setup({
    pair: () => { throw new Error(token) },
    info: count => { if (count < 3) return server; throw new Error(token) },
  })
  await f.command.run()
  assert.equal(f.counts().stopCount, 1)
  assert.equal(f.alerts.length, 0)
  assert.equal(JSON.stringify(f.toasts).includes(token), false)
  assert.match(f.toasts.at(-1).message, /changed or could not be re-verified/)
})

test("parallel commands do not create duplicate pairing tokens", async () => {
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  const f = setup({ start: () => pending })
  const first = f.command.run()
  await f.command.run()
  finish(); await first
  assert.equal(f.counts().startCount, 1)
  assert.equal(f.counts().pairCount, 1)
})

test("private upstream error text and malformed pairing metadata are never displayed", async () => {
  const f = setup({ pair: () => { throw new Error(token) } })
  await f.command.run()
  assert.equal(f.alerts.length, 0)
  assert.equal(f.counts().stopCount, 0)
  assert.equal(JSON.stringify(f.toasts).includes(token), false)
  for (const metadata of [{ code: "bad/url", expires_in: 300 }, { code: token, expires_in: 301 }, { code: token, expires_in: 0 }]) {
    const g = setup({ pair: () => metadata })
    await g.command.run()
    assert.equal(g.alerts.length, 0)
    assert.equal(g.counts().stopCount, 0)
    assert.equal(JSON.stringify(g.toasts).includes(token), false)
  }
})
