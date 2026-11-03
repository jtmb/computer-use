import {
  createProtocolCodec,
  MAX_PROTOCOL_FRAME_BYTES,
  type ProtocolValue,
} from "../../computer-use-runtime/src/index.ts";
import { BrowserBackendError, BROWSER_ERROR_CODES, type BrowserErrorCode } from "./errors.ts";
import type { BrowserOperation, ElementTarget } from "./ops.ts";

const PROTOCOL_KEYS = [
  "type", "id", "operation", "method", "tabId", "url", "target", "ref", "generation",
  "button", "clickCount", "modifiers", "value", "key", "values", "deltaX", "deltaY",
  "ownership", "path", "result", "error", "code", "message", "snapshot", "closed",
  "title", "binary", "byteLength", "chunkCount", "chunkIndex", "data", "ready",
  "status", "requirePasswordField",
];

const codec = createProtocolCodec(PROTOCOL_KEYS);
const REF_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const MODIFIERS = new Set(["Alt", "Control", "Meta", "Shift"]);

export const SCREENSHOT_CHUNK_BYTES = 5_000;

export function encodeProtocolMessage(value: unknown): Uint8Array {
  try {
    return codec.encode(value);
  } catch {
    throw new BrowserBackendError("PROTOCOL_INVALID", "The protocol message exceeds its allowed shape or size.");
  }
}

export function decodeProtocolMessage(value: Uint8Array): ProtocolValue {
  try {
    return codec.decode(value);
  } catch {
    throw new BrowserBackendError("PROTOCOL_INVALID", "The protocol frame is malformed or oversized.");
  }
}

export class FrameDecoder {
  #buffer = Buffer.alloc(0);

  push(chunk: Uint8Array): readonly Uint8Array[] {
    this.#buffer = Buffer.concat([this.#buffer, Buffer.from(chunk)]);
    const frames: Uint8Array[] = [];
    let consumed = 0;
    while (this.#buffer.byteLength - consumed >= 4) {
      const length = this.#buffer.readUInt32BE(consumed);
      if (length + 4 > MAX_PROTOCOL_FRAME_BYTES) {
        this.#buffer = Buffer.alloc(0);
        throw new BrowserBackendError("PROTOCOL_INVALID", "The protocol frame exceeds its byte limit.");
      }
      if (this.#buffer.byteLength - consumed < length + 4) break;
      frames.push(this.#buffer.subarray(consumed, consumed + length + 4));
      consumed += length + 4;
    }
    if (consumed > 0) this.#buffer = this.#buffer.subarray(consumed);
    if (this.#buffer.byteLength > MAX_PROTOCOL_FRAME_BYTES) {
      this.#buffer = Buffer.alloc(0);
      throw new BrowserBackendError("PROTOCOL_INVALID", "The partial protocol frame exceeds its byte limit.");
    }
    return frames;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BrowserBackendError("PROTOCOL_INVALID", "The protocol message must be an object.");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new BrowserBackendError("PROTOCOL_INVALID", "The protocol message contains an unknown field.");
  }
}

function stringField(value: Record<string, unknown>, key: string, maxLength = 8_192): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0 || field.length > maxLength) {
    throw new BrowserBackendError("PROTOCOL_INVALID", `The protocol field ${key} is invalid.`);
  }
  return field;
}

function textField(value: Record<string, unknown>, key: string, maxLength = 8_192): string {
  const field = value[key];
  if (typeof field !== "string" || field.length > maxLength) {
    throw new BrowserBackendError("PROTOCOL_INVALID", `The protocol field ${key} is invalid.`);
  }
  return field;
}

function targetField(value: Record<string, unknown>): ElementTarget {
  const target = record(value.target);
  exactKeys(target, ["tabId", "ref", "generation"]);
  if (
    typeof target.tabId !== "string" || target.tabId.length > 128 ||
    typeof target.ref !== "string" || !REF_PATTERN.test(target.ref) ||
    !Number.isSafeInteger(target.generation) || (target.generation as number) < 1
  ) {
    throw new BrowserBackendError("PROTOCOL_INVALID", "The element target is invalid.");
  }
  return { tabId: target.tabId, ref: target.ref, generation: target.generation as number };
}

function tabIdField(value: Record<string, unknown>): string {
  const tabId = stringField(value, "tabId", 128);
  if (tabId.trim() !== tabId) throw new BrowserBackendError("PROTOCOL_INVALID", "The tab id is invalid.");
  return tabId;
}

