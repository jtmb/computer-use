import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { EventSequenceTable, EventTable } from "@opencode/core/event/sql"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionEvent } from "@opencode/core/session/event"
import { SessionExecution } from "@opencode/core/session/execution"
import { SessionInbox } from "@opencode/core/session/inbox"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionStore } from "@opencode/core/session/store"
import { SessionTable } from "@opencode/core/session/sql"
import { SessionStatusEvent } from "@opencode/schema/session-status-event"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Bus.node,
      SessionProjector.node,
      SessionInbox.node,
      SessionStore.node,
      Session.node,
    ]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      SessionExecution.node.replace(SessionExecution.noopLayer),
    ],
  ),
)

const sessionID = Session.ID.make("ses_title_cas")
const base = `Base label · ${sessionID}`

const seed = (title: string) =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .onConflictDoNothing()
      .run()
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: "title-cas",
        directory: "/project",
        title,
        version: "test",
      })
      .onConflictDoNothing()
      .run()
    return db
  })

type Db = Effect.Success<ReturnType<typeof seed>>

const title = (db: Db) =>
  db
    .select({ title: SessionTable.title })
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionID))
    .get()
    .pipe(Effect.orDie)

const renamedEvents = (db: Db) =>
  db
    .select({ type: EventTable.type })
    .from(EventTable)
    .where(eq(EventTable.aggregate_id, sessionID))
    .all()
    .pipe(Effect.orDie)

const sequence = (db: Db) =>
  db
    .select({ seq: EventSequenceTable.seq })
    .from(EventSequenceTable)
    .where(eq(EventSequenceTable.aggregate_id, sessionID))
    .get()
    .pipe(Effect.orDie)

describe("conditional session rename", () => {
  it.effect("commits when the stored title still matches the expected baseline", () =>
    Effect.gen(function* () {
      const db = yield* seed(base)
      const sessions = yield* Session.Service
      const next = `Next label · ${sessionID}`
      yield* sessions.renameConditional({ sessionID, title: next, expectedTitle: base })
      expect(yield* title(db)).toEqual({ title: next })
      expect(yield* renamedEvents(db)).toHaveLength(1)
      expect(yield* sequence(db)).toEqual({ seq: 0 })
    }),
  )

  it.effect("stores the exact title including the full session ID suffix", () =>
    Effect.gen(function* () {
      const db = yield* seed(base)
      const sessions = yield* Session.Service
      const long = `${"A".repeat(120)} · ${sessionID}`
      yield* sessions.renameConditional({ sessionID, title: long, expectedTitle: base })
      expect(yield* title(db)).toEqual({ title: long })
    }),
  )

  it.effect("preserves a manual rename committed after the last pre-publication read", () =>
    Effect.gen(function* () {
      const db = yield* seed(base)
      const bus = yield* Bus.Service
      const store = yield* SessionStore.Service
      const sessions = yield* Session.Service
      const manual = `Human chosen · ${sessionID}`

      // Interleave another client between rename's pre-check read and its publication.
      // Only the test-scoped Store.get is wrapped; Bus, SQLite and the projector stay real.
      // The publish happens outside any Bus transaction or aggregate lock.
      const originalGet = store.get
      let reads = 0
      yield* Effect.addFinalizer(() => Effect.sync(() => void Object.assign(store, { get: originalGet })))
      Object.assign(store, {
        get: (id: Session.ID) =>
          Effect.gen(function* () {
            const snapshot = yield* originalGet(id)
            reads += 1
            if (id === sessionID && reads === 1)
              yield* bus.publish(SessionEvent.Renamed, { sessionID, title: manual })
            return snapshot
          }),
      })

      const exit = yield* sessions
        .renameConditional({ sessionID, title: `Plugin chosen · ${sessionID}`, expectedTitle: base })
        .pipe(Effect.exit)

      // Manual-title preservation is asserted first so a removed guard fails here, not on Exit.
      expect(yield* title(db)).toEqual({ title: manual })
      expect(reads).toBe(2)
      expect(exit._tag).toBe("Failure")
      expect(exit._tag === "Failure" ? exit.cause.toString() : "").toContain("TitleConflictError")
      expect(yield* renamedEvents(db)).toHaveLength(1)
      expect(yield* sequence(db)).toEqual({ seq: 0 })
    }),
  )

  it.effect("legacy unconditional rename still overwrites a manual title", () =>
    Effect.gen(function* () {
      const db = yield* seed(base)
      const bus = yield* Bus.Service
      const sessions = yield* Session.Service
      yield* bus.publish(SessionEvent.Renamed, { sessionID, title: `Human chosen · ${sessionID}` })
      yield* sessions.rename({ sessionID, title: `Plugin chosen · ${sessionID}` })
      expect(yield* title(db)).toEqual({ title: `Plugin chosen · ${sessionID}` })
      expect(yield* renamedEvents(db)).toHaveLength(2)
    }),
  )

  it.effect("reports a missing session for conditional and legacy renames", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const missing = Session.ID.make("ses_title_cas_missing")
      for (const expectedTitle of [base, undefined]) {
        const exit = yield* (expectedTitle === undefined
          ? sessions.rename({ sessionID: missing, title: base })
          : sessions.renameConditional({ sessionID: missing, title: base, expectedTitle })
        ).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        expect(exit._tag === "Failure" ? exit.cause.toString() : "").toContain("NotFoundError")
      }
    }),
  )

  // Expected-title limitation: a rename away and back is indistinguishable from no rename.
  // A sequence precondition would reject this; it is not implemented and no such guarantee is claimed.
  it.effect("accepts an ABA round trip that returns to the expected title", () =>
    Effect.gen(function* () {
      const db = yield* seed(base)
      const bus = yield* Bus.Service
      const sessions = yield* Session.Service
      yield* bus.publish(SessionEvent.Renamed, { sessionID, title: `Other · ${sessionID}` })
      yield* bus.publish(SessionEvent.Renamed, { sessionID, title: base })
      yield* sessions.renameConditional({ sessionID, title: `Plugin chosen · ${sessionID}`, expectedTitle: base })
      expect(yield* title(db)).toEqual({ title: `Plugin chosen · ${sessionID}` })
    }),
  )

  it.effect("exposes TitleConflictError as a runtime named export", () =>
    Effect.gen(function* () {
      expect(typeof Session.TitleConflictError).toBe("function")
      const error = new Session.TitleConflictError({ sessionID })
      expect(error._tag).toBe("Session.TitleConflictError")
      expect(error.message).toContain(sessionID)
    }),
  )

  it.effect("rejects a guard on a non-durable event", () =>
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const exit = yield* bus
        .publish(SessionStatusEvent.Idle, { sessionID }, { guard: () => Effect.succeed(true) })
        .pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
      expect(exit._tag === "Failure" ? exit.cause.toString() : "").toContain("Local guards require a durable event")
    }),
  )

  it.effect("rejects a guard inside publishAll", () =>
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const exit = yield* bus
        .publishAll([[SessionEvent.Renamed, { sessionID, title: base }, { guard: () => Effect.succeed(true) }]])
        .pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
      expect(exit._tag === "Failure" ? exit.cause.toString() : "").toContain("Batch guards are not supported")
    }),
  )
})
