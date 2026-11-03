import type { ResourceSnapshot } from "./monitor.ts"

export type ResourceTone = "normal" | "warning" | "error"

export function formatMiB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "? MiB"
  return `${Math.round(bytes / 1_048_576)} MiB`
}

export function formatCpu(percent: number | undefined): string {
  return percent === undefined || !Number.isFinite(percent) || percent < 0 ? "?%" : `${Math.round(percent)}%`
}

export function footerText(snapshot: ResourceSnapshot): string {
  return `CPU ${formatCpu(snapshot.cpuPercent)} · RAM ${formatMiB(snapshot.rssBytes)}`
}

export function resourceTone(snapshot: ResourceSnapshot): ResourceTone {
  if ((snapshot.cpuPercent ?? 0) >= 95 || snapshot.rssBytes >= 2 * 1_073_741_824) return "error"
  if ((snapshot.cpuPercent ?? 0) >= 80 || snapshot.rssBytes >= 1_073_741_824) return "warning"
  return "normal"
}
