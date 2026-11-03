import type { ProviderFallbackStatus } from "./rpc.ts"

export type SidebarSlotProps = {
  sessionID: string
}

export type SidebarContribution<Element = unknown> = {
  append: "sidebar.content"
  render: (props: SidebarSlotProps) => Element
}

export function appendSidebarContribution<Element>(
  slot: (contribution: SidebarContribution<Element>) => () => void,
  render: SidebarContribution<Element>["render"],
): () => void {
  return slot({ append: "sidebar.content", render })
}

export function parseProviderFallbackStatus(value: unknown): ProviderFallbackStatus | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const status = value as Record<string, unknown>
  if (status.state !== "inactive" && status.state !== "configured" && status.state !== "last-fallback") {
    return undefined
  }

  const chainLength = status.chainLength
  if (chainLength !== null && (!Number.isInteger(chainLength) || (chainLength as number) < 0)) return undefined

  let lastFallback: ProviderFallbackStatus["lastFallback"] = null
  if (status.lastFallback !== null) {
    if (typeof status.lastFallback !== "object" || status.lastFallback === null || Array.isArray(status.lastFallback)) {
      return undefined
    }
    const item = status.lastFallback as Record<string, unknown>
    if (
      typeof item.source !== "string" ||
      typeof item.target !== "string" ||
      typeof item.recordedAt !== "number" ||
      !Number.isFinite(item.recordedAt)
    ) {
      return undefined
    }
    lastFallback = { source: item.source, target: item.target, recordedAt: item.recordedAt }
  }

  if (status.state === "last-fallback" && lastFallback === null) return undefined
  return {
    state: status.state,
    chainLength: chainLength as number | null,
    lastFallback,
  }
}

export function formatSidebarStatus(status: ProviderFallbackStatus): string {
  if (status.lastFallback) {
    return `Last fallback: ${status.lastFallback.source} → ${status.lastFallback.target}`
  }
  if (status.state === "configured") return "Configured; waiting for a qualifying provider failure"
  return "Inactive; no effective fallback chain"
}
