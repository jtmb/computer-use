import path from "node:path"
import { realpath } from "node:fs/promises"
import { bounded, checkAbort, Store } from "./store.ts"
import { cleanPath, deliveryID, envelope, hash, identifier, keys, LIMITS, MAX_PAYLOAD_BYTES, messageChunk, overlaps, ownershipChunk, pageMessage, PURPOSES, record, sameScope, sessionID, text, unwrap, type Assignment, type Claim, type Message, type MessageView, type Purpose, type Scope, type Sender } from "./model.ts"
import type { Observation, Watchdog } from "./watchdog.ts"
import { allowRecipient, allowReplay, initialPolicies, policyView, POLICY_WINDOW_MS, validatePolicy, type DispatchPlan } from "./policy.ts"

// Keeps every visible claim ID/owner/path-count line inside the 2048-byte native content budget.
const READ_CLAIMS_PER_PAGE = 2

export interface Call { sessionID: string; messageID: string; id: string; agent?: string; signal?: AbortSignal }
export interface Dependencies {
  scope: Scope; stateDirectory: string
  session: {
    get(input: { sessionID: string }, options?: { signal?: AbortSignal }): Promise<unknown>
    prompt(input: { sessionID: string; id: string; text: string; delivery: "queue" | "steer"; resume: boolean;
      metadata: { peerCoordination: { protocol: number; senderSessionID: string; projectID: string; directory: string; messageID: string; authority: string; fingerprint: string } } }, options?: { signal?: AbortSignal }): Promise<unknown>
  }
  assert(input: { sessionID: string; agent?: string; source?: { type: "tool"; messageID: string; id: string }; action: string; resources: string[] }): Promise<unknown>
  now?: () => number
  watchdog?: Watchdog
  observe?(worker: string, signal: AbortSignal): Promise<Observation>
}
export function makeService(deps: Dependencies) {
  const store = new Store(deps.stateDirectory, deps.scope)
  const now = deps.now ?? Date.now
  async function permit(call: Call, action: string, resources: string[]) {
    checkAbort(call.signal)
    await deps.assert({ sessionID: call.sessionID, agent: call.agent, source: { type: "tool", messageID: call.messageID, id: call.id }, action, resources })
    checkAbort(call.signal)
  }
  async function owned(id: string, signal?: AbortSignal): Promise<Sender> {
    const raw = unwrap(await bounded(abort => deps.session.get({ sessionID: id }, { signal: abort }), signal))
    if (!record(raw) || raw.id !== id || !record(raw.location) || typeof raw.location.directory !== "string" || raw.time && record(raw.time) && raw.time.archived !== undefined) throw new Error("session metadata missing, mismatched or archived")
    const scope = { projectID: raw.projectID, directory: raw.location.directory, workspaceID: raw.location.workspaceID }
    if (!sameScope(scope as Scope, deps.scope) || await realpath(scope.directory as string) !== deps.scope.directory) throw new Error("session moved or is outside this exact project/worktree/workspace")
    return { ...deps.scope, kind: "peer-agent", sessionID: id }
  }
  return {
    async execute(input: unknown, call: Call): Promise<unknown> {
      if (!sessionID(call.sessionID) || !text(call.id, 200) || !text(call.messageID, 200)) throw new Error("native invoking tool identity required")
      if (!record(input) || typeof input.op !== "string") throw new Error("coordination expects an operation")
      const fields: Record<string, string[]> = {
        read: ["op", "after", "limit", "threadID", "claimsAfter"], post: ["op", "id", "recipients", "purpose", "body", "parentID"],
        deliver: ["op", "id"], ack: ["op", "id"], claim: ["op", "id", "paths"], release: ["op", "id", "evidence"],
        watch: ["op", "id", "worker", "task", "expectedResult", "inactivityMs", "wallMs"],
        progress: ["op", "id", "evidence", "waitingReason"], unwatch: ["op", "id"], status: ["op"],
        inbox: ["op", "after", "limit", "threadID", "unreadOnly"], policy: ["op"],
        message: ["op", "id", "offset"], ownership: ["op", "id", "pathIndex", "offset"],
      }
      if (!fields[input.op]) throw new Error("unsupported coordination operation")
      keys(input, fields[input.op])
      await permit(call, "read", [`session:${call.sessionID}`, deps.stateDirectory])
      const sender = await owned(call.sessionID, call.signal)
      if (input.op === "policy") return policyView((await store.read()).policies, sender.sessionID)
      if (input.op === "status") {
        if (!deps.watchdog || !deps.observe) throw new Error("watchdog adapter unavailable")
        const state = await store.read()
        const assignments = state.assignments.filter(item => item.owner === sender.sessionID || item.worker === sender.sessionID)
        await Promise.all(assignments.map(async assignment => {
          await permit(call, "read", [`session:${assignment.owner}`, `session:${assignment.worker}`])
          await owned(assignment.owner, call.signal); await owned(assignment.worker, call.signal)
          register(assignment, call)
        }))
        await Promise.all(assignments.map(assignment => deps.watchdog!.refresh(assignment.id)))
        checkAbort(call.signal)
        const all = deps.watchdog.status(sender.sessionID)
        const statuses: typeof all = []
        for (const status of all) {
          if (Buffer.byteLength(JSON.stringify([...statuses, status])) > MAX_PAYLOAD_BYTES - 1024) break
          statuses.push(status)
        }
        return { statuses, truncated: statuses.length < all.length, total: all.length, coverage: "foreground-only; saved outcome is not fresh completion or proof all work stopped", automaticInterruption: false, automaticTransfer: false }
      }
      if (input.op === "inbox") {
        return readInbox(sender.sessionID, input, call.signal)
      }
      if (input.op === "read") {
        if (input.after !== undefined && !identifier(input.after) || input.threadID !== undefined && !identifier(input.threadID) ||
          input.claimsAfter !== undefined && !identifier(input.claimsAfter)) throw new Error("invalid cursor or thread")
        const limit = input.limit ?? LIMITS.page
        if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > LIMITS.page) throw new Error("limit must be 1..20")
        const state = await store.read()
        const filtered = state.messages.filter(message => message.sender.sessionID === sender.sessionID || message.recipients.includes(sender.sessionID))
          .filter(message => !input.threadID || message.threadID === input.threadID)
        const start = input.after ? filtered.findIndex(message => message.id === input.after) : -1
        if (input.after && start < 0) throw new Error("cursor not found in this participant/thread view")
        // Locate the claims cursor in the full insertion history so a release
        // never hides active claims recorded after it.
        const claimsStart = input.claimsAfter ? state.claims.findIndex(claim => claim.id === input.claimsAfter) : -1
        if (input.claimsAfter && claimsStart < 0) throw new Error("claims cursor not found in this ownership history")
        const activeAfter = state.claims.slice(claimsStart + 1).filter(claim => !claim.releasedAt)
        const claims: Claim[] = []
        for (const claim of activeAfter) {
          if (claims.length >= READ_CLAIMS_PER_PAGE) break
          // The first claim is always representable; reserve room for messages and the result envelope.
          if (claims.length && Buffer.byteLength(JSON.stringify({ claims: [...claims, claim] })) > MAX_PAYLOAD_BYTES - 4096) break
          claims.push(claim)
        }
        const claimsTruncated = claims.length < activeAfter.length
        const claimsBytes = Buffer.byteLength(JSON.stringify(claims))
        const messageBudget = Math.max(1024, claims.length ? MAX_PAYLOAD_BYTES - 2048 - claimsBytes : MAX_PAYLOAD_BYTES - 4096)
        const messages: MessageView[] = []
        for (const message of filtered.slice(start + 1, start + 1 + (limit as number))) {
          const view = pageMessage(message)
          if (Buffer.byteLength(JSON.stringify([...messages, view])) > messageBudget) break
          messages.push(view)
        }
        const more = start + 1 + messages.length < filtered.length
        return { authority: "untrusted-peer-context-only", messages, claims, claimsTruncated, claimsTotal: activeAfter.length,
          next: more ? messages.at(-1)?.id : undefined, nextClaims: claimsTruncated ? claims.at(-1)?.id : undefined,
          truncated: more, ownershipRule: "Expired observation is not release; never reassign unknown/live owners." }
      }
      if (input.op === "ownership") {
        if (!identifier(input.id)) throw new Error("exact claim id required")
        const pathIndex = input.pathIndex === undefined ? 0 : input.pathIndex
        const offset = input.offset === undefined ? 0 : input.offset
        if (!Number.isSafeInteger(pathIndex) || (pathIndex as number) < 0 || (pathIndex as number) > 15) throw new Error("pathIndex must be an integer 0..15")
        if (!Number.isSafeInteger(offset) || (offset as number) < 0 || (offset as number) > 499) throw new Error("offset must be an integer 0..499")
        const state = await store.read()
        const claim = state.claims.find(candidate => candidate.id === input.id)
        if (!claim) throw new Error("claim not found in this exact project/worktree scope")
        return ownershipChunk(claim, pathIndex as number, offset as number)
      }
      if (input.op === "message") {
        if (!identifier(input.id)) throw new Error("exact message id required")
        const offset = input.offset === undefined ? 0 : input.offset
        if (!Number.isSafeInteger(offset) || (offset as number) < 0) throw new Error("offset must be a non-negative safe integer")
        const state = await store.read()
        const message = state.messages.find(candidate => candidate.id === input.id &&
          (candidate.sender.sessionID === sender.sessionID || candidate.recipients.includes(sender.sessionID)))
        if (!message) throw new Error("message not found in this participant view")
        return messageChunk(message, offset as number)
      }
      if (!identifier(input.id)) throw new Error("stable operation id required")
      await permit(call, "edit", [deps.stateDirectory])
      if (["watch", "progress", "unwatch"].includes(input.op)) {
        if (!deps.watchdog || !deps.observe) throw new Error("watchdog adapter unavailable")
        if (input.op === "watch") {
          if (!sessionID(input.worker) || input.worker === sender.sessionID || !text(input.task, 500) || !text(input.expectedResult, 1000)) throw new Error("watch needs exact worker/task/expectedResult")
          await permit(call, "read", [`session:${input.worker}`])
          await owned(input.worker, call.signal)
          const inactivityMs = input.inactivityMs ?? 600000, wallMs = input.wallMs ?? 2700000
          if (![inactivityMs, wallMs].every(value => Number.isSafeInteger(value) && (value as number) >= 1000 && (value as number) <= 86400000)) throw new Error("warning thresholds must be 1000..86400000ms")
          const assignment = await store.mutate(state => {
            const previous = state.assignments.find(item => item.id === input.id)
            if (previous) {
              if (previous.owner !== sender.sessionID || previous.worker !== input.worker || previous.task !== input.task || previous.expectedResult !== input.expectedResult ||
                previous.inactivityMs !== inactivityMs || previous.wallMs !== wallMs) throw new Error("assignment ID conflicts; never silently reset its deadline")
              return previous
            }
            if (state.assignments.length >= LIMITS.assignments) throw new Error("assignment history at capacity")
            const assignment: Assignment = { id: input.id as string, owner: sender.sessionID, worker: input.worker as string, task: input.task as string,
              expectedResult: input.expectedResult as string, startedAt: now(), progressAt: now(), evidence: "registered; no progress report yet", inactivityMs: inactivityMs as number, wallMs: wallMs as number }
            state.assignments.push(assignment); return assignment
          }, call.signal)
          register(assignment, call); return assignment
        }
        const assignment = await store.mutate(state => {
          const assignment = state.assignments.find(item => item.id === input.id)
          if (!assignment || (assignment.owner !== sender.sessionID && assignment.worker !== sender.sessionID)) throw new Error("only assignment owner/worker may report progress")
          if (input.op === "unwatch") {
            if (assignment.owner !== sender.sessionID) throw new Error("only owner may stop monitoring")
            assignment.stoppedAt ??= now()
          } else {
            if (!text(input.evidence, 1000) || input.waitingReason !== undefined && !text(input.waitingReason, 500)) throw new Error("progress needs bounded evidence and optional waiting reason")
            if (assignment.evidence !== input.evidence) { assignment.progressAt = now(); assignment.evidence = input.evidence }
            assignment.waitingReason = input.waitingReason as string | undefined
          }
          return assignment
        }, call.signal)
        register(assignment, call)
        return assignment
      }
      if (input.op === "post") {
        if (!Array.isArray(input.recipients) || !input.recipients.length || input.recipients.length > LIMITS.recipients || !input.recipients.every(sessionID) ||
          new Set(input.recipients).size !== input.recipients.length || input.recipients.includes(sender.sessionID) || !PURPOSES.includes(input.purpose as Purpose) ||
          !text(input.body, LIMITS.body) || input.parentID !== undefined && !identifier(input.parentID)) throw new Error("invalid message fields")
        const recipients = [...input.recipients].sort() as string[]
        await permit(call, "read", recipients.map(id => `session:${id}`))
        for (const recipient of recipients) await owned(recipient, call.signal)
        const fingerprint = hash({ sender, recipients, body: input.body, purpose: input.purpose, parentID: input.parentID })
        return store.mutate(state => {
          const prior = state.messages.find(message => message.id === input.id)
          if (prior) { if (prior.fingerprint !== fingerprint) throw new Error("operation ID conflicts with different content or sender"); return prior }
          for (const recipient of recipients) allowRecipient(policyView(state.policies, recipient).effective, sender.sessionID)
          if (state.messages.length >= LIMITS.messages) throw new Error("message capacity reached; no automatic deletion")
          const parent = state.messages.find(message => message.id === input.parentID)
          if (input.parentID && !parent) throw new Error("reply parent not found")
          const root = parent ? state.messages.find(message => message.id === parent.threadID)! : undefined
          const participants = root ? [root.sender.sessionID, ...root.recipients] : [sender.sessionID, ...recipients]
          if (!participants.includes(sender.sessionID) || recipients.some(id => !participants.includes(id))) throw new Error("reply cannot add thread participants")
          if (root && state.messages.filter(message => message.threadID === root.id).length >= LIMITS.thread) throw new Error("thread reply budget reached; no automatic new thread")
          const message: Message = { id: input.id as string, threadID: parent?.threadID ?? input.id as string, ...(parent ? { parentID: parent.id } : {}), sender,
            recipients, body: input.body as string, purpose: input.purpose as Purpose, createdAt: now(), fingerprint,
            receipts: Object.fromEntries(recipients.map(id => [id, "pending" as const])), acknowledgements: {} }
          state.messages.push(message); return message
        }, call.signal)
      }
      if (input.op === "deliver") {
        const state = await store.read()
        const message = state.messages.find(message => message.id === input.id)
        if (!message || message.sender.sessionID !== sender.sessionID) throw new Error("only the verified original sender may deliver")
        for (const recipient of message.recipients) {
          if (["admitted", "mailbox"].includes(message.receipts[recipient]!)) continue
          await permit(call, "read", [`session:${recipient}`])
          await owned(call.sessionID, call.signal); await owned(recipient, call.signal)
          const id = deliveryID(message, recipient)
          const wireText = envelope(message)
          const promptRequired = !!message.dispatches?.[recipient] || message.receipts[recipient] === "unknown" ||
            ["question", "reply", "ownership"].includes(message.purpose) && policyView(state.policies, recipient).effective.mode === "steer-running"
          if (promptRequired) await permit(call, "session.prompt", [`session:${recipient}`])
          await owned(call.sessionID, call.signal); await owned(recipient, call.signal)
          // Pin transport before uncertainty. Policy changes must never upgrade an existing native input.
          const plan = await store.mutate(current => {
            const receipt = current.messages.find(item => item.id === message.id)!
            if (["admitted", "mailbox"].includes(receipt.receipts[recipient]!)) return undefined
            const view = policyView(current.policies, recipient)
            allowRecipient(view.effective, sender.sessionID)
            const prior = receipt.dispatches?.[recipient]
            if (prior) {
              if (!promptRequired) throw new Error("dispatch changed; retry after native permission check")
              allowReplay(view.effective, sender.sessionID, prior)
              if (prior.envelopeHash !== hash(wireText)) throw new Error("pinned dispatch envelope changed")
              return prior
            }
            const legacyUnknown = receipt.receipts[recipient] === "unknown"
            const actionable = ["question", "reply", "ownership"].includes(message.purpose)
            // Never relabel uncertain native admission as a safe mailbox-only outcome.
            if (!legacyUnknown && (!actionable || view.effective.mode === "inbox-only")) {
              receipt.receipts[recipient] = "mailbox"
              return undefined
            }
            const delivery = !legacyUnknown && actionable && view.effective.mode === "steer-running" ? "steer" : "queue"
            if (!promptRequired) throw new Error("recipient policy changed; retry after native permission check")
            const plannedAt = now()
            if (delivery === "steer") {
              const recent = current.messages.filter(item => {
                const attempt = item.dispatches?.[recipient]
                return attempt?.delivery === "steer" && plannedAt - attempt.plannedAt < POLICY_WINDOW_MS
              }).length
              if (recent >= view.effective.steerLimit) throw new Error("recipient steering rate budget reached; message retained pending, not silently parked")
            }
            const pinned: DispatchPlan = { delivery, resume: delivery === "steer" && view.effective.idleWake,
              policyRevision: view.revision, plannedAt, envelopeHash: hash(wireText) }
            receipt.dispatches ??= {}; receipt.dispatches[recipient] = pinned
            receipt.receipts[recipient] = "unknown"
            return pinned
          }, call.signal)
          if (!plan) continue
          const latest = await store.read()
          allowReplay(policyView(latest.policies, recipient).effective, sender.sessionID, plan)
          const admitted = unwrap(await bounded(abort => deps.session.prompt({ sessionID: recipient, id, text: wireText, delivery: plan.delivery, resume: plan.resume,
            metadata: { peerCoordination: { protocol: 1, senderSessionID: sender.sessionID, projectID: sender.projectID, directory: sender.directory,
              messageID: message.id, authority: "context-only", fingerprint: message.fingerprint } } }, { signal: abort }), call.signal))
          if (!record(admitted) || admitted.id !== id || admitted.sessionID !== recipient || admitted.type !== "user" || admitted.delivery !== plan.delivery || !record(admitted.payload) || admitted.payload.text !== wireText) throw new Error("admission identity/content/transport not verified; outcome remains unknown")
          await store.mutate(current => { current.messages.find(item => item.id === message.id)!.receipts[recipient] = "admitted" }, call.signal)
        }
        return (await store.read()).messages.find(item => item.id === message.id)
      }
      if (input.op === "ack") return store.mutate(state => {
        const message = state.messages.find(message => message.id === input.id)
        if (!message || !message.recipients.includes(sender.sessionID)) throw new Error("only an addressed peer may acknowledge")
        message.acknowledgements[sender.sessionID] ??= now()
        return { id: message.id, acknowledgement: "seen-only", acceptedWork: false }
      }, call.signal)
      if (input.op === "claim") {
        if (!Array.isArray(input.paths) || !input.paths.length || input.paths.length > 16 || !input.paths.every(cleanPath)) throw new Error("claim requires bounded literal worktree-relative paths")
        for (const relative of input.paths) {
          let candidate = path.join(deps.scope.directory, relative)
          while (true) {
            try { if (await realpath(candidate) !== candidate) throw new Error("claim path is symlinked"); break }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; candidate = path.dirname(candidate) }
          }
        }
        return store.mutate(state => {
          const prior = state.claims.find(claim => claim.id === input.id)
          const paths = [...input.paths as string[]].sort()
          if (prior) { if (prior.owner !== sender.sessionID || hash(prior.paths) !== hash(paths)) throw new Error("claim ID conflicts"); return prior }
          if (state.claims.length >= LIMITS.claims) throw new Error("claim history at capacity")
          if (state.claims.some(claim => !claim.releasedAt && claim.paths.some(a => paths.some(b => overlaps(a, b))))) throw new Error("path is reserved; stale status never releases ownership")
          const claim = { id: input.id as string, owner: sender.sessionID, paths, createdAt: now() }; state.claims.push(claim); return claim
        }, call.signal)
      }
      if (!text(input.evidence, 1000)) throw new Error("release requires explicit owner evidence")
      return store.mutate(state => {
        const claim = state.claims.find(claim => claim.id === input.id)
        if (!claim || claim.owner !== sender.sessionID) throw new Error("only the native invoking owner may release; no automatic takeover")
        claim.releasedAt ??= now(); claim.evidence ??= input.evidence as string
        return claim
      }, call.signal)
    },
    async inboxRead(input: unknown, signal?: AbortSignal) {
      const selected = settingsInput(input, ["sessionID", "after", "limit", "unreadOnly"])
      await settingsPermit(selected, "read", signal)
      await owned(selected, signal)
      return readInbox(selected, input as Record<string, unknown>, signal)
    },
    async inboxSeen(input: unknown, signal?: AbortSignal) {
      const selected = settingsInput(input, ["sessionID", "id"])
      if (!record(input) || !identifier(input.id)) throw new Error("mark-seen requires an exact message ID")
      await settingsPermit(selected, "read", signal)
      await owned(selected, signal)
      await settingsPermit(selected, "edit", signal)
      await owned(selected, signal)
      return store.mutate(state => {
        const message = state.messages.find(message => message.id === input.id)
        if (!message?.recipients.includes(selected)) throw new Error("only an addressed peer may acknowledge")
        message.acknowledgements[selected] ??= now()
        return { id: message.id, acknowledgement: "seen-only", acceptedWork: false }
      }, signal)
    },
    async inboxOwnership(input: unknown, signal?: AbortSignal) {
      const selected = settingsInput(input, ["sessionID"])
      await settingsPermit(selected, "read", signal)
      await owned(selected, signal)
      const assignments = (await store.read()).assignments.filter(item => item.owner === selected || item.worker === selected)
      const result = { assignments: [] as Assignment[], total: assignments.length, truncated: false }
      for (const item of assignments) {
        if (Buffer.byteLength(JSON.stringify({ ...result, assignments: [...result.assignments, item] })) > MAX_PAYLOAD_BYTES - 512) break
        result.assignments.push(item)
      }
      result.truncated = result.assignments.length < assignments.length
      checkAbort(signal)
      return result
    },
    async settingsRead(input: unknown, signal?: AbortSignal) {
      const selected = settingsInput(input, ["sessionID"])
      await settingsPermit(selected, "read", signal)
      await owned(selected, signal)
      return policyView((await store.read()).policies, selected)
    },
    async settingsUpdate(input: unknown, signal?: AbortSignal) {
      const selected = settingsInput(input, ["sessionID", "target", "expectedRevision", "policy"])
      if (!record(input) || !["project", "chat"].includes(input.target as string) || !Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 0) throw new Error("invalid policy update")
      if (input.policy === null) { if (input.target !== "chat") throw new Error("only chat override can inherit") }
      else validatePolicy(input.policy)
      await settingsPermit(selected, "read", signal)
      await owned(selected, signal)
      await settingsPermit(selected, "edit", signal)
      if (input.policy !== null) {
        for (const id of input.policy.allowedSenders ?? []) {
          await deps.assert({ sessionID: selected, action: "read", resources: [`session:${id}`] })
          await owned(id, signal)
        }
      }
      await owned(selected, signal)
      return store.mutate(state => {
        const policies = state.policies ?? initialPolicies()
        if (policies.revision !== input.expectedRevision) throw new Error("recipient policy revision conflict; reload before saving")
        if (policies.revision === Number.MAX_SAFE_INTEGER) throw new Error("policy revision exhausted")
        if (input.target === "project") policies.project = structuredClone(input.policy as typeof policies.project)
        else if (input.policy === null) delete policies.sessions[selected]
        else {
          if (!policies.sessions[selected] && Object.keys(policies.sessions).length >= 64) throw new Error("recipient override capacity reached")
          policies.sessions[selected] = structuredClone(input.policy as typeof policies.project)
        }
        policies.revision++; state.policies = policies
        return policyView(policies, selected)
      }, signal)
    },
    store,
  }
  async function readInbox(selected: string, input: Record<string, unknown>, signal?: AbortSignal) {
    if (input.after !== undefined && !identifier(input.after) || input.threadID !== undefined && !identifier(input.threadID) ||
      input.unreadOnly !== undefined && typeof input.unreadOnly !== "boolean") throw new Error("invalid inbox cursor/thread/unread filter")
    const limit = input.limit ?? LIMITS.page
    if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > LIMITS.page) throw new Error("limit must be 1..20")
    const state = await store.read()
    checkAbort(signal)
    const incoming = state.messages.filter(message => message.recipients.includes(selected) && (!input.threadID || message.threadID === input.threadID))
    // Locate the cursor before filtering ACKs: a concurrent ACK must not invalidate pagination.
    const anchor = input.after ? incoming.findIndex(message => message.id === input.after) : -1
    if (input.after && anchor < 0) throw new Error("inbox cursor not found for current recipient/thread")
    const unreadOnly = input.unreadOnly !== false
    const unread = (message: Message) => message.acknowledgements[selected] === undefined
    const eligible = incoming.slice(anchor + 1).filter(message => !unreadOnly || unread(message))
    const result = { authority: "untrusted-peer-context-only", messages: [] as MessageView[], unreadOnly,
      total: incoming.filter(message => !unreadOnly || unread(message)).length, unreadCount: incoming.filter(unread).length,
      countsExact: true, next: undefined as string | undefined, truncated: false }
    for (const message of eligible.slice(0, limit as number)) {
      const view = pageMessage(message)
      if (Buffer.byteLength(JSON.stringify({ ...result, messages: [...result.messages, view] })) > MAX_PAYLOAD_BYTES - 512) break
      result.messages.push(view)
    }
    result.truncated = result.messages.length < eligible.length
    if (result.truncated) result.next = result.messages.at(-1)?.id
    return result
  }
  function settingsInput(input: unknown, allowed: string[]): string {
    if (!record(input) || !sessionID(input.sessionID)) throw new Error("operator settings require an exact selected session")
    keys(input, allowed); return input.sessionID
  }
  async function settingsPermit(selected: string, action: string, signal?: AbortSignal) {
    checkAbort(signal)
    // RPC authenticates the client, not human provenance. Never fabricate a native tool source.
    await deps.assert({ sessionID: selected, action, resources: [`session:${selected}`, deps.stateDirectory] })
    checkAbort(signal)
  }
  function register(assignment: Assignment, call: Call): void {
    deps.watchdog!.add(assignment, async signal => {
      const observationCall = { ...call, signal }
      await permit(observationCall, "read", [`session:${assignment.owner}`, `session:${assignment.worker}`])
      await owned(assignment.owner, signal); await owned(assignment.worker, signal)
      return deps.observe!(assignment.worker, signal)
    })
  }
}
