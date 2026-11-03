import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"

import { decodeGeneratedPng, readGeneratedImage, validateGeneratedFilename } from "./output.ts"

export type PreviewImage = Readonly<{
  filename: string
  uri: string
  sha256: string
  width: number
  height: number
}>

export type PreviewSession = Readonly<{ sessionID: string; directory: string }>

export function createOriginalAction(dependencies: {
  alive: () => boolean
  state: (value: "opening" | "idle" | "error") => void
  open: () => Promise<void>
}) {
  let pending: Promise<void> | undefined
  return () => {
    if (pending || !dependencies.alive()) return pending ?? Promise.resolve()
    dependencies.state("opening")
    pending = Promise.resolve().then(() => dependencies.alive() ? dependencies.open() : undefined).then(() => {
      if (dependencies.alive()) dependencies.state("idle")
    }, () => {
      if (dependencies.alive()) dependencies.state("error")
    }).finally(() => { pending = undefined })
    return pending
  }
}

const PNG_PREFIX = "data:image/png;base64,"
const MAX_URI_LENGTH = PNG_PREFIX.length + Math.ceil(16 * 1024 * 1024 / 3) * 4
const runFile = promisify(execFile)

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function previewFilename(token: string): string | undefined {
  if (token.length > 110) return
  try { return validateGeneratedFilename(token.trim()) } catch { return }
}

function selectPreviewUri(messages: readonly unknown[], filename: string, uri?: string): string | null | undefined {
  for (const message of messages.slice(-2000)) {
    const item = record(message)
    if (item?.type !== "assistant" || !Array.isArray(item.content)) continue
    for (const part of item.content) {
      const tool = record(part)
      const state = record(tool?.state)
      if (tool?.type !== "tool" || state?.status !== "completed" || !Array.isArray(state.content)) continue
      for (const content of state.content) {
        const file = record(content)
        if (file?.type !== "file" || file.mime !== "image/png" || file.name !== filename) continue
        if (typeof file.uri !== "string" || !file.uri.startsWith(PNG_PREFIX) || file.uri.length > MAX_URI_LENGTH) return null
        // A historical fence must not silently select different bytes with the same name.
        if (uri !== undefined && uri !== file.uri) return null
        uri = file.uri
      }
    }
  }
  return uri
}

function previewFromUri(filename: string, uri: string): PreviewImage | undefined {
  try {
    const image = decodeGeneratedPng(uri.slice(PNG_PREFIX.length))
    return {
      filename, uri,
      sha256: createHash("sha256").update(image).digest("hex"),
      width: image.readUInt32BE(16), height: image.readUInt32BE(20),
    }
  } catch { return }
}

/** A fence only selects an attachment; it never supplies a path or executable. */
export function findGeneratedPreview(messages: readonly unknown[], token: string): PreviewImage | undefined {
  const filename = previewFilename(token)
  if (!filename) return
  const uri = selectPreviewUri(messages, filename)
  return uri ? previewFromUri(filename, uri) : undefined
}

export type PreviewHistoryInput = {
  sessionID: string
  type: "assistant"
  limit: number
  order?: "desc"
  cursor?: string
}

export async function recoverGeneratedPreview(token: string, session: PreviewSession, dependencies: {
  list: (input: PreviewHistoryInput, options: { signal: AbortSignal }) => Promise<unknown>
  current: () => PreviewSession | undefined
  signal: AbortSignal
  cached?: readonly unknown[]
}): Promise<PreviewImage | undefined> {
  const filename = previewFilename(token)
  if (!filename) return
  const check = () => {
    dependencies.signal.throwIfAborted()
    const current = dependencies.current()
    if (current?.sessionID !== session.sessionID || current.directory !== session.directory) {
      throw new Error("The image's session or project changed.")
    }
  }
  check()
  let uri = selectPreviewUri(dependencies.cached ?? [], filename)
  if (uri === null) throw new Error("Conflicting or invalid image attachments.")
  let cursor: string | undefined
  const seen = new Set<string>()
  // Scan the bounded history to reject conflicting reattachments, not just the first match.
  for (let page = 0; page < 40; page++) {
    check()
    const response = record(await dependencies.list({
      sessionID: session.sessionID, type: "assistant", limit: 50,
      ...(cursor ? { cursor } : { order: "desc" as const }),
    }, { signal: dependencies.signal }))
    check()
    const pagination = record(response?.cursor)
    if (!Array.isArray(response?.data) || response.data.length > 50 || !pagination) {
      throw new Error("Invalid image history response.")
    }
    uri = selectPreviewUri(response.data, filename, uri)
    if (uri === null) throw new Error("Conflicting or invalid image attachments.")
    const next = pagination.next
    if (next === null || next === undefined) {
      return uri ? previewFromUri(filename, uri) : undefined
    }
    if (typeof next !== "string" || !next || next.length > 4096 || seen.has(next)) {
      throw new Error("Invalid image history cursor.")
    }
    seen.add(next)
    cursor = next
  }
  throw new Error("Image history exceeds the 2000-message recovery limit.")
}

export async function launchOriginal(uri: string, signal?: AbortSignal): Promise<void> {
  if (process.platform !== "linux") throw new Error("The original-file viewer currently supports Linux only.")
  await runFile("/usr/bin/xdg-open", [uri], { timeout: 10_000, maxBuffer: 16_384, signal })
}

export async function openOriginalImage(
  image: PreviewImage,
  session: PreviewSession,
  dependencies: {
    current: () => PreviewSession | undefined
    read?: typeof readGeneratedImage
    launch?: typeof launchOriginal
    signal?: AbortSignal
  },
): Promise<void> {
  const check = async () => {
    dependencies.signal?.throwIfAborted()
    const current = dependencies.current()
    if (current?.sessionID !== session.sessionID || current.directory !== session.directory) {
      throw new Error("The image's session or project changed.")
    }
  }
  await check()
  const loaded = await (dependencies.read ?? readGeneratedImage)({
    projectDirectory: session.directory, filename: image.filename,
    signal: dependencies.signal, check,
  })
  if (createHash("sha256").update(loaded.image).digest("hex") !== image.sha256) {
    throw new Error("The saved PNG no longer matches the preview attachment.")
  }
  await check()
  await (dependencies.launch ?? launchOriginal)(pathToFileURL(loaded.absolutePath).href, dependencies.signal)
}
