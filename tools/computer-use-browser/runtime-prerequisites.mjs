import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chooseChannel, INSTALLED_CHROME_SANDBOX, isSetuidRootHelper, sandboxHelperPath } from "./src/channel.ts";
import { buildChildEnvironment } from "./src/worker-child.ts";
import { validateScratchParent } from "./isolated-model-benchmark.mjs";

export const PACKAGE_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)));
export const PLAYWRIGHT_VERSION = "1.63.0-alpha-2026-08-31";
export const INSTALLED_CHROME = "/opt/google/chrome/chrome";
const MAX_POLICY_BYTES = 64;

export class PrerequisiteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PrerequisiteError";
    this.code = code;
  }
}

function reject(code, message) {
  throw new PrerequisiteError(code, message);
}

function absolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || !isAbsolute(value)) {
    reject("INVALID_PATH", `${label} must be an explicit absolute path`);
  }
  if (resolve(value) !== value) reject("AMBIGUOUS_PATH", `${label} must be normalized`);
  return value;
}

/**
 * Inspect one executable path without following an unexpected link.
 *
 * A prerequisite probe answers "would the worker be able to start this file",
 * so a symlink or a non-canonical path is reported rather than silently
 * accepted: the launch path does not resolve it either.
 */
export async function inspectEntry(target, { lstatImpl = lstat, realpathImpl = realpath } = {}) {
  const info = await lstatImpl(target).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return { path: target, status: "missing" };
  const canonical = await realpathImpl(target).catch(() => null);
  if (!info.isFile() || info.isSymbolicLink() || canonical !== target) {
    return { path: target, status: "unsafe" };
  }
  return { path: target, status: "present", uid: info.uid, mode: info.mode };
}

/** The benchmark also requires a real, non-writable browser installation root. */
export async function inspectDirectory(target, { lstatImpl = lstat, realpathImpl = realpath } = {}) {
  const info = await lstatImpl(target).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return { path: target, status: "missing" };
  const canonical = await realpathImpl(target).catch(() => null);
  if (!info.isDirectory() || info.isSymbolicLink() || canonical !== target) {
    return { path: target, status: "unsafe" };
  }
  return { path: target, status: "present", uid: info.uid, mode: info.mode };
}

export async function readUnprivilegedNamespacePolicy({ readFileImpl = readFile } = {}) {
  try {
    const text = await readFileImpl("/proc/sys/kernel/apparmor_restrict_unprivileged_userns", "utf8");
    if (Buffer.byteLength(text) > MAX_POLICY_BYTES) reject("POLICY_UNREADABLE", "the AppArmor userns policy is unexpectedly large");
    return { readable: true, unprivilegedNamespacesAllowed: text.trim() === "0" };
  } catch (error) {
    if (error instanceof PrerequisiteError) throw error;
    return { readable: false, unprivilegedNamespacesAllowed: true };
  }
}

function identity(entry) {
  return entry?.status === "present" ? { uid: entry.uid, mode: entry.mode } : null;
}

/**
 * Decide the browser lane from filesystem facts only; nothing is launched,
 * installed or written. The benchmark's own browser prerequisite is the pinned
 * Playwright installation, not a particular launch channel: its worker still
 * chooses the sandboxable channel at launch.
 */
export function evaluateBrowserLane({
  bundledExecutable,
  bundledSandbox,
  installedExecutable,
  installedSandbox,
  browsersRoot,
  unprivilegedNamespacesAllowed,
  uid,
}) {
  const channel = chooseChannel({
    unprivilegedNamespacesAllowed,
    bundledSandbox: identity(bundledSandbox),
    installedSandbox: identity(installedSandbox),
  });
  const sandboxPossible = unprivilegedNamespacesAllowed || isSetuidRootHelper(identity(bundledSandbox));
  const benchmarkBlockers = [];
  if (bundledExecutable?.status !== "present") benchmarkBlockers.push("BROWSER_EXECUTABLE_MISSING");
  if (bundledExecutable?.status === "present" &&
      (bundledExecutable.uid !== uid || (bundledExecutable.mode & 0o022) !== 0)) {
    benchmarkBlockers.push("BROWSER_OWNERSHIP_UNSAFE");
  }
  if (browsersRoot?.status !== "present" || browsersRoot.uid !== uid || (browsersRoot.mode & 0o022) !== 0) {
    benchmarkBlockers.push("BROWSER_PATH_UNSAFE");
  }
  const ready = channel === "bundled"
    ? bundledExecutable?.status === "present" && sandboxPossible
    : installedExecutable?.status === "present" && isSetuidRootHelper(identity(installedSandbox));
  const blocker = ready ? null : channel === "bundled"
    ? (bundledExecutable?.status === "present" ? "BUNDLED_SANDBOX_UNAVAILABLE" : "BROWSER_EXECUTABLE_MISSING")
    : (installedExecutable?.status === "present" ? "INSTALLED_SANDBOX_UNAVAILABLE" : "INSTALLED_BROWSER_MISSING");
  return {
    channel,
    workerReady: ready,
    blocker,
    benchmark: { executablePrerequisiteReady: benchmarkBlockers.length === 0, blockers: benchmarkBlockers },
  };
}

