import { expect, test } from "bun:test"
import { join } from "node:path"

const staged = process.env.CAS_STAGED
const native = process.env.OPENCODE_NATIVE
if (!staged || !native) throw Error("CAS_STAGED and OPENCODE_NATIVE are required")
const read = async (file: string) => {
  const input = Bun.file(file)
  if (input.size > 4 * 1024 * 1024) throw Error("OpenAPI fixture exceeds its read envelope")
  return JSON.parse(await input.text())
}
const document = await read(join(staged, "packages/protocol/openapi.json"))
const baseline = await read(join(native, "packages/protocol/openapi.json"))
const update = document.paths["/api/session/{sessionID}"].patch
const before = baseline.paths["/api/session/{sessionID}"].patch
const payload = update.requestBody.content["application/json"].schema

test("regenerated OpenAPI declares the optional expected title with its conditional semantics", () => {
  expect(payload.properties.expectedTitle.anyOf).toContainEqual({ type: "string" })
  expect(payload.required ?? []).not.toContain("expectedTitle")
  expect(payload.properties.expectedTitle.description).toContain("non-empty title")
  expect(payload.properties.expectedTitle.description).toContain("409")
  expect(payload.additionalProperties).toBe(false)
})

test("the actual conditional conflict response refers to the encoded ConflictError contract", () => {
  const ref = update.responses["409"].content["application/json"].schema.$ref
  expect(ref).toBe("#/components/schemas/ConflictErrorEncoded")
  const conflict = document.components.schemas.ConflictErrorEncoded
  expect(conflict.properties._tag.enum).toEqual(["ConflictError"])
  expect(conflict.required).toEqual(["_tag", "message"])
  expect(conflict.additionalProperties).toBe(false)
  expect(Object.keys(conflict.properties).sort()).toEqual(["_tag", "message", "resource"])
})

test("legacy payload fields, session identity and existing responses remain unchanged", () => {
  expect(update.operationId).toBe(before.operationId)
  expect(update.parameters).toEqual(before.parameters)
  for (const field of ["title", "metadata", "permissions", "archived"]) {
    expect(payload.properties[field]).toEqual(before.requestBody.content["application/json"].schema.properties[field])
  }
  expect(Object.keys(update.responses).sort()).toEqual(["204", "400", "401", "404", "409"])
  for (const status of ["204", "400", "401", "404"]) expect(update.responses[status]).toEqual(before.responses[status])
})

test("every generated local component reference resolves in the complete document", () => {
  const queue: unknown[] = [document]
  let nodes = 0
  let refs = 0
  while (queue.length) {
    if (++nodes > 200_000) throw Error("OpenAPI reference walk exceeds its fixture envelope")
    const value = queue.pop()
    if (typeof value !== "object" || value === null) continue
    for (const [key, entry] of Object.entries(value)) {
      if (key === "$ref") {
        expect(typeof entry).toBe("string")
        expect((entry as string).startsWith("#/components/schemas/")).toBe(true)
        const name = (entry as string).slice("#/components/schemas/".length)
        expect(Object.hasOwn(document.components.schemas, name)).toBe(true)
        refs++
      } else if (typeof entry === "object" && entry !== null) queue.push(entry)
    }
  }
  expect(refs).toBeGreaterThan(0)
})

test("the pinned original is a distinct unchanged baseline, not relabeled as the new schema", () => {
  expect(before.requestBody.content["application/json"].schema.properties.expectedTitle).toBeUndefined()
  expect(before.responses["409"]).toBeUndefined()
  expect(document.openapi).toBe(baseline.openapi)
  expect(Object.keys(document.paths).sort()).toEqual(Object.keys(baseline.paths).sort())
})
