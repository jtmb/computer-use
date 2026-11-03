import { dirname, join } from "node:path";

export type BrowserChannel = "bundled" | "chrome";

/** The minimal stat identity needed to judge a sandbox helper. */
export interface SandboxHelperIdentity {
  readonly uid: number;
  readonly mode: number;
}

export interface ChannelDecisionInput {
  readonly unprivilegedNamespacesAllowed: boolean;
  readonly bundledSandbox: SandboxHelperIdentity | null;
  readonly installedSandbox: SandboxHelperIdentity | null;
}

export const INSTALLED_CHROME_SANDBOX = "/opt/google/chrome/chrome-sandbox";

export function sandboxHelperPath(executablePath: string): string {
  return join(dirname(executablePath), "chrome_sandbox");
}

/** Chromium refuses to start when a helper is present but not root-owned setuid. */
export function isSetuidRootHelper(info: SandboxHelperIdentity | null): boolean {
  return info !== null && info.uid === 0 && (info.mode & 0o4000) !== 0;
}

/**
 * Pick the only browser build whose sandbox can start here.
 *
 * A channel is chosen from verified filesystem preconditions, never from an
 * inherited environment variable: the child environment is sanitized, and
 * letting an ambient value choose the browser would weaken the sandbox contract.
 * With no usable sandbox the bundled build is still selected so the launch fails
 * loudly instead of silently running unsandboxed.
 */
export function chooseChannel(input: ChannelDecisionInput): BrowserChannel {
  if (input.unprivilegedNamespacesAllowed) return "bundled";
  if (isSetuidRootHelper(input.bundledSandbox)) return "bundled";
  if (isSetuidRootHelper(input.installedSandbox)) return "chrome";
  return "bundled";
}
