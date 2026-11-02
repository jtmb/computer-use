import assert from "node:assert/strict"
import { test } from "node:test"

import { registerCaptureTools } from "./capture-tool.ts"
import type { BridgeCommand, BridgeRequest } from "./bridge.ts"
import { registerInputTools } from "./input-tool.ts"
import type { DesktopPermissionRequest, DesktopToolContext } from "./desktop.ts"
import { createCredentialSafety, type CredentialSafety } from "./credential-safety.ts"

type Tool = {
  name: string
  input: { properties: Record<string, unknown>; additionalProperties?: boolean }
  options: { namespace: string; codemode: boolean }
  execute(input: Record<string, unknown>, context: DesktopToolContext): Promise<{
    output?: Record<string, unknown>
    content: Array<{ type: string; text?: string; uri?: string; mime?: string; name?: string }>
  }>
}

type Fake = {
  tools: Map<string, Tool>
  permissions: DesktopPermissionRequest[]
  calls: Array<{ command: BridgeCommand; request?: BridgeRequest }>
  execute(command: BridgeCommand, request?: BridgeRequest): Promise<string>
  fail?: BridgeCommand
  failConfirm?: boolean
  onExecute?: (command: BridgeCommand) => void
}

const context: DesktopToolContext = {
  sessionID: "session-1",
  messageID: "message-1",
  agent: "build",
  id: "desktop_tool",
}
const windowId = "12345678-1234-1234-1234-123456789abc:42"
const observationId = "observation-uuid"
const pngBase64 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("validated-by-python"),
]).toString("base64")

function success(value: Record<string, unknown>): string {
  return JSON.stringify({ available: true, ok: true, ...value })
}

function register(overrides: Partial<Fake> = {}, credentialSafety?: CredentialSafety): Fake {
  const tools = new Map<string, Tool>()
  const permissions: DesktopPermissionRequest[] = []
  const calls: Array<{ command: BridgeCommand; request?: BridgeRequest }> = []
  const fake: Fake = {
    tools,
    permissions,
    calls,
    async execute(command, request) {
      fake.onExecute?.(command)
      calls.push({ command, request })
      if (fake.fail === command || (command === "confirm" && fake.failConfirm))
        throw new Error(`${command} executor offline`)
      if (command === "capture")
        return success({ windowId, observationId, width: 1, height: 1, sha256: "ab".repeat(32), pngBase64 })
      if (command === "input")
        return success({ action: "click", windowId })
      if (command === "release")
        return success({ released: true })
      if (command === "launch")
        return success({
          desktopId: "org.example.Editor",
          beforeWindowIds: ["old-window"],
          launchToken: "launch-capability-1",
          at: 1,
        })
      return success({ appeared: false, windowIds: [] })
    },
    ...overrides,
  }

  const editor = {
    namespace() {},
    add(tool: Tool) { tools.set(tool.name, tool) },
  }
  const dependencies = {
    async assertPermission(request: DesktopPermissionRequest) { permissions.push(request) },
    executeBridge: (command: BridgeCommand, request?: BridgeRequest) => fake.execute(command, request),
    ...(credentialSafety === undefined ? {} : { credentialSafety }),
  }
  registerCaptureTools<Tool>(editor, dependencies)
  registerInputTools<Tool>(editor, dependencies)
  return fake
}

test("capture, input, release, and launch authorize before dispatch", async () => {
  const fake = register()
  for (const tool of fake.tools.values()) {
    assert.equal(tool.options.namespace, "desktop")
    assert.equal(tool.options.codemode, true)
  }
  fake.onExecute = () => assert.ok(fake.permissions.length > 0, "permission must precede bridge dispatch")
  await fake.tools.get("capture")!.execute({ windowId }, context)
  fake.permissions.length = 0
  await fake.tools.get("input")!.execute({ observationId, action: "click", x: 4, y: 7 }, context)
  fake.permissions.length = 0
  await fake.tools.get("release")!.execute({}, context)
  fake.permissions.length = 0
  await fake.tools.get("launch")!.execute({ desktopId: "org.example.Editor" }, context)
  assert.deepEqual(fake.calls.map((call) => call.command), ["capture", "input", "release", "launch", "confirm"])
})

