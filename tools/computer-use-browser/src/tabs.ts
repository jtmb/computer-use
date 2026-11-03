import {
  createIdentityFactory,
  LIMITS,
  type TabTargetId,
} from "../../computer-use-runtime/src/index.ts";
import { BrowserBackendError } from "./errors.ts";

export type TabOwnership = "ephemeral" | "deliverable" | "handoff" | "user-owned";

export interface TabRecord<Page> {
  readonly id: TabTargetId;
  readonly page: Page;
  readonly ownership: TabOwnership;
}

export class TabRegistry<Page extends { on?(event: "close", listener: () => void): unknown }> {
  readonly #identity = createIdentityFactory();
  readonly #tabs = new Map<TabTargetId, TabRecord<Page>>();

  register(page: Page, ownership: TabOwnership): TabRecord<Page> {
    const agentTabs = [...this.#tabs.values()].filter((tab) => tab.ownership !== "user-owned");
    if (ownership !== "user-owned" && agentTabs.length >= LIMITS.MAX_TABS_PER_WORKER) {
      throw new BrowserBackendError("TAB_LIMIT", "The worker has reached its live tab limit.");
    }
    const record: TabRecord<Page> = Object.freeze({
      id: this.#identity.createTabTargetId(),
      page,
      ownership,
    });
    this.#tabs.set(record.id, record);
    page.on?.("close", () => this.#tabs.delete(record.id));
    return record;
  }

  get(id: string): TabRecord<Page> {
    let parsed: TabTargetId;
    try {
      parsed = this.#identity.parseTabTargetId(id);
    } catch {
      throw new BrowserBackendError("FOREIGN_TAB", "The tab id does not belong to this worker.");
    }
    const record = this.#tabs.get(parsed);
    if (!record) throw new BrowserBackendError("FOREIGN_TAB", "The tab id is not live in this worker.");
    return record;
  }

  list(): readonly TabRecord<Page>[] {
    return Object.freeze([...this.#tabs.values()]);
  }

  remove(id: string): TabRecord<Page> {
    const record = this.get(id);
    if (record.ownership === "user-owned") {
      throw new BrowserBackendError("TAB_PROTECTED", "User-owned tabs cannot be closed by the agent.");
    }
    this.#tabs.delete(record.id);
    return record;
  }
}
