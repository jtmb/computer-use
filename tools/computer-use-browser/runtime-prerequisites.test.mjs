import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

import {
  evaluateBrowserLane,
  inspectDirectory,
  inspectEntry,
  inspectScratchParent,
  readUnprivilegedNamespacePolicy,
} from "./runtime-prerequisites.mjs";

const present = (overrides = {}) => ({ status: "present", uid: 1000, mode: 0o755, ...overrides });
const rootSetuid = (overrides = {}) => ({ status: "present", uid: 0, mode: 0o4755, ...overrides });

function laneInput(overrides = {}) {
  return {
    bundledExecutable: present(),
    bundledSandbox: present(),
    installedExecutable: present(),
    installedSandbox: rootSetuid(),
    browsersRoot: present({ mode: 0o755, uid: 1000 }),
    unprivilegedNamespacesAllowed: false,
    uid: 1000,
    ...overrides,
  };
}

test("a restricted host with the installed setuid helper is worker-ready through Chrome", () => {
  const lane = evaluateBrowserLane(laneInput());
  assert.equal(lane.channel, "chrome");
  assert.equal(lane.workerReady, true);
  assert.equal(lane.blocker, null);
  assert.deepEqual(lane.benchmark, { executablePrerequisiteReady: true, blockers: [] });
});

test("allowed user namespaces make the bundled build ready for both lanes", () => {
  const lane = evaluateBrowserLane(laneInput({ unprivilegedNamespacesAllowed: true }));
  assert.equal(lane.channel, "bundled");
  assert.equal(lane.workerReady, true);
  assert.deepEqual(lane.benchmark, { executablePrerequisiteReady: true, blockers: [] });
});

test("a missing bundled executable blocks the worker instead of reporting readiness", () => {
  const lane = evaluateBrowserLane(laneInput({
    unprivilegedNamespacesAllowed: true,
    bundledExecutable: { status: "missing" },
    bundledSandbox: { status: "missing" },
  }));
  assert.equal(lane.workerReady, false);
  assert.equal(lane.blocker, "BROWSER_EXECUTABLE_MISSING");
  assert.equal(lane.benchmark.executablePrerequisiteReady, false);
});

test("a restricted host with no usable helper fails closed on the bundled build", () => {
  const lane = evaluateBrowserLane(laneInput({
    installedExecutable: { status: "missing" },
    installedSandbox: { status: "missing" },
  }));
  assert.equal(lane.channel, "bundled");
  assert.equal(lane.workerReady, false);
  assert.equal(lane.blocker, "BUNDLED_SANDBOX_UNAVAILABLE");
});

test("a non-setuid installed helper does not select Chrome, and a missing Chrome executable blocks the fallback", () => {
  const withoutHelper = evaluateBrowserLane(laneInput({ installedSandbox: present() }));
  assert.equal(withoutHelper.channel, "bundled");
  assert.equal(withoutHelper.workerReady, false);
  assert.equal(withoutHelper.blocker, "BUNDLED_SANDBOX_UNAVAILABLE");
  const withoutExecutable = evaluateBrowserLane(laneInput({ installedExecutable: { status: "missing" } }));
  assert.equal(withoutExecutable.channel, "chrome");
  assert.equal(withoutExecutable.workerReady, false);
  assert.equal(withoutExecutable.blocker, "INSTALLED_BROWSER_MISSING");
});

test("group-writable benchmark paths are reported as unsafe without changing worker readiness", () => {
  const lane = evaluateBrowserLane(laneInput({
    unprivilegedNamespacesAllowed: true,
    bundledExecutable: present({ mode: 0o775 }),
    browsersRoot: present({ mode: 0o775 }),
  }));
  assert.equal(lane.workerReady, true);
  assert.deepEqual(lane.benchmark.blockers, ["BROWSER_OWNERSHIP_UNSAFE", "BROWSER_PATH_UNSAFE"]);
});

test("inspectEntry distinguishes a real file, a symlink and a missing path", async () => {
  const statOf = (overrides) => ({ isFile: () => true, isSymbolicLink: () => false, uid: 1000, mode: 0o755, ...overrides });
  const real = await inspectEntry("/opt/browser", {
    lstatImpl: async () => statOf(),
    realpathImpl: async (path) => path,
  });
  assert.deepEqual(real, { path: "/opt/browser", status: "present", uid: 1000, mode: 0o755 });

  const linked = await inspectEntry("/opt/browser", {
    lstatImpl: async () => statOf({ isSymbolicLink: () => true }),
    realpathImpl: async () => "/tmp/elsewhere",
  });
  assert.equal(linked.status, "unsafe");

  const missing = await inspectEntry("/opt/missing", {
    lstatImpl: async () => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    },
    realpathImpl: async () => null,
  });
  assert.deepEqual(missing, { path: "/opt/missing", status: "missing" });
});

test("inspectDirectory requires a canonical real directory for the browser installation root", async () => {
  const directory = await inspectDirectory("/home/tester/.cache/ms-playwright", {
    lstatImpl: async () => ({ isDirectory: () => true, isSymbolicLink: () => false, uid: 1000, mode: 0o755 }),
    realpathImpl: async (path) => path,
  });
  assert.deepEqual(directory, { path: "/home/tester/.cache/ms-playwright", status: "present", uid: 1000, mode: 0o755 });

  const linked = await inspectDirectory("/home/tester/.cache/ms-playwright", {
    lstatImpl: async () => ({ isDirectory: () => true, isSymbolicLink: () => true, uid: 1000, mode: 0o755 }),
    realpathImpl: async () => "/tmp/elsewhere",
  });
  assert.equal(linked.status, "unsafe");
});

test("the AppArmor policy is interpreted, and an unreadable policy does not claim restriction", async () => {
  assert.deepEqual(await readUnprivilegedNamespacePolicy({ readFileImpl: async () => "0\n" }),
    { readable: true, unprivilegedNamespacesAllowed: true });
  assert.deepEqual(await readUnprivilegedNamespacePolicy({ readFileImpl: async () => "1\n" }),
    { readable: true, unprivilegedNamespacesAllowed: false });
  assert.deepEqual(await readUnprivilegedNamespacePolicy({ readFileImpl: async () => { throw new Error("denied"); } }),
    { readable: false, unprivilegedNamespacesAllowed: true });
});

test("scratch parent inspection surfaces the policy code without throwing", async () => {
  const blocked = await inspectScratchParent("/tmp/opencode", {
    validate: async () => {
      const error = new Error("scratch parent must not be group writable");
      error.code = "SCRATCH_PARENT_UNSAFE";
      throw error;
    },
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.code, "SCRATCH_PARENT_UNSAFE");

  const ready = await inspectScratchParent("/tmp/opencode/private", {
    validate: async (path) => ({ path, approvedRoot: "/tmp/opencode" }),
  });
  assert.deepEqual(ready, { status: "ready", path: "/tmp/opencode/private", approvedRoot: "/tmp/opencode" });

  assert.equal((await inspectScratchParent(undefined)).status, "not_requested");
});

test("a requested scratch check cannot become not-requested through a missing flag value", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", new URL("./runtime-prerequisites.mjs", import.meta.url).pathname, "--scratch-parent"], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--scratch-parent requires an absolute path/);
});
