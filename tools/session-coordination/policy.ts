import { keys, record, sessionID } from "./model.ts"

export const RECEIVE_MODES = ["off", "inbox-only", "steer-running"] as const
export interface ReceivePolicy {
  mode: typeof RECEIVE_MODES[number]; idleWake: boolean; allowedSenders: string[] | null; steerLimit: number
}
export interface Policies { version: 1; revision: number; project: ReceivePolicy; sessions: Record<string, ReceivePolicy> }
export interface PolicyView {
  sessionID: string; revision: number; inherited: boolean; project: ReceivePolicy; override?: ReceivePolicy; effective: ReceivePolicy
}
export interface DispatchPlan {
  delivery: "queue" | "steer"; resume: boolean; policyRevision: number; plannedAt: number; envelopeHash: string
}
export const POLICY_WINDOW_MS = 60_000
const sessionSchema = { type: "string", minLength: 5, maxLength: 100, pattern: "^ses_[a-zA-Z0-9_-]+$" }
const policyFields = {
  mode: { enum: RECEIVE_MODES }, idleWake: { type: "boolean" },
  allowedSenders: { anyOf: [{ type: "null" }, { type: "array", maxItems: 8, uniqueItems: true, items: sessionSchema }] },
  steerLimit: { type: "integer", minimum: 1, maximum: 16 },
}
const policyShape = { type: "object", required: ["mode", "idleWake", "allowedSenders", "steerLimit"], additionalProperties: false }
export const receivePolicySchema = { anyOf: [
  { ...policyShape, properties: { ...policyFields, idleWake: { const: false } } },
  { ...policyShape, properties: { ...policyFields, idleWake: { const: true }, mode: { const: "steer-running" } } },
] }
export const policyViewSchema = { type: "object", properties: { sessionID: sessionSchema, revision: { type: "integer", minimum: 0 },
  inherited: { type: "boolean" }, project: receivePolicySchema, override: receivePolicySchema, effective: receivePolicySchema,
}, required: ["sessionID", "revision", "inherited", "project", "effective"], additionalProperties: false }
export const dispatchPlanSchema = { type: "object", properties: { delivery: { enum: ["queue", "steer"] }, resume: { type: "boolean" },
  policyRevision: { type: "integer", minimum: 0 }, plannedAt: { type: "integer" }, envelopeHash: { type: "string", minLength: 64, maxLength: 64 },
}, required: ["delivery", "resume", "policyRevision", "plannedAt", "envelopeHash"], additionalProperties: false }
export function defaultPolicy(): ReceivePolicy { return { mode: "inbox-only", idleWake: false, allowedSenders: null, steerLimit: 4 } }
export function initialPolicies(): Policies { return { version: 1, revision: 0, project: defaultPolicy(), sessions: {} } }
export function validatePolicy(value: unknown): asserts value is ReceivePolicy {
  if (!record(value) || !RECEIVE_MODES.includes(value.mode as ReceivePolicy["mode"]) || typeof value.idleWake !== "boolean" ||
    value.idleWake && value.mode !== "steer-running" || !Number.isInteger(value.steerLimit) || (value.steerLimit as number) < 1 || (value.steerLimit as number) > 16 ||
    value.allowedSenders !== null && (!Array.isArray(value.allowedSenders) || value.allowedSenders.length > 8 ||
      !value.allowedSenders.every(sessionID) || new Set(value.allowedSenders).size !== value.allowedSenders.length)) throw new Error("invalid recipient policy")
  keys(value, ["mode", "idleWake", "allowedSenders", "steerLimit"])
}
export function validatePolicies(value: unknown): asserts value is Policies {
  if (!record(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
    !record(value.sessions) || Object.keys(value.sessions).length > 64) throw new Error("invalid recipient policy store")
  keys(value, ["version", "revision", "project", "sessions"])
  validatePolicy(value.project)
  for (const [id, policy] of Object.entries(value.sessions)) { if (!sessionID(id)) throw new Error("invalid recipient override"); validatePolicy(policy) }
}
export function policyView(policies: Policies | undefined, id: string): PolicyView {
  const value = policies ?? initialPolicies(), override = value.sessions[id]
  return structuredClone({ sessionID: id, revision: value.revision, inherited: override === undefined, project: value.project,
    ...(override ? { override } : {}), effective: override ?? value.project })
}
export function validatePolicyView(value: unknown): asserts value is PolicyView {
  if (!record(value) || !sessionID(value.sessionID) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
    typeof value.inherited !== "boolean" || value.inherited !== (value.override === undefined)) throw new Error("invalid effective policy view")
  keys(value, ["sessionID", "revision", "inherited", "project", "override", "effective"])
  validatePolicy(value.project); validatePolicy(value.effective)
  if (value.override !== undefined) validatePolicy(value.override)
  if (JSON.stringify(value.effective) !== JSON.stringify(value.override ?? value.project)) throw new Error("effective policy mismatch")
}
export function allowRecipient(policy: ReceivePolicy, sender: string): void {
  if (policy.mode === "off" || policy.allowedSenders !== null && !policy.allowedSenders.includes(sender)) throw new Error("recipient policy refuses peer input")
}
export function allowReplay(policy: ReceivePolicy, sender: string, plan: DispatchPlan): void {
  allowRecipient(policy, sender)
  if (plan.delivery === "steer" && policy.mode !== "steer-running" || plan.resume && !policy.idleWake) throw new Error("recipient policy revoked pinned dispatch; outcome remains unknown/pending")
}
export function validatePlan(value: unknown): asserts value is DispatchPlan {
  if (!record(value) || !["queue", "steer"].includes(value.delivery as string) || typeof value.resume !== "boolean" || value.resume && value.delivery !== "steer" ||
    !Number.isSafeInteger(value.policyRevision) || (value.policyRevision as number) < 0 || !Number.isSafeInteger(value.plannedAt) ||
    typeof value.envelopeHash !== "string" || value.envelopeHash.length !== 64) throw new Error("invalid pinned dispatch plan")
  keys(value, ["delivery", "resume", "policyRevision", "plannedAt", "envelopeHash"])
}
