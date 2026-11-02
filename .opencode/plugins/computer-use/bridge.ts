import { spawn, type ChildProcess } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"

import {
  REPO_ROOT,
  describeDesktopFailure,
  type DesktopPermissionRequest,
  type DesktopToolContext,
} from "./desktop.ts"

export const WINDOW_BRIDGE_SCRIPT = path.join(REPO_ROOT, "scripts", "desktop-windows.py")
export const PNG_MAX_BYTES = 6_291_456
export const BRIDGE_REQUEST_TIMEOUT_MS = 30_000
export const BRIDGE_CAPTURE_TIMEOUT_MS = 11_000

export type BridgeCommand = "capture" | "input" | "release" | "launch" | "confirm"
export type BridgeRequest = Record<string, unknown>
export type BridgeExecutor = (
  command: BridgeCommand,
  request?: BridgeRequest,
  signal?: AbortSignal,
) => Promise<string>

const MAX_REPLY_BYTES = 256 * 1024
const MAX_CAPTURE_OUTPUT_BYTES = 9 * 1024 * 1024
const MAX_REQUEST_BYTES = 16 * 1024
const MAX_FRAME_OVERHEAD_BYTES = 1024

type BridgeDaemonOptions = {
  scriptPath?: string
  pythonExecutable?: string
  timeoutMs?: number
  captureTimeoutMs?: number
}

type PendingRequest = {
  id: number
  command: BridgeCommand
  resolve(value: string): void
  timeout: NodeJS.Timeout
  signal?: AbortSignal
  abortListener?: () => void
}

type BridgeDaemon = {
  child: ChildProcess
  buffer: Buffer
  alive: boolean
  suspended: boolean
  environmentKeys: readonly string[]
  pending?: PendingRequest
}

export type BridgeDaemonControl = {
  readonly environmentKeys: readonly string[]
  isCurrent(): boolean
  suspend(): boolean
  resume(): boolean
}

export type BridgeClient = {
  execute: BridgeExecutor
  ownedDaemonControl(): BridgeDaemonControl | undefined
  stop(): void
}

export interface BridgePermissionDependencies {
  assertPermission(request: DesktopPermissionRequest): Promise<void>
  executeBridge?: BridgeExecutor
}

export function permissionRequest(
  context: DesktopToolContext,
  action: string,
  resource: string,
): DesktopPermissionRequest {
  return {
    sessionID: context.sessionID,
    agent: context.agent,
    source: { type: "tool", messageID: context.messageID, id: context.id },
    action,
    resources: [resource],
    save: [resource],
  }
}

export function permissionResource(...parts: string[]): string {
  return ["desktop", ...parts.map((part) => encodeURIComponent(part).replaceAll("*", "%2A"))].join("/")
}

export function executeBridge(
  command: BridgeCommand,
  request?: BridgeRequest,
  signal?: AbortSignal,
): Promise<string> {
  return sharedBridgeClient.execute(command, request, signal)
}

function daemonFailure(error: object, timeoutMs?: number, mutating = false): string {
  let message = describeDesktopFailure(error, mutating).replace("desktop-control.py failed", "desktop-windows.py failed")
  if (timeoutMs !== undefined) {
    message = message.replace(/timed out after \d+s/, `timed out after ${Math.ceil(timeoutMs / 1000)}s`)
  }
  return message
}

/**
 * Environment for the bridge daemon.
 *
 * D-Bus session addressing is part of this allowlist because it is not a secret but
 * an address: without `DBUS_SESSION_BUS_ADDRESS` (or `XDG_RUNTIME_DIR`, from which the
 * bus socket is derived) GDBus tries to autolaunch a bus, which fails under GNOME
 * with "Cannot autolaunch D-Bus without X11 $DISPLAY". A freshly started daemon then
 * refuses every desktop call even though the Shell bridge is present.
 */
function sanitizedEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    HOME: process.env.HOME ?? homedir(),
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LANG: process.env.LANG ?? "C",
  }
  for (const name of ["DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "DISPLAY", "WAYLAND_DISPLAY"] as const) {
    const value = process.env[name]
    if (typeof value === "string" && value.length > 0) environment[name] = value
  }
  return environment
}