test("capture returns a data-URI file and structured metadata without a filesystem path", async () => {
  const fake = register()
  const result = await fake.tools.get("capture")!.execute({ windowId }, context)
  // Content-only: returning `output` would make the harness surface that object
  // instead of the parts, dropping the PNG. The metadata must ride in the text.
  assert.equal(result.output, undefined, "capture must not return structured output")
  const text = result.content.find((part) => part.type === "text")!.text!
  const metadata = JSON.parse(text.slice(text.indexOf("{")))
  assert.deepEqual(metadata, {
    windowId,
    observationId,
    width: 1,
    height: 1,
    sha256: "ab".repeat(32),
    bytes: Buffer.from(pngBase64, "base64").byteLength,
  })
  assert.equal("path" in metadata, false, "no filesystem path may be reported")
  const file = result.content.find((part) => part.type === "file")!
  assert.equal(file.uri, `data:image/png;base64,${pngBase64}`)
  assert.equal(file.mime, "image/png")
  assert.equal(file.name, "desktop-window.png")
  assert.equal(fake.calls[0].request?.windowId, windowId)
})

test("capture refuses a payload larger than six MiB", async () => {
  const fake = register()
  fake.execute = async (command) => {
    fake.calls.push({ command })
    const oversized = Buffer.alloc(6_291_457)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversized)
    return success({ windowId, observationId, width: 1, height: 1, sha256: "ab".repeat(32), pngBase64: oversized.toString("base64") })
  }
  const result = await fake.tools.get("capture")!.execute({ windowId }, context)
  assert.match(result.content[0].text ?? "", /exceeds the 6291456-byte limit/)
  assert.equal(result.content.some((part) => part.type === "file"), false)
})

test("input rejects an unknown action before permission checks or dispatch", async () => {
  const fake = register()
  const result = await fake.tools.get("input")!.execute({ observationId, action: "launch" }, context)
  assert.match(result.content[0].text ?? "", /action must be click, drag, scroll, press_key, or type_text/)
  assert.deepEqual(fake.permissions, [])
  assert.deepEqual(fake.calls, [])
})

test("input mutation requires read and desktop_mutate permissions before dispatch", async () => {
  const fake = register()
  fake.onExecute = () => assert.deepEqual(fake.permissions.map(({ action }) => action), ["read", "desktop_mutate"])
  await fake.tools.get("input")!.execute({ observationId, action: "click", x: 4, y: 7 }, context)
  assert.deepEqual(fake.permissions.map(({ action }) => action), ["read", "desktop_mutate"])
  assert.deepEqual(fake.permissions[0].resources, ["desktop/input/click"])
  assert.deepEqual(fake.permissions[1].resources, ["desktop/input/click"])
})

test("release always dispatches after its desktop/input read check", async () => {
  const fake = register()
  await fake.tools.get("release")!.execute({}, context)
  assert.deepEqual(fake.permissions.map(({ action, resources }) => ({ action, resources })), [
    { action: "read", resources: ["desktop/input"] },
  ])
  assert.deepEqual(fake.calls, [{ command: "release", request: undefined }])
})

test("launch reports appeared=false when confirmation finds no new matching window", async () => {
  const fake = register()
  const result = await fake.tools.get("launch")!.execute({ desktopId: "org.example.Editor" }, context)
  // Content-only: the structured result is embedded in the text beside the sentence.
  assert.equal(result.output, undefined, "desktop tools must not return structured output")
  const text = result.content.find((part) => part.type === "text")!.text!
  const data = JSON.parse(text.slice(text.indexOf("{")))
  assert.deepEqual(data, {
    launched: true,
    appeared: false,
    windowIds: [],
    desktopId: "org.example.Editor",
  })
  assert.deepEqual(fake.calls.map(({ command }) => command), ["launch", "confirm"])
  // The caller must not supply its own baseline; the bridge binds confirmation
  // to the one-use capability that the launch returned.
  assert.deepEqual(fake.calls[1].request, {
    launchToken: "launch-capability-1",
    timeoutMs: 5000,
  })
})

test("executor failures from each command become readable tool text", async () => {
  for (const command of ["capture", "input", "release", "launch", "confirm"] as const) {
    const fake = register({ fail: command })
    const toolName = command === "capture" ? "capture" : command === "input" ? "input" : command === "release" ? "release" : "launch"
    const input = command === "capture" ? { windowId }
      : command === "input" ? { observationId, action: "click", x: 4, y: 7 }
        : command === "release" ? {}
          : { desktopId: "org.example.Editor" }
    const result = await fake.tools.get(toolName)!.execute(input, context)
    assert.match(result.content[0].text ?? "", /executor offline/)
    assert.deepEqual(Object.keys(result), ["content"], `${command} failure must remain content-only`)
    assert.doesNotThrow(() => JSON.stringify(result))
  }
})

