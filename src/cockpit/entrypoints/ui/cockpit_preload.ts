import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type { ChangeActionResultDTO } from "@/cockpit/models/change_action";
import type { PipelineEditorDTO, PipelineSaveResultDTO } from "@/cockpit/models/pipeline_editor";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { SprintBoardDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";
import {
  type AttentionChangeDTO,
  SPRINT_BOARD_BRIDGE_GLOBAL,
  SPRINT_BOARD_CHANNEL,
  type SprintBoardBridge,
  type TicketRefreshDTO,
} from "@/cockpit/models/sprint_board_bridge";
import type { StatusMovePreviewDTO, StatusMoveResultDTO } from "@/cockpit/models/status_move_action";
import type { PipelineDraftDTO } from "@/pipeline/models/pipeline_draft";
import type { AgentSessionDTO } from "@/session/models/agent_session";
import {
  SESSION_BRIDGE_GLOBAL,
  SESSION_CHANNEL,
  type SessionBridge,
  type SessionExitDTO,
  type SessionOutputDTO,
  type Unsubscribe,
} from "@/session/models/session_bridge";

type ChannelForward = (event: IpcRendererEvent, payload: unknown) => void;

function subscribe(channel: string, forward: ChannelForward): Unsubscribe {
  ipcRenderer.on(channel, forward);
  return () => {
    ipcRenderer.removeListener(channel, forward);
  };
}

const sessionBridge: SessionBridge = {
  start: async (ticketKey, size) =>
    (await ipcRenderer.invoke(SESSION_CHANNEL.start, ticketKey, size)) as AgentSessionDTO,
  sendInput: (sessionId, keystrokes) => {
    ipcRenderer.send(SESSION_CHANNEL.input, sessionId, keystrokes);
  },
  resize: (sessionId, size) => {
    ipcRenderer.send(SESSION_CHANNEL.resize, sessionId, size);
  },
  sendPrompt: async (sessionId, promptText) => {
    await ipcRenderer.invoke(SESSION_CHANNEL.prompt, sessionId, promptText);
  },
  onOutput: (listener) =>
    subscribe(SESSION_CHANNEL.output, (_event, output) => {
      listener(output as SessionOutputDTO);
    }),
  onStatus: (listener) =>
    subscribe(SESSION_CHANNEL.status, (_event, session) => {
      listener(session as AgentSessionDTO);
    }),
  onExit: (listener) =>
    subscribe(SESSION_CHANNEL.exit, (_event, exit) => {
      listener(exit as SessionExitDTO);
    }),
};

const sprintBoardBridge: SprintBoardBridge = {
  cached: async () => (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.cached)) as SprintBoardDTO | null,
  refreshAll: async () => (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.refreshAll)) as SprintBoardDTO,
  refreshTicket: async (ticketKey) =>
    (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.refreshTicket, ticketKey)) as TicketRefreshDTO,
  runChangeAction: async (ticketKey, action) =>
    (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.changeAction, ticketKey, action)) as ChangeActionResultDTO,
  buildPrompt: async (request) =>
    (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.changePrompt, request)) as readonly string[],
  recordCheckpoint: async (request) =>
    (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.checkpoint, request)) as ChangeActionResultDTO,
  openPipeline: async () => (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.pipelineOpen)) as PipelineEditorDTO,
  checkPipeline: async (request) =>
    (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.pipelineCheck, request)) as PipelineDraftDTO,
  savePipeline: async (request) =>
    (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.pipelineSave, request)) as PipelineSaveResultDTO,
  writeDefaultPrompts: async () =>
    (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.writeDefaultPrompts)) as readonly string[],
  previewStatusMove: async (request) =>
    (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.movePreview, request)) as StatusMovePreviewDTO,
  moveStatus: async (request) => (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.move, request)) as StatusMoveResultDTO,
  tickAttestation: async (request) =>
    (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.attestTick, request)) as ChangeActionResultDTO,
  openInTracker: async (ticketKey) => {
    await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.openInTracker, ticketKey);
  },
  openExternal: async (url) => {
    await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.openExternal, url);
  },
  onProgress: (listener) =>
    subscribe(SPRINT_BOARD_CHANNEL.progress, (_event, progress) => {
      listener(progress as RefreshProgressDTO);
    }),
  onCard: (listener) =>
    subscribe(SPRINT_BOARD_CHANNEL.card, (_event, card) => {
      listener(card as TicketCardDTO);
    }),
  onAttention: (listener) =>
    subscribe(SPRINT_BOARD_CHANNEL.attention, (_event, change) => {
      listener(change as AttentionChangeDTO);
    }),
};

export function exposeCockpitBridge(): void {
  contextBridge.exposeInMainWorld(SESSION_BRIDGE_GLOBAL, sessionBridge);
  contextBridge.exposeInMainWorld(SPRINT_BOARD_BRIDGE_GLOBAL, sprintBoardBridge);
}
