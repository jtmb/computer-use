import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BUN_VERSION = "1.4.2";
// Authentic npm integrity for @oven/bun-linux-x64@1.4.2, the version the pinned
// upstream package and the native test suites require.
export const BUN_INTEGRITY = "sha512-9/E/UXOTpSo3YsV5g+FhtTd/qTpiWoKuxS12cqtuYA1ssu9fRAoPQnipFgGyck3tWO63iUdxBiygq+kELFawng==";
// package/bin/bun streamed from that registry-authenticated tarball; an unrelated
// executable must not borrow the archive's identity by printing the same version.
export const BUN_BINARY_SHA256 = "a83d263767d839e4d2649ca8e35d07159c7afc99afdc96d731ced29e056dda0c";
export const NODE_VERSION = "26.4.0";
export const NATIVE_PIN = "ba546ec1598a70db2570e9c6258028d955ba8f58";
export const NATIVE_ORIGIN = "https://github.com/anomalyco/opencode";
const MAX_GIT_OUTPUT = 2 * 1024 * 1024;

export class NativePrerequisiteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "NativePrerequisiteError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new NativePrerequisiteError(code, message);
}

function absolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || !isAbsolute(value)) {
    fail("INVALID_PATH", `${label} must be an explicit absolute path`);
  }
  if (resolve(value) !== value) fail("AMBIGUOUS_PATH", `${label} must be normalized`);
  return value;
}

async function regularFile(target, code, label, { lstatImpl = lstat, realpathImpl = realpath } = {}) {
  const info = await lstatImpl(target).catch((error) => fail(code, `${label} is unavailable: ${error.code ?? error.message}`));
  const canonical = await realpathImpl(target).catch(() => null);
  if (!info.isFile() || info.isSymbolicLink() || canonical !== target) {
    fail(code, `${label} must be a canonical regular file without links`);
  }
  return info;
}

async function fileDigest(target, algorithm, encoding) {
  const digest = createHash(algorithm);
  for await (const chunk of createReadStream(target)) digest.update(chunk);
  return digest.digest(encoding);
}

