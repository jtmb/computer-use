import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import test, { type TestContext } from "node:test"

import { findGeneratedPreview, openOriginalImage, recoverGeneratedPreview, type PreviewHistoryInput } from "../src/image-preview.ts"
import { readGeneratedImage, saveGeneratedImage } from "../src/output.ts"

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="
const uri = `data:image/png;base64,${PNG}`
const filename = "preview.png"
const messages = (fileUri = uri, status = "completed") => [{ type: "assistant", content: [{
  type: "tool", name: "execute", state: { status, content: [
    { type: "text", text: "Saved image attached; no new generation." },
    { type: "file", mime: "image/png", name: filename, uri: fileUri },
  ] },
}] }]

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "chatgpt-preview with spaces-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const saved = await saveGeneratedImage({ projectDirectory: directory, filename, imageBase64: PNG })
  const image = findGeneratedPreview(messages(), filename)!
  assert.ok(image)
  const session = { sessionID: "ses_preview1", directory }
  const launches: string[] = []
  return { directory, saved, image, session, launches,
    dependencies: { current: () => session, launch: async (value: string) => { launches.push(value) } },
  }
}

test("a preview selects only a completed native PNG attachment, never an arbitrary path/URL", () => {
  const image = findGeneratedPreview(messages(), `\n${filename}\n`)
  assert.ok(image)
  assert.equal(image.width, 1)
  assert.equal(image.height, 1)
  assert.equal(image.uri, uri)
  for (const token of ["../preview.png", "/private/preview.png", "file:///private.png", "https://example.com/a.png", "a.png\npreview.png", "x".repeat(111)]) {
    assert.equal(findGeneratedPreview(messages(), token), undefined)
  }
  assert.equal(findGeneratedPreview(messages(), "other.png"), undefined)
  assert.equal(findGeneratedPreview(messages(uri, "running"), filename), undefined)
  assert.equal(findGeneratedPreview(messages("https://example.com/a.png"), filename), undefined)
  assert.equal(findGeneratedPreview(messages("data:image/png;base64,not-png"), filename), undefined)
  assert.equal(findGeneratedPreview([{ type: "user", content: messages()[0].content }], filename), undefined)
  assert.equal(findGeneratedPreview([null, {}, { type: "assistant", content: [null] }], filename), undefined)
})

test("a reused filename with different attachment bytes is ambiguous, while identical reattachments are allowed", () => {
  assert.ok(findGeneratedPreview([...messages(), ...messages()], filename))
  assert.equal(findGeneratedPreview([...messages(), ...messages(`${uri}AAAA`)], filename), undefined)
})

const previewSession = { sessionID: "ses_preview_history", directory: "/fixture/project" }
function history(pages: unknown[]) {
  const requests: PreviewHistoryInput[] = []
  const controller = new AbortController()
  let current: typeof previewSession | undefined = previewSession
  return { requests, controller, change: (value: typeof current) => { current = value }, dependencies: {
    signal: controller.signal, current: () => current,
    list: async (input: PreviewHistoryInput, options: { signal: AbortSignal }) => {
      assert.equal(options.signal, controller.signal)
      requests.push(input)
      assert.ok(pages.length, "unexpected history request")
      return pages.shift()
    },
  } }
}

test("a reopened preview recovers its completed attachment outside the cached latest message page", async () => {
  const cached = Array.from({ length: 50 }, () => ({ type: "assistant", content: [] }))
  assert.equal(findGeneratedPreview(cached, filename), undefined, "reproduces the cache-only defect")
  const fake = history([
    { data: cached, cursor: { next: "older-page" } },
    { data: messages(), cursor: { next: "oldest-page" } },
    { data: [], cursor: { next: null } },
  ])
  const image = await recoverGeneratedPreview(filename, previewSession, { ...fake.dependencies, cached })
  assert.equal(image?.uri, uri)
  assert.equal(image?.sha256, findGeneratedPreview(messages(), filename)?.sha256)
  assert.deepEqual(fake.requests, [
    { sessionID: previewSession.sessionID, type: "assistant", limit: 50, order: "desc" },
    { sessionID: previewSession.sessionID, type: "assistant", limit: 50, cursor: "older-page" },
    { sessionID: previewSession.sessionID, type: "assistant", limit: 50, cursor: "oldest-page" },
  ])
})

test("recovery rejects conflicting later pages and allows identical duplicate attachments", async () => {
  for (const conflicting of [false, true]) {
    const fake = history([
      { data: messages(), cursor: { next: "older" } },
      { data: messages(conflicting ? `${uri}AAAA` : uri), cursor: {} },
    ])
    const result = recoverGeneratedPreview(filename, previewSession, fake.dependencies)
    if (conflicting) await assert.rejects(result, /Conflicting/)
    else assert.equal((await result)?.uri, uri)
  }
  const fake = history([{ data: messages(), cursor: {} }])
  await assert.rejects(recoverGeneratedPreview(filename, previewSession, {
    ...fake.dependencies, cached: messages(`${uri}AAAA`),
  }), /Conflicting/)
})

