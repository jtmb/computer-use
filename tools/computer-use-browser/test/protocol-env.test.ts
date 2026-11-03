import assert from "node:assert/strict";
import { test } from "node:test";
import * as publicApi from "../src/index.ts";
import { BrowserBackendError } from "../src/errors.ts";
import { buildChildEnvironment } from "../src/worker-child.ts";
import {
  decodeProtocolMessage,
  encodeProtocolMessage,
  FrameDecoder,
  parseRequest,
} from "../src/protocol.ts";

test("protocol uses bounded runtime frames and rejects unknown methods and fields", () => {
  const encoded = encodeProtocolMessage({ type: "request", id: "req-1", operation: { method: "tabs.list" } });
  const decoded = decodeProtocolMessage(encoded);
  const request = parseRequest(decoded);
  assert.equal(request.operation.method, "tabs.list");

  const emptyFill = encodeProtocolMessage({
    type: "request",
    id: "req-empty-fill",
    operation: { method: "fill", target: { tabId: "tab-id", ref: "e1", generation: 1 }, value: "" },
  });
  assert.equal((parseRequest(decodeProtocolMessage(emptyFill)).operation as { value: string }).value, "");

  const decoder = new FrameDecoder();
  assert.equal(decoder.push(encoded.subarray(0, 3)).length, 0);
  assert.equal(decoder.push(encoded.subarray(3)).length, 1);

  const unknown = encodeProtocolMessage({ type: "request", id: "req-2", operation: { method: "unsupportedMethod" } });
  assert.throws(() => parseRequest(decodeProtocolMessage(unknown)),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "PROTOCOL_INVALID");
  const privateCredential = encodeProtocolMessage({
    type: "credential-fill",
    id: "cred-1",
    target: { tabId: "tab-id", ref: "e1", generation: 1 },
    value: "marker-secret",
  });
  assert.throws(() => parseRequest(decodeProtocolMessage(privateCredential)),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "PROTOCOL_INVALID");
  assert.throws(() => encodeProtocolMessage({ type: "response", id: "x", result: "x".repeat(70_000) }),
    (error: unknown) => error instanceof BrowserBackendError && error.code === "PROTOCOL_INVALID");
});

test("child environment is an explicit allowlist with debug and Node injection variables absent", () => {
  const environment = buildChildEnvironment({
    HOME: "/home/tester",
    PATH: "/usr/bin:/bin",
    LANG: "C.UTF-8",
    PLAYWRIGHT_BROWSERS_PATH: "/browser-cache",
    TMPDIR: "/tmp/opencode",
    TZ: "UTC",
    DEBUG: "pw:*",
    PWDEBUG: "1",
    PW_TEST_DEBUG: "1",
    NODE_OPTIONS: "--require=/tmp/hook.js",
    NODE_DEBUG: "module",
    PRIVATE_TOKEN: "must-not-pass",
    OPENCODE_BROWSER_CHANNEL: "chrome",
  });
  assert.deepEqual(Object.keys(environment).sort(), [
    "HOME", "LANG", "PATH", "PLAYWRIGHT_BROWSERS_PATH", "TMPDIR", "TZ",
  ]);
  for (const name of ["DEBUG", "PWDEBUG", "PW_TEST_DEBUG", "NODE_OPTIONS", "NODE_DEBUG", "PRIVATE_TOKEN", "OPENCODE_BROWSER_CHANNEL"]) {
    assert.equal(Object.hasOwn(environment, name), false);
  }
});

test("public module exports contain no unsafe script or debugging surface", () => {
  const exports = Object.keys(publicApi);
  for (const unsafe of ["evaluate", "runCode", "addScriptTag", "cdp", "CDP"]) {
    assert.equal(exports.includes(unsafe), false);
  }
});
