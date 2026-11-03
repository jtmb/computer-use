// Repository-local shim: the canonical shared contract lives in the
// computer-use-runtime package. Deployment copies the real module over this
// filename so the extension directory stays self-contained.
export * from "../computer-use-runtime/src/runtime-contract.mjs";
