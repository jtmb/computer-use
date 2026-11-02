import path from "node:path"

import { throwIfAborted } from "./abort.ts"

export interface SessionLocation {
  directory: string
  workspaceID?: string
  project?: { id?: string; directory?: string; canonical?: string }
  [key: string]: unknown
}

export interface SessionInfo extends Record<string, unknown> {
  id: string
  location: SessionLocation
  projectID?: string
}

export interface PluginLocation {
  directory?: string
  project?: { id?: string; directory?: string; canonical?: string }
  workspaceID?: string
}

export interface PermissionAssertion {
  assert(input: {
    sessionID: string
    agent?: string
    action: "edit"
    resources: string[]
  }): Promise<unknown>
}

export interface SessionApi {
  get(input: { sessionID: string }, requestOptions?: { signal?: AbortSignal }): Promise<unknown>
}

export function unwrapData(value: unknown): unknown {
  if (typeof value === "object" && value !== null && "data" in value) {
    return (value as { data: unknown }).data
  }
  return value
}

export function sessionListPage(value: unknown): { sessions: unknown[]; next?: unknown } {
  let raw = value
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const data = (raw as Record<string, unknown>).data
    if (typeof data === "object" && data !== null && !Array.isArray(data)) raw = data
  }
  if (Array.isArray(raw)) return { sessions: raw }
  if (typeof raw !== "object" || raw === null) throw new Error("session.list returned an unsupported response")
  const record = raw as Record<string, unknown>
  // List responses carry their cursor beside data; resource unwrapping would lose it.
  const sessions = [record.data, record.items, record.sessions].find(Array.isArray)
  if (!sessions) throw new Error("session.list returned no bounded session page")
  const cursor = record.cursor
  const next = typeof cursor === "object" && cursor !== null
    ? (cursor as Record<string, unknown>).next
    : record.next
  return { sessions, ...(next ? { next } : {}) }
}

export function sessionDirectory(session: SessionInfo): string {
  const directory = session.location?.directory
  if (typeof directory !== "string" || !path.isAbsolute(directory)) {
    throw new Error("session.get did not return an absolute session location directory")
  }
  return path.resolve(directory)
}

export function sessionAgent(session: SessionInfo): string | undefined {
  const metadataAgent = typeof session.metadata === "object" && session.metadata !== null
    ? (session.metadata as Record<string, unknown>).agent
    : undefined
  const raw = session.agent ?? session.agentID ?? metadataAgent
  if (typeof raw === "string") return raw
  if (typeof raw === "object" && raw !== null) {
    const value = raw as Record<string, unknown>
    if (typeof value.name === "string") return value.name
    if (typeof value.id === "string") return value.id
  }
  return undefined
}

export function isPlanOrReadOnly(session: SessionInfo): boolean {
  const agent = sessionAgent(session)?.trim().toLowerCase()
  const mode = typeof session.mode === "string" ? session.mode.toLowerCase() : ""
  if (agent === "plan" || mode === "plan" || session.readOnly === true || mode === "read-only" || mode === "readonly") {
    return true
  }
  const permissions = session.permissions
  if (!Array.isArray(permissions)) return false
  return permissions.some((item) => {
    if (typeof item !== "object" || item === null) return false
    const rule = item as Record<string, unknown>
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action]
    const resource = typeof rule.resource === "string" ? rule.resource : ""
    return rule.effect === "deny" && (actions.includes("edit") || actions.includes("*") || actions.includes("**")) &&
      (resource === "*" || resource === "**" || resource === "**/*" || resource === "")
  })
}

function normalizedDirectory(value: unknown): string | undefined {
  return typeof value === "string" && path.isAbsolute(value) ? path.resolve(value) : undefined
}

export function belongsToPluginLocation(session: SessionInfo, pluginLocation?: PluginLocation): boolean {
  if (!pluginLocation) return false
  const actualDirectory = sessionDirectory(session)
  const pluginDirectory = normalizedDirectory(pluginLocation.directory)
  if (!pluginDirectory || actualDirectory !== pluginDirectory) return false
  if (typeof pluginLocation.workspaceID === "string" && typeof session.location.workspaceID === "string" &&
    pluginLocation.workspaceID !== session.location.workspaceID) return false
  const pluginProjectID = pluginLocation.project?.id
  return typeof pluginProjectID !== "string" || typeof session.projectID !== "string" || pluginProjectID === session.projectID
}

