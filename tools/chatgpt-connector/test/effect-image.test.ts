import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import { Effect, Fiber } from "effect"

import { ChatGPTRequestError } from "../src/backend.ts"
import { createEffectTools, type EffectToolDependencies, type PermissionRequest } from "../src/effect-tools.ts"
import { saveGeneratedImage } from "../src/output.ts"

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="
const call = { sessionID: "ses_first1", agent: "build", messageID: "msg_first1", id: "call_image1" }

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  throw new Error("Image test condition was not reached")
}

async function harness(t: TestContext, overrides: Partial<EffectToolDependencies> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "chatgpt-effect-image-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let currentDirectory = directory
  let requests = 0
  const permissions: PermissionRequest[] = []
  const dependencies: EffectToolDependencies = {
    enableImages: true,
    sessionDirectory: () => Effect.sync(() => currentDirectory),
    assertPermission: (request) => Effect.sync(() => { permissions.push(request) }),
    execute: async () => {
      requests += 1
      assert.equal(permissions.filter((p) => p.action === "edit").length >= 3, true)
      return { text: "Image generated.", imageBase64: PNG }
    },
    ...overrides,
  }
  const image = createEffectTools(dependencies).find((tool) => tool.name === "generate_image")
  const show = createEffectTools(dependencies).find((tool) => tool.name === "show_image")
  assert.ok(image)
  assert.ok(show)
  return {
    directory, dependencies, permissions,
    requests: () => requests,
    move: (path: string) => { currentDirectory = path },
    effect: () => image.execute({ prompt: "A red pixel" }, call),
    run: () => Effect.runPromise(image.execute({ prompt: "A red pixel" }, call)),
    showInput: (input: unknown) => Effect.runPromise(show.execute(input, call)),
    showEffect: (filename: string) => show.execute({ filename }, call),
  }
}

test("image tool preauthorizes exact output and returns saved bytes as native PNG content, not structured output", async (t) => {
  const fake = await harness(t)
  const result = await fake.run()
  assert.ok(Array.isArray(result.content))
  assert.equal("output" in result, false)
  const file = result.content.find((part) => part.type === "file")
  assert.ok(file?.type === "file")
  assert.equal(file.mime, "image/png")
  assert.equal(file.uri, `data:image/png;base64,${PNG}`)
  const previewGuide = result.content.find((part) => part.type === "text")
  assert.ok(previewGuide?.type === "text")
  assert.ok(previewGuide.text.includes(`fenced chatgpt-image block containing only ${file.name}`))
  assert.equal(fake.requests(), 1)
  assert.deepEqual(fake.permissions.map((p) => p.action), ["chatgpt.generate_image", "edit", "edit", "edit"])
  assert.deepEqual(fake.permissions.slice(1).map((p) => p.resources), [
    ["assets"], ["assets/generated"], [`assets/generated/${file.name}`],
  ])
  assert.ok(fake.permissions.every((p) => p.source.id === call.id && p.sessionID === call.sessionID))
  assert.deepEqual(await readFile(join(fake.directory, "assets", "generated", file.name)), Buffer.from(PNG, "base64"))
})

test("image edit denial propagates unchanged before any backend or filesystem work", async (t) => {
  const denied = new Error("synthetic edit denial")
  const fake = await harness(t, {
    assertPermission: (request) => request.action === "edit" ? Effect.fail(denied) : Effect.void,
  })
  await assert.rejects(fake.run(), (error) => String(error).includes(denied.message))
  assert.equal(fake.requests(), 0)
  assert.deepEqual(await readdir(fake.directory), [])
})

test("interrupting an image edit permission ends its fiber without generation", async (t) => {
  let pending = false
  let finished = false
  const fake = await harness(t, {
    assertPermission: (request) => request.action !== "edit" ? Effect.void : Effect.sync(() => { pending = true }).pipe(
      Effect.andThen(Effect.never),
      Effect.ensuring(Effect.sync(() => { finished = true })),
    ),
  })
  const fiber = Effect.runFork(fake.effect())
  await waitFor(() => pending)
  await Effect.runPromise(Fiber.interrupt(fiber))
  assert.equal(finished, true)
  assert.equal(fake.requests(), 0)
  assert.deepEqual(await readdir(fake.directory), [])
})

