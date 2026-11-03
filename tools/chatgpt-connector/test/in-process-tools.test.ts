import assert from "node:assert/strict"
import test from "node:test"

import { createInProcessTools, IN_PROCESS_NAMESPACE, type InProcessCall, type InProcessDependencies } from "../src/in-process-tools.ts"

function fakeCall(signal = new AbortController().signal): InProcessCall {
  return { sessionID: "ses_first1", agent: "build", messageID: "msg_first1", id: "call_first1", signal }
}

function harness(overrides: Partial<InProcessDependencies> = {}) {
  const requests: Array<{ input: unknown; signal: AbortSignal }> = []
  const permissions: unknown[] = []
  const directories: string[] = []
  const saved: unknown[] = []
  const dependencies: InProcessDependencies = {
    permission: { assert: async (input) => { permissions.push(input) } },
    sessionDirectory: async (sessionID) => {
      directories.push(sessionID)
      return "/repo/a"
    },
    execute: async (input, signal) => {
      requests.push({ input, signal })
      if (input.action === "generate_image") return { text: "Image generated.", imageBase64: "ZmFrZQ==" }
      if (input.action === "web_search") {
        return { text: "Synthetic result", searchPerformed: true, sources: [{ title: "Example", url: "https://example.com/" }] }
      }
      return { text: "Synthetic reply" }
    },
    saveImage: async ({ authorize, ...input }) => {
      await authorize("/repo/a/assets/generated/test.png")
      saved.push(input)
      return { absolutePath: "/repo/a/assets/generated/test.png", relativePath: "assets/generated/test.png", bytes: 4, mimeType: "image/png" }
    },
    ...overrides,
  }
  const tools = createInProcessTools(dependencies)
  const tool = (name: string) => {
    const found = tools.find((candidate) => candidate.name === name)
    assert.ok(found)
    return found
  }
  return { tools, tool, requests, permissions, directories, saved }
}

test("direct tools use verified invocation identity and permission before fake execution", async () => {
  const fake = harness()
  assert.deepEqual(fake.tools.map((tool) => tool.name), ["generate_image", "web_search", "chat"])
  assert.ok(fake.tools.every((tool) => tool.options.namespace === IN_PROCESS_NAMESPACE && tool.options.codemode === true))
  const call = fakeCall()
  assert.deepEqual(await fake.tool("chat").execute({ prompt: "Synthetic prompt" }, call), { content: "Synthetic reply" })
  assert.deepEqual(fake.directories, ["ses_first1"])
  assert.deepEqual(fake.permissions, [{
    sessionID: "ses_first1",
    agent: "build",
    source: { type: "tool", messageID: "msg_first1", id: "call_first1" },
    action: "chatgpt.chat",
    resources: ["chatgpt.com"],
    save: ["chatgpt.com"],
  }])
  assert.deepEqual(fake.requests.map(({ input }) => input), [{ action: "chat", prompt: "Synthetic prompt", sessionID: "ses_first1" }])
  assert.equal(fake.requests[0]?.signal, call.signal)
})

test("invalid or forged inputs do not resolve the session or request permission", async () => {
  const fake = harness()
  for (const input of [null, {}, { prompt: " " }, { prompt: "test", sessionID: "ses_other1" }]) {
    const result = await fake.tool("chat").execute(input, fakeCall())
    assert.match(result.content, /arguments are invalid/)
  }
  assert.deepEqual(fake.directories, [])
  assert.deepEqual(fake.permissions, [])
  assert.deepEqual(fake.requests, [])
})

