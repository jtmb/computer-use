import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseChannel,
  INSTALLED_CHROME_SANDBOX,
  isSetuidRootHelper,
  sandboxHelperPath,
} from "../src/channel.ts";

test("allowed unprivileged user namespaces select the bundled build without any helper", () => {
  assert.equal(chooseChannel({
    unprivilegedNamespacesAllowed: true,
    bundledSandbox: null,
    installedSandbox: null,
  }), "bundled");
});

test("a root-owned setuid bundled helper keeps the bundled build on a restricted host", () => {
  assert.equal(chooseChannel({
    unprivilegedNamespacesAllowed: false,
    bundledSandbox: { uid: 0, mode: 0o4755 },
    installedSandbox: null,
  }), "bundled");
});

test("a restricted host falls back to installed Chrome only through a setuid root helper", () => {
  assert.equal(chooseChannel({
    unprivilegedNamespacesAllowed: false,
    bundledSandbox: { uid: 1000, mode: 0o755 },
    installedSandbox: { uid: 0, mode: 0o4755 },
  }), "chrome");
});

test("with no usable sandbox the bundled build is selected so launch fails closed", () => {
  assert.equal(chooseChannel({
    unprivilegedNamespacesAllowed: false,
    bundledSandbox: { uid: 1000, mode: 0o755 },
    installedSandbox: { uid: 1000, mode: 0o755 },
  }), "bundled");
});

test("a helper only counts as setuid root when both properties hold", () => {
  assert.equal(isSetuidRootHelper({ uid: 0, mode: 0o4755 }), true);
  assert.equal(isSetuidRootHelper({ uid: 1000, mode: 0o4755 }), false);
  assert.equal(isSetuidRootHelper({ uid: 0, mode: 0o755 }), false);
  assert.equal(isSetuidRootHelper(null), false);
});

test("the sandbox helper is resolved beside the selected browser executable", () => {
  assert.equal(
    sandboxHelperPath("/home/tester/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome"),
    "/home/tester/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome_sandbox",
  );
  assert.equal(INSTALLED_CHROME_SANDBOX, "/opt/google/chrome/chrome-sandbox");
});
