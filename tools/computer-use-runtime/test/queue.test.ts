import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerOperationQueue, formatRuntimeError } from "../src/index.ts";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("concurrent mutations execute in FIFO order exactly once", async () => {
  const queue = createOwnerOperationQueue();
  const gate = deferred();
  const events: string[] = [];
  let firstRuns = 0;
  let secondRuns = 0;
  const first = queue.run("owner-a", async () => {
    firstRuns += 1;
    events.push("first-start");
    await gate.promise;
    events.push("first-end");
  });
  const second = queue.run("owner-a", () => {
    secondRuns += 1;
    events.push("second");
  });

  await Promise.resolve();
  assert.deepEqual(events, ["first-start"]);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first-start", "first-end", "second"]);
  assert.equal(firstRuns, 1);
  assert.equal(secondRuns, 1);
});

test("cancellation of a running operation releases the lock for the next entry", async () => {
  const queue = createOwnerOperationQueue();
  const controller = new AbortController();
  const started = deferred();
  let nextRuns = 0;
  const first = queue.run(
    "owner-b",
    async (signal) => {
      started.resolve();
      await new Promise<void>((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      });
    },
    { signal: controller.signal },
  );
  const second = queue.run("owner-b", () => {
    nextRuns += 1;
  });
  await started.promise;
  controller.abort();
  await assert.rejects(first, { code: "CANCELLED" });
  await second;
  assert.equal(nextRuns, 1);
});

test("bounded depth rejects excess entries without growing the queue", async () => {
  const queue = createOwnerOperationQueue(1);
  const gate = deferred();
  const first = queue.run("owner-c", () => gate.promise);
  await Promise.resolve();
  await assert.rejects(queue.run("owner-c", () => "not-run"), { code: "QUEUE_FULL" });
  gate.resolve();
  await first;
});

test("a throwing operation is redacted, does not deadlock, and later entries run once", async () => {
  const queue = createOwnerOperationQueue();
  let secondRuns = 0;
  const first = queue.run("owner-d", () => {
    throw new Error("backend detail is not normalized by the queue");
  });
  const second = queue.run("owner-d", () => {
    secondRuns += 1;
    return "ok";
  });
  await assert.rejects(first, (error: unknown) => {
    assert.equal((error as { code?: string }).code, "INTERNAL");
    assert.equal(formatRuntimeError(error).includes("backend detail"), false);
    return true;
  });
  assert.equal(await second, "ok");
  assert.equal(secondRuns, 1);
});

test("opted-in reads interleave but cannot jump an earlier mutation", async () => {
  const queue = createOwnerOperationQueue();
  const gate = deferred();
  const events: string[] = [];
  const firstRead = queue.run(
    "owner-e",
    async () => {
      events.push("read-1-start");
      await gate.promise;
      events.push("read-1-end");
    },
    { mode: "read", allowInterleave: true },
  );
  const secondRead = queue.run(
    "owner-e",
    () => events.push("read-2"),
    { mode: "read", allowInterleave: true },
  );
  const mutation = queue.run("owner-e", () => events.push("mutation"));
  const lateRead = queue.run(
    "owner-e",
    () => events.push("read-late"),
    { mode: "read", allowInterleave: true },
  );

  await Promise.resolve();
  assert.deepEqual(events, ["read-1-start", "read-2"]);
  gate.resolve();
  await Promise.all([firstRead, secondRead, mutation, lateRead]);
  assert.deepEqual(events, ["read-1-start", "read-2", "read-1-end", "mutation", "read-late"]);
});

test("queued cancellation removes only that entry and the following entry runs", async () => {
  const queue = createOwnerOperationQueue(3);
  const gate = deferred();
  const first = queue.run("owner-f", () => gate.promise);
  await Promise.resolve();
  const controller = new AbortController();
  const cancelled = queue.run("owner-f", () => "not-run", { signal: controller.signal });
  let thirdRuns = 0;
  const third = queue.run("owner-f", () => {
    thirdRuns += 1;
  });
  controller.abort();
  await assert.rejects(cancelled, { code: "CANCELLED" });
  gate.resolve();
  await Promise.all([first, third]);
  assert.equal(thirdRuns, 1);
});
