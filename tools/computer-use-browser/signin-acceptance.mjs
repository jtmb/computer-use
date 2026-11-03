/**
 * Tool-level acceptance for the private sign-in path.
 *
 * Everything is production code — `web.signin`, the guard, the whole-surface gate,
 * an auth-flow worker, the manager's fill gate, snapshot redaction and the
 * status-only result — except the human: a stub dialog returns a synthetic value,
 * exactly as the GTK dialog would after a person typed. A tiny local page reports
 * only the typed length, so the run proves the value reached the field without the
 * value ever appearing in a result or a snapshot.
 *
 * What it does NOT prove: the GTK dialog itself, or a real human's interaction with
 * it. That remains an operator step.
 */

import { createServer } from "node:http"
import { readdirSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, "../..")
const { createAuthGuard } = await import(`${REPO}/tools/computer-use-runtime/src/index.ts`)
const { registerBrowserTools } = await import(`${REPO}/.opencode/plugins/computer-use/browser-tools.ts`)
const { withSerializedTools } = await import(`${REPO}/.opencode/plugins/computer-use/serialization.ts`)

const SYNTHETIC = "synthetic-dialog-value-123"
// Per-run session id, so cleanup can only ever touch this run's profile.
const SESSION = `ses_signinaccept_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const dataDirectory =
  process.env.OPENCODE_DATA_DIR ?? join(homedir(), ".opencode-v2-pilot", "data", "opencode")

const PAGE = `<!doctype html><meta charset="utf-8"><title>sign-in probe</title>
<form action="/submit" method="post">
  <p><label>Password <input type="password" id="pw" aria-label="Password"></label></p>
  <p><button type="submit">Sign in</button></p>
</form>
<p id="out">len=none</p>
<script>
  const pw = document.getElementById('pw')
  pw.addEventListener('input', () => {
    document.getElementById('out').textContent = 'len=' + pw.value.length
  })
</script>`

const server = createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  response.end(PAGE)
})
await new Promise((done) => server.listen(0, "127.0.0.1", done))
const port = server.address().port

const authGuard = createAuthGuard()
const tools = new Map()
let dialogCalls = 0
registerBrowserTools(
  withSerializedTools(
    {
      namespace() {},
      add(tool) {
        tools.set(tool.name, tool)
      },
      list() {
        return [...tools.values()]
      },
      update() {},
    },
    "web",
    { authGuard, deadlines: { signin: 330_000 } },
  ),
  {
    assertPermission: async () => {},
    dataDirectory,
    authGuard,
    signInDialog: async () => {
      dialogCalls += 1
      return { status: "ok", value: Buffer.from(SYNTHETIC) }
    },
  },
)

const context = (id) => ({ sessionID: SESSION, agent: "build", messageID: `msg_${SESSION}`, id })
const call = (name, args, id) => tools.get(name).execute(args, context(`call_${id}`))
const textOf = (result) =>
  (result.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n")

const failed = []
const check = (name, ok, detail = {}) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ""}`)
  if (!ok) failed.push(name)
}

try {
  const opened = JSON.parse(textOf(await call("open", { url: `http://127.0.0.1:${port}/` }, "open")))
  const tabId = opened.tabId
  const snap = JSON.parse(textOf(await call("snapshot", { tabId }, "snap")))
  const ref = /(?:textbox|Password)[^\n]*\[ref=([A-Za-z0-9_-]+)\]/u.exec(snap.snapshot)?.[1]
  check("the snapshot exposes the password field", Boolean(ref), { ref, generation: snap.generation })

  const signed = textOf(await call("signin", { tabId, ref, generation: snap.generation }, "signin"))
  check("sign-in returns status only", /"status":"filled"/u.test(signed), { text: signed.slice(0, 80) })
  check("the dialog was used exactly once", dialogCalls === 1, { dialogCalls })
  check("the value never appears in the result", !signed.includes(SYNTHETIC))
  check("the guard returns to idle", authGuard.guard.getState() === "idle", {
    state: authGuard.guard.getState(),
  })

  const after = JSON.parse(textOf(await call("snapshot", { tabId }, "snap2")))
  check("the page confirms the typed length", after.snapshot.includes(`len=${SYNTHETIC.length}`), {
    expected: `len=${SYNTHETIC.length}`,
  })
  check(
    "the field value is redacted in the snapshot",
    after.snapshot.includes("[redacted]") && !after.snapshot.includes(SYNTHETIC),
  )

  const replay = textOf(await call("signin", { tabId, ref, generation: snap.generation }, "signin2"))
  check(
    "a consumed generation cannot open the dialog again",
    dialogCalls === 1 && /current snapshot generation/u.test(replay),
    { dialogCalls, text: replay.slice(0, 90) },
  )
} finally {
  await call("close", {}, "close").catch(() => {})
  await new Promise((done) => server.close(done))
  // Remove the profile this run created; earlier versions left ~11 MB behind per run.
  const found = []
  const walk = (directory, depth) => {
    if (depth > 6) return
    let entries = []
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = join(directory, entry.name)
      if (entry.name === SESSION) found.push(full)
      else walk(full, depth + 1)
    }
  }
  walk(join(dataDirectory, "browser-profiles"), 0)
  for (const path of found) rmSync(path, { recursive: true, force: true })
}

console.log(`SUMMARY: checks=${8 - failed.length}/8 passed`)
process.exit(failed.length === 0 ? 0 : 1)
