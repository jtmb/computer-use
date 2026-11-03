import { RuntimeError } from "./errors.ts";

export type AuthGuardState =
  | "idle"
  | "awaiting-user"
  | "filling"
  | "submitted-uncertain"
  | "blocked";

export type GuardedOperation =
  | "observation"
  | "capture"
  | "screenshot"
  | "console"
  | "network"
  | "control"
  | "status";

export interface AuthGuardView {
  getState(): AuthGuardState;
  isOperationAllowed(operation: GuardedOperation): boolean;
  assertOperationAllowed(operation: GuardedOperation): void;
  isObservationBlocked(): boolean;
  isCaptureBlocked(): boolean;
  isScreenshotBlocked(): boolean;
  isConsoleNetworkBlocked(): boolean;
  isControlBlocked(): boolean;
  handleUntrustedModelCommand(command: unknown): false;
}

export interface AuthGuardSignInPath {
  begin(): boolean;
  beginFilling(): boolean;
  markSubmittedUncertain(): boolean;
  block(): boolean;
  completeVerified(): boolean;
}

export interface AuthGuardUserActions {
  cancel(): boolean;
}

export interface AuthGuardOperatorActions {
  recover(): boolean;
}

export interface AuthGuardRuntime {
  readonly guard: AuthGuardView;
  readonly signInPath: AuthGuardSignInPath;
  readonly userActions: AuthGuardUserActions;
  readonly operatorActions: AuthGuardOperatorActions;
}

const SENSITIVE_OPERATIONS = new Set<GuardedOperation>([
  "observation",
  "capture",
  "screenshot",
  "console",
  "network",
  "control",
]);

export function createAuthGuard(): AuthGuardRuntime {
  let state: AuthGuardState = "idle";
  const verifiedCompletionRecords = new WeakSet<object>();

  function issueVerifiedCompletionRecord(): object {
    const record = Object.freeze(Object.create(null) as object);
    verifiedCompletionRecords.add(record);
    return record;
  }

  function completeVerified(record: object): boolean {
    if (state === "idle" || !verifiedCompletionRecords.has(record)) {
      return false;
    }
    verifiedCompletionRecords.delete(record);
    state = "idle";
    return true;
  }

  function isOperationAllowed(operation: GuardedOperation): boolean {
    if (!SENSITIVE_OPERATIONS.has(operation)) {
      return true;
    }
    return state === "idle";
  }

  const guard: AuthGuardView = Object.freeze({
    getState: () => state,
    isOperationAllowed,
    assertOperationAllowed(operation: GuardedOperation): void {
      if (!isOperationAllowed(operation)) {
        throw new RuntimeError("AUTH_GUARD_BLOCKED");
      }
    },
    isObservationBlocked: () => state !== "idle",
    isCaptureBlocked: () => state !== "idle",
    isScreenshotBlocked: () => state !== "idle",
    isConsoleNetworkBlocked: () => state !== "idle",
    isControlBlocked: () => state !== "idle",
    handleUntrustedModelCommand: (_command: unknown) => false,
  });

  const signInPath: AuthGuardSignInPath = Object.freeze({
    begin(): boolean {
      if (state !== "idle") {
        return false;
      }
      state = "awaiting-user";
      return true;
    },
    beginFilling(): boolean {
      if (state !== "awaiting-user") {
        return false;
      }
      state = "filling";
      return true;
    },
    markSubmittedUncertain(): boolean {
      if (state !== "filling") {
        return false;
      }
      state = "submitted-uncertain";
      return true;
    },
    block(): boolean {
      if (state === "idle") {
        return false;
      }
      state = "blocked";
      return true;
    },
    completeVerified(): boolean {
      if (state === "idle") {
        return false;
      }
      const record = issueVerifiedCompletionRecord();
      return completeVerified(record);
    },
  });

  const userActions: AuthGuardUserActions = Object.freeze({
    cancel(): boolean {
      if (state === "idle") {
        return false;
      }
      state = "idle";
      return true;
    },
  });

  const operatorActions: AuthGuardOperatorActions = Object.freeze({
    recover(): boolean {
      if (state === "idle") {
        return false;
      }
      state = "idle";
      return true;
    },
  });

  return Object.freeze({ guard, signInPath, userActions, operatorActions });
}
