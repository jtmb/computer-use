import { createHash } from "node:crypto"
import { relative } from "node:path"
import { Effect, Result } from "effect"

import { ChatGPTRequestError } from "./backend.ts"
import type { EffectToolCall, EffectToolDependencies } from "./effect-tools.ts"
import { validateRpcOutput } from "./mcp.ts"
import { decodeGeneratedPng, planGeneratedImage, readGeneratedImage, saveGeneratedImage, validateGeneratedFilename } from "./output.ts"

type ImageResult = {
  content: string | Array<
    { type: "text"; text: string } |
    { type: "file"; uri: string; mime: "image/png"; name: string }
  >
}

function imageAttachment(image: Buffer, file: { filename: string; absolutePath: string }, title: string): ImageResult {
  const sha256 = createHash("sha256").update(image).digest("hex")
  // No structured `output`: native file content must survive Code Mode delivery.
  return {
    content: [
      { type: "text", text: `${title} Saved image: ${file.absolutePath}\nMIME: image/png\nSize: ${image.length} bytes\nSHA-256: ${sha256}\nThe direct TUI companion supports an Open original action: include a fenced chatgpt-image block containing only ${file.filename} in your reply. Terminal previews may be blocky; this action opens the original PNG in the system image viewer without regeneration.` },
      { type: "file", uri: `data:image/png;base64,${image.toString("base64")}`, mime: "image/png", name: file.filename },
    ],
  }
}

export function parseShowImageInput(input: unknown) {
  if (typeof input !== "object" || input === null || Array.isArray(input) ||
    Object.keys(input).length !== 1 || !("filename" in input) || typeof input.filename !== "string") {
    throw new Error("show_image requires only a saved PNG filename")
  }
  return { action: "show_image" as const, filename: validateGeneratedFilename(input.filename) }
}

export function executeShowImageTool(
  filename: string,
  directory: string,
  call: EffectToolCall,
  dependencies: EffectToolDependencies,
): Effect.Effect<ImageResult, unknown> {
  return Effect.gen(function* () {
    const runtime = yield* Effect.context<never>()
    const run = Effect.runPromiseWith(runtime)
    const ensureLocation = () => Effect.gen(function* () {
      yield* Effect.sync(() => dependencies.ensureAvailable?.())
      if ((yield* dependencies.sessionDirectory(call.sessionID)) !== directory) {
        return yield* Effect.fail(new Error("The invoking session location changed."))
      }
    })
    yield* dependencies.assertPermission({
      sessionID: call.sessionID,
      agent: call.agent,
      source: { type: "tool", messageID: call.messageID, id: call.id },
      action: "read",
      resources: [`assets/generated/${filename}`],
      save: [`assets/generated/${filename}`],
    })
    yield* ensureLocation()
    const loaded = yield* Effect.result(cancellable((signal) => readGeneratedImage({
      projectDirectory: directory,
      filename,
      signal,
      check: () => run(ensureLocation(), { signal }),
    }), true))
    if (Result.isFailure(loaded)) {
      return { content: "The saved PNG could not be safely displayed. No new image was generated." }
    }
    return imageAttachment(loaded.success.image, loaded.success, "Saved image attached; no new generation.")
  })
}

function cancellable<Value>(run: (signal: AbortSignal) => Promise<Value>, drain = false) {
  return Effect.callback<Value, unknown>((resume, signal) => {
    const pending = Promise.resolve().then(() => run(signal))
    void pending.then(
      (value) => resume(Effect.succeed(value)),
      (error) => resume(Effect.fail(error)),
    )
    // File cleanup must finish before an interrupted tool releases its scope.
    if (drain) return Effect.promise(() => pending.then(() => undefined, () => undefined))
  })
}

export function executeImageTool(
  prompt: string,
  directory: string,
  call: EffectToolCall,
  dependencies: EffectToolDependencies,
): Effect.Effect<ImageResult, unknown> {
  return Effect.gen(function* () {
    const runtime = yield* Effect.context<never>()
    const run = Effect.runPromiseWith(runtime)
    const plan = planGeneratedImage(directory)
    const paths = [...plan.directories, plan.absolutePath]
    const allowed = new Set(paths)
    const ensureLocation = () => Effect.gen(function* () {
      yield* Effect.sync(() => dependencies.ensureAvailable?.())
      if ((yield* dependencies.sessionDirectory(call.sessionID)) !== directory) {
        return yield* Effect.fail(new Error("The invoking session location changed."))
      }
    })

    // These assertions stay in the tool fiber, before spending generation quota.
    // The saver can only use these exact paths; it never launches permission fibers.
    for (const path of paths) {
      yield* ensureLocation()
      const resource = relative(directory, path)
      yield* dependencies.assertPermission({
        sessionID: call.sessionID,
        agent: call.agent,
        source: { type: "tool", messageID: call.messageID, id: call.id },
        action: "edit",
        resources: [resource],
        save: [resource],
      })
    }
    yield* ensureLocation()

    const generated = yield* Effect.result(cancellable((signal) => dependencies.execute({
      action: "generate_image", prompt, sessionID: call.sessionID, projectDirectory: directory,
    }, signal)))
    if (Result.isFailure(generated)) {
      const detail = generated.failure instanceof ChatGPTRequestError
        ? generated.failure.message
        : "ChatGPT image generation failed."
      dependencies.onError?.(new Error(detail))
      return { content: detail }
    }

    const decoded = yield* Effect.result(Effect.try({
      try: () => {
        const output = validateRpcOutput(generated.success)
        if (!output.imageBase64 || output.sources !== undefined || output.searchPerformed !== undefined) {
          throw new Error("Invalid image response")
        }
        return decodeGeneratedPng(output.imageBase64)
      },
      catch: (error) => error,
    }))
    if (Result.isFailure(decoded)) return { content: "ChatGPT returned an invalid or oversized PNG; nothing was saved or attached." }
    const image = decoded.success
    yield* ensureLocation()

    const saved = yield* Effect.result(cancellable((signal) => (dependencies.saveImage ?? saveGeneratedImage)({
      projectDirectory: directory,
      imageBase64: image.toString("base64"),
      filename: plan.filename,
      signal,
      check: () => run(ensureLocation(), { signal }),
      authorize: async (path) => {
        signal.throwIfAborted()
        if (!allowed.has(path)) throw new Error("Image saver requested an unapproved path.")
        await run(ensureLocation(), { signal })
      },
    }), true))
    if (Result.isFailure(saved)) {
      return { content: "ChatGPT generated an image, but it could not be safely saved. No image was attached; do not automatically repeat the generation." }
    }
    if (saved.success.absolutePath !== plan.absolutePath || saved.success.relativePath !== plan.relativePath ||
      saved.success.bytes !== image.length || saved.success.mimeType !== "image/png") {
      return { content: "The image save receipt did not match the generated image; no image was attached." }
    }

    return imageAttachment(image, plan, "Generated image attached.")
  })
}
