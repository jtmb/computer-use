import { execFile } from "node:child_process"
import path from "node:path"

import type { RepositoryMetadata } from "./model.ts"

const GIT_TIMEOUT_MS = 3_000
const GIT_OUTPUT_BYTES = 16 * 1024
export type GitRunner = (args: string[], directory: string, signal?: AbortSignal) => Promise<string>

function abortError(signal?: AbortSignal): Error | undefined {
  if (!signal?.aborted) return undefined
  return signal.reason instanceof Error ? signal.reason : new Error("operation aborted")
}

function runGit(args: string[], directory: string, signal?: AbortSignal): Promise<string> {
  const aborted = abortError(signal)
  if (aborted) return Promise.reject(aborted)
  return new Promise((resolve, reject) => {
    execFile("git", args, {
      cwd: directory,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_OUTPUT_BYTES,
      ...(signal ? { signal } : {}),
    }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout.trim())
    })
  })
}

function isNotRepository(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const record = error as Record<string, unknown>
  const output = `${String(record.message ?? "")} ${String(record.stderr ?? "")}`
  return output.includes("not a git repository")
}

function safeRemoteIdentity(value: string): string | undefined {
  const input = value.trim()
  if (!input || input.length > 2_048 || /[\r\n\0]/.test(input)) return undefined

  let host: string | undefined
  let repositoryPath: string | undefined
  try {
    const remote = new URL(input)
    if (["https:", "http:", "ssh:", "git+ssh:"].includes(remote.protocol)) {
      host = remote.hostname.toLowerCase()
      repositoryPath = remote.pathname.replace(/^\/+/, "")
      if (remote.port) host += `:${remote.port}`
    }
  } catch {
    const scp = /^(?:[^@/]+@)?([^/:]+):([^?#]+)$/.exec(input)
    if (scp) {
      host = scp[1].toLowerCase()
      repositoryPath = scp[2].replace(/^\/+/, "")
    }
  }
  if (!host || !repositoryPath) return undefined
  repositoryPath = repositoryPath.replace(/\.git$/i, "").replace(/\/+$/, "")
  if (!repositoryPath || repositoryPath.split("/").some((part) => !part || part === "." || part === "..")) return undefined
  if (!/^[A-Za-z0-9._~/-]+$/.test(repositoryPath) || !/^[A-Za-z0-9.:-]+$/.test(host)) return undefined
  return `${host}/${repositoryPath}`
}

function unavailable(kind: RepositoryMetadata["kind"], gap: string): RepositoryMetadata {
  return { kind, identity: null, worktree: null, scope: null, gaps: [gap] }
}

export async function describeRepository(
  directory: string,
  options: { signal?: AbortSignal; runGit?: GitRunner } = {},
): Promise<RepositoryMetadata> {
  const { signal } = options
  const git = options.runGit ?? runGit
  try {
    const root = path.resolve(await git(["rev-parse", "--show-toplevel"], directory, signal))
    const actualDirectory = path.resolve(directory)
    const relativeScope = path.relative(root, actualDirectory)
    const scope = relativeScope === "" ? "." : relativeScope.split(path.sep).join("/")
    const gaps: string[] = []
    if (path.isAbsolute(relativeScope) || relativeScope === ".." || relativeScope.startsWith(`..${path.sep}`)) {
      gaps.push("The session directory is not contained by the Git worktree; relative scope is unavailable.")
    }

    let worktree: string | null = null
    try {
      const [gitDirectory, commonDirectory] = await Promise.all([
        git(["rev-parse", "--absolute-git-dir"], directory, signal),
        git(["rev-parse", "--path-format=absolute", "--git-common-dir"], directory, signal),
      ])
      const relativeGitDirectory = path.relative(path.resolve(commonDirectory), path.resolve(gitDirectory))
      if (relativeGitDirectory === "") worktree = "main"
      else if (!path.isAbsolute(relativeGitDirectory) && relativeGitDirectory !== ".." && !relativeGitDirectory.startsWith(`..${path.sep}`)) {
        worktree = `linked/${relativeGitDirectory.split(path.sep).join("/")}`
      } else {
        gaps.push("Git did not provide a relative worktree identity.")
      }
    } catch (error) {
      if (abortError(signal)) throw error
      gaps.push("Git worktree identity could not be read.")
    }

    let identity: string | null = null
    try {
      identity = safeRemoteIdentity(await git(["remote", "get-url", "origin"], directory, signal)) ?? null
      if (!identity) gaps.push("The origin remote did not provide a portable repository identity.")
    } catch (error) {
      if (abortError(signal)) throw error
      gaps.push("No readable origin remote is available for a portable repository identity.")
    }

    return {
      kind: "git",
      identity,
      worktree,
      scope: gaps.some((gap) => gap.startsWith("The session directory")) ? null : scope,
      gaps,
    }
  } catch (error) {
    if (abortError(signal)) throw error
    return unavailable(
      isNotRepository(error) ? "not-git-repository" : "unavailable",
      isNotRepository(error)
        ? "The source directory is not inside a Git repository; repository identity and relative scope are unavailable."
        : "Read-only Git metadata could not be resolved; repository identity and relative scope are unavailable.",
    )
  }
}
