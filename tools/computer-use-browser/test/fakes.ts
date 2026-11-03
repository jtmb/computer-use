import type {
  BrowserDocumentHandleLike,
  BrowserFrameLike,
  BrowserContextLike,
  BrowserLauncher,
  BrowserPageLike,
  ElementHandleLike,
  LaunchOptions,
  LocatorLike,
} from "../src/ops.ts";

export const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

export class FakeLocator implements LocatorLike {
  readonly calls: string[];
  readonly #page: FakePage;

  constructor(calls: string[], page: FakePage) {
    this.calls = calls;
    this.#page = page;
  }

  async click(): Promise<void> { this.calls.push("click"); }
  async fill(value: string): Promise<void> { this.calls.push(`fill:${value}`); }
  async press(key: string): Promise<void> { this.calls.push(`press:${key}`); }
  async pressSequentially(value: string): Promise<void> { this.calls.push(`type:${value}`); }
  async hover(): Promise<void> { this.calls.push("hover"); }
  async selectOption(): Promise<void> { this.calls.push("select"); }
  async scrollIntoViewIfNeeded(): Promise<void> { this.calls.push("scroll-into-view"); }
  async setInputFiles(path: string): Promise<void> { this.calls.push(`upload:${path}`); }
  async elementHandle(): Promise<ElementHandleLike | null> { return new FakeElementHandle(this.#page); }
}

class FakeFrame implements BrowserFrameLike {
  readonly #readUrl: () => string;

  constructor(readUrl: () => string) {
    this.#readUrl = readUrl;
  }

  url(): string { return this.#readUrl(); }
}

class FakeDocumentHandle implements BrowserDocumentHandleLike {
  readonly #page: FakePage;
  readonly #token: object;

  constructor(page: FakePage, token: object) {
    this.#page = page;
    this.#token = token;
  }

  async evaluate<Result>(pageFunction: (document: unknown) => Result): Promise<Result> {
    // The worker asks the document for password values with a marked query; the fake
    // answers from configured data, otherwise it reports the same-document check.
    if (String(pageFunction).includes("__ocPasswordQuery")) {
      return this.#page.passwordValues as Result;
    }
    return (this.#page.documentToken === this.#token) as Result;
  }

  async dispose(): Promise<void> {}
}

class FakeElementHandle implements ElementHandleLike {
  readonly #page: FakePage;

  constructor(page: FakePage) {
    this.#page = page;
  }

  async fill(_value: string, _options?: { readonly signal?: AbortSignal }): Promise<void> {
    this.#page.calls.push("credential-fill");
  }

  async ownerFrame(): Promise<BrowserFrameLike | null> {
    return this.#page.useForeignFrame ? this.#page.foreignFrame : this.#page.mainFrame();
  }

  async evaluate<Result>(pageFunction: (element: Element) => Result): Promise<Result> {
    // The worker probes password-typed fields with a different page function; the
    // fake distinguishes them by the probe's source so both paths stay testable.
    if (String(pageFunction).includes("__ocPasswordProbe")) {
      return this.#page.snapshotFieldIsPassword as Result;
    }
    return this.#page.credentialMetadata() as Result;
  }

  async dispose(): Promise<void> {}
}

export class FakePage implements BrowserPageLike {
  readonly calls: string[] = [];
  readonly mouse = { wheel: async (x: number, y: number) => { this.calls.push(`wheel:${x},${y}`); } };
  #url = "about:blank";
  #history = ["about:blank"];
  #historyIndex = 0;
  #documentToken: object = {};
  readonly #mainFrame = new FakeFrame(() => this.#url);
  readonly foreignFrame = new FakeFrame(() => "https://cross-frame.test/");
  useForeignFrame = false;
  /** Reported input type for the privileged credential path. */
  fieldType: string | null = "password";
  detached = false;
  actionUrl: string | null = null;
  snapshot = '- button "Continue" [ref=e1]';
  /** What the worker's password probe should report for pinned elements. */
  snapshotFieldIsPassword = false;
  /** Values the document query should report for password inputs on this page. */
  passwordValues: string[] = [];
  screenshotBytes: Uint8Array = PNG;
  readonly #closeListeners: (() => void)[] = [];

  get documentToken(): object { return this.#documentToken; }
  url(): string { return this.#url; }
  async title(): Promise<string> { return `Title ${this.#url}`; }
  async goto(url: string): Promise<void> {
    this.#history = this.#history.slice(0, this.#historyIndex + 1);
    this.#history.push(url);
    this.#historyIndex += 1;
    this.#url = url;
    this.#documentToken = {};
  }
  async goBack(): Promise<void> {
    this.#historyIndex = Math.max(0, this.#historyIndex - 1);
    this.#url = this.#history[this.#historyIndex]!;
    this.#documentToken = {};
  }
  async goForward(): Promise<void> {
    this.#historyIndex = Math.min(this.#history.length - 1, this.#historyIndex + 1);
    this.#url = this.#history[this.#historyIndex]!;
    this.#documentToken = {};
  }
  async reload(): Promise<void> { this.calls.push("reload"); this.#documentToken = {}; }
  async ariaSnapshot(): Promise<string> { return this.snapshot; }
  locator(selector: string): FakeLocator {
    this.calls.push(`locator:${selector}`);
    return new FakeLocator(this.calls, this);
  }
  mainFrame(): BrowserFrameLike { return this.#mainFrame; }
  async evaluateHandle(): Promise<BrowserDocumentHandleLike> {
    return new FakeDocumentHandle(this, this.#documentToken);
  }
  credentialMetadata(): object {
    let documentOrigin: string | null = null;
    let actionOrigin: string | null = null;
    try {
      documentOrigin = new URL(this.#url).origin;
      actionOrigin = new URL(this.actionUrl ?? this.#url, this.#url).origin;
    } catch {
      // Invalid fake URLs remain untrusted metadata.
    }
    return {
      connected: !this.detached,
      sameDocument: true,
      supportedField: true,
      fieldType: this.fieldType,
      documentOrigin,
      actionOrigin,
    };
  }
  async screenshot(): Promise<Uint8Array> { return this.screenshotBytes; }
  on(event: "close", listener: () => void): void {
    if (event === "close") this.#closeListeners.push(listener);
  }
  async close(): Promise<void> {
    this.detached = true;
    for (const listener of this.#closeListeners) listener();
  }
}

export class FakeContext implements BrowserContextLike {
  readonly createdPages: FakePage[] = [];
  readonly initialPages: FakePage[];
  closed = false;

  constructor(initialPages: FakePage[] = []) {
    this.initialPages = initialPages;
  }

  pages(): FakePage[] { return this.initialPages; }
  async newPage(): Promise<FakePage> {
    const page = new FakePage();
    this.createdPages.push(page);
    return page;
  }
  async close(): Promise<void> { this.closed = true; }
}

export function fakeLauncher(
  context: FakeContext,
  observe?: (profileDir: string, options: LaunchOptions) => void,
): BrowserLauncher {
  return async (profileDir, options) => {
    observe?.(profileDir, options);
    return context;
  };
}