test("session move while authorizing an image prevents generation", async (t) => {
  const fake = await harness(t)
  fake.dependencies.assertPermission = (request) => Effect.sync(() => {
    if (request.action === "edit") fake.move("/different-project")
  })
  await assert.rejects(fake.run(), /location changed/)
  assert.equal(fake.requests(), 0)
  assert.deepEqual(await readdir(fake.directory), [])
})

test("session move before saving refuses output in the old project", async (t) => {
  const fake = await harness(t)
  fake.dependencies.saveImage = async (input) => {
    fake.move("/different-project")
    return saveGeneratedImage(input)
  }
  const result = await fake.run()
  assert.ok(typeof result.content === "string")
  assert.match(result.content, /could not be safely saved/)
  assert.deepEqual(await readdir(fake.directory), [])
})

test("cancelling image generation aborts the backend and produces no file", async (t) => {
  let started = false
  let aborted = false
  const fake = await harness(t, {
    execute: async (_request, signal) => {
      started = true
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")) }, { once: true })
      })
    },
  })
  const fiber = Effect.runFork(fake.effect())
  await waitFor(() => started)
  await Effect.runPromise(Fiber.interrupt(fiber))
  assert.equal(aborted, true)
  assert.deepEqual(await readdir(fake.directory), [])
})

test("image cancellation waits for save cleanup before releasing the tool", async (t) => {
  let saving = false
  let cleaned = false
  const fake = await harness(t, {
    saveImage: async ({ signal }) => {
      saving = true
      await new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve(), { once: true }))
      await new Promise<void>((resolve) => setImmediate(resolve))
      cleaned = true
      throw new Error("cancelled save")
    },
  })
  const fiber = Effect.runFork(fake.effect())
  await waitFor(() => saving)
  await Effect.runPromise(Fiber.interrupt(fiber))
  assert.equal(cleaned, true)
  assert.deepEqual(await readdir(fake.directory), [])
})

test("malformed image output never reaches the saver or returns a file attachment", async (t) => {
  for (const output of [
    { text: "No image" }, { text: "Bad image", imageBase64: "aGVsbG8=" },
    { text: "Mixed", imageBase64: PNG, sources: [] },
  ]) {
    const fake = await harness(t, { execute: async () => output, saveImage: async () => { throw new Error("must not save") } })
    const result = await fake.run()
    assert.ok(typeof result.content === "string")
    assert.match(result.content, /invalid or oversized PNG/)
    assert.deepEqual(await readdir(fake.directory), [])
  }
})

test("image backend errors are redacted and are never retried as a new generation", async (t) => {
  for (const failure of [new Error("private token and echoed prompt"), new ChatGPTRequestError(403), new ChatGPTRequestError(429)]) {
    let attempts = 0
    const diagnostics: string[] = []
    const fake = await harness(t, {
      execute: async () => { attempts += 1; throw failure },
      onError: (error) => { diagnostics.push(String(error)) },
    })
    const result = await fake.run()
    assert.ok(typeof result.content === "string")
    assert.doesNotMatch(result.content + diagnostics.join(""), /private token|echoed prompt/)
    if (failure instanceof ChatGPTRequestError) assert.match(result.content, new RegExp(String(failure.status)))
    assert.equal(attempts, 1)
    assert.deepEqual(await readdir(fake.directory), [])
  }
})

