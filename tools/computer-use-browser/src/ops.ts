import { stat } from "node:fs/promises";
import {
  LIMITS,
  type TabTargetId,
} from "../../computer-use-runtime/src/index.ts";
import { BrowserBackendError } from "./errors.ts";
import { TabRegistry, type TabOwnership } from "./tabs.ts";

export const MAX_SNAPSHOT_BYTES = 8_000;
export const MAX_BROWSER_TEXT_LENGTH = 8_192;

export interface LocatorLike {
  click(options?: {
    readonly button?: "left" | "right" | "middle";
    readonly clickCount?: number;
    readonly modifiers?: readonly ("Alt" | "Control" | "Meta" | "Shift")[];
  }): Promise<void>;
  fill(value: string): Promise<void>;
  press(key: string): Promise<void>;
  pressSequentially(value: string): Promise<void>;
  hover(): Promise<void>;
  selectOption(values: string | readonly string[]): Promise<unknown>;
  scrollIntoViewIfNeeded(): Promise<void>;
  setInputFiles(path: string): Promise<void>;
  elementHandle(): Promise<ElementHandleLike | null>;
}

export interface BrowserFrameLike {
  url(): string;
}

export interface BrowserDocumentHandleLike {
  evaluate<Result>(pageFunction: (document: unknown) => Result): Promise<Result>;
  dispose(): Promise<void>;
}

export interface ElementHandleLike {
  fill(value: string, options?: { readonly signal?: AbortSignal }): Promise<void>;
  ownerFrame(): Promise<BrowserFrameLike | null>;
  evaluate<Result>(pageFunction: (element: Element) => Result): Promise<Result>;
  dispose(): Promise<void>;
}

export interface BrowserPageLike {
  url(): string;
  title(): Promise<string>;
  goto(url: string): Promise<unknown>;
  goBack(): Promise<unknown>;
  goForward(): Promise<unknown>;
  reload(): Promise<unknown>;
  ariaSnapshot(options: { readonly mode: "ai" }): Promise<string>;
  locator(selector: string): LocatorLike;
  mainFrame(): BrowserFrameLike;
  evaluateHandle(pageFunction: () => unknown): Promise<BrowserDocumentHandleLike>;
  screenshot(options: { readonly type: "png" }): Promise<Uint8Array>;
  mouse: { wheel(deltaX: number, deltaY: number): Promise<void> };
  on?(event: "close", listener: () => void): unknown;
  close(): Promise<void>;
}

export interface BrowserContextLike {
  pages(): BrowserPageLike[];
  newPage(): Promise<BrowserPageLike>;
  close(): Promise<void>;
}

export interface LaunchOptions {
  readonly headless: false;
  readonly viewport: null;
  readonly chromiumSandbox: true;
  readonly acceptDownloads: true;
  readonly serviceWorkers?: "block";
}

export type BrowserLauncher = (
  profileDir: string,
  options: LaunchOptions,
) => Promise<BrowserContextLike>;

export interface ElementTarget {
  readonly tabId: string;
  readonly ref: string;
  readonly generation: number;
}

export interface TabSummary {
  readonly id: TabTargetId;
  readonly ownership: TabOwnership;
  readonly url: string;
  readonly title: string;
}

export type BrowserOperation =
  | { readonly method: "navigate"; readonly tabId: string; readonly url: string }
  | { readonly method: "back" | "forward" | "reload"; readonly tabId: string }
  | { readonly method: "snapshot"; readonly tabId: string }
  | {
      readonly method: "click";
      readonly target: ElementTarget;
      readonly button?: "left" | "right" | "middle";
      readonly clickCount?: number;
      readonly modifiers?: readonly ("Alt" | "Control" | "Meta" | "Shift")[];
    }
  | { readonly method: "fill"; readonly target: ElementTarget; readonly value: string }
  | { readonly method: "type"; readonly target: ElementTarget; readonly value: string }
  | { readonly method: "press"; readonly target: ElementTarget; readonly key: string }
  | { readonly method: "hover"; readonly target: ElementTarget }
  | {
      readonly method: "selectOption";
      readonly target: ElementTarget;
      readonly values: string | readonly string[];
    }
  | { readonly method: "scroll"; readonly tabId: string; readonly deltaX: number; readonly deltaY: number }
  | { readonly method: "screenshot"; readonly tabId: string }
  | { readonly method: "tabs.list" }
  | { readonly method: "tabs.new"; readonly ownership?: Exclude<TabOwnership, "user-owned"> }
  | { readonly method: "tabs.close"; readonly tabId: string }
  | { readonly method: "info"; readonly tabId: string }
  | { readonly method: "upload"; readonly target: ElementTarget; readonly path: string };

