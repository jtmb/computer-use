/**
 * Live TLS and sandbox acceptance for the browser backend.
 *
 * Proves two things that unit tests cannot: the browser really refuses an untrusted
 * certificate (TLS validation is on), and the Chrome it launches really runs sandboxed
 * (no `--no-sandbox`, setuid helper present).
 *
 *   node --experimental-strip-types tools/computer-use-browser/tls-sandbox-acceptance.mjs
 *
 * It starts a local HTTPS server with a self-signed certificate, drives the production
 * `web` tool registrations against it, then against a normally trusted site, and leaves
 * no browser or profile behind.
 */

import { execFileSync } from "node:child_process"
import { statSync, rmSync, readdirSync, existsSync } from "node:fs"
import { createServer } from "node:https"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { mkdtempSync } from "node:fs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, "../..")
const PLUGIN = join(REPO, ".opencode/plugins/computer-use/browser-tools.ts")
const SESSION = `ses_tlssandbox_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const TRUSTED = "https://example.com/"

if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error("this acceptance needs a graphical session (DISPLAY or WAYLAND_DISPLAY)")
  process.exit(2)
}

const dataDirectory =
  process.env.OPENCODE_DATA_DIR ?? join(homedir(), ".opencode-v2-pilot", "data", "opencode")
const profileRoot = join(dataDirectory, "browser-profiles")

const certDirectory = mkdtempSync(join(tmpdir(), "ocwc-tls-"))
const keyPath = join(certDirectory, "key.pem")
const certPath = join(certDirectory, "cert.pem")
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
  "-subj", "/CN=localhost", "-keyout", keyPath, "-out", certPath,
], { stdio: "ignore" })

const { readFileSync } = await import("node:fs")
const server = createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (_request, response) => {
    response.writeHead(200, { "content-type": "text/html" })
    response.end("<!doctype html><title>untrusted</title><h1>self-signed</h1>")
  },
)
await new Promise((done) => server.listen(0, "127.0.0.1", done))
const port = server.address().port
const untrustedUrl = `https://127.0.0.1:${port}/`

const { registerBrowserTools } = await import(PLUGIN)
const { withSerializedTools } = await import(join(REPO, ".opencode/plugins/computer-use/serialization.ts"))

const tools = new Map()
const editor = {
  namespace() {},
  add(tool) { tools.set(tool.name, tool) },
  list() { return [...tools.values()] },
  update() {},
}
registerBrowserTools(
  withSerializedTools(editor, "web"),
  { assertPermission: async () => true, dataDirectory, authGuard: undefined },
)

const context = {
  sessionID: SESSION,
  agent: "build",
  messageID: `msg_${SESSION}`,
  id: `call_${SESSION}`,
}
const call = async (name, args = {}) => {
  const tool = tools.get(name)
  if (!tool) throw new Error(`the plugin did not register a ${name} tool`)
  return tool.execute(args, context)
}
const textOf = (result) =>
  (result.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n")

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${detail}`}`)
  if (!ok) failures += 1
}

function chromeProcesses() {
  try {
    const output = execFileSync("ps", ["-eo", "args"], { encoding: "utf8" })
    return output.split("\n").filter((line) => /chrome/i.test(line) && !/ps -eo/.test(line))
  } catch {
    return []
  }
}

function sandboxHelperSetuid() {
  const candidates = ["/opt/google/chrome/chrome-sandbox", "/usr/lib/chromium/chrome-sandbox"]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const mode = statSync(candidate).mode
    if ((mode & 0o4000) !== 0) return candidate
  }
  return null
}

function sessionProfile() {
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
  walk(profileRoot, 0)
  return found.length === 1 ? found[0] : null
}

const cleanupProfiles = () => {
  const candidates = []
  const walk = (directory, depth) => {
    if (depth > 6) return
    let entries = []
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = join(directory, entry.name)
      if (entry.name === SESSION) candidates.push(full)
      else walk(full, depth + 1)
    }
  }
  walk(profileRoot, 0)
  for (const path of candidates) rmSync(path, { recursive: true, force: true })
}

try {
  // 1. An untrusted certificate must be refused, not silently accepted.
  const untrusted = textOf(await call("open", { url: untrustedUrl })).trim()
  const certificateRefusal = /ERR_CERT_[A-Z_]+/.test(untrusted) && !/"tabId"/.test(untrusted)
  check("an untrusted certificate is refused with a named certificate error", certificateRefusal,
    untrusted.slice(0, 140).replace(/\s+/g, " "))

  // 2. A normally trusted site still works, so the refusal above is the certificate.
  let trusted = ""
  try {
    trusted = textOf(await call("open", { url: TRUSTED })).trim()
  } catch (error) {
    trusted = `threw: ${error?.message ?? error}`
  }
  let trustedOk = false
  try {
    const parsed = JSON.parse(trusted)
    trustedOk = typeof parsed.tabId === "string" && /example/i.test(String(parsed.title))
  } catch { trustedOk = false }
  check("a normally trusted site opens", trustedOk, trusted.slice(0, 120).replace(/\s+/g, " "))

  // 3. The browser alive right now must be sandboxed. Scope to THIS worker: its Chrome
  // processes carry the session's profile directory, so an unrelated Chrome is not evidence.
  await new Promise((done) => setTimeout(done, 1000))
  const profile = sessionProfile()
  const mine = profile ? chromeProcesses().filter((line) => line.includes(profile)) : []
  const unsandboxed = mine.filter((line) => /--no-sandbox|--disable-setuid-sandbox/i.test(line))
  check("this worker's Chrome is running", mine.length > 0,
    profile ? `${mine.length} process(es) for ${profile}` : "session profile not found")
  check("none of this worker's Chrome processes disables the sandbox", unsandboxed.length === 0,
    unsandboxed[0] ? unsandboxed[0].slice(0, 120) : `${mine.length} process(es) checked`)
  const helper = sandboxHelperSetuid()
  check("the setuid sandbox helper is present", helper !== null, helper ?? "not found")

  await call("close").catch(() => {})
} finally {
  await new Promise((done) => server.close(done))
  cleanupProfiles()
  console.log(failures === 0 ? "SUMMARY: failures=0" : `SUMMARY: failures=${failures}`)
  process.exitCode = failures === 0 ? 0 : 1
}
