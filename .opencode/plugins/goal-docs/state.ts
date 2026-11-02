import { open, readFile, realpath } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import { GOAL_PLUGIN_VERSION, parseSessionGoalState, type SessionGoalState } from "./model.ts"
import { unwrapData } from "./session.ts"
import { throwIfAborted } from "./abort.ts"

export const MAX_GOAL_STATE_BYTES = 8 * 1024 * 1024
export const MAX_SESSIONS_IN_STATE = 1_000
const LOCAL_GOAL_CONTRACT = "opencode-goal-plugin/enhanced-state-v3-1"
const LOCAL_GOAL_IDENTITY = "local-enhanced/state-v3@0.1.1"
export interface StateReaderDependencies {
  readFile(path: string): Promise<Uint8Array | string>
  readFileBounded?(path: string, byteLimit: number, signal?: AbortSignal): Promise<Uint8Array | string>
  statePath: string
  packageJsonPath?: string
  packageVersion?: string
  signal?: AbortSignal
}

export function resolveGoalStatePath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  if (env.OPENCODE_GOAL_STATE_PATH) return path.resolve(env.OPENCODE_GOAL_STATE_PATH)
  const dataHome = env.XDG_DATA_HOME || path.join(home, ".local", "share")
  return path.join(dataHome, "opencode-goal-plugin", "goals.json")
}

export function resolveGoalPluginPackageJson(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.OPENCODE_GOAL_PLUGIN_PACKAGE_JSON
  if (!configured) {
    throw new Error("the active goal-plugin package version is unavailable; set OPENCODE_GOAL_PLUGIN_PACKAGE_JSON or provide the verified version from ctx.plugin.list()")
  }
  if (!path.isAbsolute(configured)) throw new Error("OPENCODE_GOAL_PLUGIN_PACKAGE_JSON must be an absolute path")
  return path.resolve(configured)
}

