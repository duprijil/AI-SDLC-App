import type { ChangeViewDTO } from "@/cockpit/models/block_state";
import type { TicketCardDTO } from "@/cockpit/models/sprint_board";

export type ChangeActionDTO =
  | { readonly kind: "merge"; readonly change: ChangeViewDTO }
  | { readonly kind: "update_branch"; readonly change: ChangeViewDTO }
  | {
      readonly kind: "reply";
      readonly threadId: string;
      readonly replyText: string;
      readonly shouldResolve: boolean;
    };

export interface ChangeActionResultDTO {
  readonly failure: string | null;
  readonly card: TicketCardDTO | null;
}
