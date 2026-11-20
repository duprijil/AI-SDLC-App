import type { AttentionKind } from "@/cockpit/models/attention";
import type { AttestTickRequestDTO } from "@/cockpit/models/attest_action";
import type { ChangeActionDTO, ChangeActionResultDTO } from "@/cockpit/models/change_action";
import type { CheckpointRequestDTO } from "@/cockpit/models/checkpoint_action";
import type {
  PipelineCheckRequestDTO,
  PipelineEditorDTO,
  PipelineSaveRequestDTO,
  PipelineSaveResultDTO,
} from "@/cockpit/models/pipeline_editor";
import type { PromptRequestDTO } from "@/cockpit/models/prompt_request";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { SprintBoardDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";
import type {
  StatusMovePreviewDTO,
  StatusMoveRequestDTO,
  StatusMoveResultDTO,
} from "@/cockpit/models/status_move_action";
import type { PipelineDraftDTO } from "@/pipeline/models/pipeline_draft";
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
  attestTick: "attest:tick",
  checkpoint: "prompt:checkpoint",
  writeDefaultPrompts: "prompts:write-defaults",
  card: "board:card",
  pipelineOpen: "pipeline:open",
  pipelineCheck: "pipeline:check",
  pipelineSave: "pipeline:save",
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
  buildPrompt(request: PromptRequestDTO): Promise<readonly string[]>;
  recordCheckpoint(request: CheckpointRequestDTO): Promise<ChangeActionResultDTO>;
  writeDefaultPrompts(): Promise<readonly string[]>;
  openPipeline(): Promise<PipelineEditorDTO>;
  checkPipeline(request: PipelineCheckRequestDTO): Promise<PipelineDraftDTO>;
  savePipeline(request: PipelineSaveRequestDTO): Promise<PipelineSaveResultDTO>;
  previewStatusMove(request: StatusMoveRequestDTO): Promise<StatusMovePreviewDTO>;
  moveStatus(request: StatusMoveRequestDTO): Promise<StatusMoveResultDTO>;
  tickAttestation(request: AttestTickRequestDTO): Promise<ChangeActionResultDTO>;
  openInTracker(ticketKey: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  onProgress(listener: (progress: RefreshProgressDTO) => void): Unsubscribe;
  onAttention(listener: (change: AttentionChangeDTO) => void): Unsubscribe;
  onCard(listener: (card: TicketCardDTO) => void): Unsubscribe;
}
