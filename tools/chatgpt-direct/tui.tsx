import { Plugin } from "@opencode/plugin/tui"
import { RenderableEvents, type BaseRenderable } from "@opentui/core"
import { createEffect } from "solid-js"

import { createPermissionRefresher } from "../chatgpt-connector/src/permission-refresh.ts"
import { findGeneratedPreview, openOriginalImage, recoverGeneratedPreview, type PreviewSession } from "../chatgpt-connector/src/image-preview.ts"
import { createImagePreviewCard, createRecoveringImagePreview } from "./image-preview.ts"

/**
 * Clears a permission prompt that an interrupted ChatGPT call left behind.
 *
 * The server removes the pending request on interruption without emitting
 * `permission.replied`, so the client refreshes from server state instead of
 * approving or rejecting anything.
 */
export default Plugin.define({
  id: "chatgpt.permission-refresh",
  setup(context) {
    const lifetime = new AbortController()
    const current = (): PreviewSession | undefined => {
      const route = context.ui.router.current()
      if (route.type !== "session" || lifetime.signal.aborted) return
      const session = context.data.session.get(route.sessionID)
      if (!session) return
      return { sessionID: route.sessionID, directory: session.location.directory }
    }
    let routeLifetime = new AbortController()
    let owner = current()
    let focusedPreview: {
      session: PreviewSession
      preview: ReturnType<typeof createImagePreviewCard>
      signal: AbortSignal
    } | undefined
    const syncOwner = (next: PreviewSession | undefined) => {
      if (next?.sessionID === owner?.sessionID && next?.directory === owner?.directory) return
      focusedPreview = undefined
      routeLifetime.abort()
      routeLifetime = new AbortController()
      owner = next
    }
    createEffect(() => syncOwner(current()))
    const rememberPreview = (preview: ReturnType<typeof createImagePreviewCard>, session: PreviewSession, signal: AbortSignal) => {
      const active = current()
      if (signal.aborted || preview.isDestroyed || active?.sessionID !== session.sessionID || active.directory !== session.directory) return
      const candidate = { session, preview, signal }
      focusedPreview = candidate
      preview.once(RenderableEvents.DESTROYED, () => {
        if (focusedPreview === candidate) focusedPreview = undefined
      })
    }
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "chatgpt.direct.image-preview.focus",
        title: "Focus image preview",
        group: "ChatGPT",
        palette: true,
        enabled: () => current() !== undefined && (context.options.images === undefined || context.options.images === true),
        run: async () => {
          const session = current()
          const candidate = focusedPreview
          // Native dialog.clear() schedules its own 1 ms refocus before running a palette command.
          await new Promise<void>((resolve) => setTimeout(resolve, 1))
          if (lifetime.signal.aborted || candidate?.signal.aborted || context.keymap.mode.current() === "modal") return
          const active = current()
          if (!session || active?.sessionID !== session.sessionID || active.directory !== session.directory) return
          const unavailable = () => context.ui.toast.show({ title: "Image preview", message: "No visible image preview is available in this session.", variant: "error" })
          if (!candidate || focusedPreview !== candidate || candidate.session.sessionID !== session.sessionID || candidate.session.directory !== session.directory) return unavailable()
          const preview = candidate.preview
          if (preview.isDestroyed || !preview.parent || preview.width <= 0 || preview.height <= 0 ||
            preview.screenX + preview.width <= 0 || preview.screenY + preview.height <= 0 ||
            preview.screenX >= context.renderer.width || preview.screenY >= context.renderer.height) return unavailable()
          let ancestor: BaseRenderable | null = preview.parent
          for (let depth = 0; ancestor && depth < 128; depth += 1) {
            if (!ancestor.visible) return unavailable()
            ancestor = ancestor.parent
          }
          if (ancestor || !preview.visible) return unavailable()
          preview.focus()
          context.ui.toast.show({ title: "Image preview", message: preview.focused ? "Image preview focused. Press Enter or Space to open the unchanged original." : "Could not focus the image preview.", variant: preview.focused ? "success" : "error" })
        },
      }],
    }))
    const stopPreview = context.markdown.registerCodeBlockRenderer("chatgpt-image", (token, render) => {
      if (context.options.images !== undefined && context.options.images !== true) return render.defaultRender()
      const session = current()
      if (!session) return render.defaultRender()
      syncOwner(session)
      const cached = context.data.session.message.list(session.sessionID)
      const image = findGeneratedPreview(cached, token.text)
      const signal = AbortSignal.any([lifetime.signal, routeLifetime.signal])
      const error = (message: string) => context.ui.toast.show({ title: "Image preview", message, variant: "error" })
      if (!image) return createRecoveringImagePreview(context.renderer, {
        signal, error,
        load: (signal) => recoverGeneratedPreview(token.text, session, {
          cached, current, signal,
          list: (input, options) => context.client.message.list(input, options),
        }),
        open: (image, signal) => openOriginalImage(image, session, { current, signal }),
        ready: (preview) => rememberPreview(preview, session, signal),
      })
      const preview = createImagePreviewCard(context.renderer, image, {
        open: (cardSignal) => openOriginalImage(image, session, { current, signal: AbortSignal.any([signal, cardSignal]) }),
        error,
      })
      rememberPreview(preview, session, signal)
      return preview
    })
    const refresher = createPermissionRefresher({
      hasCached: (sessionID) => (context.data.session.permission.list(sessionID)?.length ?? 0) > 0,
      refresh: async (sessionID) => {
        context.data.session.permission.invalidate(sessionID)
        await context.data.session.permission.sync(sessionID)
      },
    })
    const stopAsked = context.data.on("permission.asked", (event) => refresher.asked(event.data.sessionID))
    const stopEnded = context.data.on("session.execution.interrupted", (event) => {
      void refresher.interrupted(event.data.sessionID)
    })
    return () => {
      focusedPreview = undefined
      lifetime.abort()
      routeLifetime.abort()
      stopPreview()
      stopAsked()
      stopEnded()
    }
  },
})