export async function inspectScratchParent(scratchParent, { validate = validateScratchParent } = {}) {
  if (scratchParent === undefined) return { status: "not_requested" };
  const selected = absolutePath(scratchParent, "--scratch-parent");
  try {
    const result = await validate(selected);
    return { status: "ready", path: selected, approvedRoot: result.approvedRoot };
  } catch (error) {
    return { status: "blocked", path: selected, code: error?.code ?? "SCRATCH_PARENT_REJECTED",
      message: String(error?.message ?? error) };
  }
}

function describeEntry(entry) {
  return entry.status === "present"
    ? { ...entry, mode: `0o${(entry.mode & 0o7777).toString(8).padStart(4, "0")}` }
    : entry;
}

async function loadChromium(browsersPath) {
  // Playwright resolves its browser directory at first import, so probe with the
  // same PLAYWRIGHT_BROWSERS_PATH the worker will receive rather than the parent
  // cache (they differ when only XDG_CACHE_HOME is set).
  const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  try {
    const { chromium } = await import("playwright-core");
    return chromium;
  } finally {
    if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = previous;
  }
}

export async function discoverBrowserPrerequisites({
  scratchParent,
  env = process.env,
  uid = process.getuid?.(),
  lstatImpl = lstat,
  realpathImpl = realpath,
} = {}) {
  const childEnvironment = buildChildEnvironment({ ...env });
  const chromium = await loadChromium(childEnvironment.PLAYWRIGHT_BROWSERS_PATH);
  const executablePath = chromium.executablePath();
  const read = { lstatImpl, realpathImpl };
  const [bundledExecutable, bundledSandbox, installedExecutable, installedSandbox, browsersRoot, policy] = await Promise.all([
    inspectEntry(executablePath, read),
    inspectEntry(sandboxHelperPath(executablePath), read),
    inspectEntry(INSTALLED_CHROME, read),
    inspectEntry(INSTALLED_CHROME_SANDBOX, read),
    // The benchmark validates the Playwright installation root three levels
    // above the executable (chrome-linux64 → chromium-<rev> → ms-playwright).
    inspectDirectory(dirname(dirname(dirname(executablePath))), read),
    readUnprivilegedNamespacePolicy(),
  ]);
  const lane = evaluateBrowserLane({
    bundledExecutable,
    bundledSandbox,
    installedExecutable,
    installedSandbox,
    browsersRoot,
    unprivilegedNamespacesAllowed: policy.unprivilegedNamespacesAllowed,
    uid,
  });
  const isolation = await inspectScratchParent(scratchParent);
  const display = {
    wayland: typeof childEnvironment.WAYLAND_DISPLAY === "string" && childEnvironment.WAYLAND_DISPLAY.length > 0,
    xdgRuntime: typeof childEnvironment.XDG_RUNTIME_DIR === "string" && childEnvironment.XDG_RUNTIME_DIR.length > 0,
  };
  return {
    schemaVersion: 1,
    observed: new Date().toISOString(),
    browser: {
      playwrightVersion: PLAYWRIGHT_VERSION,
      browsersPath: childEnvironment.PLAYWRIGHT_BROWSERS_PATH,
      bundledExecutable: describeEntry(bundledExecutable),
      bundledSandbox: describeEntry(bundledSandbox),
      installedChrome: describeEntry(installedExecutable),
      installedSandbox: describeEntry(installedSandbox),
      browsersRoot: describeEntry(browsersRoot),
      unprivilegedNamespacesAllowed: policy.unprivilegedNamespacesAllowed,
      namespacePolicyReadable: policy.readable,
      ...lane,
    },
    isolation,
    display,
    limits: [
      "filesystem metadata only; no browser, profile, page or compositor was started",
      "a ready lane is a launch prerequisite, not a loaded worker or human acceptance",
    ],
  };
}

async function main(argv) {
  let scratchParent;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scratch-parent") {
      const value = argv[++index];
      if (!value) reject("INVALID_ARGUMENT", "--scratch-parent requires an absolute path");
      scratchParent = absolutePath(value, arg);
    }
    else if (arg === "--help") {
      process.stdout.write("Usage: node --experimental-strip-types runtime-prerequisites.mjs [--scratch-parent ABSOLUTE_PATH]\n");
      return 0;
    } else reject("INVALID_ARGUMENT", `unknown argument: ${arg}`);
  }
  const report = await discoverBrowserPrerequisites({ scratchParent });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.browser.workerReady) return 1;
  if (report.isolation.status === "blocked") return 1;
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
