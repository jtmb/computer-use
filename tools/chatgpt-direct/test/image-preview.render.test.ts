import assert from "node:assert/strict"
import test from "node:test"
import { ImageRenderable, TextRenderable } from "@opentui/core"
import { createTestRenderer, MouseButtons } from "@opentui/core/testing"

import { findGeneratedPreview } from "../../chatgpt-connector/src/image-preview.ts"
import { createImagePreviewCard, createRecoveringImagePreview } from "../image-preview.ts"

const uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="
const image = findGeneratedPreview([{ type: "assistant", content: [{ type: "tool", state: {
  status: "completed", content: [{ type: "file", mime: "image/png", name: "preview.png", uri }],
} }] }], "preview.png")!

test("the real OpenTUI preview is image-only and opens only after an image click or Enter", async () => {
  const ui = await createTestRenderer({ width: 80, height: 24 })
  try {
    let calls = 0
    let openSignal: AbortSignal | undefined
    const errors: string[] = []
    const card = createImagePreviewCard(ui.renderer, image, { error: (message) => { errors.push(message) }, open: async (signal) => { calls++; openSignal = signal } })
    ui.renderer.root.add(card)
    await ui.renderOnce()
    assert.equal(calls, 0, "rendering must not open an application")
    const frame = ui.captureCharFrame()
    assert.equal(card.getChildrenCount(), 0)
    assert.equal(card.width, 24)
    assert.equal(card.height, 12)
    assert.equal(frame.includes("Open original"), false)
    assert.equal(frame.includes("full resolution"), false)
    assert.equal(frame.includes("preview.png"), false)
    await ui.mockMouse.click(card.x + 1, card.y + 1, MouseButtons.RIGHT)
    assert.equal(calls, 0)
    await ui.mockMouse.click(card.x + 1, card.y + 1, MouseButtons.LEFT)
    await ui.waitFor(() => calls === 1)
    await ui.waitFor(() => card.opacity === 1)
    ui.mockInput.pressEnter()
    await ui.waitFor(() => calls === 2)
    ui.resize(16, 24)
    await ui.renderOnce()
    assert.equal(card.width, 16)
    assert.equal(card.height, 8)
    assert.deepEqual(errors, [])
    card.destroyRecursively()
    assert.equal(openSignal?.aborted, true)
  } finally { await ui.dispose() }
})

test("image clicks prevent duplicate launches, report errors out of band, and tolerate disposal while pending", async () => {
  const ui = await createTestRenderer({ width: 80, height: 24 })
  try {
    let reject: (error: Error) => void = () => undefined
    let calls = 0
    const errors: string[] = []
    const card = createImagePreviewCard(ui.renderer, image, {
      error: (message) => { errors.push(message) }, open: () => { calls++; return new Promise<void>((_, failure) => { reject = failure }) },
    })
    ui.renderer.root.add(card)
    await ui.renderOnce()
    await ui.mockMouse.click(card.x + 1, card.y + 1)
    await ui.waitFor(() => calls === 1)
    ui.mockInput.pressEnter()
    await ui.renderOnce()
    assert.equal(calls, 1)
    reject(new Error("synthetic viewer failure"))
    await ui.waitFor(() => errors.length === 1)
    assert.ok(errors[0].includes("Could not open original"))
    assert.equal(ui.captureCharFrame().includes("Could not open original"), false)
    ui.mockInput.pressEnter()
    await ui.waitFor(() => calls === 2)
    card.destroyRecursively()
    reject(new Error("disposed"))
    await ui.renderOnce()
  } finally { await ui.dispose() }
})

test("history recovery replaces the loading state with the image-only interactive card", async () => {
  const ui = await createTestRenderer({ width: 80, height: 24 })
  try {
    let finish: (value: typeof image) => void = () => undefined
    let opens = 0
    const box = createRecoveringImagePreview(ui.renderer, {
      signal: new AbortController().signal,
      load: () => new Promise((resolve) => { finish = resolve }),
      open: async () => { opens++ }, error: () => assert.fail("unexpected preview error"),
    })
    ui.renderer.root.add(box)
    await ui.renderOnce()
    assert.ok(ui.captureCharFrame().includes("Loading image preview"))
    finish(image)
    await ui.waitFor(() => !ui.captureCharFrame().includes("Loading image preview"))
    const card = box.getChildren()[0]
    assert.equal(box.getChildrenCount(), 1)
    assert.ok(card instanceof ImageRenderable)
    assert.equal(card.width, 24)
    assert.equal(card.height, 12)
    assert.equal(opens, 0)
    await ui.mockMouse.click(card.x + 1, card.y + 1)
    await ui.waitFor(() => opens === 1)
  } finally { await ui.dispose() }
})

test("disposing a recovering card aborts its request and consumes a late rejection", async () => {
  const ui = await createTestRenderer({ width: 80, height: 24 })
  try {
    let signal: AbortSignal | undefined
    let reject: (error: Error) => void = () => undefined
    const box = createRecoveringImagePreview(ui.renderer, {
      signal: new AbortController().signal,
      load: (input) => { signal = input; return new Promise((_, failure) => { reject = failure }) },
      open: async () => assert.fail("must not open"), error: () => assert.fail("must not notify after disposal"),
    })
    ui.renderer.root.add(box)
    await ui.renderOnce()
    box.destroyRecursively()
    assert.equal(signal?.aborted, true)
    reject(new Error("late failure"))
    await ui.renderOnce()
  } finally { await ui.dispose() }
})

test("failed history shows an honest retry state and a route abort ignores late results", async () => {
  const ui = await createTestRenderer({ width: 80, height: 24 })
  try {
    const route = new AbortController()
    let finish: (value: typeof image) => void = () => undefined
    const box = createRecoveringImagePreview(ui.renderer, {
      signal: route.signal, load: () => new Promise((resolve) => { finish = resolve }),
      open: async () => assert.fail("must not open"), error: () => assert.fail("must not notify"),
    })
    ui.renderer.root.add(box)
    await ui.renderOnce()
    route.abort()
    finish(image)
    await ui.renderOnce()
    assert.ok(box.getChildren()[0] instanceof TextRenderable)
    box.destroyRecursively()
    const failed = createRecoveringImagePreview(ui.renderer, {
      signal: new AbortController().signal, load: async () => { throw new Error("synthetic API failure") },
      open: async () => assert.fail("must not open"), error: () => assert.fail("must not notify"),
    })
    ui.renderer.root.add(failed)
    await ui.waitFor(() => ui.captureCharFrame().includes("Reopen this session to retry"))
  } finally { await ui.dispose() }
})
