/**
 * Tabs whose password was filled and which have not left the form since.
 *
 * Shared between the browser and desktop surfaces on purpose. The first version kept
 * this state inside `browser-tools.ts`, which meant `web.screenshot` refused but
 * `desktop.capture` — which photographs the same window through the compositor —
 * happily imaged a page that could be showing the value. One module, consulted by
 * both surfaces, closes that hole.
 *
 * Keys are `sessionID\0tabId`; the NUL keeps a session prefix match exact, so one
 * session never clears another's flags. A flag is removed only by an observed tab
 * navigation or confirmed session close, never by elapsed time.
 */

export interface CredentialSafety {
  /** Record that this tab holds a value the human typed; it must navigate before it is imaged. */
  mark(sessionID: string, tabId: string): void
  /** Clear one tab: it navigated to a new document or was closed. */
  clear(sessionID: string, tabId: string): void
  /** Clear every tab of one session, for example when its worker is closed. */
  clearSession(sessionID: string): void
  /** True when this exact tab still holds a filled value. */
  isTabFilled(sessionID: string, tabId: string): boolean
  /** True for one session, or globally when no browser window can be mapped to a session. */
  hasAnyFilled(sessionID?: string): boolean
}

/**
 * One instance per plugin load. A module-level set would leak state across reloads and
 * tests, and the reviewer found exactly that kind of stale state when a session closed.
 */
// Keep the legacy clock option accepted, but elapsed time no longer clears protection.
export function createCredentialSafety(_options: { readonly now?: () => number } = {}): CredentialSafety {
  const filledTabs = new Set<string>()
  const key = (sessionID: string, tabId: string): string => `${sessionID}\u0000${tabId}`
  const prefixOf = (sessionID: string): string => `${sessionID}\u0000`

  return Object.freeze({
    mark(sessionID: string, tabId: string): void {
      filledTabs.add(key(sessionID, tabId))
    },
    clear(sessionID: string, tabId: string): void {
      filledTabs.delete(key(sessionID, tabId))
    },
    clearSession(sessionID: string): void {
      const prefix = prefixOf(sessionID)
      for (const entry of [...filledTabs.keys()]) {
        if (entry.startsWith(prefix)) filledTabs.delete(entry)
      }
    },
    isTabFilled(sessionID: string, tabId: string): boolean {
      return filledTabs.has(key(sessionID, tabId))
    },
    hasAnyFilled(sessionID?: string): boolean {
      if (sessionID === undefined) return filledTabs.size > 0
      const prefix = prefixOf(sessionID)
      for (const entry of filledTabs.keys()) {
        if (entry.startsWith(prefix)) return true
      }
      return false
    },
  })
}
