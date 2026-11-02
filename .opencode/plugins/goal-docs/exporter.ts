import { buildGoalDocBundle, type GoalDocBundle } from "./render.ts"
import { readGoalStateForSession } from "./state.ts"
import { sanitizeText } from "./model.ts"
import { describeRepository } from "./repository.ts"
import { throwIfAborted } from "./abort.ts"
import {
  assertEditableSession,
  getOwnedSession,
  type PermissionAssertion,
  type PluginLocation,
  type SessionApi,
  type SessionInfo,
} from "./session.ts"
import { writeGoalDocBundles, type WriteBundleResult, type WriterFileSystem } from "./writer.ts"
import type { ExportSource, RepositoryMetadata, SessionGoalState } from "./model.ts"

export interface ExportInput {
  sessionID: string
  goalID?: string
}

export interface ExportOutcome {
  status: "exported" | "missing"
  source: ExportSource
  state: SessionGoalState | null
  bundles: GoalDocBundle[]
  selected?: GoalDocBundle
  write?: WriteBundleResult
}

export interface ExportDependencies {
  session: SessionApi
  permission?: PermissionAssertion
  location?: PluginLocation
  readState?(sessionID: string, options?: { signal?: AbortSignal }): Promise<SessionGoalState | null>
  writeBundles?(directory: string, bundles: readonly GoalDocBundle[]): Promise<WriteBundleResult>
  fileSystem?: WriterFileSystem
  repositoryMetadata?(directory: string, options?: { signal?: AbortSignal }): Promise<RepositoryMetadata>
  now?: () => number
}

export async function exportGoalState(
  input: ExportInput,
  dependencies: ExportDependencies,
  options: { signal?: AbortSignal } = {},
): Promise<ExportOutcome> {
  const { signal } = options
  throwIfAborted(signal)
  const { info, directory } = await getOwnedSession(dependencies.session, input.sessionID, dependencies.location, signal)
  if (directory.length > 4_096) throw new Error("source session directory exceeds the export bound")
  const timestamp = (dependencies.now ?? Date.now)()
  const exportedAt = new Date(timestamp).toISOString()
  const repository = await (dependencies.repositoryMetadata ?? describeRepository)(directory, { signal })
  const source: ExportSource = {
    sessionID: sanitizeText(info.id, 200),
    directory: sanitizeText(directory, 4_096),
    exportedAt,
    repository,
  }
  throwIfAborted(signal)
  const state = dependencies.readState
    ? await dependencies.readState(info.id, { signal })
    : await readGoalStateForSession(info.id, { signal })
  throwIfAborted(signal)
  const records = state ? [...state.archives, ...(state.current ? [state.current] : [])] : []
  if (records.length === 0) return { status: "missing", source, state, bundles: [] }

  const selectedRecord = input.goalID ? records.find((goal) => goal.id === input.goalID) : undefined
  if (input.goalID && !selectedRecord) throw new Error(`goal ${input.goalID} is not present in the selected session's validated state`)
  const archiveNotice = state?.historyNotice ?? "No validated goal history is available."
  const generated = records.map((goal) => buildGoalDocBundle(source, goal, archiveNotice))

  await assertEditableSession(dependencies.permission, info, directory, signal)
  const writeBundles = dependencies.writeBundles ?? ((sourceDirectory, nextBundles) =>
    writeGoalDocBundles(sourceDirectory, nextBundles, { fileSystem: dependencies.fileSystem, signal }))
  throwIfAborted(signal)
  const write = await writeBundles(directory, generated)
  const bundles = write.bundles
  const selected = input.goalID ? bundles.find((bundle) => bundle.goalID === input.goalID) : undefined
  const primary = selected ?? bundles.find((bundle) => bundle.goalID === state?.current?.id) ?? bundles[0]
  return { status: "exported", source: primary?.source ?? source, state, bundles, ...(selected ? { selected } : {}), write }
}

export async function readValidatedGoalState(
  session: SessionInfo,
  readState: (sessionID: string) => Promise<SessionGoalState | null> = readGoalStateForSession,
): Promise<SessionGoalState | null> {
  return readState(session.id)
}
