import type { DraftDTO, DraftKind } from "@/session/models/draft";

export interface DraftStorePort {
  record(draft: DraftDTO): void;
  openDrafts(ticketKey: string): readonly DraftDTO[];
  markUsed(ticketKey: string, kind: DraftKind, target: string, usedAt: string): void;
}
