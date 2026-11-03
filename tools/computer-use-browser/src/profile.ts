import { lstat, mkdir, readlink, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, parse, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BrowserBackendError } from "./errors.ts";

export interface ProfileOptions {
  readonly opencodeDataDir: string;
  readonly envRoot?: string;
  readonly generation?: string;
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function validateSegment(value: string): void {
  if (!SAFE_SEGMENT.test(value) || value === "." || value === "..") {
    throw new BrowserBackendError("PROFILE_INVALID", "The project or session key is invalid.");
  }
}

function resolveRoot(options: ProfileOptions): string {
  const configured = process.env.OPENCODE_BROWSER_PROFILE_ROOT ?? options.envRoot;
  const base = configured ?? options.opencodeDataDir;
  if (!isAbsolute(base)) {
    throw new BrowserBackendError("PROFILE_INVALID", "The browser profile root must be absolute.");
  }
  if (!isAbsolute(options.opencodeDataDir)) {
    throw new BrowserBackendError("PROFILE_INVALID", "The OpenCode data directory must be absolute.");
  }
  return resolve(configured ? base : join(base, "browser-profiles"));
}

async function assertNoSymlinkComponents(path: string): Promise<void> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(/[\\/]/u).filter(Boolean)) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new BrowserBackendError("PROFILE_INVALID", "The browser profile path contains a symlink.");
      }
      if (!info.isDirectory()) {
        throw new BrowserBackendError("PROFILE_INVALID", "The browser profile path is not a directory.");
      }
    } catch (error) {
      if (error instanceof BrowserBackendError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new BrowserBackendError("PROFILE_INVALID", "The browser profile path cannot be inspected.");
    }
  }
}

async function ensurePrivateDirectory(path: string, requireOwned: boolean): Promise<void> {
  await assertNoSymlinkComponents(path);
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
  } catch {
    throw new BrowserBackendError("PROFILE_INVALID", "The browser profile directory cannot be created.");
  }
  await assertNoSymlinkComponents(path);
  let info;
  try {
    info = await lstat(path);
  } catch {
    throw new BrowserBackendError("PROFILE_INVALID", "The browser profile directory cannot be inspected.");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new BrowserBackendError("PROFILE_INVALID", "The browser profile path is not a real directory.");
  }
  if (requireOwned && info.uid !== process.getuid?.()) {
    throw new BrowserBackendError("PROFILE_INVALID", "The browser profile root is not owned by this user.");
  }
  if ((info.mode & 0o077) !== 0) {
    throw new BrowserBackendError(
      "PROFILE_INVALID",
      "The browser profile root must not grant any group or other permission.",
    );
  }
}

export async function resolveBrowserProfile(
  projectKey: string,
  sessionId: string,
  options: ProfileOptions,
): Promise<string> {
  validateSegment(projectKey);
  validateSegment(sessionId);
  if (options.generation !== undefined) validateSegment(options.generation);
  const root = resolveRoot(options);
  await ensurePrivateDirectory(root, true);
  const projectDir = join(root, projectKey);
  await ensurePrivateDirectory(projectDir, true);
  const sessionDir = join(projectDir, sessionId);
  await ensurePrivateDirectory(sessionDir, true);
  const profileDir = options.generation ? join(sessionDir, options.generation) : sessionDir;
  if (profileDir !== sessionDir) await ensurePrivateDirectory(profileDir, true);
  return validateBrowserProfile(profileDir);
}

export async function validateBrowserProfile(profileDir: string): Promise<string> {
  if (!isAbsolute(profileDir)) {
    throw new BrowserBackendError("PROFILE_INVALID", "The browser profile path must be absolute.");
  }
  await assertNoSymlinkComponents(profileDir);
  let info;
  try {
    info = await lstat(profileDir);
  } catch {
    throw new BrowserBackendError("PROFILE_INVALID", "The browser profile directory cannot be inspected.");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new BrowserBackendError("PROFILE_INVALID", "The browser profile path is not a real directory.");
  }
  if (info.uid !== process.getuid?.()) {
    throw new BrowserBackendError("PROFILE_INVALID", "The browser profile root is not owned by this user.");
  }
  if ((info.mode & 0o077) !== 0) {
    throw new BrowserBackendError(
      "PROFILE_INVALID",
      "The browser profile directory must not grant any group or other permission.",
    );
  }
  const profilePath = await realpath(profileDir);
  const lockFile = join(profilePath, "SingletonLock");
  try {
    const lock = await lstat(lockFile);
    // Chromium leaves SingletonLock as "<hostname>-<pid>". A lock from a dead
    // process is stale and safe to reclaim; a live one is a real conflict.
    const target = lock.isSymbolicLink() ? await readlink(lockFile).catch(() => "") : "";
    const pid = Number(target.slice(target.lastIndexOf("-") + 1));
    const alive = Number.isSafeInteger(pid) && pid > 0 && (() => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
      }
    })();
    if (alive) {
      throw new BrowserBackendError(
        "PROFILE_LOCKED",
        `The browser profile is locked: ${profilePath}`,
      );
    }
    for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
      await rm(join(profilePath, name), { force: true }).catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof BrowserBackendError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new BrowserBackendError("PROFILE_INVALID", "The browser profile lock cannot be inspected.");
    }
  }
  return profilePath;
}

export function createProfileGeneration(): string {
  return `worker-${randomUUID()}`;
}