function validateOperation(value: unknown): BrowserOperation {
  const operation = record(value);
  const method = stringField(operation, "method", 32);
  switch (method) {
    case "navigate":
      exactKeys(operation, ["method", "tabId", "url"]);
      return { method, tabId: tabIdField(operation), url: stringField(operation, "url") };
    case "back":
    case "forward":
    case "reload":
    case "snapshot":
    case "info":
    case "screenshot":
      exactKeys(operation, ["method", "tabId"]);
      return { method, tabId: tabIdField(operation) };
    case "click": {
      exactKeys(operation, ["method", "target", "button", "clickCount", "modifiers"]);
      const button = operation.button;
      const clickCount = operation.clickCount;
      const modifiers = operation.modifiers;
      if (button !== undefined && !["left", "right", "middle"].includes(String(button))) {
        throw new BrowserBackendError("PROTOCOL_INVALID", "The click button is invalid.");
      }
      if (clickCount !== undefined && (!Number.isSafeInteger(clickCount) || (clickCount as number) < 1 || (clickCount as number) > 3)) {
        throw new BrowserBackendError("PROTOCOL_INVALID", "The click count is invalid.");
      }
      if (modifiers !== undefined && (!Array.isArray(modifiers) || modifiers.some((item) => typeof item !== "string" || !MODIFIERS.has(item)))) {
        throw new BrowserBackendError("PROTOCOL_INVALID", "The click modifiers are invalid.");
      }
      return {
        method,
        target: targetField(operation),
        ...(button === undefined ? {} : { button: button as "left" | "right" | "middle" }),
        ...(clickCount === undefined ? {} : { clickCount: clickCount as number }),
        ...(modifiers === undefined ? {} : { modifiers: modifiers as ("Alt" | "Control" | "Meta" | "Shift")[] }),
      };
    }
    case "fill":
    case "type":
      exactKeys(operation, ["method", "target", "value"]);
      return { method, target: targetField(operation), value: textField(operation, "value") };
    case "press":
      exactKeys(operation, ["method", "target", "key"]);
      return { method, target: targetField(operation), key: stringField(operation, "key", 128) };
    case "hover":
      exactKeys(operation, ["method", "target"]);
      return { method, target: targetField(operation) };
    case "selectOption": {
      exactKeys(operation, ["method", "target", "values"]);
      const values = operation.values;
      if (typeof values === "string") return { method, target: targetField(operation), values };
      if (Array.isArray(values) && values.length > 0 && values.length <= 32 && values.every((item) => typeof item === "string" && item.length <= 8_192)) {
        return { method, target: targetField(operation), values: values as string[] };
      }
      throw new BrowserBackendError("PROTOCOL_INVALID", "The option values are invalid.");
    }
    case "scroll": {
      exactKeys(operation, ["method", "tabId", "deltaX", "deltaY"]);
      const deltaX = operation.deltaX;
      const deltaY = operation.deltaY;
      if (typeof deltaX !== "number" || typeof deltaY !== "number") {
        throw new BrowserBackendError("PROTOCOL_INVALID", "The scroll values are invalid.");
      }
      return { method, tabId: tabIdField(operation), deltaX, deltaY };
    }
    case "tabs.list":
      exactKeys(operation, ["method"]);
      return { method };
    case "tabs.new": {
      exactKeys(operation, ["method", "ownership"]);
      const ownership = operation.ownership;
      if (ownership !== undefined && !["ephemeral", "deliverable", "handoff"].includes(String(ownership))) {
        throw new BrowserBackendError("PROTOCOL_INVALID", "The new tab ownership is invalid.");
      }
      return { method, ...(ownership === undefined ? {} : { ownership: ownership as "ephemeral" | "deliverable" | "handoff" }) };
    }
    case "tabs.close":
      exactKeys(operation, ["method", "tabId"]);
      return { method, tabId: tabIdField(operation) };
    case "upload":
      exactKeys(operation, ["method", "target", "path"]);
      return { method, target: targetField(operation), path: stringField(operation, "path", 4_096) };
    default:
      throw new BrowserBackendError("PROTOCOL_INVALID", "The requested browser method is not supported.");
  }
}

export function parseRequest(value: ProtocolValue): { readonly id: string; readonly operation: BrowserOperation } {
  const message = record(value);
  exactKeys(message, ["type", "id", "operation"]);
  if (message.type !== "request") throw new BrowserBackendError("PROTOCOL_INVALID", "The message is not a request.");
  const id = stringField(message, "id", 128);
  return { id, operation: validateOperation(message.operation) };
}

export interface CredentialFillRequest {
  readonly id: string;
  readonly target: ElementTarget;
  readonly value: string;
  readonly requirePasswordField?: boolean;
}

export function parseCredentialFillRequest(value: ProtocolValue): CredentialFillRequest {
  const message = record(value);
  exactKeys(message, ["type", "id", "target", "value", "requirePasswordField"]);
  if (message.type !== "credential-fill") {
    throw new BrowserBackendError("PROTOCOL_INVALID", "The message is not a credential-fill request.");
  }
  const credential = textField(message, "value", 4_096);
  if (!credential || new TextEncoder().encode(credential).byteLength > 4_096) {
    throw new BrowserBackendError("PROTOCOL_INVALID", "The credential-fill value is invalid.");
  }
  if (message.requirePasswordField !== undefined && typeof message.requirePasswordField !== "boolean") {
    throw new BrowserBackendError("PROTOCOL_INVALID", "The credential target restriction is invalid.");
  }
  return {
    id: stringField(message, "id", 128), target: targetField(message), value: credential,
    ...(message.requirePasswordField === undefined ? {} : { requirePasswordField: message.requirePasswordField }),
  };
}

export function parseCredentialAbortRequest(value: ProtocolValue): string {
  const message = record(value);
  exactKeys(message, ["type", "id"]);
  if (message.type !== "credential-abort") {
    throw new BrowserBackendError("PROTOCOL_INVALID", "The message is not a credential-abort request.");
  }
  return stringField(message, "id", 128);
}

export function parseRequestAbort(value: ProtocolValue): string {
  const message = record(value);
  exactKeys(message, ["type", "id"]);
  if (message.type !== "request-abort") {
    throw new BrowserBackendError("PROTOCOL_INVALID", "The message is not a request-abort message.");
  }
  return stringField(message, "id", 128);
}

export function validateErrorCode(value: unknown): BrowserErrorCode {
  if (typeof value === "string" && (BROWSER_ERROR_CODES as readonly string[]).includes(value)) {
    return value as BrowserErrorCode;
  }
  return "PROTOCOL_INVALID";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
