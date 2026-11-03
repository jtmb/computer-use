import assert from "node:assert/strict"
import { test } from "node:test"
import { discoverExistingServer, serverIdentity } from "../scripts/gateway-discovery.mjs"

const info = () => ({ pid: 12345, version: "2.1.1", urls: ["http://127.0.0.1:51789"] })
const sessionID = "ses_existing_chat"

test("discovers a non-default port and verifies the connected instance and existing chat", async () => {
  const calls = []
  const result = await discoverExistingServer(info(), sessionID, async args => {
    calls.push(args)
    if (args[0] === "service") return "http://127.0.0.1:51789\n"
    return JSON.stringify(args.at(-1) === "/api/info" ? info() : { data: { id: sessionID } })
  })
  assert.deepEqual(result, { pid: 12345, version: "2.1.1", target: "http://127.0.0.1:51789", sessionID })
  assert.deepEqual(calls, [["service", "status"], ["api", "get", "/api/info"], ["api", "get", `/api/session/${sessionID}`]])
})

for (const [name, value] of [
  ["missing identity", undefined], ["unknown version", { ...info(), version: "unknown" }],
  ["legacy version", { ...info(), version: "1.9.0" }], ["invalid pid", { ...info(), pid: 0 }],
  ["multiple endpoints", { ...info(), urls: [...info().urls, "https://other.example"] }],
  ...["http://0.0.0.0:51789", "http://192.168.0.1:51789", "https://127.0.0.1:51789",
    "http://user:synthetic@127.0.0.1:51789", "http://127.0.0.1:51789/prefix", "http://127.0.0.1:51789/?query",
    "http://127.0.0.1:51789/#fragment", "http://[::1]:51789", "not a URL",
    "http://127.0.0.1", "http://127.0.0.1:80", "http://127.0.0.1:0"].map(url => [url, { ...info(), urls: [url] }]),
]) test(`refuses ${name} without querying the local service`, async () => {
  let calls = 0
  await assert.rejects(discoverExistingServer(value, undefined, async () => { calls++; return "" }))
  assert.equal(calls, 0)
})

test("PID, advertised endpoint and service-status mismatches all refuse startup", async () => {
  for (const [local, address] of [[{ ...info(), pid: 777 }, info().urls[0]],
    [{ ...info(), urls: ["http://127.0.0.1:51800"] }, "http://127.0.0.1:51800"],
    [info(), "http://127.0.0.1:40000"]]) {
    await assert.rejects(discoverExistingServer(info(), undefined, async args => args[0] === "service" ? address : JSON.stringify(local)), /does not match/)
  }
})

test("wrong or invalid selected chat cannot become a proxy target", async () => {
  const native = async args => args[0] === "service" ? info().urls[0]
    : JSON.stringify(args.at(-1) === "/api/info" ? info() : { data: { id: "ses_different" } })
  await assert.rejects(discoverExistingServer(info(), sessionID, native), /confirm the selected chat/)
  await assert.rejects(discoverExistingServer(info(), "../../credential", native), /invalid/)
})

test("native API failures are redacted and endpoint normalization is deterministic", async () => {
  await assert.rejects(discoverExistingServer(info(), undefined, async args => {
    if (args[0] === "service") return info().urls[0]
    throw new Error("synthetic-private-output")
  }), error => /native API/.test(error.message) && !error.message.includes("synthetic-private-output"))
  assert.equal(serverIdentity({ ...info(), urls: ["http://127.0.0.1:51789/"] }).target, info().urls[0])
})