export function createBridgeExecutor(options: BridgeDaemonOptions = {}): BridgeClient {
  const scriptPath = options.scriptPath ?? WINDOW_BRIDGE_SCRIPT
  const pythonExecutable = options.pythonExecutable ?? "/usr/bin/python3"
  const timeoutMs = options.timeoutMs ?? BRIDGE_REQUEST_TIMEOUT_MS
  const captureTimeoutMs = options.captureTimeoutMs ?? BRIDGE_CAPTURE_TIMEOUT_MS
  let daemon: BridgeDaemon | undefined
  let nextId = 1
  let queue: Promise<void> = Promise.resolve()
  let stopped = false

  const complete = (current: BridgeDaemon, pending: PendingRequest, value: string): void => {
    if (current.pending !== pending) return
    clearTimeout(pending.timeout)
    if (pending.signal && pending.abortListener)
      pending.signal.removeEventListener("abort", pending.abortListener)
    current.pending = undefined
    pending.resolve(value)
  }

  const markDead = (current: BridgeDaemon, error: object, kill: boolean, timeoutMs?: number): void => {
    if (!current.alive) return
    current.alive = false
    current.suspended = false
    if (daemon === current) daemon = undefined
    if (current.pending) {
      // Cancelling input or launch stops the client, not work the Shell may
      // already have dispatched for it.
      const mutating = current.pending.command === "input" || current.pending.command === "launch"
      complete(current, current.pending, daemonFailure(error, timeoutMs, mutating))
    }
    if (kill && current.child.exitCode === null && current.child.signalCode === null)
      current.child.kill("SIGKILL")
  }

  const protocolFailure = (current: BridgeDaemon): void => {
    markDead(current, { code: "EPROTO", message: "invalid daemon protocol" }, true)
  }

  const daemonForRequest = (): BridgeDaemon | undefined => {
    if (daemon?.alive) return daemon
    let child: ChildProcess
    const environment = sanitizedEnvironment()
    try {
      child = spawn(pythonExecutable, [scriptPath, "serve"], {
        env: environment,
        stdio: ["pipe", "pipe", "ignore"],
      })
    } catch {
      return undefined
    }
    const created: BridgeDaemon = {
      child,
      buffer: Buffer.alloc(0),
      alive: true,
      suspended: false,
      environmentKeys: Object.freeze(Object.keys(environment).sort()),
    }
    daemon = created
    child.stdout?.on("data", (chunk: Buffer) => {
      if (!created.alive) return
      if (!created.pending) {
        protocolFailure(created)
        return
      }
      created.buffer = Buffer.concat([created.buffer, chunk])
      const newline = created.buffer.indexOf(0x0a)
      const maximum = (created.pending?.command === "capture" ? MAX_CAPTURE_OUTPUT_BYTES : MAX_REPLY_BYTES) + MAX_FRAME_OVERHEAD_BYTES
      if (newline < 0) {
        if (created.buffer.byteLength > maximum) protocolFailure(created)
        return
      }
      const line = created.buffer.subarray(0, newline)
      const remainder = created.buffer.subarray(newline + 1)
      created.buffer = remainder
      const pending = created.pending
      if (!pending || remainder.byteLength > 0) {
        protocolFailure(created)
        return
      }
      if (line.byteLength > maximum) {
        protocolFailure(created)
        return
      }
      let value: unknown
      try {
        value = JSON.parse(line.toString("utf8"))
      } catch {
        protocolFailure(created)
        return
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        protocolFailure(created)
        return
      }
      const response = value as Record<string, unknown>
      if (response.id !== pending.id || typeof response.available !== "boolean" || typeof response.ok !== "boolean") {
        protocolFailure(created)
        return
      }
      delete response.id
      const encoded = JSON.stringify(response)
      const replyLimit = pending.command === "capture"
        ? MAX_CAPTURE_OUTPUT_BYTES
        : MAX_REPLY_BYTES
      if (Buffer.byteLength(encoded, "utf8") > replyLimit) {
        protocolFailure(created)
        return
      }
      complete(created, pending, encoded)
      // Return the original failure, never replay a possibly dispatched action.
      // A later caller must provide fresh state and gets a new owned transport.
      if (response.ok === false && response.transportClosed === true)
        markDead(created, { code: "ECONNRESET", message: "session bus connection closed" }, true)
    })
    // A transport failure is not an exit: the owned child may still be stopped.
    // Retire and terminate it before discarding the only cleanup capability.
    child.stdout?.on("error", () => markDead(created, { code: "EPIPE", message: "daemon output closed" }, true))
    child.stdin?.on("error", () => markDead(created, { code: "EPIPE", message: "daemon input closed" }, true))
    child.once("error", (error) => markDead(created, error, true))
    child.once("exit", (code, signal) => {
      markDead(created, {
        code: code ?? "unknown",
        message: signal ? `daemon exited with signal ${signal}` : "daemon exited before replying",
      }, false)
    })
    return created
  }

  const executeOne: BridgeExecutor = (command, request, signal) => {
    if (stopped) return Promise.resolve(daemonFailure({ code: "ECANCELED", message: "daemon stopped" }))
    if (signal?.aborted) return Promise.resolve(daemonFailure({ name: "AbortError" }))
    let body: string
    try {
      body = JSON.stringify(request ?? {})
      if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES)
        return Promise.resolve(daemonFailure({ code: "EINVAL", message: "request exceeds 16 KiB" }))
    } catch {
      return Promise.resolve(daemonFailure({ code: "EINVAL", message: "request is not JSON serializable" }))
    }
    const id = nextId++
    const frame = JSON.stringify({ id, command, request: JSON.parse(body) }) + "\n"
    if (Buffer.byteLength(frame, "utf8") > MAX_REQUEST_BYTES + MAX_FRAME_OVERHEAD_BYTES)
      return Promise.resolve(daemonFailure({ code: "EINVAL", message: "request frame exceeds protocol limit" }))
    const current = daemonForRequest()
    if (!current || !current.child.stdin) {
      return Promise.resolve(daemonFailure({ code: "ENOENT", message: "daemon could not be started" }))
    }
    const limit = command === "capture" ? captureTimeoutMs : timeoutMs
    return new Promise((resolve) => {
      const pending: PendingRequest = {
        id,
        command,
        resolve,
        timeout: setTimeout(() => {
          markDead(current, { code: "ETIMEDOUT", killed: true, message: "daemon request timed out" }, true, limit)
        }, limit),
        signal,
      }
      if (signal) {
        pending.abortListener = () => markDead(current, { name: "AbortError" }, true)
        signal.addEventListener("abort", pending.abortListener, { once: true })
      }
      current.pending = pending
      current.child.stdin!.write(frame, (error) => {
        if (error) markDead(current, { code: "EPIPE", message: "daemon input failed" }, true)
      })
    })
  }

  const execute: BridgeExecutor = (command, request, signal) => {
    const result = queue.then(() => executeOne(command, request, signal))
    queue = result.then(() => undefined, () => undefined)
    return result
  }

  return {
    execute,
    ownedDaemonControl() {
      const owned = daemon
      if (!owned) return undefined
      const isCurrent = () => !stopped && daemon === owned && owned.alive &&
        owned.child.exitCode === null && owned.child.signalCode === null
      return {
        environmentKeys: owned.environmentKeys,
        isCurrent,
        suspend() {
          if (!isCurrent() || owned.suspended) return false
          try {
            if (!owned.child.kill("SIGSTOP")) return false
            owned.suspended = true
            return true
          } catch {
            return false
          }
        },
        resume() {
          if (!owned.suspended) return false
          if (!isCurrent()) {
            owned.suspended = false
            return false
          }
          try {
            const resumed = owned.child.kill("SIGCONT")
            if (resumed) owned.suspended = false
            return resumed
          } catch {
            return false
          }
        },
      }
    },
    stop() {
      stopped = true
      if (daemon) markDead(daemon, { code: "ECANCELED", message: "daemon stopped" }, true)
    },
  }
}

