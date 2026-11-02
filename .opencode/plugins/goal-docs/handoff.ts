import { randomUUID } from "node:crypto"

import { semanticFingerprint, sha256 } from "./model.ts"
import { exportGoalState, type ExportDependencies } from "./exporter.ts"
import { handoffPrompt } from "./render.ts"
import { readGoalStateForSession } from "./state.ts"
import {
  assertEditableSession,
  getOwnedSession,
  matchesHandoffProvenance,
  sessionAgent,
  sessionModel,
  sessionPermissions,
  sessionListPage,
  unwrapData,
  type SessionApi,
  type SessionInfo,
} from "./session.ts"
import {
  createMessageID,
  createTargetSessionID,
  createTransferID,
  getTransferRecord,
  updateTransferRecord,
  type HandoffTransferRecord,
  type WriterFileSystem,
} from "./writer.ts"
import { throwIfAborted } from "./abort.ts"

export interface HandoffSessionApi extends SessionApi {
  list(input: { directory: string; limit: number; cursor?: unknown }, requestOptions?: { signal?: AbortSignal }): Promise<unknown>
  create(input: Record<string, unknown>, requestOptions?: { signal?: AbortSignal }): Promise<unknown>
  prompt(input: { sessionID: string; text: string; id: string; resume: false }, requestOptions?: { signal?: AbortSignal }): Promise<unknown>
}

export interface HandoffInput {
  sourceSessionID: string
  goalID: string
}

export interface HandoffResult {
  transferID: string
  phase: "export" | "create" | "seed" | "open"
  outcome: "pending" | "complete" | "failed"
  sourceSessionID: string
  targetSessionID?: string
  messageID?: string
  docsDirectory?: string
  progress: {
    docs: "not_started" | "complete" | "possibly_partial"
    target: "not_created" | "creation_unknown" | "created" | "recovered" | "verified"
    seed: "not_sent" | "unknown" | "admitted"
  }
  message: string
}

export interface HandoffDependencies extends ExportDependencies {
  session: HandoffSessionApi
  now?: () => number
  fileSystem?: WriterFileSystem
}

const TRANSFER_LEASE_MS = 60_000
const MAX_SESSION_PAGES = 10
const SESSION_PAGE_SIZE = 100

function fallbackTransferID(sessionID: string, goalID: string): string {
  return createTransferID(sessionID, goalID || "unknown", 0, "unvalidated")
}

function recordBase(
  transferID: string,
  sourceSessionID: string,
  goalID: string,
  planRevision: number,
  sourceFingerprint: string,
  now: number,
): HandoffTransferRecord {
  return {
    transferID,
    sourceSessionID,
    goalID,
    planRevision,
    sourceFingerprint,
    targetSessionID: null,
    messageID: createMessageID(transferID),
    phase: "create",
    status: "in_progress",
    updatedAt: now,
  }
}

function transferResult(
  record: HandoffTransferRecord,
  docsDirectory: string | undefined,
  outcome: HandoffResult["outcome"],
  message: string,
  progress: HandoffResult["progress"],
): HandoffResult {
  return {
    transferID: record.transferID,
    phase: record.phase,
    outcome,
    sourceSessionID: record.sourceSessionID,
    ...(record.targetSessionID ? { targetSessionID: record.targetSessionID } : {}),
    messageID: record.messageID,
    ...(docsDirectory ? { docsDirectory } : {}),
    progress,
    message,
  }
}

function directoryFromLocation(location: unknown): string | undefined {
  if (typeof location !== "object" || location === null) return undefined
  const directory = (location as Record<string, unknown>).directory
  return typeof directory === "string" ? directory : undefined
}

function transferMetadata(session: unknown, transferID: string): boolean {
  const value = unwrapData(session)
  if (typeof value !== "object" || value === null) return false
  const metadata = (value as Record<string, unknown>).metadata
  if (typeof metadata !== "object" || metadata === null) return false
  const handoff = (metadata as Record<string, unknown>).goalDocsHandoff
  return typeof handoff === "object" && handoff !== null &&
    (handoff as Record<string, unknown>).transferID === transferID
}

