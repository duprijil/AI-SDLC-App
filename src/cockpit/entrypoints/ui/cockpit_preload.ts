import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";
import {
  SPRINT_BOARD_BRIDGE_GLOBAL,
  SPRINT_BOARD_CHANNEL,
  type SprintBoardBridge,
} from "@/cockpit/models/sprint_board_bridge";
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
  refresh: async () => (await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.refresh)) as SprintBoardDTO,
  openInTracker: async (ticketKey) => {
    await ipcRenderer.invoke(SPRINT_BOARD_CHANNEL.openInTracker, ticketKey);
  },
};

export function exposeCockpitBridge(): void {
  contextBridge.exposeInMainWorld(SESSION_BRIDGE_GLOBAL, sessionBridge);
  contextBridge.exposeInMainWorld(SPRINT_BOARD_BRIDGE_GLOBAL, sprintBoardBridge);
}