const sharedBridgeClient = createBridgeExecutor()

export function stopBridgeDaemon(): void {
  sharedBridgeClient.stop()
}

/** Private acceptance-harness capability; it is not registered as a desktop tool. */
export function ownedBridgeDaemonControl(): BridgeDaemonControl | undefined {
  return sharedBridgeClient.ownedDaemonControl()
}

export function parseBridgeResponse(value: string, label: string): Record<string, unknown> {
  let decoded: unknown
  try {
    decoded = JSON.parse(value)
  } catch {
    throw new Error(`${label} returned unreadable output: ${value || "no output"}`)
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded))
    throw new Error(`${label} returned an invalid response object`)
  const response = decoded as Record<string, unknown>
  if (response.ok !== true) {
    const detail = typeof response.detail === "string"
      ? response.detail
      : typeof response.error === "string" ? response.error : "unknown bridge failure"
    throw new Error(`${label} failed: ${detail}`)
  }
  return response
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Join a tool-level prefix to an executor error without repeating a prefix the error
 * already carries. `parseBridgeResponse` throws "<label> failed: <detail>", and the
 * tools used to wrap that again, so the model read "Desktop input failed: Desktop input
 * failed: ...".
 */
export function failureText(prefix: string, error: unknown): string {
  const detail = errorMessage(error)
  return detail.startsWith(prefix) ? detail : `${prefix}: ${detail}`
}