export async function verifyBun({
  bun,
  tarball,
  expectedVersion = BUN_VERSION,
  expectedIntegrity = BUN_INTEGRITY,
  expectedBinarySha256 = BUN_BINARY_SHA256,
  run = execFileSync,
  lstatImpl = lstat,
  realpathImpl = realpath,
} = {}) {
  const selected = absolutePath(bun, "--bun");
  await regularFile(selected, "BUN_UNAVAILABLE", "Bun binary", { lstatImpl, realpathImpl });
  let tarballStatus = "not_requested";
  let binarySha256;
  if (tarball !== undefined) {
    const archive = absolutePath(tarball, "--bun-tarball");
    await regularFile(archive, "BUN_TARBALL_UNAVAILABLE", "Bun tarball", { lstatImpl, realpathImpl });
    if (`sha512-${await fileDigest(archive, "sha512", "base64")}` !== expectedIntegrity) {
      fail("BUN_TARBALL_INTEGRITY_MISMATCH", "the Bun tarball does not match the authentic npm SHA-512 integrity");
    }
    binarySha256 = await fileDigest(selected, "sha256", "hex");
    if (binarySha256 !== expectedBinarySha256) {
      fail("BUN_BINARY_INTEGRITY_MISMATCH", "the selected Bun binary does not match the pinned archive member bytes");
    }
    tarballStatus = "verified";
  }
  let version;
  try {
    version = run(selected, ["--version"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    fail("BUN_UNAVAILABLE", `Bun could not report its version: ${error?.code ?? "execution failed"}`);
  }
  if (version !== expectedVersion) {
    fail("BUN_VERSION_MISMATCH", `Bun reports ${JSON.stringify(version)} but the native suites require ${expectedVersion}`);
  }
  return { path: selected, version, tarball: tarballStatus, ...(binarySha256 ? { binarySha256 } : {}) };
}

export async function verifyNode({ node, expectedVersion = NODE_VERSION, run = execFileSync } = {}) {
  const selected = absolutePath(node, "--node");
  await regularFile(selected, "NODE_UNAVAILABLE", "Node binary");
  let version;
  try {
    version = run(selected, ["--version"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    fail("NODE_UNAVAILABLE", "Node could not report its version");
  }
  if (version !== `v${expectedVersion}`) {
    fail("NODE_VERSION_MISMATCH", `Node reports ${JSON.stringify(version)} but ${expectedVersion} was requested`);
  }
  return { path: selected, version };
}

function git(gitImpl, checkout, ...args) {
  try {
    return gitImpl("git", ["-c", "core.hooksPath=/dev/null", "-C", checkout, ...args], {
      encoding: "utf8", timeout: 30_000, maxBuffer: MAX_GIT_OUTPUT, stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    fail("SOURCE_CHECKOUT_UNAVAILABLE", `git ${args[0]} failed in the selected checkout: ${error?.code ?? "execution failed"}`);
  }
}

export async function verifySourceCheckout({
  checkout,
  pin = NATIVE_PIN,
  origin = NATIVE_ORIGIN,
  gitImpl = execFileSync,
} = {}) {
  const selected = absolutePath(checkout, "--checkout");
  const head = git(gitImpl, selected, "rev-parse", "HEAD");
  if (head !== pin) fail("SOURCE_PIN_MISMATCH", `checkout HEAD is ${head}, not the pinned ${pin}`);
  const remote = git(gitImpl, selected, "config", "--get", "remote.origin.url");
  const escapedOrigin = origin.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (!new RegExp(`^${escapedOrigin}(?:\\.git)?$`, "u").test(remote)) {
    fail("SOURCE_ORIGIN_MISMATCH", `checkout origin is ${JSON.stringify(remote)}, not ${origin}`);
  }
  const status = git(gitImpl, selected, "status", "--porcelain");
  const entries = status === "" ? [] : status.split("\n");
  return { path: selected, head, origin: remote, clean: entries.length === 0, changedEntries: entries.length };
}

export async function discoverNativePrerequisites({
  bun,
  tarball,
  node,
  checkout,
  run = execFileSync,
  gitImpl = execFileSync,
  lstatImpl = lstat,
  realpathImpl = realpath,
} = {}) {
  const report = { schemaVersion: 1, bun: null, node: null, checkout: null, next: [] };
  if (bun !== undefined) report.bun = await verifyBun({ bun, tarball, run, lstatImpl, realpathImpl });
  if (node !== undefined) report.node = await verifyNode({ node, run });
  if (checkout !== undefined) report.checkout = await verifySourceCheckout({ checkout, gitImpl });
  if (report.bun) {
    if (report.bun.tarball !== "verified") report.next.push("Version-only probe: no archive/binary integrity attested; not an authenticated native-test prerequisite.");
    report.next.push(`NATIVE_ROW_BUN=${report.bun.path}`);
    report.next.push(`NATIVE_ROW_SOURCE_CHECKOUT=${report.checkout?.path ?? "/absolute/path/to/pinned/opencode"}`);
  }
  if (report.checkout && !report.checkout.clean) {
    report.next.push("the checkout has local patch/application work; preview.mjs refuses it directly, while preview.test.mjs clones a clean scratch at the same pin");
  }
  return report;
}

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") return { help: true };
    const key = { "--bun": "bun", "--bun-tarball": "tarball", "--node": "node", "--checkout": "checkout" }[arg];
    if (!key) fail("INVALID_ARGUMENT", `unknown argument: ${arg}`);
    const value = argv[++index];
    if (!value) fail("INVALID_ARGUMENT", `${arg} requires an absolute path`);
    options[key] = absolutePath(value, arg);
  }
  return options;
}

async function main(argv) {
  const options = parse(argv);
  if (options.help) {
    process.stdout.write("Usage: node runtime-prerequisites.mjs [--bun ABS] [--bun-tarball ABS] [--node ABS] [--checkout ABS]\n");
    return 0;
  }
  if (!options.bun && !options.node && !options.checkout) {
    fail("INVALID_ARGUMENT", "provide at least one of --bun, --node or --checkout; no path is guessed");
  }
  const report = await discoverNativePrerequisites(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error?.code ?? "PREREQUISITE_FAILED"}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
