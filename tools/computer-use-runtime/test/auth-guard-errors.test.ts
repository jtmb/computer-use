import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuthGuard,
  formatRuntimeError,
  RuntimeError,
} from "../src/index.ts";

test("non-idle private sign-in blocks observation, capture, side channels, and control", () => {
  const runtime = createAuthGuard();
  assert.equal(runtime.signInPath.begin(), true);
  assert.equal(runtime.guard.getState(), "awaiting-user");
  for (const operation of ["observation", "capture", "screenshot", "console", "network", "control"] as const) {
    assert.equal(runtime.guard.isOperationAllowed(operation), false);
    assert.throws(() => runtime.guard.assertOperationAllowed(operation), {
      code: "AUTH_GUARD_BLOCKED",
    });
  }
  assert.equal(runtime.guard.isOperationAllowed("status"), true);
});

test("model-supplied completion and clear commands cannot leave blocked or uncertain state", () => {
  const blocked = createAuthGuard();
  blocked.signInPath.begin();
  blocked.signInPath.block();
  assert.equal(blocked.guard.handleUntrustedModelCommand("complete"), false);
  assert.equal(blocked.guard.handleUntrustedModelCommand("clear"), false);
  assert.equal(blocked.guard.getState(), "blocked");
  assert.equal(blocked.guard.isControlBlocked(), true);

  const uncertain = createAuthGuard();
  uncertain.signInPath.begin();
  uncertain.signInPath.beginFilling();
  uncertain.signInPath.markSubmittedUncertain();
  assert.equal(uncertain.guard.handleUntrustedModelCommand({ action: "complete" }), false);
  assert.equal(uncertain.guard.handleUntrustedModelCommand({ action: "clear" }), false);
  assert.equal(uncertain.guard.getState(), "submitted-uncertain");
});

test("verified completion is a privileged, one-time transition", () => {
  const runtime = createAuthGuard();
  assert.equal(runtime.signInPath.begin(), true);
  assert.equal(runtime.signInPath.beginFilling(), true);
  assert.equal(runtime.signInPath.completeVerified(), true);
  assert.equal(runtime.guard.getState(), "idle");
  assert.equal(runtime.signInPath.completeVerified(), false);
  assert.equal(runtime.guard.isObservationBlocked(), false);
});

test("explicit user cancellation and operator recovery each clear active state once", () => {
  const userRuntime = createAuthGuard();
  userRuntime.signInPath.begin();
  assert.equal(userRuntime.userActions.cancel(), true);
  assert.equal(userRuntime.userActions.cancel(), false);
  assert.equal(userRuntime.guard.getState(), "idle");

  const operatorRuntime = createAuthGuard();
  operatorRuntime.signInPath.begin();
  operatorRuntime.signInPath.block();
  assert.equal(operatorRuntime.operatorActions.recover(), true);
  assert.equal(operatorRuntime.operatorActions.recover(), false);
  assert.equal(operatorRuntime.guard.getState(), "idle");
});

test("formatted runtime errors omit backend blobs and token-looking detail", () => {
  const backendBlob = "B".repeat(200);
  const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCDE";
  const formatted = formatRuntimeError(new RuntimeError("PROTOCOL_INVALID", `${backendBlob} ${token}`));
  assert.equal(formatted.includes(backendBlob), false);
  assert.equal(formatted.includes(token), false);
  assert.match(formatted, /^PROTOCOL_INVALID:/);
});
