import { RuntimeError } from "./errors.ts";

export type OperationMode = "mutation" | "read";

export interface QueueOptions {
  readonly mode?: OperationMode;
  readonly allowInterleave?: boolean;
  readonly signal?: AbortSignal;
}

export interface OwnerOperationQueue {
  run<Result>(
    owner: string,
    operation: (signal?: AbortSignal) => Result | Promise<Result>,
    options?: QueueOptions,
  ): Promise<Result>;
}

interface QueueEntry {
  readonly state: OwnerQueueState;
  readonly owner: string;
  readonly mode: OperationMode;
  readonly allowInterleave: boolean;
  readonly signal?: AbortSignal;
  readonly operation: (signal?: AbortSignal) => unknown | Promise<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  onAbort?: () => void;
  status: "queued" | "running" | "settled";
  exclusive: boolean;
}

interface OwnerQueueState {
  readonly pending: QueueEntry[];
  readonly active: Set<QueueEntry>;
  exclusiveActive: boolean;
}

const MAX_OWNER_LENGTH = 256;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function isInterleavableRead(entry: QueueEntry): boolean {
  return entry.mode === "read" && entry.allowInterleave;
}

// Per-owner scheduling policy:
//   - a mutation runs exclusively and blocks everything queued behind it;
//   - a read may interleave with other reads, but never with a mutation;
//   - work is FIFO, so a queued mutation is not overtaken by later reads.
// Queue state is keyed by owner and deleted once idle, so unrelated owners never
// contend and idle owners do not accumulate.
export function createOwnerOperationQueue(maxDepth = 64): OwnerOperationQueue {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 1_024) {
    throw new RuntimeError("INVALID_INPUT");
  }

  const owners = new Map<string, OwnerQueueState>();

  function getOrCreateState(owner: string): OwnerQueueState {
    let state = owners.get(owner);
    if (!state) {
      state = { pending: [], active: new Set(), exclusiveActive: false };
      owners.set(owner, state);
    }
    return state;
  }

  function cleanup(owner: string, state: OwnerQueueState): void {
    if (state.pending.length === 0 && state.active.size === 0 && owners.get(owner) === state) {
      owners.delete(owner);
    }
  }

  function finish(entry: QueueEntry, outcome: "resolve" | "reject", value: unknown): void {
    // Settlement is idempotent: an abort can race with normal completion, and
    // both paths must release the slot exactly once before draining.
    if (entry.status === "settled") {
      return;
    }
    const wasRunning = entry.status === "running";
    entry.status = "settled";
    if (entry.onAbort && entry.signal) {
      entry.signal.removeEventListener("abort", entry.onAbort);
    }

    if (wasRunning) {
      entry.state.active.delete(entry);
      if (entry.exclusive) {
        entry.state.exclusiveActive = false;
      }
    } else {
      const index = entry.state.pending.indexOf(entry);
      if (index >= 0) {
        entry.state.pending.splice(index, 1);
      }
    }

    if (outcome === "resolve") {
      entry.resolve(value);
    } else {
      entry.reject(value);
    }

    drain(entry.owner, entry.state);
    cleanup(entry.owner, entry.state);
  }

  function start(entry: QueueEntry, exclusive: boolean): void {
    const index = entry.state.pending.indexOf(entry);
    if (index < 0 || entry.status !== "queued") {
      return;
    }
    entry.state.pending.splice(index, 1);
    entry.status = "running";
    entry.exclusive = exclusive;
    entry.state.active.add(entry);
    if (exclusive) {
      entry.state.exclusiveActive = true;
    }

    void Promise.resolve()
      .then(async () => {
        if (entry.signal?.aborted) {
          throw new RuntimeError("CANCELLED");
        }
        const result = await entry.operation(entry.signal);
        if (entry.signal?.aborted) {
          throw new RuntimeError("CANCELLED");
        }
        finish(entry, "resolve", result);
      })
      .catch((error: unknown) => {
        const safeError =
          error instanceof RuntimeError ? error : new RuntimeError("INTERNAL");
        finish(
          entry,
          "reject",
          entry.signal?.aborted ? new RuntimeError("CANCELLED") : safeError,
        );
      });
  }

  function drain(owner: string, state: OwnerQueueState): void {
    // Only the head of the queue is considered, so a later read cannot jump ahead
    // of an earlier mutation that is still waiting.
    if (state.exclusiveActive || state.pending.length === 0) {
      return;
    }

    const first = state.pending[0];
    if (state.active.size > 0) {
      if (isInterleavableRead(first)) {
        start(first, false);
        drain(owner, state);
      }
      return;
    }

    if (isInterleavableRead(first)) {
      start(first, false);
      drain(owner, state);
      return;
    }

    start(first, true);
  }

  function run<Result>(
    owner: string,
    operation: (signal?: AbortSignal) => Result | Promise<Result>,
    options: QueueOptions = {},
  ): Promise<Result> {
    if (
      typeof owner !== "string" ||
      owner.trim().length === 0 ||
      owner.length > MAX_OWNER_LENGTH ||
      CONTROL_CHARACTERS.test(owner) ||
      typeof operation !== "function"
    ) {
      return Promise.reject(new RuntimeError("INVALID_INPUT"));
    }

    const mode = options.mode ?? "mutation";
    const allowInterleave = options.allowInterleave ?? false;
    if (
      (mode !== "mutation" && mode !== "read") ||
      (allowInterleave && mode !== "read")
    ) {
      return Promise.reject(new RuntimeError("INVALID_INPUT"));
    }
    if (options.signal?.aborted) {
      return Promise.reject(new RuntimeError("CANCELLED"));
    }

    const state = getOrCreateState(owner);
    if (state.pending.length + state.active.size >= maxDepth) {
      cleanup(owner, state);
      return Promise.reject(new RuntimeError("QUEUE_FULL"));
    }

    return new Promise<Result>((resolve, reject) => {
      const entry: QueueEntry = {
        owner,
        state,
        mode,
        allowInterleave,
        ...(options.signal ? { signal: options.signal } : {}),
        operation,
        resolve: (value) => resolve(value as Result),
        reject,
        status: "queued",
        exclusive: false,
      };
      if (options.signal) {
        entry.onAbort = () => {
          if (entry.status === "queued") {
            finish(entry, "reject", new RuntimeError("CANCELLED"));
          }
        };
        options.signal.addEventListener("abort", entry.onAbort, { once: true });
      }
      state.pending.push(entry);
      drain(owner, state);
    });
  }

  return Object.freeze({ run });
}
