import os from "node:os";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BrowserBackendError } from "../src/errors.ts";
import { createBrowserManager, createLocalWorkerHandle } from "../src/manager.ts";
import { createBrowserWorker } from "../src/ops.ts";
import { resolveBrowserProfile } from "../src/profile.ts";
import { FakeContext, fakeLauncher } from "./fakes.ts";

async function tempRoot(): Promise<string> {
  return mkdtemp(join("/tmp/opencode", "browser-backend-test-"));
}

async function managerFor(root: string) {
  return createBrowserManager({
    workerFactory: async (profileDir) => {
      const worker = await createBrowserWorker({ profileDir, launcher: fakeLauncher(new FakeContext()) });
      return createLocalWorkerHandle(worker);
    },
  });
}

function session(sessionId: string, root: string) {
  return {
    sessionId,
    projectKey: "computer-use-project",
    opencodeDataDir: join(root, "unused-data-dir"),
    envRoot: join(root, "profiles"),
  };
}

test("profile directories use the configured root and isolate project and session", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await resolveBrowserProfile("project", "ses_first", {
    opencodeDataDir: join(root, "data"),
    envRoot: join(root, "custom"),
  });
  const second = await resolveBrowserProfile("project", "ses_second", {
    opencodeDataDir: join(root, "data"),
    envRoot: join(root, "custom"),
  });
  assert.notEqual(first, second);
  assert.ok(first.startsWith(join(root, "custom", "project", "ses_first")));
});

test("profile roots reject relative, symlinked, world-readable, and foreign-owned paths; locks name the profile", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = { opencodeDataDir: join(root, "data") };
  await assert.rejects(resolveBrowserProfile("project", "ses_relative", { ...base, envRoot: "relative/root" }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "PROFILE_INVALID");

  const target = join(root, "real-root");
  await mkdir(target, { mode: 0o700 });
  const link = join(root, "linked-root");
  await import("node:fs/promises").then(({ symlink }) => symlink(target, link));
  await assert.rejects(resolveBrowserProfile("project", "ses_link", { ...base, envRoot: link }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "PROFILE_INVALID");

  const readable = join(root, "readable-root");
  await mkdir(readable, { mode: 0o755 });
  await assert.rejects(resolveBrowserProfile("project", "ses_readable", { ...base, envRoot: readable }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "PROFILE_INVALID");

  // A group-readable root is still a wider boundary than the documented 0700
  // contract, so it must be refused rather than silently accepted.
  const groupReadable = join(root, "group-root");
  await mkdir(groupReadable, { mode: 0o750 });
  await assert.rejects(resolveBrowserProfile("project", "ses_group", { ...base, envRoot: groupReadable }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "PROFILE_INVALID");

  const actualGetuid = process.getuid;
  assert.ok(actualGetuid);
  process.getuid = () => actualGetuid() + 1;
  try {
    await assert.rejects(resolveBrowserProfile("project", "ses_foreign", { ...base, envRoot: join(root, "foreign-root") }),
      (error: unknown) => error instanceof BrowserBackendError && error.code === "PROFILE_INVALID");
  } finally {
    process.getuid = actualGetuid;
  }

  const profile = await resolveBrowserProfile("project", "ses_locked", { ...base, envRoot: join(root, "locked-root") });
  // A lock held by a live process is a real conflict.
  await symlink(`${os.hostname()}-${process.pid}`, join(profile, "SingletonLock"));
  await assert.rejects(resolveBrowserProfile("project", "ses_locked", { ...base, envRoot: join(root, "locked-root") }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "PROFILE_LOCKED" && error.message.includes(profile));

  // A lock left by a dead process is stale and must be reclaimed, otherwise a
  // crashed browser would block the session forever.
  await rm(join(profile, "SingletonLock"), { force: true });
  await symlink(`${os.hostname()}-999999`, join(profile, "SingletonLock"));
  const reclaimed = await resolveBrowserProfile("project", "ses_locked", { ...base, envRoot: join(root, "locked-root") });
  assert.equal(reclaimed, profile);
  await assert.rejects(lstat(join(profile, "SingletonLock")),
    (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT");
});

test("two sessions have separate workers, profiles, and tab registries; foreign ids are rejected", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const manager = await managerFor(root);
  const first = await manager.start(session("ses_alpha", root));
  const second = await manager.start(session("ses_beta", root));
  assert.notEqual(first.profileDir, second.profileDir);
  const firstTab = await manager.execute("ses_alpha", { method: "tabs.new" }) as { id: string };
  const secondTab = await manager.execute("ses_beta", { method: "tabs.new" }) as { id: string };
  assert.notEqual(firstTab.id, secondTab.id);
  await assert.rejects(manager.execute("ses_beta", { method: "info", tabId: firstTab.id }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "FOREIGN_TAB");
  assert.equal((await manager.execute("ses_alpha", { method: "tabs.list" }) as unknown[]).length, 1);
  assert.equal((await manager.execute("ses_beta", { method: "tabs.list" }) as unknown[]).length, 1);
});

test("third concurrent session gets a typed capacity error without replacing either worker", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const manager = await managerFor(root);
  await manager.start(session("ses_one", root));
  await manager.start(session("ses_two", root));
  await assert.rejects(manager.start(session("ses_three", root)),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "CAPACITY_EXCEEDED");
  assert.deepEqual(manager.listSessions().map((item) => item.sessionId), ["ses_one", "ses_two"]);
});

test("worker crash is surfaced without retry; an explicit restart uses a fresh profile", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  let factoryCalls = 0;
  let mutationCalls = 0;
  const manager = createBrowserManager({
    workerFactory: async (profileDir) => {
      factoryCalls += 1;
      if (factoryCalls === 1) {
        let alive = true;
        return {
          execute: async () => {
            mutationCalls += 1;
            alive = false;
            throw new BrowserBackendError("WORKER_CRASHED", "crashed during the request");
          },
          terminate: async () => { alive = false; },
          isAlive: () => alive,
        };
      }
      const worker = await createBrowserWorker({ profileDir, launcher: fakeLauncher(new FakeContext()) });
      return createLocalWorkerHandle(worker);
    },
  });
  const initial = await manager.start(session("ses_crash", root));
  await assert.rejects(manager.execute("ses_crash", { method: "tabs.new" }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "WORKER_CRASHED");
  assert.equal(mutationCalls, 1);
  await assert.rejects(manager.execute("ses_crash", { method: "tabs.new" }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "WORKER_CRASHED");
  assert.equal(factoryCalls, 1);
  const restarted = await manager.restart("ses_crash");
  assert.equal(factoryCalls, 2);
  assert.notEqual(restarted.profileDir, initial.profileDir);
  assert.equal((await manager.execute("ses_crash", { method: "tabs.new" }) as { ownership: string }).ownership, "ephemeral");
});

test("cancel terminates only its named session and preserves the other session", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const manager = await managerFor(root);
  await manager.start(session("ses_keep", root));
  await manager.start(session("ses_cancel", root));
  assert.equal(await manager.cancel("ses_cancel"), true);
  assert.deepEqual(manager.listSessions().map((item) => item.sessionId), ["ses_keep"]);
  assert.equal(await manager.cancel("ses_missing"), false);
  assert.equal((await manager.execute("ses_keep", { method: "tabs.new" }) as { ownership: string }).ownership, "ephemeral");
});