test("missing or aborted cancellation signals and permission denial fail before execution", async () => {
  const denied = new Error("synthetic permission denial")
  let permissionCalls = 0
  const fake = harness({ permission: { assert: async () => { permissionCalls++; throw denied } } })
  const missingSignal = { ...fakeCall(), signal: undefined }
  await assert.rejects(fake.tool("chat").execute({ prompt: "test" }, missingSignal), /cancellation support/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(fake.tool("chat").execute({ prompt: "test" }, fakeCall(controller.signal)), /cancelled/)
  await assert.rejects(fake.tool("chat").execute({ prompt: "test" }, fakeCall()), (error) => error === denied)
  assert.equal(permissionCalls, 1)
  assert.deepEqual(fake.requests, [])
  assert.deepEqual(fake.saved, [])
})

test("cancellation during permission and project resolution prevents execution", async () => {
  const duringPermission = new AbortController()
  const first = harness({ permission: { assert: async () => { duringPermission.abort() } } })
  await assert.rejects(first.tool("chat").execute({ prompt: "test" }, fakeCall(duringPermission.signal)), /cancelled/)
  assert.deepEqual(first.requests, [])

  const duringResolution = new AbortController()
  let asked = false
  const second = harness({
    permission: { assert: async () => { asked = true } },
    sessionDirectory: async () => { duringResolution.abort(); return "/repo/a" },
  })
  await assert.rejects(second.tool("chat").execute({ prompt: "test" }, fakeCall(duringResolution.signal)), /cancelled/)
  assert.equal(asked, false)
  assert.deepEqual(second.requests, [])
})

test("fake search and image results reuse the adapter's output and project checks", async () => {
  const fake = harness()
  const call = fakeCall()
  const search = await fake.tool("web_search").execute({ query: "synthetic", mode: "quick" }, call)
  assert.match(search.content, /Example — https:\/\/example\.com\//)
  const image = await fake.tool("generate_image").execute({ prompt: "synthetic" }, call)
  assert.match(image.content, /assets\/generated\/test\.png/)
  assert.deepEqual(fake.saved, [{ projectDirectory: "/repo/a", imageBase64: "ZmFrZQ==" }])
  assert.deepEqual(fake.permissions[2], {
    sessionID: "ses_first1", agent: "build",
    source: { type: "tool", messageID: "msg_first1", id: "call_first1" },
    action: "edit", resources: ["assets/generated/test.png"], save: ["assets/generated/test.png"],
  })
  assert.deepEqual(fake.requests[1]?.input, {
    action: "generate_image", prompt: "synthetic", sessionID: "ses_first1", projectDirectory: "/repo/a",
  })
})

test("direct image saving rechecks session location and propagates edit denial", async () => {
  const denied = new Error("synthetic edit denial")
  const permission = harness({
    permission: { assert: async (input) => {
      if (input.action === "edit" && input.resources.some((resource) => /^assets\/generated\/[^/]+\.png$/.test(resource))) throw denied
    } },
  })
  await assert.rejects(permission.tool("generate_image").execute({ prompt: "synthetic" }, fakeCall()), (error) => error === denied)
  assert.deepEqual(permission.saved, [])

  let locations = 0
  const moved = harness({ sessionDirectory: async () => ++locations === 1 ? "/repo/a" : "/repo/b" })
  const result = await moved.tool("generate_image").execute({ prompt: "synthetic" }, fakeCall())
  assert.match(result.content, /could not be safely saved/)
  assert.deepEqual(moved.saved, [])
})

test("direct image authorization refuses external, relative, or wildcard paths", async () => {
  let editChecks = 0
  for (const path of ["/repo/other/test.png", "assets/generated/test.png", "/repo/a/assets/generated/*.png"]) {
    const fake = harness({
      permission: { assert: async (input) => { if (input.action === "edit") editChecks++ } },
      saveImage: async ({ authorize }) => {
        await authorize(path)
        throw new Error("unexpected save")
      },
    })
    const result = await fake.tool("generate_image").execute({ prompt: "synthetic" }, fakeCall())
    assert.match(result.content, /could not be safely saved/)
  }
  assert.equal(editChecks, 0)
})

test("an unverified search response or cancellation before image save fails closed", async () => {
  const controller = new AbortController()
  const fake = harness({
    execute: async (input) => {
      if (input.action === "web_search") return { text: "unverified", searchPerformed: false }
      controller.abort()
      return { text: "late image", imageBase64: "ZmFrZQ==" }
    },
  })
  const search = await fake.tool("web_search").execute({ query: "synthetic" }, fakeCall())
  assert.match(search.content, /Search was not completed/)
  await assert.rejects(fake.tool("generate_image").execute({ prompt: "synthetic" }, fakeCall(controller.signal)), /cancelled/)
  assert.deepEqual(fake.saved, [])
})

test("a pending direct request receives and reacts to the invoking cancellation signal", async () => {
  let started!: () => void
  const waiting = new Promise<void>((resolve) => { started = resolve })
  const fake = harness({
    execute: async (_input, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("synthetic abort")), { once: true })
      started()
    }),
  })
  const controller = new AbortController()
  const pending = fake.tool("chat").execute({ prompt: "test" }, fakeCall(controller.signal))
  await waiting
  controller.abort()
  await assert.rejects(pending, /cancelled/)
})

test("unloading a direct tool snapshot prevents late permission grants and image writes", async () => {
  let available = true
  const ensureAvailable = () => { if (!available) throw new Error("ChatGPT connector is unavailable.") }
  const pendingApproval = harness({
    ensureAvailable,
    permission: { assert: async () => { available = false } },
  })
  await assert.rejects(pendingApproval.tool("chat").execute({ prompt: "test" }, fakeCall()), /unavailable/)
  assert.deepEqual(pendingApproval.requests, [])

  available = true
  const pendingImage = harness({
    ensureAvailable,
    permission: { assert: async (input) => { if (input.action === "edit") available = false } },
  })
  await assert.rejects(pendingImage.tool("generate_image").execute({ prompt: "test" }, fakeCall()), /unavailable/)
  assert.deepEqual(pendingImage.saved, [])
})
