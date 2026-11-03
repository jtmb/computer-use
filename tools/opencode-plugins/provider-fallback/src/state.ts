import { modelLabel, type ModelRef } from "./model.ts"

export type LastFallback = {
  source: string
  target: string
  recordedAt: number
}

type SessionState = {
  agent?: string
  lastFallback?: LastFallback
  touchedAt: number
}

type Cooldown = {
  until: number
  touchedAt: number
}

export type FallbackState = ReturnType<typeof createFallbackState>

const MAX_SESSIONS = 512
const MAX_ATTEMPTS_PER_SESSION = 128
const MAX_COOLDOWNS = 512

export function createFallbackState(now: () => number = Date.now) {
  const sessions = new Map<string, SessionState>()
  const attempts = new Map<string, Set<string>>()
  const cooldowns = new Map<string, Cooldown>()

  const ensureSession = (sessionID: string) => {
    let session = sessions.get(sessionID)
    if (session) return session

    if (sessions.size >= MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((left, right) => left[1].touchedAt - right[1].touchedAt)[0]
      if (oldest) {
        sessions.delete(oldest[0])
        attempts.delete(oldest[0])
      }
    }
    session = { touchedAt: now() }
    sessions.set(sessionID, session)
    return session
  }

  return {
    setAgent(sessionID: string, agent: string) {
      if (!sessionID || !agent) return
      const session = ensureSession(sessionID)
      session.agent = agent
      session.touchedAt = now()
    },
    getAgent(sessionID: string): string | undefined {
      return sessions.get(sessionID)?.agent
    },
    setCooldown(key: string, until: number) {
      if (!key || !Number.isFinite(until)) return
      if (!cooldowns.has(key) && cooldowns.size >= MAX_COOLDOWNS) {
        const oldest = [...cooldowns.entries()].sort((left, right) => left[1].touchedAt - right[1].touchedAt)[0]
        if (oldest) cooldowns.delete(oldest[0])
      }
      cooldowns.set(key, { until, touchedAt: now() })
    },
    isCooling(key: string): boolean {
      const cooldown = cooldowns.get(key)
      return !!cooldown && cooldown.until > now()
    },
    hasAttempt(sessionID: string, token: string): boolean {
      return attempts.get(sessionID)?.has(token) ?? false
    },
    markAttempt(sessionID: string, token: string) {
      const entries = attempts.get(sessionID) ?? new Set<string>()
      if (entries.has(token)) return
      if (entries.size >= MAX_ATTEMPTS_PER_SESSION) {
        const oldest = entries.values().next().value as string | undefined
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.add(token)
      attempts.set(sessionID, entries)
      ensureSession(sessionID).touchedAt = now()
    },
    recordFallback(sessionID: string, source: ModelRef, target: ModelRef) {
      if (!sessionID) return
      const session = ensureSession(sessionID)
      session.lastFallback = {
        source: modelLabel(source),
        target: modelLabel(target),
        recordedAt: now(),
      }
      session.touchedAt = now()
    },
    lastFallback(sessionID: string): LastFallback | undefined {
      const record = sessions.get(sessionID)?.lastFallback
      return record ? { ...record } : undefined
    },
    clearSession(sessionID: string) {
      sessions.delete(sessionID)
      attempts.delete(sessionID)
    },
    snapshot() {
      return {
        sessions: [...sessions.entries()].map(([sessionID, session]) => ({
          sessionID,
          agent: session.agent,
          lastFallback: session.lastFallback ? { ...session.lastFallback } : undefined,
        })),
        cooldowns: [...cooldowns.entries()].map(([key, cooldown]) => ({ key, ...cooldown })),
        attempts: [...attempts.entries()].map(([sessionID, values]) => ({ sessionID, tokens: [...values] })),
      }
    },
  }
}