function assertTransferRecordIdentity(
  record: HandoffTransferRecord | undefined,
  input: HandoffInput,
  planRevision: number,
  fingerprint: string,
): void {
  if (!record) return
  if (record.sourceSessionID !== input.sourceSessionID || record.goalID !== input.goalID ||
    record.planRevision !== planRevision || record.sourceFingerprint !== fingerprint) {
    throw new Error("persisted transfer record does not match the validated source snapshot")
  }
}

function sessionID(value: unknown): string | undefined {
  const raw = unwrapData(value)
  if (typeof raw !== "object" || raw === null) return undefined
  const id = (raw as Record<string, unknown>).id
  return typeof id === "string" ? id : undefined
}

async function findExistingTarget(
  session: HandoffSessionApi,
  directory: string,
  transferID: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (typeof session.list !== "function") {
    throw new Error("session.list is required to recover an interrupted idempotent handoff safely")
  }
  let cursor: unknown
  let read = 0
  for (let pageNumber = 0; pageNumber < MAX_SESSION_PAGES; pageNumber += 1) {
    throwIfAborted(signal)
    const page = sessionListPage(await session.list(
      { directory, limit: SESSION_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
      { signal },
    ))
    for (const item of page.sessions) {
      read += 1
      if (read > MAX_SESSION_PAGES * SESSION_PAGE_SIZE) throw new Error("session search exceeded its bound")
      if (!transferMetadata(item, transferID)) continue
      const raw = unwrapData(item)
      if (directoryFromLocation((raw as Record<string, unknown>).location) !== directory) continue
      const id = sessionID(item)
      if (id) return id
    }
    if (!page.next) return undefined
    cursor = page.next
  }
  throw new Error("session search reached its page bound; refusing to risk a duplicate target session")
}

function sessionCreateInput(source: SessionInfo, transferID: string, goalID: string, permissions: unknown[] | undefined): Record<string, unknown> {
  const agent = sessionAgent(source)
  const model = sessionModel(source)
  const input: Record<string, unknown> = {
    id: createTargetSessionID(transferID),
    title: `Goal handoff ${transferID.slice(-12)}`,
    location: source.location,
    metadata: {
      goalDocsHandoff: { transferID, sourceSessionID: source.id, goalID },
    },
    ...(permissions === undefined ? {} : { permissions }),
  }
  if (agent) input.agent = agent
  if (model) input.model = model
  return input
}

function updateOwnedClaim(
  previous: HandoffTransferRecord | undefined,
  leaseToken: string,
  update: (record: HandoffTransferRecord) => HandoffTransferRecord,
): HandoffTransferRecord {
  if (!previous) throw new Error("handoff claim disappeared; refusing to recreate its progress")
  if (previous.phase === "open" || previous.leaseToken !== leaseToken) return previous
  return update(previous)
}

async function verifyTarget(
  session: HandoffSessionApi,
  targetID: string,
  source: SessionInfo,
  directory: string,
  transferID: string,
  goalID: string,
  signal?: AbortSignal,
): Promise<void> {
  if (targetID === source.id) throw new Error("handoff target must be an independent session")
  const result = unwrapData(await session.get({ sessionID: targetID }, { signal }))
  if (typeof result !== "object" || result === null) throw new Error("created target session could not be verified")
  const target = result as Record<string, unknown>
  if (target.id !== targetID) throw new Error("session.get returned a different handoff target ID")
  if (directoryFromLocation(target.location) !== directory) throw new Error("handoff target is not in the source session's exact worktree")
  if (typeof source.projectID === "string" && target.projectID !== source.projectID) {
    throw new Error("handoff target belongs to a different project")
  }
  if (target.parentID != null || target.fork != null) {
    throw new Error("handoff target was created as a child or fork session; refusing to continue")
  }
  if (!matchesHandoffProvenance(target, { sourceSessionID: source.id, goalID, transferID })) {
    throw new Error("handoff target did not retain its transfer identity; refusing an untraceable retry")
  }
  const expectedPermissions = sessionPermissions(source)
  const actualPermissions = sessionPermissions(target as SessionInfo)
  if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions)) {
    throw new Error("handoff target did not retain the source session's permission rules")
  }
  const expectedAgent = sessionAgent(source)
  if (expectedAgent && sessionAgent(target as SessionInfo) !== expectedAgent) {
    throw new Error("handoff target did not retain the source session's agent")
  }
  const expectedModel = sessionModel(source)
  if (expectedModel && JSON.stringify(sessionModel(target as SessionInfo)) !== JSON.stringify(expectedModel)) {
    throw new Error("handoff target did not retain the source session's model and variant")
  }
}

