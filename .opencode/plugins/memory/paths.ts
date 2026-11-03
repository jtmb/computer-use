import { execFile } from "node:child_process"
import path from "node:path"

const COMMAND_TIMEOUT_MS = 3_000
const COMMAND_OUTPUT_BYTES = 16 * 1024

export type CommandRunner = (command: string, args: string[], cwd: string, signal?: AbortSignal) => Promise<string>

function abortError(signal?: AbortSignal): Error | undefined {
  if (!signal?.aborted) return undefined
  return signal.reason instanceof Error ? signal.reason : new Error("memory operation cancelled")
}

export const runBoundedCommand: CommandRunner = (command, args, cwd, signal) => {
  const aborted = abortError(signal)
  if (aborted) return Promise.reject(aborted)
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd,
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: COMMAND_OUTPUT_BYTES,
      ...(signal ? { signal } : {}),
    }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

function absoluteLine(output: string, description: string): string {
  const value = output.trim()
  if (!value || value.length > 4_096 || /[\r\n\0]/.test(value) || !path.isAbsolute(value)) {
    throw new Error(`${description} did not return one absolute path`)
  }
  return path.resolve(value)
}

export async function resolveGitRoot(
  sessionDirectory: string,
  options: { signal?: AbortSignal; run?: CommandRunner } = {},
): Promise<string> {
  if (!path.isAbsolute(sessionDirectory)) throw new Error("session.get did not return an absolute directory")
  const output = await (options.run ?? runBoundedCommand)("git", ["-C", sessionDirectory, "rev-parse", "--show-toplevel"], sessionDirectory, options.signal)
  return absoluteLine(output, "git rev-parse --show-toplevel")
}

export async function resolveOpenCodeDataDirectory(
  sessionDirectory: string,
  options: { signal?: AbortSignal; run?: CommandRunner } = {},
): Promise<string> {
  if (!path.isAbsolute(sessionDirectory)) throw new Error("session.get did not return an absolute directory")
  const output = await (options.run ?? runBoundedCommand)("opencode", ["debug", "paths", "data"], sessionDirectory, options.signal)
  return absoluteLine(output, "opencode debug paths data")
}

export function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}
