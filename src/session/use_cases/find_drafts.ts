import type { DraftStorePort } from "@/session/adapters/draft_store_port";
import type { DraftDTO } from "@/session/models/draft";

export class FindDrafts {
  readonly #drafts: DraftStorePort;

  constructor(drafts: DraftStorePort) {
    this.#drafts = drafts;
  }

  execute(ticketKey: string): readonly DraftDTO[] {
    return this.#drafts.openDrafts(ticketKey);
  }
}
