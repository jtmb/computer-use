import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityFactory, RuntimeError } from "../src/index.ts";

test("factory mints unique opaque ids for every identity domain", () => {
  const ids = createIdentityFactory();
  const values = [
    ids.createCallerId(),
    ids.createWindowTargetId(),
    ids.createTabTargetId(),
    ids.createObservationHandleId(),
    ids.createRequestId(),
  ];
  assert.equal(new Set(values).size, values.length);
  assert.equal(ids.validateCallerId(values[0]), true);
  assert.equal(ids.validateWindowTargetId(values[1]), true);
  assert.equal(ids.validateTabTargetId(values[2]), true);
  assert.equal(ids.validateObservationHandleId(values[3]), true);
  assert.equal(ids.validateRequestId(values[4]), true);
});

test("foreign-factory and cross-domain id reuse are rejected", () => {
  const first = createIdentityFactory();
  const second = createIdentityFactory();
  const caller = first.createCallerId();
  assert.throws(() => second.parseCallerId(caller), { code: "FOREIGN_ID" });
  assert.throws(() => first.parseWindowTargetId(caller), { code: "FOREIGN_ID" });
});

test("forged ids with a copied runtime prefix are rejected", () => {
  const ids = createIdentityFactory();
  const issued = ids.createRequestId();
  const forged = `${issued.slice(0, -1)}${issued.endsWith("a") ? "b" : "a"}`;
  assert.throws(() => ids.parseRequestId(forged), { code: "FOREIGN_ID" });
});

test("blank, non-string, control-character, and over-length ids are rejected distinctly", () => {
  const ids = createIdentityFactory();
  assert.throws(() => ids.parseCallerId("   "), { code: "INVALID_ID" });
  assert.throws(() => ids.parseCallerId(42), { code: "INVALID_ID" });
  assert.throws(() => ids.parseCallerId("cu1.prefix.caller.\u0000"), { code: "INVALID_ID" });
  assert.throws(() => ids.parseCallerId("x".repeat(129)), { code: "INVALID_ID" });
});