function textFrom(bytes: Uint8Array | string, label: string, limit: number): string {
  let text: string
  try {
    text = typeof bytes === "string" ? bytes : new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${label} is not valid UTF-8`)
  }
  if (Buffer.byteLength(text, "utf8") > limit) throw new Error(`${label} exceeds the ${limit}-byte read limit`)
  return text
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readBoundedFile(filePath: string, byteLimit: number, signal?: AbortSignal): Promise<Uint8Array> {
  throwIfAborted(signal)
  const handle = await open(filePath, "r")
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile()) throw new Error(`${filePath} is not a regular file`)
    if (metadata.size > byteLimit) throw new Error(`${filePath} exceeds the ${byteLimit}-byte read limit`)
    const buffer = Buffer.alloc(byteLimit + 1)
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      throwIfAborted(signal)
      const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
      if (result.bytesRead === 0) break
      bytesRead += result.bytesRead
    }
    if (bytesRead > byteLimit) throw new Error(`${filePath} exceeds the ${byteLimit}-byte read limit`)
    throwIfAborted(signal)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

async function readText(deps: StateReaderDependencies, filePath: string, label: string, byteLimit: number): Promise<string> {
  throwIfAborted(deps.signal)
  const value = deps.readFileBounded
    ? await deps.readFileBounded(filePath, byteLimit, deps.signal)
    : await deps.readFile(filePath)
  throwIfAborted(deps.signal)
  return textFrom(value, label, byteLimit)
}

function localPackageIdentity(raw: Record<string, unknown>): string | undefined {
  if (raw.name === "@prevalentware/opencode-goal-plugin" && raw.version === "0.1.1" && raw.goalStateContract === LOCAL_GOAL_CONTRACT) {
    return LOCAL_GOAL_IDENTITY
  }
  return undefined
}

async function validatePackageVersion(deps: StateReaderDependencies): Promise<string> {
  let version = deps.packageVersion
  if (version === undefined) {
    const packageJsonPath = deps.packageJsonPath ?? resolveGoalPluginPackageJson()
    const raw = JSON.parse(await readText(deps, packageJsonPath, "goal plugin package metadata", 32_768)) as unknown
    if (!object(raw) || raw.name !== "@prevalentware/opencode-goal-plugin") {
      throw new Error("goal plugin package metadata does not identify @prevalentware/opencode-goal-plugin")
    }
    version = localPackageIdentity(raw) ?? (typeof raw.version === "string" ? raw.version : undefined)
  }
  if (version !== GOAL_PLUGIN_VERSION && version !== LOCAL_GOAL_IDENTITY) {
    throw new Error(`goal-docs requires @prevalentware/opencode-goal-plugin ${GOAL_PLUGIN_VERSION}; refusing an unverified state layout`)
  }
  return version
}

export interface PluginListApi {
  list(input?: unknown, requestOptions?: { signal?: AbortSignal }): Promise<unknown>
}

export async function resolveGoalPluginVersion(
  pluginAPI: PluginListApi,
  signal?: AbortSignal,
): Promise<string> {
  throwIfAborted(signal)
  const response = unwrapData(await pluginAPI.list(undefined, { signal }))
  const items = Array.isArray(response)
    ? response
    : object(response) && Array.isArray(response.data)
      ? response.data
      : undefined
  if (!items) throw new Error("ctx.plugin.list() returned no plugin inventory; refusing to assume the goal-plugin version")

  const packageName = "@prevalentware/opencode-goal-plugin"
  const matches = items.flatMap((item) => {
    if (!object(item) || !object(item.source) || item.source.type !== "package" || typeof item.source.target !== "string") return []
    const target = item.source.target
    if (target !== packageName && !target.startsWith(`${packageName}@`)) return []
    const targetVersion = target.startsWith(`${packageName}@`) ? target.slice(packageName.length + 1) : undefined
    const version = typeof item.source.version === "string" ? item.source.version : targetVersion
    return version ? [version] : []
  })
  const local = items.filter((item) => object(item) && item.id === "local.goal-mode.server" &&
    object(item.source) && item.source.type === "local")
  if (local.length) {
    if (local.length !== 1 || matches.length !== 0) throw new Error("ambiguous enhanced goal-plugin identity")
    const item = local[0] as Record<string, unknown>
    const source = item.source as Record<string, unknown>
    if (!object(item.state) || item.state.status !== "active" || typeof source.path !== "string" || !path.isAbsolute(source.path)) {
      throw new Error("local goal-plugin identity is not an active absolute source")
    }
    const entry = path.resolve(source.path)
    if (!["server.js", "server.ts"].includes(path.basename(entry)) || await realpath(entry) !== entry) {
      throw new Error("local goal-plugin entry is not a verified regular package entry")
    }
    const metadata = path.join(path.dirname(entry), "package.json")
    if (await realpath(metadata) !== metadata) throw new Error("local goal-plugin metadata path is symlinked")
    const raw = JSON.parse(textFrom(await readBoundedFile(metadata, 32_768, signal), "goal plugin package metadata", 32_768)) as unknown
    const identity = object(raw) ? localPackageIdentity(raw) : undefined
    if (!identity) throw new Error("local goal-plugin has no supported enhanced state contract")
    throwIfAborted(signal)
    return identity
  }
  if (matches.length !== 1) {
    throw new Error("ctx.plugin.list() did not provide one unambiguous goal-plugin package version; configure OPENCODE_GOAL_PLUGIN_PACKAGE_JSON to verify the local package metadata")
  }
  return matches[0]
}

export async function readGoalStateForSession(
  sessionID: string,
  overrides: Partial<StateReaderDependencies> = {},
): Promise<SessionGoalState | null> {
  const signal = overrides.signal
  const deps: StateReaderDependencies = {
    readFile: async (filePath) => readFile(filePath, signal ? { signal } : undefined),
    readFileBounded: readBoundedFile,
    statePath: overrides.statePath ?? resolveGoalStatePath(),
    ...(overrides.packageJsonPath ? { packageJsonPath: overrides.packageJsonPath } : {}),
    ...(overrides.packageVersion ? { packageVersion: overrides.packageVersion } : {}),
    ...(signal ? { signal } : {}),
    ...overrides,
  }
  const identity = await validatePackageVersion(deps)

  let stateText: string
  try {
    stateText = await readText(deps, deps.statePath, "goal state", MAX_GOAL_STATE_BYTES)
  } catch (error) {
    if (object(error) && error.code === "ENOENT") return null
    throw error
  }

  const raw = JSON.parse(stateText) as unknown
  if (identity === LOCAL_GOAL_IDENTITY && (!object(raw) || raw.version !== 3)) {
    throw new Error("local enhanced goal-plugin requires state version 3")
  }
  if (!object(raw) || !object(raw.goals) || Object.keys(raw.goals).length > MAX_SESSIONS_IN_STATE) {
    throw new Error("goal state is not a bounded object; refusing to export")
  }
  return parseSessionGoalState(raw, sessionID)
}
