import { randomBytes } from "node:crypto";
import { RuntimeError } from "./errors.ts";

declare const identityBrand: unique symbol;

export type OpaqueId<Kind extends string> = string & {
  readonly [identityBrand]: Kind;
};

export type CallerId = OpaqueId<"caller">;
export type WindowTargetId = OpaqueId<"window-target">;
export type TabTargetId = OpaqueId<"tab-target">;
export type ObservationHandleId = OpaqueId<"observation-handle">;
export type RequestId = OpaqueId<"request">;

export interface IdentityFactory {
  createCallerId(): CallerId;
  createWindowTargetId(): WindowTargetId;
  createTabTargetId(): TabTargetId;
  createObservationHandleId(): ObservationHandleId;
  createRequestId(): RequestId;
  parseCallerId(value: unknown): CallerId;
  parseWindowTargetId(value: unknown): WindowTargetId;
  parseTabTargetId(value: unknown): TabTargetId;
  parseObservationHandleId(value: unknown): ObservationHandleId;
  parseRequestId(value: unknown): RequestId;
  validateCallerId(value: unknown): value is CallerId;
  validateWindowTargetId(value: unknown): value is WindowTargetId;
  validateTabTargetId(value: unknown): value is TabTargetId;
  validateObservationHandleId(value: unknown): value is ObservationHandleId;
  validateRequestId(value: unknown): value is RequestId;
}

const MAX_ID_LENGTH = 128;
const ID_SECRET_BYTES = 18;
const NAMESPACE_BYTES = 12;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

type IdentityKind =
  | "caller"
  | "window-target"
  | "tab-target"
  | "observation-handle"
  | "request";

export function createIdentityFactory(): IdentityFactory {
  const namespace = `cu1.${randomBytes(NAMESPACE_BYTES).toString("base64url")}`;
  const minted = new Map<IdentityKind, Set<string>>();

  function valuesFor(kind: IdentityKind): Set<string> {
    let values = minted.get(kind);
    if (!values) {
      values = new Set<string>();
      minted.set(kind, values);
    }
    return values;
  }

  function create<Kind extends IdentityKind>(kind: Kind): OpaqueId<Kind> {
    const issued = valuesFor(kind);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const value = `${namespace}.${kind}.${randomBytes(ID_SECRET_BYTES).toString("base64url")}`;
      if (value.length <= MAX_ID_LENGTH && !issued.has(value)) {
        issued.add(value);
        return value as OpaqueId<Kind>;
      }
    }
    throw new RuntimeError("INTERNAL");
  }

  function parse<Kind extends IdentityKind>(value: unknown, kind: Kind): OpaqueId<Kind> {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > MAX_ID_LENGTH ||
      value.trim().length === 0 ||
      CONTROL_CHARACTERS.test(value)
    ) {
      throw new RuntimeError("INVALID_ID");
    }

    if (!value.startsWith(`${namespace}.${kind}.`) || !valuesFor(kind).has(value)) {
      throw new RuntimeError("FOREIGN_ID");
    }

    return value as OpaqueId<Kind>;
  }

  function validate<Kind extends IdentityKind>(
    value: unknown,
    kind: Kind,
  ): value is OpaqueId<Kind> {
    try {
      parse(value, kind);
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({
    createCallerId: () => create("caller"),
    createWindowTargetId: () => create("window-target"),
    createTabTargetId: () => create("tab-target"),
    createObservationHandleId: () => create("observation-handle"),
    createRequestId: () => create("request"),
    parseCallerId: (value: unknown) => parse(value, "caller"),
    parseWindowTargetId: (value: unknown) => parse(value, "window-target"),
    parseTabTargetId: (value: unknown) => parse(value, "tab-target"),
    parseObservationHandleId: (value: unknown) => parse(value, "observation-handle"),
    parseRequestId: (value: unknown) => parse(value, "request"),
    validateCallerId: (value: unknown): value is CallerId => validate(value, "caller"),
    validateWindowTargetId: (value: unknown): value is WindowTargetId =>
      validate(value, "window-target"),
    validateTabTargetId: (value: unknown): value is TabTargetId =>
      validate(value, "tab-target"),
    validateObservationHandleId: (value: unknown): value is ObservationHandleId =>
      validate(value, "observation-handle"),
    validateRequestId: (value: unknown): value is RequestId => validate(value, "request"),
  });
}