test("a bridge refusal is reported once instead of with a doubled prefix", async () => {
  const fake = register()
  const refusal = JSON.stringify({
    available: true,
    ok: false,
    error: "bridge-rejected",
    detail: "g-io-error-quark: GDBus.Error:org.gnome.Shell.Extensions.OpenCodeWindowControl.Error.REFUSED: The caller context is invalid. (36)",
  })
  fake.execute = async (command) => {
    fake.calls.push({ command })
    return refusal
  }
  const input = await fake.tools.get("input")!.execute({ observationId, action: "click", x: 4, y: 7 }, context)
  const inputText = input.content[0].text ?? ""
  assert.equal((inputText.match(/Desktop input failed/g) ?? []).length, 1, inputText)
  assert.match(inputText, /REFUSED/)

  const capture = await fake.tools.get("capture")!.execute({ windowId }, context)
  const captureText = capture.content[0].text ?? ""
  assert.equal((captureText.match(/Desktop capture failed/g) ?? []).length, 1, captureText)
  assert.match(captureText, /REFUSED/)
})

test("no desktop tool declares structured output", () => {
  // Two live failures taught this: a declared `output` with no schema is rejected
  // outright, and a declared schema makes the harness surface the object instead of
  // the content — which would drop capture's image part and break every failure path
  // that returns text only ("did not return its declared output"). Content-only avoids
  // both, so these tools return text (and, for capture, a file part).
  const fake = register()
  assert.deepEqual([...fake.tools.keys()].sort(), ["capture", "input", "launch", "release"])
  for (const tool of fake.tools.values()) {
    const definition = tool as unknown as { output?: unknown }
    assert.equal(definition.output, undefined, `${tool.name} must not declare an output schema`)
  }
})

test("a filled browser tab blocks compositor capture until it is cleared", async () => {
  const safety = createCredentialSafety()
  safety.mark(context.sessionID, "tab-1")
  const fake = register({}, safety)
  const capture = fake.tools.get("capture")!

  const refused = await capture.execute({ windowId }, context)
  const refusedText = refused.content.find((part) => part.type === "text")!.text!
  assert.match(refusedText, /Refused: a browser tab still has a credential filled/u)
  assert.deepEqual(fake.calls, [], "no bridge call may run while a filled tab exists")

  // Navigating away (or closing the tab) clears the flag and capture resumes.
  safety.clearSession(context.sessionID)
  const allowed = await capture.execute({ windowId }, context)
  assert.match(allowed.content.find((part) => part.type === "text")!.text!, /Captured/u)
  assert.equal(fake.calls.length, 1)
})

test("closing a browser session clears that session's filled tabs only", () => {
  const safety = createCredentialSafety()
  safety.mark("ses_a", "tab-1")
  safety.mark("ses_a", "tab-2")
  safety.mark("ses_b", "tab-1")
  safety.clearSession("ses_a")
  assert.equal(safety.hasAnyFilled("ses_a"), false, "session a is cleared")
  assert.equal(safety.hasAnyFilled("ses_b"), true, "session b keeps its own flag")
  assert.equal(safety.isTabFilled("ses_b", "tab-1"), true)
})

test("elapsed time cannot clear a filled flag without a confirmed lifecycle change", async () => {
  let clock = 1_000
  const safety = createCredentialSafety({ now: () => clock })
  safety.mark(context.sessionID, "tab-1")
  assert.equal(safety.hasAnyFilled(context.sessionID), true)

  clock += 31 * 60_000
  assert.equal(safety.hasAnyFilled(context.sessionID), true, "elapsed time cannot prove that sensitive page contents disappeared")

  const fake = register({}, safety)
  const refused = await fake.tools.get("capture")!.execute({ windowId }, context)
  assert.match(refused.content.find((part) => part.type === "text")!.text!, /Refused/u)
  assert.deepEqual(fake.calls, [])
  safety.clearSession(context.sessionID)
  const allowed = await fake.tools.get("capture")!.execute({ windowId }, context)
  assert.match(allowed.content.find((part) => part.type === "text")!.text!, /Captured/u)
})
