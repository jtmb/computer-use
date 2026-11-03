import type { Context } from "@opencode/plugin/tui/context"
import type { ReceivePolicy } from "./policy.ts"
import type { Selection, SettingsHost } from "./settings.ts"
import type { InboxHost } from "./inbox-ui.ts"
import { record } from "./model.ts"

type RpcOptions = { location: { directory: string }; signal: AbortSignal }
type UpdateInput = { sessionID: string; target: "project" | "chat"; expectedRevision: number; policy: ReceivePolicy | null }
export interface SettingsRpcMethods {
  read(input: { sessionID: string }, options: RpcOptions): Promise<unknown>
  update(input: UpdateInput, options: RpcOptions): Promise<unknown>
}

export interface InboxRpcMethods {
  read(input: { sessionID: string; after?: string; unreadOnly: boolean; limit: number }, options: RpcOptions): Promise<unknown>
  seen(input: { sessionID: string; id: string }, options: RpcOptions): Promise<unknown>
  ownership(input: { sessionID: string }, options: RpcOptions): Promise<unknown>
}
export function createInboxHost(context: TuiContext, rpc: InboxRpcMethods): InboxHost {
  return {
    dialog: context.ui.dialog, toast: context.ui.toast, keymap: context.keymap,
    selected() {
      const route = context.ui.router.current()
      if (route.type !== "session") return undefined
      const session = context.data.session.get(route.sessionID)
      if (!session) return undefined
      const location: unknown = session.location
      const workspaceID = record(location) && typeof location.workspaceID === "string" ? location.workspaceID : undefined
      return { sessionID: session.id, projectID: session.projectID, directory: session.location.directory, workspaceID }
    },
    read: (selected, input, signal) => rpc.read({ sessionID: selected.sessionID, ...input, limit: 10 }, { location: { directory: selected.directory }, signal }),
    seen: (selected, id, signal) => rpc.seen({ sessionID: selected.sessionID, id }, { location: { directory: selected.directory }, signal }),
    ownership: (selected, signal) => rpc.ownership({ sessionID: selected.sessionID }, { location: { directory: selected.directory }, signal }),
  }
}

type TuiContext = Pick<Context, "ui" | "keymap" | "data">

export function createSettingsHost(context: TuiContext, rpc: SettingsRpcMethods): SettingsHost {
  return {
    dialog: context.ui.dialog,
    toast: context.ui.toast,
    keymap: context.keymap,
    selected(): Selection | undefined {
      const route = context.ui.router.current()
      if (route.type !== "session") return undefined
      const session = context.data.session.get(route.sessionID)
      return session ? { sessionID: session.id, directory: session.location.directory } : undefined
    },
    read: (selected, signal) => rpc.read({ sessionID: selected.sessionID }, { location: { directory: selected.directory }, signal }),
    update: (input, selected, signal) => rpc.update(input, { location: { directory: selected.directory }, signal }),
  }
}