test("invalid selectors do not fetch and missing, unfinished or malformed PNGs never become cards", async () => {
  const fake = history([])
  assert.equal(await recoverGeneratedPreview("../image.png", previewSession, fake.dependencies), undefined)
  assert.equal(fake.requests.length, 0)
  for (const data of [[], messages(uri, "running"), messages("data:image/png;base64,not-png")]) {
    const fake = history([{ data, cursor: {} }])
    assert.equal(await recoverGeneratedPreview(filename, previewSession, fake.dependencies), undefined)
  }
})

test("malformed envelopes, oversized pages and cyclic or invalid cursors fail closed", async () => {
  for (const response of [null, {}, { data: [] }, { data: [], cursor: { next: 3 } },
    { data: [], cursor: { next: "" } }, { data: Array(51).fill(null), cursor: {} }]) {
    const fake = history([response])
    await assert.rejects(recoverGeneratedPreview(filename, previewSession, fake.dependencies), /Invalid image history/)
  }
  const fake = history([{ data: [], cursor: { next: "same" } }, { data: messages(), cursor: { next: "same" } }])
  await assert.rejects(recoverGeneratedPreview(filename, previewSession, fake.dependencies), /cursor/)
})

test("recovery remains bounded even if every page has a fresh cursor", async () => {
  const fake = history(Array.from({ length: 40 }, (_, index) => ({ data: [], cursor: { next: `page-${index}` } })))
  await assert.rejects(recoverGeneratedPreview(filename, previewSession, fake.dependencies), /2000-message/)
  assert.equal(fake.requests.length, 40)
})

test("cancellation and session or directory changes prevent recovery before and after a request", async () => {
  const cancelled = history([])
  cancelled.controller.abort()
  await assert.rejects(recoverGeneratedPreview(filename, previewSession, cancelled.dependencies), { name: "AbortError" })
  assert.equal(cancelled.requests.length, 0)
  for (const next of [undefined, { ...previewSession, sessionID: "ses_other" }, { ...previewSession, directory: "/other" }]) {
    const fake = history([{ data: messages(), cursor: {} }])
    await assert.rejects(recoverGeneratedPreview(filename, previewSession, {
      ...fake.dependencies,
      list: async (input, options) => {
        const page = await fake.dependencies.list(input, options)
        fake.change(next)
        return page
      },
    }), /changed/)
  }
  const fake = history([{ data: messages(), cursor: {} }])
  await assert.rejects(recoverGeneratedPreview(filename, previewSession, {
    ...fake.dependencies,
    list: async (input, options) => {
      const page = await fake.dependencies.list(input, options)
      fake.controller.abort()
      return page
    },
  }), { name: "AbortError" })
})

test("Open original verifies the local PNG and dispatches its file URI without changing bytes or creating a copy", async (t) => {
  const fake = await fixture(t)
  await openOriginalImage(fake.image, fake.session, fake.dependencies)
  assert.deepEqual(fake.launches, [pathToFileURL(fake.saved.absolutePath).href])
  assert.deepEqual(await readFile(fake.saved.absolutePath), Buffer.from(PNG, "base64"))
  assert.deepEqual(await readdir(join(fake.directory, "assets", "generated")), [filename])
})

test("Open original refuses a saved file that no longer matches the attachment", async (t) => {
  const fake = await fixture(t)
  await assert.rejects(openOriginalImage({ ...fake.image, sha256: "different" }, fake.session, fake.dependencies), /no longer matches/)
  assert.deepEqual(fake.launches, [])
})

test("missing files, malformed files and symlink replacements cannot be opened", async (t) => {
  const fake = await fixture(t)
  await unlink(fake.saved.absolutePath)
  await assert.rejects(openOriginalImage(fake.image, fake.session, fake.dependencies))
  await writeFile(fake.saved.absolutePath, "invalid PNG")
  await assert.rejects(openOriginalImage(fake.image, fake.session, fake.dependencies))
  await unlink(fake.saved.absolutePath)
  const other = join(fake.directory, "outside.png")
  await writeFile(other, Buffer.from(PNG, "base64"))
  await symlink(other, fake.saved.absolutePath)
  await assert.rejects(openOriginalImage(fake.image, fake.session, fake.dependencies))
  assert.deepEqual(fake.launches, [])
})

test("switching session or project before/during validation prevents launching", async (t) => {
  const fake = await fixture(t)
  for (const current of [undefined, { ...fake.session, sessionID: "ses_other1" }, { ...fake.session, directory: "/other" }]) {
    await assert.rejects(openOriginalImage(fake.image, fake.session, { ...fake.dependencies, current: () => current }), /changed/)
  }
  let current = fake.session
  await assert.rejects(openOriginalImage(fake.image, fake.session, {
    ...fake.dependencies, current: () => current,
    read: async (input) => {
      const loaded = await readGeneratedImage(input)
      current = { ...fake.session, directory: "/other" }
      return loaded
    },
  }), /changed/)
  assert.deepEqual(fake.launches, [])
})

test("cancellation prevents opening and viewer failure is not reported as success", async (t) => {
  const fake = await fixture(t)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(openOriginalImage(fake.image, fake.session, { ...fake.dependencies, signal: controller.signal }))
  assert.deepEqual(fake.launches, [])
  await assert.rejects(openOriginalImage(fake.image, fake.session, {
    ...fake.dependencies, launch: async () => { throw new Error("synthetic viewer unavailable") },
  }), /viewer unavailable/)
})
