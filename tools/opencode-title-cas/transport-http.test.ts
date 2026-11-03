import { expect } from "bun:test"
import { Session } from "@opencode/schema/session"
import { Effect, Schema } from "effect"
import { it } from "../../core/test/lib/effect"
import { ServerFetch } from "../src/fetch"

const SessionResponse = Schema.Struct({ data: Schema.toEncoded(Session.Info) })

type Reply = { status: number; body: unknown }

const makeRequest = Effect.fn(function* () {
  const handler = yield* ServerFetch.make({
    app: { version: "test" },
    database: { path: ":memory:" },
    fs: { filewatcher: false },
    models: { fetch: false },
  })
  return (path: string, method: string, body?: unknown) =>
    Effect.promise(async (): Promise<Reply> => {
      const response = await handler(
        new Request(`http://opencode.local${path}`, {
          method,
          headers: { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      )
      const text = await response.text()
      let parsed: unknown = text
      try {
        parsed = text ? JSON.parse(text) : undefined
      } catch {
        parsed = text
      }
      return { status: response.status, body: parsed }
    })
})

type Request = Effect.Success<ReturnType<typeof makeRequest>>

const createSession = (request: Request) =>
  Effect.gen(function* () {
    const reply = yield* request("/api/session", "POST", { metadata: { source: "create" } })
    expect(reply.status).toBe(200)
    return Schema.decodeUnknownSync(SessionResponse)(reply.body).data
  })

const readSession = (request: Request, sessionID: Session.ID) =>
  request(`/api/session/${sessionID}`, "GET").pipe(
    Effect.map((reply) => {
      expect(reply.status).toBe(200)
      return Schema.decodeUnknownSync(SessionResponse)(reply.body).data
    }),
  )

const patch = (request: Request, sessionID: Session.ID, body: unknown) =>
  request(`/api/session/${sessionID}`, "PATCH", body)

const base = (sessionID: Session.ID) => `Base label · ${sessionID}`

it.live("conditional title update commits when the stored title matches", () =>
  Effect.gen(function* () {
    const request = yield* makeRequest()
    const session = yield* createSession(request)
    const start = base(session.id)
    expect((yield* patch(request, session.id, { title: start })).status).toBe(204)
    expect((yield* readSession(request, session.id)).title).toBe(start)

    const next = `Next label · ${session.id}`
    expect((yield* patch(request, session.id, { title: next, expectedTitle: start })).status).toBe(204)
    expect((yield* readSession(request, session.id)).title).toBe(next)
  }).pipe(Effect.scoped),
)

it.live("a successful conditional title update also applies the other supplied fields", () =>
  Effect.gen(function* () {
    const request = yield* makeRequest()
    const session = yield* createSession(request)
    const start = base(session.id)
    yield* patch(request, session.id, { title: start })
    const permissions = [{ action: "edit", resource: "**", effect: "allow" }]
    const next = `Next label · ${session.id}`
    const reply = yield* patch(request, session.id, {
      title: next, expectedTitle: start, metadata: { source: "conditional" }, permissions, archived: true,
    })
    expect(reply.status).toBe(204)
    const after = yield* readSession(request, session.id)
    expect(after.title).toBe(next)
    expect(after.metadata).toEqual({ source: "conditional" })
    expect(after.permissions).toEqual(permissions)
    expect(after.time.archived).toBeGreaterThan(0)
  }).pipe(Effect.scoped),
)

it.live("conflict preserves the manual title and skips metadata, permissions and archive", () =>
  Effect.gen(function* () {
    const request = yield* makeRequest()
    const session = yield* createSession(request)
    const start = base(session.id)
    const manual = `Human chosen · ${session.id}`
    yield* patch(request, session.id, { title: start })
    yield* patch(request, session.id, { title: manual })

    const reply = yield* patch(request, session.id, {
      title: `Plugin chosen · ${session.id}`,
      expectedTitle: start,
      metadata: { source: "plugin" },
      permissions: [{ action: "edit", resource: "**", effect: "allow" }],
      archived: true,
    })

    // User-visible preservation is asserted before the status so a dropped forward fails here.
    const after = yield* readSession(request, session.id)
    expect(after.title).toBe(manual)
    expect(after.metadata).toEqual({ source: "create" })
    expect(after.permissions).toBeUndefined()
    expect(after.time.archived).toBeUndefined()
    expect(reply.status).toBe(409)
    const body = JSON.stringify(reply.body)
    expect(body).toContain("Session title changed before the conditional rename.")
    expect(body).not.toContain("Human chosen")
    expect(body).not.toContain("Plugin chosen")
    expect(body.toLowerCase()).not.toContain("select ")
  }).pipe(Effect.scoped),
)

it.live("invalid conditional preconditions fail 400 without renaming or generating", () =>
  Effect.gen(function* () {
    const request = yield* makeRequest()
    const session = yield* createSession(request)
    const start = base(session.id)
    yield* patch(request, session.id, { title: start })

    const missing = yield* patch(request, session.id, { expectedTitle: start })
    expect(missing.status).toBe(400)
    expect(JSON.stringify(missing.body)).toContain("expectedTitle requires a non-empty title")
    expect((yield* readSession(request, session.id)).title).toBe(start)

    const empty = yield* patch(request, session.id, { title: "", expectedTitle: start })
    expect(empty.status).toBe(400)
    expect(JSON.stringify(empty.body)).toContain("expectedTitle requires a non-empty title")
    expect((yield* readSession(request, session.id)).title).toBe(start)
  }).pipe(Effect.scoped),
)

it.live("legacy empty title keeps the HTTP generation path rather than a plain rename", () =>
  Effect.gen(function* () {
    const request = yield* makeRequest()
    const session = yield* createSession(request)
    const start = base(session.id)
    yield* patch(request, session.id, { title: start })

    expect((yield* patch(request, session.id, { title: "" })).status).toBe(204)
    expect((yield* readSession(request, session.id)).title).toBe(start)
  }).pipe(Effect.scoped),
)

it.live("legacy unconditional title updates still overwrite, and missing sessions stay 404", () =>
  Effect.gen(function* () {
    const request = yield* makeRequest()
    const session = yield* createSession(request)
    yield* patch(request, session.id, { title: base(session.id) })
    const manual = `Human chosen · ${session.id}`
    yield* patch(request, session.id, { title: manual })
    expect((yield* readSession(request, session.id)).title).toBe(manual)

    const conditional = yield* patch(request, session.id, {
      title: "Plugin chosen",
      expectedTitle: manual,
    })
    expect(conditional.status).toBe(204)

    const absent = Session.ID.make("ses_transport_missing")
    expect((yield* patch(request, absent, { title: "x", expectedTitle: "y" })).status).toBe(404)
    expect((yield* patch(request, absent, { title: "x" })).status).toBe(404)
  }).pipe(Effect.scoped),
)
