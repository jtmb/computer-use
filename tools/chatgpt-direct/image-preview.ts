import { BoxRenderable, ImageRenderable, RenderableEvents, TextRenderable, type RenderContext } from "@opentui/core"

import { createOriginalAction, type PreviewImage } from "../chatgpt-connector/src/image-preview.ts"
import { previewDimensions } from "./preview-layout.ts"

export function createRecoveringImagePreview(renderer: RenderContext, options: {
  load: (signal: AbortSignal) => Promise<PreviewImage | undefined>
  open: (image: PreviewImage, signal: AbortSignal) => Promise<void>
  error: (message: string) => void
  signal: AbortSignal
  ready?: (preview: ReturnType<typeof createImagePreviewCard>) => void
}) {
  const box = new BoxRenderable(renderer, { flexDirection: "column", maxWidth: "100%", flexShrink: 1 })
  const status = new TextRenderable(renderer, { content: "Loading image preview…" })
  box.add(status)
  const disposed = new AbortController()
  const signal = AbortSignal.any([options.signal, disposed.signal, AbortSignal.timeout(30_000)])
  box.once(RenderableEvents.DESTROYED, () => disposed.abort())
  const alive = () => !box.isDestroyed && !disposed.signal.aborted && !options.signal.aborted
  // The renderer API is synchronous; the owned container is updated after authenticated recovery.
  void Promise.resolve().then(() => {
    signal.throwIfAborted()
    return options.load(signal)
  }).then((image) => {
    if (!alive()) return
    signal.throwIfAborted()
    if (!image) { status.content = "Image preview unavailable."; return }
    const card = createImagePreviewCard(renderer, image, {
      open: (cardSignal) => options.open(image, AbortSignal.any([options.signal, disposed.signal, cardSignal])),
      error: options.error,
    })
    box.remove(status)
    status.destroyRecursively()
    box.add(card)
    options.ready?.(card)
  }).catch(() => {
    if (alive()) status.content = "Image preview unavailable. Reopen this session to retry."
  })
  return box
}

export function createImagePreviewCard(
  renderer: RenderContext,
  image: PreviewImage,
  options: {
    open: (signal: AbortSignal) => Promise<void>
    error: (message: string) => void
  },
) {
  const disposed = new AbortController()
  const preview = new ImageRenderable(renderer, {
    source: image.uri, protocol: "auto", fit: "fill",
    width: 1, height: 1, maxWidth: "100%", flexShrink: 1,
    onSizeChange() {
      const size = previewDimensions(image.width, image.height, this.width, this.cellAspectRatio)
      if (this.height !== size.height) this.height = size.height
    },
    onMouseUp(event) {
      if (event.button !== 0 || event.isDragging) return
      event.stopPropagation()
      this.focus()
      void open()
    },
    onKeyDown(event) {
      if (event.name !== "return" && event.name !== "space") return
      event.preventDefault()
      event.stopPropagation()
      void open()
    },
    onError: () => options.error("Could not load image preview."),
  })
  preview.once(RenderableEvents.DESTROYED, () => disposed.abort())
  preview.focusable = true
  const size = previewDimensions(image.width, image.height, renderer.width, preview.cellAspectRatio)
  preview.width = size.width
  preview.height = size.height
  const open = createOriginalAction({
    alive: () => !preview.isDestroyed,
    state: (state) => {
      preview.opacity = state === "opening" ? 0.65 : 1
      if (state === "error") options.error("Could not open original. Check the saved PNG and system image viewer.")
    },
    open: () => options.open(disposed.signal),
  })
  return preview
}
