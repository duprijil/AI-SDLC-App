import type { DraftStorePort } from "@/session/adapters/draft_store_port";
import { Draft, type DraftDTO } from "@/session/models/draft";

export class RecordDraft {
  readonly #drafts: DraftStorePort;

  constructor(drafts: DraftStorePort) {
    this.#drafts = drafts;
  }

  execute(draft: DraftDTO): DraftDTO {
    const valid = Draft.ensureValid(draft);
    this.#drafts.record(valid);
    return valid;
  }
}