export async function coordinateHandoff(
  input: HandoffInput,
  dependencies: HandoffDependencies,
  options: { signal?: AbortSignal } = {},
): Promise<HandoffResult> {
  const { signal } = options
  let transferID = fallbackTransferID(input.sourceSessionID, input.goalID)
  let phase: HandoffResult["phase"] = "export"
  let docsDirectory: string | undefined
  let targetID: string | undefined
  let messageID: string | undefined
  let ownedLeaseToken: string | undefined
  const progress: HandoffResult["progress"] = { docs: "not_started", target: "not_created", seed: "not_sent" }

  try {
    throwIfAborted(signal)
    progress.docs = "possibly_partial"
    const exported = await exportGoalState(
      { sessionID: input.sourceSessionID, goalID: input.goalID },
      dependencies,
      { signal },
    )
    if (exported.status !== "exported" || !exported.state || !exported.selected || !exported.write) {
      progress.docs = "not_started"
      throw new Error("no validated goal snapshot exists for the selected session and goal")
    }
    progress.docs = "complete"
    docsDirectory = exported.write.docsDirectory
    const bundle = exported.selected
    const sessionRecord = await getOwnedSession(dependencies.session, input.sourceSessionID, dependencies.location, signal)
    const seedText = handoffPrompt(bundle, exported.source)
    const fingerprint = sha256(`${bundle.contentFingerprint}\0${sessionRecord.directory}\0${sha256(seedText)}`)
    transferID = createTransferID(input.sourceSessionID, bundle.goalID, bundle.planRevision, fingerprint)
    messageID = createMessageID(transferID)

    throwIfAborted(signal)
    const reread = dependencies.readState
      ? await dependencies.readState(input.sourceSessionID, { signal })
      : await readGoalStateForSession(input.sourceSessionID, { signal })
    const latest = reread && [...reread.archives, ...(reread.current ? [reread.current] : [])]
      .find((goal) => goal.id === bundle.goalID)
    if (!latest || latest.planRevision !== bundle.planRevision || semanticFingerprint([latest]) !== bundle.contentFingerprint) {
      throw new Error("validated goal snapshot became stale before handoff")
    }
    if (reread?.fingerprint !== exported.state.fingerprint) {
      throw new Error("goal state changed during export; retry after the latest snapshot is exported")
    }

    const now = (dependencies.now ?? Date.now)()
    let claimed = false
    let existing = await getTransferRecord(sessionRecord.directory, transferID, { fileSystem: dependencies.fileSystem, signal })
    assertTransferRecordIdentity(existing, input, bundle.planRevision, fingerprint)
    if (existing?.phase === "open" && !existing.targetSessionID) {
      throw new Error("persisted open handoff has no target session ID; refusing to create a duplicate")
    }
    if (existing?.phase === "open" && existing.targetSessionID) {
      phase = "open"
      progress.target = "recovered"
      progress.seed = "admitted"
      await verifyTarget(dependencies.session, existing.targetSessionID, sessionRecord.info, sessionRecord.directory, transferID, bundle.goalID, signal)
      progress.target = "verified"
      return transferResult(existing, docsDirectory, "pending", "The snapshot is already seeded; this client's focus still needs verification.", progress)
    }

    const leaseToken = randomUUID()
    ownedLeaseToken = leaseToken
    const claimedRecord = await updateTransferRecord(
      sessionRecord.directory,
      transferID,
      (previous) => {
        assertTransferRecordIdentity(previous, input, bundle.planRevision, fingerprint)
        if (previous?.phase === "open") return previous
        if (previous?.status === "in_progress" && previous.leaseUntil && previous.leaseUntil > now) return previous
        claimed = true
        const base = previous ?? recordBase(
          transferID,
          input.sourceSessionID,
          bundle.goalID,
          bundle.planRevision,
          fingerprint,
          now,
        )
        return {
          ...base,
          phase: base.targetSessionID ? "seed" : "create",
          status: "in_progress",
          error: undefined,
          leaseUntil: now + TRANSFER_LEASE_MS,
          leaseToken,
          updatedAt: now,
        } as HandoffTransferRecord
      },
      { fileSystem: dependencies.fileSystem, signal },
    )
    existing = claimedRecord
    if (!claimed) {
      if (claimedRecord.phase === "open" && claimedRecord.targetSessionID) {
        phase = "open"
        progress.target = "recovered"
        await verifyTarget(dependencies.session, claimedRecord.targetSessionID, sessionRecord.info, sessionRecord.directory, transferID, bundle.goalID, signal)
        progress.target = "verified"
        progress.seed = "admitted"
        return transferResult(claimedRecord, docsDirectory, "pending", "Another invocation seeded this target; this client's focus still needs verification.", progress)
      }
      return transferResult(claimedRecord, docsDirectory, "pending", "A matching handoff is already being processed; retry without creating another session.", progress)
    }
    targetID = claimedRecord.targetSessionID ?? undefined
    messageID = claimedRecord.messageID

    if (!targetID) {
      phase = "create"
      targetID = await findExistingTarget(dependencies.session, sessionRecord.directory, transferID, signal)
      if (targetID) {
        progress.target = "recovered"
      } else {
        throwIfAborted(signal)
        const permissions = sessionPermissions(sessionRecord.info)
        if (typeof dependencies.session.create !== "function") throw new Error("session.create is unavailable")
        progress.target = "creation_unknown"
        const created = await dependencies.session.create(
          sessionCreateInput(sessionRecord.info, transferID, bundle.goalID, permissions),
          { signal },
        )
        targetID = sessionID(created)
        if (!targetID) throw new Error("session.create returned no target session ID")
        if (targetID !== createTargetSessionID(transferID)) throw new Error("session.create did not retain the requested stable target ID")
        progress.target = "created"
      }
      throwIfAborted(signal)
      await verifyTarget(dependencies.session, targetID, sessionRecord.info, sessionRecord.directory, transferID, bundle.goalID, signal)
      progress.target = "verified"
      existing = await updateTransferRecord(
        sessionRecord.directory,
        transferID,
        (previous) => updateOwnedClaim(previous, leaseToken, (record) => ({
          ...record,
          targetSessionID: targetID as string,
          phase: "seed",
          status: "in_progress",
          error: undefined,
          leaseUntil: now + TRANSFER_LEASE_MS,
          leaseToken,
          updatedAt: now,
        })),
        { fileSystem: dependencies.fileSystem, signal },
      )
    }

    if (progress.target !== "verified") {
      phase = "create"
      await verifyTarget(dependencies.session, targetID, sessionRecord.info, sessionRecord.directory, transferID, bundle.goalID, signal)
      progress.target = "verified"
    }

    existing = await getTransferRecord(sessionRecord.directory, transferID, { fileSystem: dependencies.fileSystem, signal })
    if (!existing) throw new Error("handoff claim disappeared before seeding")
    if (existing.phase === "open") {
      progress.seed = "admitted"
      return transferResult(existing, docsDirectory, "pending", "Another invocation seeded this target; this client's focus still needs verification.", progress)
    }
    if (existing.leaseToken !== leaseToken) {
      return transferResult(existing, docsDirectory, existing.status === "failed" ? "failed" : "pending", "Another invocation owns this transfer; its progress was preserved and this call did not seed again.", progress)
    }

    phase = "seed"
    throwIfAborted(signal)
    progress.seed = "unknown"
    await dependencies.session.prompt({ sessionID: targetID, text: seedText, id: messageID, resume: false }, { signal })
    progress.seed = "admitted"
    throwIfAborted(signal)
    existing = await updateTransferRecord(
      sessionRecord.directory,
      transferID,
      (previous) => updateOwnedClaim(previous, leaseToken, (record) => ({
        ...record,
        targetSessionID: targetID as string,
        messageID: messageID as string,
        phase: "open",
        status: "in_progress",
        error: undefined,
        leaseUntil: undefined,
        leaseToken: undefined,
        updatedAt: (dependencies.now ?? Date.now)(),
      })),
      { fileSystem: dependencies.fileSystem, signal },
    )
    return transferResult(existing, docsDirectory, "pending", "Validated snapshot was seeded with resume:false. Focus the target in this initiating client; no session.view navigation was attempted.", progress)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (docsDirectory && (phase === "create" || phase === "seed")) {
      try {
        const owned = await getOwnedSession(dependencies.session, input.sourceSessionID, dependencies.location)
        const failed = await updateTransferRecord(
          owned.directory,
          transferID,
          (previous) => {
            if (!previous) throw new Error("handoff claim disappeared during failure bookkeeping")
            if (previous.phase === "open" || previous.leaseToken !== ownedLeaseToken) return previous
            return {
              ...previous,
              targetSessionID: targetID ?? previous.targetSessionID,
              messageID: messageID ?? createMessageID(transferID),
              phase,
              status: "failed",
              error: message,
              leaseUntil: undefined,
              leaseToken: undefined,
              updatedAt: (dependencies.now ?? Date.now)(),
            }
          },
          { fileSystem: dependencies.fileSystem },
        )
        if (failed.status !== "failed") {
          if (failed.phase === "open") progress.seed = "admitted"
          return transferResult(failed, docsDirectory, "pending", "A later invocation advanced this transfer; its progress was preserved despite this call's late failure.", progress)
        }
        const retry = failed.phase === "seed"
          ? " Retry uses the same target and message ID."
          : " Retry reuses the transfer identity and searches for an already-created target before creating one."
        return transferResult(failed, docsDirectory, "failed", `${phase} stage failed: ${message}.${retry}`, progress)
      } catch {
        // Preserve the original failure when recovery bookkeeping is unavailable.
      }
    }
    const failed: HandoffTransferRecord = {
      ...recordBase(transferID, input.sourceSessionID, input.goalID, 0, "unvalidated", Date.now()),
      phase,
      status: "failed",
      ...(targetID ? { targetSessionID: targetID } : {}),
      ...(messageID ? { messageID } : {}),
      error: message,
    }
    if (phase === "create" && progress.target === "not_created") progress.target = "not_created"
    if (phase === "seed" && progress.seed === "not_sent") progress.seed = "not_sent"
    return transferResult(failed, docsDirectory, "failed", `${phase} stage failed: ${message}`, progress)
  }
}

