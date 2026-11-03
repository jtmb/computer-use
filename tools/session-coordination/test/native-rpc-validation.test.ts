import assert from "node:assert/strict"
import test from "node:test"
import { Schema, SchemaRepresentation, type JsonSchema } from "effect"
import { coordinationInboxContract, coordinationSettingsContract } from "../rpc-contract.ts"
import { rpcCompatible, rpcValue } from "../rpc-compatible.ts"
import { defaultPolicy } from "../policy.ts"

function nativeDecode(schema: unknown) {
  const compiled = SchemaRepresentation.fromJsonSchemaDocument({ dialect: "draft-2020-12", schema: schema as JsonSchema.JsonSchema, definitions: {} })
  // This pure JSON document uses only importer-owned checks, not service-backed revivers.
  return Schema.decodeUnknownSync(compiled as Schema.Codec<unknown>, { onExcessProperty: "error" })
}
test("installed native Effect compiler accepts every registered RPC input/output, not just AJV", () => {
  for (const contract of [coordinationInboxContract, coordinationSettingsContract]) {
    for (const [name, method] of Object.entries(rpcCompatible(contract).methods)) {
      assert.doesNotThrow(() => nativeDecode(method.input), `${contract.id}.${name}.input`)
      assert.doesNotThrow(() => nativeDecode(method.output), `${contract.id}.${name}.output`)
    }
  }
})
test("native RPC validation retains idle-wake and project-policy invariants without unsupported if/then", () => {
  const methods = rpcCompatible(coordinationSettingsContract).methods
  const update = nativeDecode(methods.update.input), output = nativeDecode(methods.read.output)
  const value = { sessionID: "ses_fixture", target: "project", expectedRevision: 0, policy: defaultPolicy() }
  assert.doesNotThrow(() => update(value))
  assert.throws(() => update({ ...value, policy: null }))
  assert.doesNotThrow(() => update({ ...value, target: "chat", policy: null }))
  assert.throws(() => update({ ...value, policy: { ...defaultPolicy(), idleWake: true } }))
  const policy = { ...defaultPolicy(), mode: "steer-running", idleWake: true }
  assert.doesNotThrow(() => update({ ...value, policy }))
  assert.throws(() => update({ ...value, authority: "human" }))
  assert.doesNotThrow(() => output({ sessionID: "ses_fixture", revision: 0, inherited: true, project: policy, effective: policy }))
})
test("native RPC output omits optional undefined rather than failing before JSON serialization", () => {
  const decode = nativeDecode(rpcCompatible(coordinationInboxContract).methods.read.output)
  const page = { authority: "untrusted-peer-context-only", messages: [], unreadOnly: true, total: 0, unreadCount: 0, countsExact: true, next: undefined, truncated: false }
  assert.throws(() => decode(page))
  assert.doesNotThrow(() => decode(rpcValue(page)))
})