export async function getOwnedSession(
  sessionAPI: SessionApi,
  sessionID: string,
  pluginLocation?: PluginLocation,
  signal?: AbortSignal,
): Promise<{ info: SessionInfo; directory: string }> {
  if (!sessionID || sessionID.length > 200) throw new Error("an explicit source session ID is required")
  const raw = unwrapData(await sessionAPI.get({ sessionID }, { signal }))
  if (typeof raw !== "object" || raw === null) throw new Error("session.get returned no session")
  const info = raw as SessionInfo
  if (typeof info.id !== "string" || info.id !== sessionID) throw new Error("session.get returned a different session ID")
  const directory = sessionDirectory(info)
  if (!belongsToPluginLocation(info, pluginLocation)) {
    throw new Error("source session is outside this plugin location; refusing cross-repository export")
  }
  return { info, directory }
}

export async function assertEditableSession(
  permission: PermissionAssertion | undefined,
  session: SessionInfo,
  directory: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  if (isPlanOrReadOnly(session)) {
    throw new Error("goal-docs writes are denied in Plan or read-only sessions")
  }
  if (!permission || typeof permission.assert !== "function") {
    throw new Error("goal-docs requires the V2 edit permission assertion API; refusing an unverified write")
  }
  const agent = sessionAgent(session)
  // The pinned Promise API has no signal parameter; recheck after it settles.
  await permission.assert({
    sessionID: session.id,
    ...(agent ? { agent } : {}),
    action: "edit",
    resources: [`${path.join(directory, "docs", "goals")}/**`],
  })
  throwIfAborted(signal)
}

export function sessionPermissions(session: SessionInfo): unknown[] | undefined {
  const permissions = session.permissions
  // Session.Info makes overrides optional; preserve absence instead of guessing rules.
  if (permissions === undefined) return undefined
  if (!Array.isArray(permissions) || permissions.length > 128) {
    throw new Error("source session permissions are not available in a bounded form; refusing to broaden handoff permissions")
  }
  return permissions.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new Error("source session contains an invalid permission rule")
    const rule = entry as Record<string, unknown>
    if (typeof rule.action !== "string" || rule.action.length > 256 || typeof rule.resource !== "string" || rule.resource.length > 2_000 ||
      (rule.effect !== "allow" && rule.effect !== "ask" && rule.effect !== "deny")) {
      throw new Error("source session contains an unrecognized permission rule; refusing to hand it off")
    }
    return { action: rule.action, resource: rule.resource, effect: rule.effect }
  })
}

export function matchesHandoffProvenance(
  session: unknown,
  identity: { sourceSessionID: string; goalID: string; transferID: string },
): boolean {
  if (typeof session !== "object" || session === null) return false
  const metadata = (session as Record<string, unknown>).metadata
  if (typeof metadata !== "object" || metadata === null) return false
  const handoff = (metadata as Record<string, unknown>).goalDocsHandoff
  if (typeof handoff !== "object" || handoff === null) return false
  const value = handoff as Record<string, unknown>
  return value.transferID === identity.transferID && value.sourceSessionID === identity.sourceSessionID && value.goalID === identity.goalID
}

export function sessionModel(session: SessionInfo): { providerID: string; id: string; variant?: string } | undefined {
  const model = session.model
  if (model === undefined || model === null) return undefined
  if (typeof model !== "object") throw new Error("source session model is not available in a supported form")
  const value = model as Record<string, unknown>
  if (typeof value.providerID !== "string" || value.providerID.length === 0 || value.providerID.length > 200 ||
    typeof value.id !== "string" || value.id.length === 0 || value.id.length > 200 ||
    (value.variant !== undefined && (typeof value.variant !== "string" || value.variant.length > 200))) {
    throw new Error("source session model or variant is not available in a supported form")
  }
  return {
    providerID: value.providerID,
    id: value.id,
    ...(typeof value.variant === "string" ? { variant: value.variant } : {}),
  }
}
