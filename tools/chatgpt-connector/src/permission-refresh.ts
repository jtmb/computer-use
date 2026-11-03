/**
 * Repairs the client permission cache after a cancelled tool call.
 *
 * Interrupting an Effect permission assertion removes the server-side request
 * without publishing `permission.replied`, so a client that caches prompts keeps
 * showing one. Refreshing reads server state; it never approves or rejects.
 */

export type PermissionCache = {
  hasCached(sessionID: string): boolean
  refresh(sessionID: string): Promise<void>
}

export type PermissionRefresher = {
  /** Note a prompt that arrived while a refresh was in flight. */
  asked(sessionID: string): void
  /** Reconcile a session whose execution was interrupted. */
  interrupted(sessionID: string): Promise<void>
}

export const MAX_REFRESH_ATTEMPTS = 3

export function createPermissionRefresher(
  cache: PermissionCache,
  attempts: number = MAX_REFRESH_ATTEMPTS,
): PermissionRefresher {
  const inFlight = new Set<string>()
  const raced = new Set<string>()

  return {
    asked(sessionID) {
      if (inFlight.has(sessionID)) raced.add(sessionID)
    },
    async interrupted(sessionID) {
      // A session with no cached prompt has nothing stale to clear; skipping avoids
      // an HTTP read for every unrelated cancelled turn.
      if (inFlight.has(sessionID) || !cache.hasCached(sessionID)) return
      inFlight.add(sessionID)
      try {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          raced.delete(sessionID)
          await cache.refresh(sessionID)
          // A `permission.asked` event can overtake the list response. Re-read while
          // prompts keep arriving, then let the event stream own the cache again.
          if (!raced.has(sessionID)) return
        }
      } catch {
        // Keep the previous cache. The next interruption or reconnect reconciles it.
      } finally {
        inFlight.delete(sessionID)
        raced.delete(sessionID)
      }
    },
  }
}
