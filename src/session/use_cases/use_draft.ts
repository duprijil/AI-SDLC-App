import type { DraftStorePort } from "@/session/adapters/draft_store_port";
import type { DraftKind } from "@/session/models/draft";

export class UseDraft {
  readonly #drafts: DraftStorePort;

  constructor(drafts: DraftStorePort) {
    this.#drafts = drafts;
  }

  execute(ticketKey: string, kind: DraftKind, target: string): void {
    this.#drafts.markUsed(ticketKey, kind, target, new Date().toISOString());
  }
}
