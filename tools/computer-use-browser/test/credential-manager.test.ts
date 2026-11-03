import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createAuthGuard, type AuthGuardSignInPath } from "../../computer-use-runtime/src/index.ts";
import { BrowserBackendError } from "../src/errors.ts";
import { createBrowserManager, createLocalWorkerHandle } from "../src/manager.ts";
import { createBrowserWorker, type SnapshotResult } from "../src/ops.ts";
import { FakeContext, fakeLauncher } from "./fakes.ts";

async function createFixture(root: string, authGuard = createAuthGuard()) {
  const context = new FakeContext();
  const manager = createBrowserManager({
    authGuard,
    workerFactory: async (profileDir, options) => {
      const worker = await createBrowserWorker({
        profileDir,
        launcher: fakeLauncher(context),
        ...options,
      });
      return createLocalWorkerHandle(worker);
    },
  });
  await manager.start({
    sessionId: "ses_private_auth",
    projectKey: "credential-fill-test",
    opencodeDataDir: join(root, "unused-data"),
    envRoot: join(root, "profiles"),
    authFlow: true,
  });
  const tab = await manager.execute("ses_private_auth", { method: "tabs.new" }) as { id: string };
  await manager.execute("ses_private_auth", {
    method: "navigate",
    tabId: tab.id,
    url: "https://login.example.test/auth",
  });
  const snapshot = await manager.execute("ses_private_auth", {
    method: "snapshot",
    tabId: tab.id,
  }) as SnapshotResult;
  return { manager, authGuard, context, target: { tabId: tab.id, ref: "e1", generation: snapshot.generation } };
}

async function temporaryRoot(): Promise<string> {
  return mkdtemp(join("/tmp/opencode", "credential-manager-test-"));
}

test("manager credential fill refuses callers without the sign-in capability", async (t) => {
  const root = await temporaryRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { manager, authGuard, target } = await createFixture(root);
  authGuard.signInPath.begin();
  authGuard.signInPath.beginFilling();
  await assert.rejects(
    manager.fillCredential({} as AuthGuardSignInPath, {
      sessionId: "ses_private_auth",
      target,
      value: Buffer.from("marker-secret"),
    }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "CREDENTIAL_FILL_BLOCKED",
  );
});

test("manager credential fill refuses while the auth guard is not filling", async (t) => {
  const root = await temporaryRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { manager, authGuard, target } = await createFixture(root);
  await assert.rejects(
    manager.fillCredential(authGuard.signInPath, {
      sessionId: "ses_private_auth",
      target,
      value: Buffer.from("marker-secret"),
    }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "CREDENTIAL_FILL_BLOCKED",
  );
});

test("manager credential fill returns only status and blocks screenshots and uploads during filling", async (t) => {
  const root = await temporaryRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { manager, authGuard, target } = await createFixture(root);
  authGuard.signInPath.begin();
  authGuard.signInPath.beginFilling();
  const result = await manager.fillCredential(authGuard.signInPath, {
    sessionId: "ses_private_auth",
    target,
    value: Buffer.from("marker-secret"),
  });
  assert.deepEqual(result, { status: "filled" });
  assert.equal(JSON.stringify(result).includes("marker-secret"), false);
  await assert.rejects(
    manager.execute("ses_private_auth", { method: "screenshot", tabId: target.tabId }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "AUTH_GUARD_BLOCKED",
  );
  await assert.rejects(
    manager.execute("ses_private_auth", {
      method: "upload",
      target,
      path: "/not/a/credential-upload",
    }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "AUTH_GUARD_BLOCKED",
  );
});

test("manager credential fill requires a service-worker-blocked auth-flow session", async (t) => {
  const root = await temporaryRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const authGuard = createAuthGuard();
  const manager = createBrowserManager({
    authGuard,
    workerFactory: async (profileDir) => {
      const worker = await createBrowserWorker({ profileDir, launcher: fakeLauncher(new FakeContext()) });
      return createLocalWorkerHandle(worker);
    },
  });
  await manager.start({
    sessionId: "ses_normal",
    projectKey: "credential-fill-test",
    opencodeDataDir: join(root, "unused-data"),
    envRoot: join(root, "profiles"),
  });
  authGuard.signInPath.begin();
  authGuard.signInPath.beginFilling();
  await assert.rejects(
    manager.fillCredential(authGuard.signInPath, {
      sessionId: "ses_normal",
      target: { tabId: "not-used", ref: "e1", generation: 1 },
      value: Buffer.from("marker-secret"),
    }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "CREDENTIAL_FILL_BLOCKED",
  );
});

test("local manager preserves the password-only restriction before filling a text input", async (t) => {
  const root = await temporaryRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { manager, authGuard, target, context } = await createFixture(root);
  t.after(() => manager.cancel("ses_private_auth"));
  context.createdPages[0]!.fieldType = "text";
  authGuard.signInPath.begin();
  authGuard.signInPath.beginFilling();
  await assert.rejects(manager.fillCredential(authGuard.signInPath, {
    sessionId: "ses_private_auth", target, value: Buffer.from("synthetic-password"), requirePasswordField: true,
  }), (error: unknown) => error instanceof BrowserBackendError && error.code === "CREDENTIAL_TARGET_INVALID");
  assert.equal(context.createdPages[0]!.calls.includes("credential-fill"), false);
});

test("local manager accepts a password field with the password-only restriction", async (t) => {
  const root = await temporaryRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { manager, authGuard, target, context } = await createFixture(root);
  t.after(() => manager.cancel("ses_private_auth"));
  context.createdPages[0]!.fieldType = "password";
  authGuard.signInPath.begin();
  authGuard.signInPath.beginFilling();
  assert.deepEqual(await manager.fillCredential(authGuard.signInPath, {
    sessionId: "ses_private_auth", target, value: Buffer.from("synthetic-password"), requirePasswordField: true,
  }), { status: "filled" });
  assert.equal(context.createdPages[0]!.calls.includes("credential-fill"), true);
});
