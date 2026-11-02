import path from "node:path"

export interface TuiLocation {
  directory: string
  workspaceID?: string
}

export interface TuiCommandInfo {
  name?: unknown
}

export interface LocationCommandInventory {
  invalidate(location?: TuiLocation): void
  sync(location?: TuiLocation): Promise<void>
  list(location?: TuiLocation): TuiCommandInfo[] | undefined
}

export interface TuiNavigationContract {
  router: {
    navigate(route: { type: "session"; sessionID: string }): unknown
    current(): { type: string; sessionID?: string }
  }
  tabs: {
    enabled(): boolean
    focus(sessionID: string): boolean
  }
}

export type HandoffCommandAvailability =
  | { status: "available" }
  | { status: "collision"; message: string }
  | { status: "unavailable"; message: string }

export type GuardedHandoffResult<T> =
  | { availability: HandoffCommandAvailability; called: false }
  | { availability: { status: "available" }; called: true; value: T }

export interface HandoffKeymapCommand {
  id: string
  title: string
  description: string
  group: string
  palette: true
  slash: { name: "handoff" }
  run: () => void | Promise<void>
}

export function buildHandoffKeymapLayer(available: boolean, run: () => void | Promise<void>) {
  const commands: HandoffKeymapCommand[] = available
    ? [{
        id: "goal-docs.handoff",
        title: "Handoff current session",
        description: "Ask this chat to send a new chat the handoff document link and a contextual continuation prompt",
        group: "Goal documentation",
        palette: true,
        slash: { name: "handoff" },
        run,
      }]
    : []
  return {
    mode: "global",
    commands,
    bindings: available ? ["goal-docs.handoff"] : [],
  } as const
}

export function sameExactWorktree(left?: TuiLocation, right?: TuiLocation): boolean {
  if (!left || !right || !path.isAbsolute(left.directory) || !path.isAbsolute(right.directory)) return false
  if (path.resolve(left.directory) !== path.resolve(right.directory)) return false
  return typeof left.workspaceID !== "string" || typeof right.workspaceID !== "string" || left.workspaceID === right.workspaceID
}

export async function inspectHandoffCommandAvailability(
  inventory: LocationCommandInventory,
  location?: TuiLocation,
): Promise<HandoffCommandAvailability> {
  if (!location?.directory || !path.isAbsolute(location.directory)) {
    return { status: "unavailable", message: "The plugin worktree location is unavailable; /handoff remains disabled." }
  }
  try {
    inventory.invalidate(location)
    await inventory.sync(location)
    const commands = inventory.list(location)
    if (!Array.isArray(commands)) {
      return { status: "unavailable", message: "The location-scoped server command inventory could not be read; /handoff remains disabled." }
    }
    if (commands.some((command) => command.name === "handoff")) {
      return { status: "collision", message: "The server already owns /handoff in this worktree; the goal-docs palette and slash command are both disabled." }
    }
    return { status: "available" }
  } catch {
    return { status: "unavailable", message: "The location-scoped server command inventory could not be read; /handoff remains disabled." }
  }
}

export async function guardedHandoffCall<T>(
  inventory: LocationCommandInventory,
  location: TuiLocation | undefined,
  call: () => Promise<T>,
  onAvailability?: (availability: HandoffCommandAvailability) => boolean | void,
): Promise<GuardedHandoffResult<T>> {
  const availability = await inspectHandoffCommandAvailability(inventory, location)
  const continueCall = onAvailability?.(availability)
  if (availability.status !== "available" || continueCall === false) return { availability, called: false }
  return { availability, called: true, value: await call() }
}

export function focusHandoffTarget(ui: TuiNavigationContract, targetSessionID: string): boolean {
  ui.router.navigate({ type: "session", sessionID: targetSessionID })
  const tabsFocused = !ui.tabs.enabled() || ui.tabs.focus(targetSessionID)
  const route = ui.router.current()
  return tabsFocused && route.type === "session" && route.sessionID === targetSessionID
}