export interface SnapshotResult {
  readonly tabId: TabTargetId;
  readonly generation: number;
  readonly snapshot: string;
}

export type BrowserOperationResult<Operation extends BrowserOperation = BrowserOperation> =
  Operation extends { readonly method: "tabs.list" }
    ? readonly TabSummary[]
    : Operation extends { readonly method: "tabs.close" }
      ? { readonly closed: true }
      : Operation extends { readonly method: "screenshot" }
        ? Uint8Array
        : Operation extends { readonly method: "snapshot" }
          ? SnapshotResult
          : Operation extends BrowserOperation
            ? TabSummary
            : never;

export interface BrowserWorker {
  readonly profileDir: string;
  execute<Operation extends BrowserOperation>(operation: Operation, signal?: AbortSignal): Promise<BrowserOperationResult<Operation>>;
  fillCredential(
    target: ElementTarget,
    value: string,
    signal?: AbortSignal,
    options?: { readonly requirePasswordField?: boolean },
  ): Promise<CredentialFillResult>;
  close(): Promise<void>;
}

export interface CredentialFillResult {
  readonly status: "filled";
}

interface PinnedElement {
  readonly handle: ElementHandleLike;
  readonly frame: BrowserFrameLike;
}

interface SnapshotState {
  readonly generation: number;
  readonly refs: Set<string>;
  readonly elements: Map<string, PinnedElement>;
  readonly document: BrowserDocumentHandleLike;
  readonly origin: string | null;
}

const REF_PATTERN = /\[ref=([A-Za-z0-9_-]+)\]/gu;

/**
 * Values typed through the privileged credential path.
 *
 * An accessibility snapshot renders an input's value in clear text, so a password
 * typed into a field would otherwise be readable by any later snapshot — exactly the
 * exposure the private sign-in path exists to prevent. Every value that passes
 * through `fillCredential` is remembered and scrubbed from text that leaves the
 * worker. Short values are matched as whole tokens so redaction cannot shred
 * unrelated page text.
 */
const REDACTION = "[redacted]";
const URL_MAX_LENGTH = 8_192;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function validateText(value: string): void {
  if (typeof value !== "string" || value.length > MAX_BROWSER_TEXT_LENGTH) {
    throw new BrowserBackendError("INVALID_INPUT", "The text input is invalid or too long.");
  }
}

function validateTarget(
  registry: TabRegistry<BrowserPageLike>,
  target: ElementTarget,
  generations: Map<TabTargetId, SnapshotState>,
): { page: BrowserPageLike; ref: string; id: TabTargetId; snapshot: SnapshotState } {
  const tab = registry.get(target.tabId);
  const snapshot = generations.get(tab.id);
  if (
    !snapshot ||
    !Number.isSafeInteger(target.generation) ||
    target.generation !== snapshot.generation ||
    !snapshot.refs.has(target.ref)
  ) {
    throw new BrowserBackendError("STALE_REF", "The element reference is not from the latest snapshot for this tab.");
  }
  return { page: tab.page, ref: target.ref, id: tab.id, snapshot };
}

function disposeSnapshot(snapshot: SnapshotState | undefined): void {
  if (!snapshot) return;
  void snapshot.document.dispose().catch(() => undefined);
  for (const element of snapshot.elements.values()) {
    void element.handle.dispose().catch(() => undefined);
  }
}

function invalidate(generations: Map<TabTargetId, SnapshotState>, id: TabTargetId): void {
  const previous = generations.get(id);
  generations.delete(id);
  disposeSnapshot(previous);
}

