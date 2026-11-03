import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { createEffect, createSignal, onCleanup } from "solid-js"

import { ProviderFallback, type ProviderFallbackStatus } from "./rpc.ts"
import {
  appendSidebarContribution,
  formatSidebarStatus,
  parseProviderFallbackStatus,
  type SidebarContribution,
} from "./sidebar.ts"

type SidebarState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; value: ProviderFallbackStatus }

function SidebarStatus(props: { sessionID?: string }) {
  const context = usePlugin()
  const [state, setState] = createSignal<SidebarState>({ kind: "loading" })
  let requestID = 0

  createEffect(() => {
    const currentRequest = ++requestID
    const sessionID = props.sessionID
    let latestRequest = 0
    let alive = true
    const api = context.client.rpc(ProviderFallback)
    const refresh = (showLoading: boolean) => {
      const nextRequest = ++latestRequest
      if (showLoading) setState({ kind: "loading" })
      void api.status({ sessionID }).then(
        (value) => {
          const parsed = parseProviderFallbackStatus(value)
          if (alive && latestRequest === nextRequest) {
            setState(parsed ? { kind: "ready", value: parsed } : { kind: "unavailable" })
          }
        },
        () => {
          if (alive && latestRequest === nextRequest) setState({ kind: "unavailable" })
        },
      )
    }
    const unsubscribe = api.events.on("changed", (event) => {
      if (event.data.sessionID === sessionID) refresh(false)
    })
    refresh(true)
    onCleanup(() => {
      alive = false
      latestRequest += 1
      unsubscribe()
      if (requestID === currentRequest) requestID += 1
    })
  })

  return (
    <box>
      <text>
        {(() => {
          const current = state()
          if (current.kind === "loading") return "Fallback status loading"
          if (current.kind === "unavailable") return "Fallback status unavailable"
          return formatSidebarStatus(current.value)
        })()}
      </text>
    </box>
  )
}

export default Plugin.define({
  id: "computer-use.provider-fallback.tui",
  setup(context) {
    const register = (contribution: SidebarContribution<ReturnType<typeof SidebarStatus>>) =>
      context.ui.slot(contribution)
    return appendSidebarContribution(
      register,
      (props) => <SidebarStatus sessionID={props.sessionID} />,
    )
  },
})
