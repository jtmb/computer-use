import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { BrowserBackendError } from "../src/errors.ts";
import { browserLaunchOptions, createBrowserWorker, type ElementHandleLike } from "../src/ops.ts";
import { TabRegistry } from "../src/tabs.ts";
import { FakeContext, FakePage, fakeLauncher, PNG } from "./fakes.ts";

async function workerFixture(options: { authFlow?: boolean; snapshotMaxBytes?: number } = {}) {
  const context = new FakeContext();
  const worker = await createBrowserWorker({
    profileDir: "/private/profile",
    launcher: fakeLauncher(context),
    ...options,
  });
  const tab = await worker.execute({ method: "tabs.new" }) as { id: string; url: string; title: string; ownership: string };
  return { context, worker, tab };
}

test("browser launch options are explicit and block service workers only for auth flows", () => {
  assert.deepEqual(browserLaunchOptions(false), {
    headless: false,
    viewport: null,
    chromiumSandbox: true,
    acceptDownloads: true,
  });
  assert.equal(browserLaunchOptions(true).serviceWorkers, "block");
});

test("navigation history updates URL and title without changing the opaque tab id", async () => {
  const { worker, tab } = await workerFixture();
  for (const [op, expected] of [
    [{ method: "navigate", tabId: tab.id, url: "https://example.test/one" }, "https://example.test/one"],
    [{ method: "navigate", tabId: tab.id, url: "https://example.test/two" }, "https://example.test/two"],
    [{ method: "back", tabId: tab.id }, "https://example.test/one"],
    [{ method: "forward", tabId: tab.id }, "https://example.test/two"],
    [{ method: "reload", tabId: tab.id }, "https://example.test/two"],
  ] as const) {
    const result = await worker.execute(op) as { id: string; url: string; title: string };
    assert.equal(result.id, tab.id);
    assert.equal(result.url, expected);
    assert.equal(result.title, `Title ${expected}`);
  }
  await assert.rejects(worker.execute({ method: "navigate", tabId: tab.id, url: "javascript:alert(1)" }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "INVALID_INPUT");
});

test("snapshot refs are scoped to their latest generation and tab", async () => {
  const { worker, tab } = await workerFixture();
  const first = await worker.execute({ method: "snapshot", tabId: tab.id }) as { generation: number; snapshot: string };
  assert.match(first.snapshot, /ref=e1/u);
  const second = await worker.execute({ method: "snapshot", tabId: tab.id }) as { generation: number };
  assert.ok(second.generation > first.generation);
  await assert.rejects(worker.execute({
    method: "click",
    target: { tabId: tab.id, ref: "e1", generation: first.generation },
  }), (error: unknown) => error instanceof BrowserBackendError && error.code === "STALE_REF");
  await assert.rejects(worker.execute({
    method: "fill",
    target: { tabId: "foreign", ref: "e1", generation: second.generation },
    value: "not applied",
  }), (error: unknown) => error instanceof BrowserBackendError && error.code === "FOREIGN_TAB");
});

test("mutations require the current snapshot and locator is constrained to the opaque ref", async () => {
  const { worker, context, tab } = await workerFixture();
  const snapshot = await worker.execute({ method: "snapshot", tabId: tab.id }) as { generation: number };
  await worker.execute({ method: "click", target: { tabId: tab.id, ref: "e1", generation: snapshot.generation }, button: "right", clickCount: 2 });
  assert.deepEqual(context.createdPages[0]!.calls.slice(-2), ["locator:aria-ref=e1", "click"]);
  await assert.rejects(worker.execute({
    method: "hover",
    target: { tabId: tab.id, ref: "e1", generation: snapshot.generation },
  }), (error: unknown) => error instanceof BrowserBackendError && error.code === "STALE_REF");
});

test("fill accepts an empty value for clearing a field", async () => {
  const { worker, context, tab } = await workerFixture();
  const snapshot = await worker.execute({ method: "snapshot", tabId: tab.id }) as { generation: number };
  await worker.execute({ method: "fill", target: { tabId: tab.id, ref: "e1", generation: snapshot.generation }, value: "" });
  assert.ok(context.createdPages[0]!.calls.includes("fill:"));
});

test("oversized snapshots and screenshots are rejected rather than silently truncated", async () => {
  const { worker, context, tab } = await workerFixture();
  const page = context.createdPages[0]!;
  page.snapshot = `x${"a".repeat(8_100)}`;
  await assert.rejects(worker.execute({ method: "snapshot", tabId: tab.id }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "SNAPSHOT_TOO_LARGE");
  page.screenshotBytes = new Uint8Array(6_291_457);
  await assert.rejects(worker.execute({ method: "screenshot", tabId: tab.id }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "SCREENSHOT_TOO_LARGE");
  page.screenshotBytes = PNG;
  assert.deepEqual(await worker.execute({ method: "screenshot", tabId: tab.id }), PNG);
});

test("tabs are opaque, capped, explicitly closed, and user-owned tabs are protected", async () => {
  const initial = new FakePage();
  const context = new FakeContext([initial]);
  const registryWorker = await createBrowserWorker({ profileDir: "/private/profile", launcher: fakeLauncher(context) });
  const listed = await registryWorker.execute({ method: "tabs.list" }) as readonly { id: string; ownership: string }[];
  assert.equal(listed[0]!.ownership, "user-owned");
  await assert.rejects(registryWorker.execute({ method: "tabs.close", tabId: listed[0]!.id }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "TAB_PROTECTED");
  const tabs: { id: string }[] = [];
  for (let index = 0; index < 8; index += 1) {
    tabs.push(await registryWorker.execute({ method: "tabs.new" }) as { id: string });
  }
  await assert.rejects(registryWorker.execute({ method: "tabs.new" }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "TAB_LIMIT");
  await registryWorker.execute({ method: "tabs.close", tabId: tabs[0]!.id });
  assert.equal((await registryWorker.execute({ method: "tabs.list" }) as unknown[]).length, 8);
});

test("a fresh registry rejects another worker's tab id", () => {
  const first = new TabRegistry<FakePage>();
  const second = new TabRegistry<FakePage>();
  const tab = first.register(new FakePage(), "ephemeral");
  assert.throws(() => second.get(tab.id), (error: unknown) => error instanceof BrowserBackendError && error.code === "FOREIGN_TAB");
});

test("upload checks file existence then uses setInputFiles with the latest reference", async (t) => {
  const { worker, context, tab } = await workerFixture();
  const page = context.createdPages[0]!;
  const snapshot = await worker.execute({ method: "snapshot", tabId: tab.id }) as { generation: number };
  const root = await mkdtemp("/tmp/opencode/browser-upload-test-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "fixture.txt");
  await writeFile(path, "fixture");
  await worker.execute({
    method: "upload",
    target: { tabId: tab.id, ref: "e1", generation: snapshot.generation },
    path,
  });
  assert.ok(page.calls.includes(`upload:${path}`));
  const nextSnapshot = await worker.execute({ method: "snapshot", tabId: tab.id }) as { generation: number };
  await assert.rejects(worker.execute({
    method: "upload",
    target: { tabId: tab.id, ref: "e1", generation: nextSnapshot.generation },
    path: "/not/a/real/upload-file",
  }), (error: unknown) => error instanceof BrowserBackendError && error.code === "UPLOAD_INVALID");
  assert.equal(page.calls.filter((call) => call.startsWith("upload:")).length, 1);
});

async function credentialFixture() {
  const { worker, context, tab } = await workerFixture({ authFlow: true });
  await worker.execute({ method: "navigate", tabId: tab.id, url: "https://login.example.test/auth" });
  const snapshot = await worker.execute({ method: "snapshot", tabId: tab.id }) as { generation: number };
  return {
    worker,
    page: context.createdPages[0]!,
    target: { tabId: tab.id, ref: "e1", generation: snapshot.generation },
  };
}

test("privileged credential fill uses a pinned field and returns status only", async () => {
  const { worker, page, target } = await credentialFixture();
  const result = await worker.fillCredential(target, "marker-secret");
  assert.deepEqual(result, { status: "filled" });
  assert.equal(JSON.stringify(result).includes("marker-secret"), false);
  assert.ok(page.calls.includes("credential-fill"));
  assert.equal(page.calls.some((call) => call.includes("marker-secret")), false);
});

test("a filled credential never appears in a later snapshot", async () => {
  const { worker, page, target } = await credentialFixture();
  // The page (or the accessibility tree) echoes the field value in clear text.
  page.snapshot = '- textbox "Password" [active] [ref=e1]: marker-secret';
  await worker.fillCredential(target, "marker-secret");
  const after = await worker.execute({ method: "snapshot", tabId: target.tabId }) as { snapshot: string };
  assert.equal(after.snapshot.includes("marker-secret"), false);
  assert.match(after.snapshot, /\[redacted\]/u);
});

test("a short filled credential is redacted as a whole token only", async () => {
  const { worker, page, target } = await credentialFixture();
  page.snapshot = '- textbox "PIN" [ref=e1]: 1234\n- paragraph: order 12345 shipped';
  await worker.fillCredential(target, "1234");
  const after = await worker.execute({ method: "snapshot", tabId: target.tabId }) as { snapshot: string };
  assert.equal(after.snapshot.includes(": 1234"), false);
  // A longer token that merely starts with the same digits must survive.
  assert.match(after.snapshot, /order 12345 shipped/u);
});

test("a password field's value is redacted even when nothing was filled through the guard", async () => {
  const { worker, context, tab } = await workerFixture({ authFlow: true });
  const page = context.createdPages[0]!;
  // The page itself put a value in the field and reflects it in the snapshot.
  page.snapshot = '- textbox "Password" [active] [ref=e1]: typed-by-someone-else';
  page.passwordValues = ["typed-by-someone-else"];
  const snapshot = await worker.execute({ method: "snapshot", tabId: tab.id }) as { snapshot: string };
  assert.equal(snapshot.snapshot.includes("typed-by-someone-else"), false);
  assert.match(snapshot.snapshot, /\[redacted\]/u);
});

test("a non-password field keeps its rendered value", async () => {
  const { worker, context, tab } = await workerFixture({ authFlow: true });
  const page = context.createdPages[0]!;
  page.snapshot = '- textbox "Search" [ref=e1]: visible query';
  page.snapshotFieldIsPassword = false;
  const snapshot = await worker.execute({ method: "snapshot", tabId: tab.id }) as { snapshot: string };
  assert.match(snapshot.snapshot, /visible query/u);
});

test("privileged credential fill refuses a stale snapshot target", async () => {
  const { worker, page, target } = await credentialFixture();
  await worker.execute({ method: "navigate", tabId: target.tabId, url: "https://login.example.test/changed" });
  await assert.rejects(
    worker.fillCredential(target, "marker-secret"),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "STALE_REF",
  );
  assert.equal(page.calls.includes("credential-fill"), false);
});

test("privileged credential fill refuses detached elements", async () => {
  const { worker, page, target } = await credentialFixture();
  page.detached = true;
  await assert.rejects(
    worker.fillCredential(target, "marker-secret"),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "CREDENTIAL_TARGET_INVALID",
  );
  assert.equal(page.calls.includes("credential-fill"), false);
});

test("a handle that mutates and then throws is classified uncertain and its value stays redacted", async () => {
  const context = new FakeContext();
  const worker = await createBrowserWorker({
    profileDir: "/private/profile",
    launcher: fakeLauncher(context),
    authFlow: true,
  });
  const tab = await worker.execute({ method: "tabs.new" }) as { id: string };
  const page = context.createdPages[0]!;
  const secret = "synthetic-mutate-then-throw-marker";
  const handle: ElementHandleLike = {
    async fill(value) {
      page.snapshot = `- textbox "Password" [ref=e1]: ${value}`;
      throw new Error(`Synthetic acknowledgement failure containing ${value}`);
    },
    async ownerFrame() { return page.mainFrame(); },
    async evaluate<Result>() {
      return {
        connected: true,
        sameDocument: true,
        supportedField: true,
        fieldType: "password",
        documentOrigin: "https://login.example.test",
        actionOrigin: "https://login.example.test",
      } as Result;
    },
    async dispose() {},
  };
  const originalLocator = page.locator.bind(page);
  page.locator = ((selector: string) => {
    const locator = originalLocator(selector);
    if (selector !== "aria-ref=e1") return locator;
    return { ...locator, async elementHandle() { return handle; } } as typeof locator;
  }) as typeof page.locator;
  await worker.execute({ method: "navigate", tabId: tab.id, url: "https://login.example.test/auth" });
  const snapshot = await worker.execute({ method: "snapshot", tabId: tab.id }) as { generation: number };

  await assert.rejects(
    worker.fillCredential({ tabId: tab.id, ref: "e1", generation: snapshot.generation }, secret),
    (error: unknown) => error instanceof BrowserBackendError &&
      (error as { code: string }).code === "CREDENTIAL_FILL_UNCERTAIN" &&
      !error.message.includes(secret),
  );
  const after = await worker.execute({ method: "snapshot", tabId: tab.id }) as { snapshot: string };
  assert.equal(after.snapshot.includes(secret), false);
  assert.match(after.snapshot, /\[redacted\]/u);
})

test("privileged credential fill refuses an element owned by a cross-origin iframe", async () => {
  const { worker, page, target } = await credentialFixture();
  // The pinned element now reports a frame that is neither the main frame nor same-origin:
  // the iframe/form race that must fail before anything is typed.
  page.useForeignFrame = true;
  await assert.rejects(
    worker.fillCredential(target, "marker-secret"),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "CREDENTIAL_TARGET_INVALID",
  );
  assert.equal(page.calls.includes("credential-fill"), false, "nothing may be typed into a foreign frame");
});

test("privileged credential fill refuses cross-origin form actions", async () => {
  const { worker, page, target } = await credentialFixture();
  page.actionUrl = "https://other.example.test/collect";
  await assert.rejects(
    worker.fillCredential(target, "marker-secret"),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "CREDENTIAL_TARGET_INVALID",
  );
  assert.equal(page.calls.includes("credential-fill"), false);
});

test("a private sign-in refuses a field that is not a password input", async () => {
  const { worker, page, target } = await credentialFixture();
  page.fieldType = "text";
  await assert.rejects(
    worker.fillCredential(target, "marker-secret", undefined, { requirePasswordField: true }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "CREDENTIAL_TARGET_INVALID",
  );
  assert.equal(page.calls.includes("credential-fill"), false);
});

test("the password requirement does not block an ordinary credential fill", async () => {
  const { worker, page, target } = await credentialFixture();
  page.fieldType = "email";
  const result = await worker.fillCredential(target, "marker-secret");
  assert.deepEqual(result, { status: "filled" });
  assert.ok(page.calls.includes("credential-fill"));
});

test("a password field beyond the fortieth is still redacted", async () => {
  const { worker, context, tab } = await workerFixture({ authFlow: true });
  const page = context.createdPages[0]!;
  const lines = [];
  for (let index = 1; index <= 45; index += 1) {
    lines.push(`- textbox "Field ${index}" [ref=e${index}]: value-${index}`);
  }
  page.snapshot = lines.join("\n");
  page.passwordValues = lines.map((_line, index) => `value-${String(index + 1)}`);
  const snapshot = await worker.execute({ method: "snapshot", tabId: tab.id }) as { snapshot: string };
  assert.equal(snapshot.snapshot.includes("value-45"), false, "the 45th field must be redacted");
  assert.equal((snapshot.snapshot.match(/\[redacted\]/gu) ?? []).length, 45);
});

test("every filled credential stays protected beyond the ninth fill", async () => {
  const { worker, page, target } = await credentialFixture();
  const values = Array.from({ length: 12 }, (_, index) => `synthetic-value-${String(index)}`);
  let current = target;
  for (const [index, value] of values.entries()) {
    if (index > 0) {
      const snapshot = await worker.execute({ method: "snapshot", tabId: target.tabId }) as { generation: number };
      current = { tabId: target.tabId, ref: "e1", generation: snapshot.generation };
    }
    await worker.fillCredential(current, value);
  }
  // After twelve distinct fills the earliest value must still be scrubbed.
  page.snapshot = `- textbox "Echo" [ref=e1]: ${values[0]}`;
  page.snapshotFieldIsPassword = false;
  const after = await worker.execute({ method: "snapshot", tabId: target.tabId }) as { snapshot: string };
  assert.equal(after.snapshot.includes(values[0]!), false, "the earliest value must still be scrubbed");
});
