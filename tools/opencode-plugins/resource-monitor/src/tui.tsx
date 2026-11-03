/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { useKeyboard } from "@opentui/solid"
import { createSignal, type JSX } from "solid-js"
import { createProcReader } from "./proc.ts"
import { createResourceMonitor, type ResourceSnapshot } from "./monitor.ts"
import { footerText, formatCpu, formatMiB, resourceTone } from "./format.ts"
import {
  isPrimaryMouseButton,
  isResourcePanel,
  openPanelOrFallback,
  registerResourceFooterSlots,
  RESOURCE_PANEL_NAME,
} from "./registration.ts"
import { normalizeIntervalMs } from "./options.ts"

function Status(props: { snapshot: () => ResourceSnapshot; open: () => void }) {
  const context = usePlugin()
  const color = () => {
    const tone = resourceTone(props.snapshot())
    return tone === "error"
      ? context.theme.text.feedback.error.base
      : tone === "warning"
        ? context.theme.text.feedback.warning.base
        : context.theme.text.muted
  }

  return <box focusable onMouseDown={(event) => {
    if (!isPrimaryMouseButton(event.button)) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget?.focus()
    props.open()
  }} onKeyDown={(event) => {
    if (event.name !== "return" && event.name !== "space") return
    event.preventDefault()
    props.open()
  }}>
    <text fg={color()}>{footerText(props.snapshot())}</text>
  </box>
}

function ResourcePanel(props: { panel: { focused: boolean; close: () => void }; snapshot: () => ResourceSnapshot }) {
  const context = usePlugin()
  useKeyboard((key) => {
    if (!props.panel.focused || key.name !== "escape") return
    key.preventDefault()
    key.stopPropagation()
    props.panel.close()
  })

  return <box focused focusable flexDirection="column" width="100%" height="100%" padding={1} borderStyle="single" borderColor={context.theme.hue.accent[200]}>
    <text fg={context.theme.hue.accent[200]}><b>TUI process resources</b></text>
    <text fg={context.theme.text.muted}>CPU {formatCpu(props.snapshot().cpuPercent)}</text>
    <text fg={context.theme.text.muted}>RSS {formatMiB(props.snapshot().rssBytes)}</text>
    <text fg={context.theme.text.muted}>Included processes: {props.snapshot().processCount}</text>
    <text fg={context.theme.text.muted}>CPU may exceed 100% across logical CPUs · Esc closes</text>
  </box>
}

export default Plugin.define({
  id: "splice.resource-monitor",
  setup(context) {
    const [snapshot, setSnapshot] = createSignal<ResourceSnapshot>({ rssBytes: Number.NaN, processCount: 0 })
    const intervalMs = normalizeIntervalMs(context.options.intervalMs)
    let stopMonitor: (() => void) | undefined
    let disposed = false

    void createProcReader().then((reader) => {
      if (disposed) return
      stopMonitor = createResourceMonitor(reader, process.pid, intervalMs, setSnapshot)
    }).catch(() => {
      // The footer remains truthful as unavailable when /proc cannot be initialized.
    })

    const registerSlot = (claim: { append: "home.footer.status" | "prompt.footer.status"; render: () => JSX.Element }) =>
      context.ui.slot(claim)
    const openResources = () => openPanelOrFallback(
      () => context.ui.panel.open(RESOURCE_PANEL_NAME, { presentation: "fullscreen" }),
      () => {
        context.ui.dialog.set({ size: "xlarge", centered: true })
        context.ui.dialog.show(() => <ResourcePanel panel={{
          focused: true,
          close: () => context.ui.dialog.clear(),
        }} snapshot={snapshot} />)
      },
    )

    const stopFooters = registerResourceFooterSlots(registerSlot, () => <Status snapshot={snapshot} open={openResources} />)
    const stopPanel = context.ui.slot({
      append: "session.panel",
      render: (panel) => isResourcePanel(panel.name)
        ? <ResourcePanel panel={panel} snapshot={snapshot} />
        : null,
    })

    return () => {
      disposed = true
      stopMonitor?.()
      stopFooters()
      stopPanel()
    }
  },
})
