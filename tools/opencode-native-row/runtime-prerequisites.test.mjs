import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import {
  BUN_INTEGRITY,
  BUN_VERSION,
  discoverNativePrerequisites,
  NativePrerequisiteError,
  verifyBun,
  verifyNode,
  verifySourceCheckout,
} from "./runtime-prerequisites.mjs";

async function fixtureDirectory(t) {
  const root = await mkdtemp("/tmp/opencode/native-prerequisite-test-");
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function script(text) {
  return `#!/bin/sh\n${text}\n`;
}

test("a regular Bun binary reporting the exact pinned version is accepted, with and without its tarball", async (t) => {
  const root = await fixtureDirectory(t);
  const bun = join(root, "bun");
  await writeFile(bun, script('echo "1.4.2"'), { mode: 0o755 });
  await chmod(bun, 0o755);
  const tarball = join(root, "bun.tgz");
  await writeFile(tarball, Buffer.from("authentic fixture archive"));
  const integrity = `sha512-${createHash("sha512").update("authentic fixture archive").digest("base64")}`;

  const direct = await verifyBun({ bun, expectedIntegrity: integrity });
  assert.deepEqual(direct, { path: bun, version: BUN_VERSION, tarball: "not_requested" });

  const binarySha256 = createHash("sha256").update(script('echo "1.4.2"')).digest("hex");
  const archived = await verifyBun({ bun, tarball, expectedIntegrity: integrity, expectedBinarySha256: binarySha256 });
  assert.equal(archived.tarball, "verified");
  assert.equal(archived.binarySha256, binarySha256);
});

test("a different Bun version and an altered tarball are refused", async (t) => {
  const root = await fixtureDirectory(t);
  const bun = join(root, "bun");
  await writeFile(bun, script('echo "1.3.13"'), { mode: 0o755 });
  await chmod(bun, 0o755);
  await assert.rejects(verifyBun({ bun }), (error) =>
    error instanceof NativePrerequisiteError && error.code === "BUN_VERSION_MISMATCH");

  const good = join(root, "bun-1.4.2");
  await writeFile(good, script('echo "1.4.2"'), { mode: 0o755 });
  const tarball = join(root, "tampered.tgz");
  await writeFile(tarball, Buffer.from("tampered archive"));
  const authentic = `sha512-${createHash("sha512").update("authentic").digest("base64")}`;
  await assert.rejects(verifyBun({ bun: good, tarball, expectedIntegrity: authentic }), (error) =>
    error instanceof NativePrerequisiteError && error.code === "BUN_TARBALL_INTEGRITY_MISMATCH");
});

test("a symlinked Bun binary is refused rather than followed", async (t) => {
  const root = await fixtureDirectory(t);
  const real = join(root, "real-bun");
  await writeFile(real, script('echo "1.4.2"'), { mode: 0o755 });
  const link = join(root, "bun");
  await symlink(real, link);
  await assert.rejects(verifyBun({ bun: link }), (error) =>
    error instanceof NativePrerequisiteError && error.code === "BUN_UNAVAILABLE");
});

test("an unrelated executable cannot borrow an authentic archive and execute its version claim", async (t) => {
  const root = await fixtureDirectory(t);
  const marker = join(root, "executed");
  const bun = join(root, "counterfeit-bun");
  await writeFile(bun, script(`touch "${marker}"; echo "1.4.2"`), { mode: 0o755 });
  const tarball = join(root, "fixture.tgz");
  await writeFile(tarball, "synthetic archive");
  const integrity = `sha512-${createHash("sha512").update("synthetic archive").digest("base64")}`;
  await assert.rejects(verifyBun({ bun, tarball, expectedIntegrity: integrity }), error =>
    error instanceof NativePrerequisiteError && error.code === "BUN_BINARY_INTEGRITY_MISMATCH");
  await assert.rejects(access(marker), { code: "ENOENT" });
});

test("a bad archive is refused before executing the selected runtime", async (t) => {
  const root = await fixtureDirectory(t);
  const bun = join(root, "bun");
  const tarball = join(root, "fixture.tgz");
  await writeFile(bun, script('echo "1.4.2"'), { mode: 0o755 });
  await writeFile(tarball, "altered archive");
  let executions = 0;
  await assert.rejects(verifyBun({ bun, tarball, run: () => { executions++; return "1.4.2"; } }), error =>
    error instanceof NativePrerequisiteError && error.code === "BUN_TARBALL_INTEGRITY_MISMATCH");
  assert.equal(executions, 0);
});

test("the isolated Node 26 runtime identity is checked exactly", async (t) => {
  const root = await fixtureDirectory(t);
  const node = join(root, "node");
  await writeFile(node, script('echo "v26.4.0"'), { mode: 0o755 });
  assert.deepEqual(await verifyNode({ node }), { path: node, version: "v26.4.0" });

  const old = join(root, "node-old");
  await writeFile(old, script('echo "v22.22.2"'), { mode: 0o755 });
  await assert.rejects(verifyNode({ node: old }), (error) =>
    error instanceof NativePrerequisiteError && error.code === "NODE_VERSION_MISMATCH");
});

function fakeGit(overrides = {}) {
  const responses = {
    "rev-parse HEAD": "ba546ec1598a70db2570e9c6258028d955ba8f58",
    "config --get remote.origin.url": "https://github.com/anomalyco/opencode.git",
    "status --porcelain": "",
    ...overrides,
  };
  return (_command, args) => {
    const key = args.slice(args.indexOf("-C") + 2).join(" ");
    const value = responses[key];
    if (value === undefined) throw Object.assign(new Error("unexpected git call"), { code: "ENOENT" });
    return value;
  };
}

test("the pinned checkout is verified by HEAD and origin, and dirtiness is reported honestly", async () => {
  const clean = await verifySourceCheckout({ checkout: "/home/tester/opencode", gitImpl: fakeGit() });
  assert.deepEqual(clean, {
    path: "/home/tester/opencode",
    head: "ba546ec1598a70db2570e9c6258028d955ba8f58",
    origin: "https://github.com/anomalyco/opencode.git",
    clean: true,
    changedEntries: 0,
  });

  const dirty = await verifySourceCheckout({
    checkout: "/home/tester/opencode",
    gitImpl: fakeGit({ "status --porcelain": " M packages/tui/src/x.tsx\n?? packages/tui/src/y.ts" }),
  });
  assert.equal(dirty.clean, false);
  assert.equal(dirty.changedEntries, 2);

  await assert.rejects(verifySourceCheckout({
    checkout: "/home/tester/opencode",
    gitImpl: fakeGit({ "rev-parse HEAD": "0000000000000000000000000000000000000000" }),
  }), (error) => error instanceof NativePrerequisiteError && error.code === "SOURCE_PIN_MISMATCH");

  await assert.rejects(verifySourceCheckout({
    checkout: "/home/tester/opencode",
    gitImpl: fakeGit({ "config --get remote.origin.url": "https://github.com/example/opencode.git" }),
  }), (error) => error instanceof NativePrerequisiteError && error.code === "SOURCE_ORIGIN_MISMATCH");
});

test("discovery emits the exact environment values a native run needs", async (t) => {
  const root = await fixtureDirectory(t);
  const bun = join(root, "bun");
  await writeFile(bun, script('echo "1.4.2"'), { mode: 0o755 });
  const report = await discoverNativePrerequisites({
    bun,
    checkout: "/home/tester/opencode",
    gitImpl: fakeGit(),
  });
  assert.deepEqual(report.bun, { path: bun, version: BUN_VERSION, tarball: "not_requested" });
  assert.ok(report.next.includes(`NATIVE_ROW_BUN=${bun}`));
  assert.ok(report.next.includes("NATIVE_ROW_SOURCE_CHECKOUT=/home/tester/opencode"));
  assert.equal(BUN_INTEGRITY.startsWith("sha512-"), true);
});

test("a missing runtime flag value is not silently omitted from a mixed discovery request", () => {
  const result = spawnSync(process.execPath, [new URL("./runtime-prerequisites.mjs", import.meta.url).pathname, "--node", process.execPath, "--bun"], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--bun requires an absolute path/);
});
