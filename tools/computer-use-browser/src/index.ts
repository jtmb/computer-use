export { BrowserBackendError, BROWSER_ERROR_CODES } from "./errors.ts";
export type { BrowserErrorCode } from "./errors.ts";
export {
  createBrowserManager,
  type BrowserCredentialFillRequest,
  type BrowserManager,
  type BrowserManagerOptions,
  type BrowserSessionStatus,
  type BrowserSessionSummary,
  type BrowserWorkerFactory,
  type StartBrowserSession,
} from "./manager.ts";
export {
  MAX_BROWSER_TEXT_LENGTH,
  MAX_SNAPSHOT_BYTES,
  browserLaunchOptions,
  type BrowserOperation,
  type BrowserOperationResult,
  type ElementTarget,
  type CredentialFillResult,
  type SnapshotResult,
  type TabSummary,
} from "./ops.ts";
export { resolveBrowserProfile, validateBrowserProfile, type ProfileOptions } from "./profile.ts";
export type { TabOwnership } from "./tabs.ts";
