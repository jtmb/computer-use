import type { JSX } from "solid-js"

export const RESOURCE_FOOTER_SLOTS = ["home.footer.status", "prompt.footer.status"] as const
export const RESOURCE_PANEL_NAME = "splice.resource-monitor"

type FooterSlot = (claim: { append: typeof RESOURCE_FOOTER_SLOTS[number]; render: () => JSX.Element }) => () => void

export function registerResourceFooterSlots(slot: FooterSlot, render: () => JSX.Element): () => void {
  const stops = RESOURCE_FOOTER_SLOTS.map((append) => slot({ append, render }))
  return () => {
    for (const stop of stops) stop()
  }
}

export function isResourcePanel(name: string): boolean {
  return name === RESOURCE_PANEL_NAME
}

export function isPrimaryMouseButton(button: number): boolean {
  return button === 0
}

export function openPanelOrFallback(openPanel: () => boolean, fallback: () => void): "panel" | "fallback" {
  if (openPanel()) return "panel"
  fallback()
  return "fallback"
}