test("concurrent image calls use distinct preauthorized filenames", async (t) => {
  const fake = await harness(t)
  const results = await Promise.all([fake.run(), fake.run()])
  const names = results.map((result) => {
    assert.ok(Array.isArray(result.content))
    const file = result.content.find((part) => part.type === "file")
    assert.ok(file?.type === "file")
    return file.name
  })
  assert.equal(new Set(names).size, 2)
  assert.deepEqual((await readdir(join(fake.directory, "assets", "generated"))).sort(), names.sort())
})

test("a saver cannot extend the tool's preapproved paths or falsify its receipt", async (t) => {
  const fake = await harness(t, {
    saveImage: async (input) => {
      await input.authorize!("/unapproved/image.png")
      throw new Error("unreachable")
    },
  })
  const refused = await fake.run()
  assert.ok(typeof refused.content === "string")
  assert.match(refused.content, /could not be safely saved/)
  fake.dependencies.saveImage = async () => ({
    absolutePath: "/wrong/image.png", relativePath: "assets/generated/wrong.png", bytes: 0, mimeType: "image/png",
  })
  const mismatched = await fake.run()
  assert.ok(typeof mismatched.content === "string")
  assert.match(mismatched.content, /receipt did not match/)
  assert.deepEqual(await readdir(fake.directory), [])
})

test("unloading after generation prevents image saving and attachment", async (t) => {
  let available = true
  const fake = await harness(t, {
    ensureAvailable: () => { if (!available) throw new Error("connector unavailable") },
    execute: async () => { available = false; return { text: "Generated", imageBase64: PNG } },
  })
  await assert.rejects(fake.run(), /connector unavailable/)
  assert.deepEqual(await readdir(fake.directory), [])
})

test("show_image reattaches the saved PNG with exact read permission and no account request", async (t) => {
  const fake = await harness(t)
  const generated = await fake.run()
  assert.ok(Array.isArray(generated.content))
  const original = generated.content.find((part) => part.type === "file")
  assert.ok(original?.type === "file")
  const result = await fake.showInput({ filename: original.name })
  assert.ok(Array.isArray(result.content))
  assert.equal("output" in result, false)
  const file = result.content.find((part) => part.type === "file")
  assert.deepEqual(file, original)
  assert.equal(fake.requests(), 1, "showing an image must not regenerate it")
  assert.equal(fake.permissions.at(-1)?.action, "read")
  assert.deepEqual(fake.permissions.at(-1)?.resources, [`assets/generated/${original.name}`])
})

test("show_image rejects forged paths/context before permission and handles missing files without generation", async (t) => {
  const fake = await harness(t)
  for (const input of [null, {}, { filename: "../private.png" }, { filename: "/other/private.png" },
    { filename: "test.png", sessionID: "ses_other1" }]) {
    const result = await fake.showInput(input)
    assert.deepEqual(result, { content: "ChatGPT tool arguments are invalid." })
  }
  assert.deepEqual(fake.permissions, [])
  const missing = await fake.showInput({ filename: "missing.png" })
  assert.ok(typeof missing.content === "string")
  assert.match(missing.content, /No new image was generated/)
  assert.equal(fake.requests(), 0)
  assert.deepEqual(await readdir(fake.directory), [])
})

test("show_image respects read denial without contacting ChatGPT", async (t) => {
  const fake = await harness(t, {
    assertPermission: () => Effect.fail(new Error("synthetic read denial")),
  })
  await assert.rejects(fake.showInput({ filename: "test.png" }), /synthetic read denial/)
  assert.equal(fake.requests(), 0)
})

test("show_image permission can be interrupted without an orphan or generation", async (t) => {
  let asked = false
  let cleaned = false
  const fake = await harness(t, {
    assertPermission: () => Effect.sync(() => { asked = true }).pipe(
      Effect.andThen(Effect.never), Effect.ensuring(Effect.sync(() => { cleaned = true })),
    ),
  })
  const fiber = Effect.runFork(fake.showEffect("test.png"))
  await waitFor(() => asked)
  await Effect.runPromise(Fiber.interrupt(fiber))
  assert.equal(cleaned, true)
  assert.equal(fake.requests(), 0)
})
