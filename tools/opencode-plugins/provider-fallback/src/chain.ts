import { modelKey, type ModelRef } from "./model.ts"

export type TierSkip = {
  tier: ModelRef
  reason: "cooldown"
}

export function pickTier(input: {
  chain: readonly ModelRef[]
  startIndex?: number
  wrap?: boolean
  isCooling: (key: string) => boolean
}): { tier?: ModelRef; skipped: TierSkip[] } {
  const skipped: TierSkip[] = []
  const count = input.chain.length
  if (count === 0) return { skipped }

  const startIndex = Math.max(0, Math.floor(input.startIndex ?? 0))
  const attempts = input.wrap ? count : Math.max(0, count - startIndex)
  for (let offset = 0; offset < attempts; offset += 1) {
    const index = input.wrap ? (startIndex + offset) % count : startIndex + offset
    const tier = input.chain[index]
    if (!tier) continue
    if (input.isCooling(modelKey(tier))) {
      skipped.push({ tier, reason: "cooldown" })
      continue
    }
    return { tier, skipped }
  }

  return { skipped }
}