function validateUrl(url: string): void {
  if (url.length > URL_MAX_LENGTH) {
    throw new BrowserBackendError("INVALID_INPUT", "The navigation URL is too long.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BrowserBackendError("INVALID_INPUT", "The navigation URL is invalid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BrowserBackendError("INVALID_INPUT", "Only HTTP and HTTPS navigation URLs are allowed.");
  }
}

function titleUrl(page: BrowserPageLike, id: TabTargetId, ownership: TabOwnership): Promise<TabSummary> {
  return page.title().then((title) => ({ id, ownership, url: page.url(), title }));
}

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function browserLaunchOptions(authFlow = false): LaunchOptions {
  return Object.freeze({
    headless: false,
    viewport: null,
    chromiumSandbox: true,
    acceptDownloads: true,
    ...(authFlow ? { serviceWorkers: "block" as const } : {}),
  });
}

export async function createBrowserWorker(options: {
  readonly profileDir: string;
  readonly launcher: BrowserLauncher;
  readonly authFlow?: boolean;
  readonly snapshotMaxBytes?: number;
}): Promise<BrowserWorker> {
  const context = await options.launcher(options.profileDir, browserLaunchOptions(options.authFlow));
  const tabs = new TabRegistry<BrowserPageLike>();
  const generations = new Map<TabTargetId, SnapshotState>();
  const sensitiveValues: string[] = [];

  const SENSITIVE_BUDGET_BYTES = 1_048_576;

  function rememberSensitive(value: string): void {
    if (!value) return;
    if (!sensitiveValues.includes(value)) sensitiveValues.push(value);
    // Retain every value for this worker's lifetime within a 1 MiB budget, measured
    // in UTF-8 bytes. The earlier eight-value cap silently unprotected the ninth
    // sign-in; this budget is far beyond any real session, and eviction past it drops
    // the oldest value (documented in the README) rather than pretending otherwise.
    let total = sensitiveValues.reduce((sum, item) => sum + Buffer.byteLength(item, "utf8"), 0);
    while (sensitiveValues.length > 1 && total > SENSITIVE_BUDGET_BYTES) {
      const dropped = sensitiveValues.shift();
      total -= dropped ? Buffer.byteLength(dropped, "utf8") : 0;
    }
  }

  function redactSensitive(text: string): string {
    if (!text || sensitiveValues.length === 0) return text;
    let result = text;
    for (const value of sensitiveValues) {
      if (value.length >= 6) {
        result = result.split(value).join(REDACTION);
        continue;
      }
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      result = result.replace(new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "gu"), REDACTION);
    }
    return result;
  }

  /**
   * Collect the current values of every password-typed input on the page.
   *
   * One document query replaces per-line probing: a bounded line scan always misses
   * the field after the bound (a real leak at 41, then at 201), while a single query
   * sees the whole document. Values found here are then scrubbed everywhere in the
   * snapshot, which also covers a page that echoes the value elsewhere.
   */
  async function passwordFieldValues(document: BrowserDocumentHandleLike): Promise<string[]> {
    try {
      const values = await document.evaluate((doc) => {
        // __ocPasswordQuery: stable marker so test doubles can identify this query.
        const scope = doc as Document;
        return Array.from(scope.querySelectorAll('input[type="password"]'))
          .map((element) => (element as HTMLInputElement).value)
          .filter((value) => typeof value === "string" && value.length > 0);
      });
      if (!Array.isArray(values)) return [];
      return values.filter((value): value is string => typeof value === "string" && value.length > 0);
    } catch {
      // A failed query leaves value-based redaction in place rather than failing the
      // snapshot; the operator sees the documented limit instead of a crash.
      return [];
    }
  }

  let snapshotGeneration = 0;
  for (const page of context.pages()) tabs.register(page, "user-owned");

  /** Summaries are redacted too: a page can reflect a value into its title or URL. */
  async function apiSummary(page: BrowserPageLike, id: TabTargetId, ownership: TabOwnership): Promise<TabSummary> {
    const summary = await titleUrl(page, id, ownership);
    return { ...summary, title: redactSensitive(summary.title), url: redactSensitive(summary.url) };
  }

  async function tabSummary(tabId: string): Promise<TabSummary> {
    const tab = tabs.get(tabId);
    return apiSummary(tab.page, tab.id, tab.ownership);
  }

  async function execute(operation: BrowserOperation, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) {
      throw new BrowserBackendError("CANCELLED", "The browser operation was cancelled; an already-dispatched page action may still have completed.");
    }
    switch (operation.method) {
      case "tabs.list":
        return Promise.all(tabs.list().map((tab) => apiSummary(tab.page, tab.id, tab.ownership)));
      case "tabs.new": {
        const page = await context.newPage();
        const tab = tabs.register(page, operation.ownership ?? "ephemeral");
        return tabSummary(tab.id);
      }
      case "tabs.close": {
        const tab = tabs.remove(operation.tabId);
        invalidate(generations, tab.id);
        await tab.page.close();
        return { closed: true };
      }
      case "navigate": {
        validateUrl(operation.url);
        const tab = tabs.get(operation.tabId);
        invalidate(generations, tab.id);
        await tab.page.goto(operation.url);
        return tabSummary(tab.id);
      }
      case "back":
      case "forward":
      case "reload": {
        const tab = tabs.get(operation.tabId);
        invalidate(generations, tab.id);
        if (operation.method === "back") await tab.page.goBack();
        if (operation.method === "forward") await tab.page.goForward();
        if (operation.method === "reload") await tab.page.reload();
        return tabSummary(tab.id);
      }
      case "snapshot": {
        const tab = tabs.get(operation.tabId);
        const capturedUrl = tab.page.url();
        const document = await tab.page.evaluateHandle(() => document);
        // Remember every password value on the page before rendering the snapshot, so
        // the value-based scrub covers them wherever they appear — including fields
        // whose value never passed through the privileged fill path.
        for (const value of await passwordFieldValues(document)) rememberSensitive(value);
        const snapshot = redactSensitive(await tab.page.ariaSnapshot({ mode: "ai" }));
        const maxBytes = Math.min(options.snapshotMaxBytes ?? MAX_SNAPSHOT_BYTES, MAX_SNAPSHOT_BYTES);
        if (new TextEncoder().encode(snapshot).byteLength > maxBytes) {
          disposeSnapshot({ generation: 0, refs: new Set(), elements: new Map(), document, origin: null });
          invalidate(generations, tab.id);
          throw new BrowserBackendError("SNAPSHOT_TOO_LARGE", "The accessibility snapshot exceeds its byte budget.");
        }
        const refs = new Set([...snapshot.matchAll(REF_PATTERN)].map((match) => match[1]!));
        const elements = new Map<string, PinnedElement>();
        for (const ref of refs) {
          try {
            const handle = await tab.page.locator(`aria-ref=${ref}`).elementHandle();
            const frame = handle ? await handle.ownerFrame() : null;
            if (handle && frame) elements.set(ref, { handle, frame });
            else if (handle) void handle.dispose().catch(() => undefined);
          } catch {
            // A missing pin remains unavailable to the privileged credential path.
          }
        }
        // Values collected above are scrubbed throughout the text.
        const safeSnapshot = redactSensitive(snapshot);
        const stillSameDocument = await document.evaluate(
          (capturedDocument) => capturedDocument === globalThis.document,
        );
        if (!stillSameDocument || tab.page.url() !== capturedUrl) {
          disposeSnapshot({ generation: 0, refs, elements, document, origin: originOf(capturedUrl) });
          invalidate(generations, tab.id);
          throw new BrowserBackendError("STALE_REF", "The page changed while its snapshot was captured.");
        }
        const generation = ++snapshotGeneration;
        const previous = generations.get(tab.id);
        generations.set(tab.id, {
          generation,
          refs,
          elements,
          document,
          origin: originOf(capturedUrl),
        });
        disposeSnapshot(previous);
        return { tabId: tab.id, generation, snapshot: safeSnapshot } satisfies SnapshotResult;
      }
      case "click": {
        const target = validateTarget(tabs, operation.target, generations);
        invalidate(generations, target.id);
        await target.page.locator(`aria-ref=${target.ref}`).click({
          ...(operation.button ? { button: operation.button } : {}),
          ...(operation.clickCount ? { clickCount: operation.clickCount } : {}),
          ...(operation.modifiers ? { modifiers: operation.modifiers } : {}),
        });
        return tabSummary(target.id);
      }
      case "fill":
      case "type": {
        validateText(operation.value);
        const target = validateTarget(tabs, operation.target, generations);
        invalidate(generations, target.id);
        const locator = target.page.locator(`aria-ref=${target.ref}`);
        if (operation.method === "fill") await locator.fill(operation.value);
        else await locator.pressSequentially(operation.value);
        return tabSummary(target.id);
      }
      case "press": {
        validateText(operation.key);
        const target = validateTarget(tabs, operation.target, generations);
        invalidate(generations, target.id);
        await target.page.locator(`aria-ref=${target.ref}`).press(operation.key);
        return tabSummary(target.id);
      }
      case "hover": {
        const target = validateTarget(tabs, operation.target, generations);
        invalidate(generations, target.id);
        await target.page.locator(`aria-ref=${target.ref}`).hover();
        return tabSummary(target.id);
      }
      case "selectOption": {
        const values = Array.isArray(operation.values) ? operation.values : [operation.values];
        for (const value of values) validateText(value);
        const target = validateTarget(tabs, operation.target, generations);
        invalidate(generations, target.id);
        await target.page.locator(`aria-ref=${target.ref}`).selectOption(operation.values);
        return tabSummary(target.id);
      }
      case "scroll": {
        if (!Number.isFinite(operation.deltaX) || !Number.isFinite(operation.deltaY) ||
          Math.abs(operation.deltaX) > 10_000 || Math.abs(operation.deltaY) > 10_000) {
          throw new BrowserBackendError("INVALID_INPUT", "The scroll delta is invalid.");
        }
        const tab = tabs.get(operation.tabId);
        invalidate(generations, tab.id);
        await tab.page.mouse.wheel(operation.deltaX, operation.deltaY);
        return tabSummary(tab.id);
      }
      case "screenshot": {
        const tab = tabs.get(operation.tabId);
        const bytes = await tab.page.screenshot({ type: "png" });
        if (bytes.byteLength > LIMITS.PNG_MAX_BYTES || !hasPngSignature(bytes)) {
          throw new BrowserBackendError("SCREENSHOT_TOO_LARGE", "The PNG screenshot is invalid or exceeds its byte cap.");
        }
        return new Uint8Array(bytes);
      }
      case "info":
        return tabSummary(operation.tabId);
      case "upload": {
        if (!operation.path || operation.path.length > 4_096) {
          throw new BrowserBackendError("UPLOAD_INVALID", "The upload path is invalid.");
        }
        let fileInfo;
        try {
          fileInfo = await stat(operation.path);
        } catch {
          throw new BrowserBackendError("UPLOAD_INVALID", "The upload file does not exist or cannot be read.");
        }
        if (!fileInfo.isFile()) {
          throw new BrowserBackendError("UPLOAD_INVALID", "The upload path must name a regular file.");
        }
        const target = validateTarget(tabs, operation.target, generations);
        invalidate(generations, target.id);
        await target.page.locator(`aria-ref=${target.ref}`).setInputFiles(operation.path);
        return tabSummary(target.id);
      }
    }
  }

  async function fillCredential(
    elementTarget: ElementTarget,
    value: string,
    signal?: AbortSignal,
    fillOptions: { readonly requirePasswordField?: boolean } = {},
  ): Promise<CredentialFillResult> {
    if (!options.authFlow) {
      throw new BrowserBackendError("CREDENTIAL_FILL_BLOCKED", "Credential fill requires a protected auth-flow context.");
    }
    if (typeof value !== "string" || new TextEncoder().encode(value).byteLength > 4_096 || value.length === 0) {
      throw new BrowserBackendError("CREDENTIAL_FILL_BLOCKED", "The credential input is invalid.");
    }
    if (signal?.aborted) {
      throw new BrowserBackendError("CREDENTIAL_FILL_BLOCKED", "Credential fill was cancelled.");
    }
    const target = validateTarget(tabs, elementTarget, generations);
    const pinned = target.snapshot.elements.get(target.ref);
    if (!pinned) {
      throw new BrowserBackendError("CREDENTIAL_TARGET_INVALID", "The credential target is not pinned to the current snapshot.");
    }
    try {
      const pageOrigin = originOf(target.page.url());
      const frame = await pinned.handle.ownerFrame();
      if (
        !pageOrigin || pageOrigin !== target.snapshot.origin ||
        frame !== pinned.frame || frame !== target.page.mainFrame() ||
        originOf(frame.url()) !== pageOrigin
      ) {
        throw new BrowserBackendError("CREDENTIAL_TARGET_INVALID", "The credential target changed document or origin.");
      }
      const sameDocument = await target.snapshot.document.evaluate(
        (capturedDocument) => capturedDocument === globalThis.document,
      );
      if (!sameDocument) {
        throw new BrowserBackendError("CREDENTIAL_TARGET_INVALID", "The credential target belongs to a stale document.");
      }
      const metadata = await pinned.handle.evaluate((element) => {
        const input = element instanceof HTMLInputElement ? element : null;
        const textarea = element instanceof HTMLTextAreaElement ? element : null;
        const supportedType = !input || ["password", "text", "email"].includes(input.type.toLowerCase());
        const form = input?.form ?? textarea?.form ?? null;
        let actionOrigin: string | null = null;
        if (form) {
          try {
            actionOrigin = new URL(form.action, document.URL).origin;
          } catch {
            actionOrigin = null;
          }
        }
        return {
          connected: element.isConnected,
          sameDocument: element.ownerDocument === document,
          supportedField: (input !== null || textarea !== null) && supportedType,
          fieldType: input ? input.type.toLowerCase() : null,
          documentOrigin: location.origin,
          actionOrigin,
        };
      });
      if (
        !metadata.connected || !metadata.sameDocument || !metadata.supportedField ||
        metadata.documentOrigin !== pageOrigin || metadata.actionOrigin !== pageOrigin
      ) {
        throw new BrowserBackendError("CREDENTIAL_TARGET_INVALID", "The credential form is detached or has a different origin.");
      }
      // A private sign-in is for a password field. Typing a password into a search or
      // username box would put it on screen in clear text and could submit it to the
      // wrong destination, so the caller can demand the field type explicitly.
      if (fillOptions.requirePasswordField && metadata.fieldType !== "password") {
        throw new BrowserBackendError("CREDENTIAL_TARGET_INVALID", "The credential target is not a password field.");
      }
      if (signal?.aborted) {
        throw new BrowserBackendError("CREDENTIAL_FILL_BLOCKED", "Credential fill was cancelled before dispatch.");
      }
      // Protect every later observation before invoking a handle that can mutate and
      // then fail without acknowledging whether the value reached the page.
      rememberSensitive(value);
      try {
        await pinned.handle.fill(value, { signal: signal ?? new AbortController().signal });
      } catch {
        throw new BrowserBackendError(
          "CREDENTIAL_FILL_UNCERTAIN",
          "The credential fill may have changed the page before its acknowledgement failed.",
        );
      }
      return Object.freeze({ status: "filled" });
    } catch (error) {
      if (error instanceof BrowserBackendError) throw error;
      throw new BrowserBackendError(
        signal?.aborted ? "CREDENTIAL_FILL_BLOCKED" : "CREDENTIAL_TARGET_INVALID",
        signal?.aborted ? "Credential fill was cancelled." : "The credential target is no longer usable.",
      );
    } finally {
      invalidate(generations, target.id);
    }
  }

  return Object.freeze({
    profileDir: options.profileDir,
    execute: execute as BrowserWorker["execute"],
    fillCredential,
    close: () => context.close(),
  });
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}
