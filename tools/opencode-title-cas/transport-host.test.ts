import { expect } from "bun:test"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { Session } from "@opencode/core/session"
import { Effect } from "effect"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

const context = Effect.fn(function* () {
  const plugins = yield* Plugin.Service
  return yield* PluginHost.make(plugins)
})

it.live("plugin host forwards expectedTitle to the real core conditional rename", () =>
  Effect.gen(function* () {
    const ctx = yield* context()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Base label" })
    const next = `Next label · ${created.id}`
    yield* ctx.session.update({ sessionID: created.id, title: next, expectedTitle: "Base label" })
    expect((yield* sessions.get(created.id)).title).toBe(next)
  }),
)

it.live("plugin conflict preserves the manual title and metadata before reporting the core conflict", () =>
  Effect.gen(function* () {
    const ctx = yield* context()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Placeholder" })
    const start = `Base label · ${created.id}`
    const manual = `Human chosen · ${created.id}`
    yield* ctx.session.update({ sessionID: created.id, title: start })
    yield* ctx.session.update({ sessionID: created.id, title: manual, metadata: { source: "human" } })

    const exit = yield* ctx.session
      .update({
        sessionID: created.id,
        title: `Plugin chosen · ${created.id}`,
        expectedTitle: start,
        metadata: { source: "plugin" },
        permissions: [{ action: "edit", resource: "**", effect: "allow" }],
      })
      .pipe(Effect.exit)

    // User-visible preservation is asserted before the error so a dropped forward fails here.
    const after = yield* sessions.get(created.id)
    expect(after.title).toBe(manual)
    expect(after.metadata).toEqual({ source: "human" })
    expect(after.permissions).toBeUndefined()
    expect(exit._tag).toBe("Failure")
    expect(exit._tag === "Failure" ? exit.cause.toString() : "").toContain("Session.TitleConflictError")
  }),
)

it.live("plugin empty title keeps the plain-rename difference from HTTP generation", () =>
  Effect.gen(function* () {
    const ctx = yield* context()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Base label" })
    yield* ctx.session.update({ sessionID: created.id, title: "" })
    expect((yield* sessions.get(created.id)).title).toBe("")
  }),
)

it.live("plugin expectedTitle without a title fails instead of being ignored", () =>
  Effect.gen(function* () {
    const ctx = yield* context()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Base label" })
    const exit = yield* ctx.session
      .update({ sessionID: created.id, expectedTitle: "Base label" })
      .pipe(Effect.exit)
    expect(exit._tag).toBe("Failure")
    expect(exit._tag === "Failure" ? exit.cause.toString() : "").toContain("expectedTitle requires a title")
    expect((yield* sessions.get(created.id)).title).toBe("Base label")
  }),
)

it.live("plugin expectedTitle with an empty title is refused and preserves the manual title", () =>
  Effect.gen(function* () {
    const ctx = yield* context()
    const sessions = yield* Session.Service
    const created = yield* ctx.session.create({ title: "Base label" })
    const manual = `Human chosen · ${created.id}`
    yield* ctx.session.update({ sessionID: created.id, title: manual, metadata: { source: "human" } })

    // expectedTitle matches the stored title, so only the empty-title rule can refuse this write.
    const exit = yield* ctx.session
      .update({
        sessionID: created.id,
        title: "",
        expectedTitle: manual,
        metadata: { source: "plugin" },
        permissions: [{ action: "edit", resource: "**", effect: "allow" }],
      })
      .pipe(Effect.exit)

    const after = yield* sessions.get(created.id)
    expect(after.title).toBe(manual)
    expect(after.metadata).toEqual({ source: "human" })
    expect(after.permissions).toBeUndefined()
    expect(exit._tag).toBe("Failure")
    expect(exit._tag === "Failure" ? exit.cause.toString() : "").toContain("expectedTitle requires a non-empty title")
  }),
)

it.live("plugin host keeps the missing-session contract", () =>
  Effect.gen(function* () {
    const ctx = yield* context()
    const missing = Session.ID.make("ses_transport_host_missing")
    const exit = yield* ctx.session
      .update({ sessionID: missing, title: "x", expectedTitle: "y" })
      .pipe(Effect.exit)
    expect(exit._tag).toBe("Failure")
    expect(exit._tag === "Failure" ? exit.cause.toString() : "").toContain("Session.NotFoundError")
  }),
)
