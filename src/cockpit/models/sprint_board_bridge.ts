import type { AttentionKind } from "@/cockpit/models/attention";
import type { ChangeActionDTO, ChangeActionResultDTO } from "@/cockpit/models/change_action";
import type { ChangePromptRequestDTO } from "@/cockpit/models/change_prompt";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { SprintBoardDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";
import type {
  StatusMovePreviewDTO,
  StatusMoveRequestDTO,
  StatusMoveResultDTO,
} from "@/cockpit/models/status_move_action";
import type { Unsubscribe } from "@/session/models/session_bridge";

export const SPRINT_BOARD_BRIDGE_GLOBAL = "cockpitBoard";

export const SPRINT_BOARD_CHANNEL = Object.freeze({
  cached: "board:cached",
  refreshAll: "board:refresh-all",
  refreshTicket: "board:refresh-ticket",
  progress: "board:progress",
  attention: "board:attention",
  openInTracker: "board:open-in-tracker",
  openExternal: "board:open-external",
  changeAction: "change:action",
  changePrompt: "change:prompt",
  movePreview: "ticket:move-preview",
  move: "ticket:move",
});

export interface AttentionChangeDTO {
  readonly ticketKey: string;
  readonly attention: AttentionKind;
}

export interface TicketRefreshDTO {
  readonly card: TicketCardDTO | null;
  readonly codeHostFailure: string | null;
}

export interface SprintBoardBridge {
  cached(): Promise<SprintBoardDTO | null>;
  refreshAll(): Promise<SprintBoardDTO>;
  refreshTicket(ticketKey: string): Promise<TicketRefreshDTO>;
  runChangeAction(ticketKey: string, action: ChangeActionDTO): Promise<ChangeActionResultDTO>;
  buildPrompt(request: ChangePromptRequestDTO): Promise<string>;
  previewStatusMove(request: StatusMoveRequestDTO): Promise<StatusMovePreviewDTO>;
  moveStatus(request: StatusMoveRequestDTO): Promise<StatusMoveResultDTO>;
  openInTracker(ticketKey: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  onProgress(listener: (progress: RefreshProgressDTO) => void): Unsubscribe;
  onAttention(listener: (change: AttentionChangeDTO) => void): Unsubscribe;
}
