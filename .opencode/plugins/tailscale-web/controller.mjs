/**
 * TUI surface for the Docker web gateway. It registers its own `tailscale-web`
 * command instead of replacing native `server.pair`, so `/web` and `/pair` stay
 * native and this gateway is opt-in. A pairing link is shown only after the
 * connected server identity is re-verified against the gateway, because a route
 * published for one backend must not silently proxy whatever later reuses that port.
 */
import { createDockerWeb } from "../../../tailscale/scripts/web-on-demand.mjs"
import { sameServer, serverIdentity } from "../../../tailscale/scripts/gateway-discovery.mjs"

export function registerDockerWeb(context, web = createDockerWeb()) {
  let disposed = false, busy = false
  const lifetime = new AbortController()
  const selectedSession = () => {
    const route = context.ui.router.current()
    return route.type === "session" ? route.sessionID : undefined
  }
  const connectedInfo = async () => {
    try { return await context.client.server.info({ signal: lifetime.signal }) }
    catch { throw new Error("Cannot verify the connected OpenCode instance; no pairing link was generated.") }
  }
  context.keymap.layer(() => ({
    mode: "global",
    priority: 100,
    commands: [{
      // A distinct command ID leaves native /web and /pair untouched.
      id: "computer-use.tailscale-web.open",
      title: "Open Docker web over private Tailscale",
      group: "Tailscale Docker",
      palette: true,
      slash: { name: "tailscale-web", arguments: true },
      async run(input) {
        if (disposed) return
        const action = input?.trim() ?? ""
        if (action !== "" && action !== "stop") {
          context.ui.toast.show({ variant: "error", message: "Use /tailscale-web or /tailscale-web stop." })
          return
        }
        if (busy) {
          context.ui.toast.show({ variant: "warning", message: "A Docker web action is already in progress." })
          return
        }
        busy = true
        context.ui.toast.show({ variant: "info", message: action === "stop" ? "Stopping Docker web…" : "Starting private Docker web…" })
        try {
          if (action === "stop") {
            await web.stop()
            if (!disposed) context.ui.toast.show({ variant: "success", message: "Docker web stopped; volumes and identity preserved." })
          } else {
            const sessionID = selectedSession(), server = await connectedInfo()
            if (disposed || selectedSession() !== sessionID) return
            const result = await web.start({ server, sessionID })
            if (disposed) return
            // A route published for one backend must not outlive a changed or
            // unverifiable identity and silently proxy whatever reuses that port.
            const stopGateway = async () => {
              if (disposed) return ""
              try { await web.stop(); return " The gateway was stopped." }
              catch { return " Gateway stop was not confirmed; run /tailscale-web stop." }
            }
            const sameInstance = async () => {
              try { return sameServer(result.instance, serverIdentity(await connectedInfo())) }
              catch { return false }
            }
            const changed = async () => {
              throw new Error("The connected OpenCode instance changed or could not be re-verified; no pairing link was displayed." + await stopGateway())
            }
            if (!(await sameInstance())) await changed()
            if (disposed || selectedSession() !== sessionID) return
            let pairing
            try { pairing = await context.client.server.pair({ signal: lifetime.signal }) }
            catch {
              if (disposed) return
              if (!(await sameInstance())) await changed()
              throw new Error("Gateway is ready, but native pairing failed. Retry /tailscale-web or use /tailscale-web stop.")
            }
            if (disposed) return
            if (!(await sameInstance())) await changed()
            if (disposed || selectedSession() !== sessionID) return
            if (typeof pairing.code !== "string" || !/^[a-zA-Z0-9_-]{16,128}$/.test(pairing.code)
              || !Number.isFinite(pairing.expires_in) || pairing.expires_in <= 0 || pairing.expires_in > 300) {
              throw new Error("Native pairing returned invalid metadata; no link was displayed.")
            }
            // Pairing codes stay in this user-triggered native UI, never in model tools/storage/logs.
            const link = new URL(`/auth/connect/${encodeURIComponent(pairing.code)}`, result.url).href
            await context.ui.dialog.alert({
              title: "Existing OpenCode · private Docker gateway",
              message: `Open this single-use link on your Tailscale-connected device within ${Math.ceil(pairing.expires_in / 60)} minutes:\n${link}\n\nGateway address: ${result.url}\nThis connects to your existing OpenCode instance and chats, not a separate Docker server. Remote access is not verified by this local check.\n\nDo not share this pairing link. /tailscale-web stop stops only the gateway; OpenCode keeps running.`,
            })
          }
        } catch (error) {
          if (!disposed) context.ui.toast.show({ variant: "error", message: error instanceof Error ? error.message : "Docker web failed." })
        } finally { busy = false }
      },
    }],
  }))
  return () => { disposed = true; lifetime.abort(); web.dispose() }
}