export async function markHandoffOpened(
  input: { sourceSessionID: string; transferID: string; targetSessionID: string },
  dependencies: HandoffDependencies,
  options: { signal?: AbortSignal } = {},
): Promise<{ transferID: string; phase: "open"; outcome: "complete" | "failed"; targetSessionID: string; message: string }> {
  try {
    const { signal } = options
    throwIfAborted(signal)
    const { info, directory } = await getOwnedSession(dependencies.session, input.sourceSessionID, dependencies.location, signal)
    await assertEditableSession(dependencies.permission, info, directory, signal)
    const existing = await getTransferRecord(directory, input.transferID, { fileSystem: dependencies.fileSystem, signal })
    if (!existing || existing.sourceSessionID !== input.sourceSessionID || existing.targetSessionID !== input.targetSessionID || existing.phase !== "open") {
      throw new Error("handoff transfer or target does not match the validated source session")
    }
    if (existing.status === "complete") {
      return { transferID: existing.transferID, phase: "open", outcome: "complete", targetSessionID: input.targetSessionID, message: "An open acknowledgement was already recorded; this alone does not verify another client's focus." }
    }
    const updated = await updateTransferRecord(
      directory,
      input.transferID,
      (previous) => {
        if (!previous || previous.sourceSessionID !== input.sourceSessionID || previous.targetSessionID !== input.targetSessionID || previous.phase !== "open") {
          throw new Error("handoff target changed before open status was recorded")
        }
        return { ...previous, status: "complete", leaseUntil: undefined, leaseToken: undefined, updatedAt: Date.now() }
      },
      { fileSystem: dependencies.fileSystem, signal },
    )
    return { transferID: updated.transferID, phase: "open", outcome: "complete", targetSessionID: input.targetSessionID, message: "The initiating client focused the seeded target session." }
  } catch (error) {
    return {
      transferID: input.transferID,
      phase: "open",
      outcome: "failed",
      targetSessionID: input.targetSessionID,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
