import { ensure } from "@/core/models/invariant";
import { InvalidDraftError } from "@/session/models/errors";

export const DRAFT_KINDS = ["thread_reply", "note"] as const;

export type DraftKind = (typeof DRAFT_KINDS)[number];

const MAXIMUM_DRAFT_LENGTH = 20_000;

export interface DraftDTO {
  readonly ticketKey: string;
  readonly kind: DraftKind;
  readonly target: string;
  readonly text: string;
  readonly createdAt: string;
}

export const Draft = {
  ensureValid(draft: DraftDTO): DraftDTO {
    ensure(draft.target.trim() !== "", () => new InvalidDraftError("A draft needs a target"));
    ensure(draft.text.trim() !== "", () => new InvalidDraftError("A draft needs text"));
    ensure(
      draft.text.length <= MAXIMUM_DRAFT_LENGTH,
      () => new InvalidDraftError(`A draft is at most ${String(MAXIMUM_DRAFT_LENGTH)} characters`),
    );
    return draft;
  },
};
