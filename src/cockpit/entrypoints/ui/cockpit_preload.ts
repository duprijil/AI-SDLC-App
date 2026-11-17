import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type { AgentSessionDTO } from "@/session/models/agent_session";
import {
  SESSION_BRIDGE_GLOBAL,
  SESSION_CHANNEL,
  type SessionBridge,
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
  start: async (size) => (await ipcRenderer.invoke(SESSION_CHANNEL.start, size)) as AgentSessionDTO,
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
    subscribe(SESSION_CHANNEL.output, (_event, chunk) => {
      if (typeof chunk === "string") {
        listener(chunk);
      }
    }),
  onStatus: (listener) =>
    subscribe(SESSION_CHANNEL.status, (_event, session) => {
      listener(session as AgentSessionDTO);
    }),
  onExit: (listener) =>
    subscribe(SESSION_CHANNEL.exit, (_event, exitCode) => {
      if (typeof exitCode === "number") {
        listener(exitCode);
      }
    }),
};

export function exposeCockpitBridge(): void {
  contextBridge.exposeInMainWorld(SESSION_BRIDGE_GLOBAL, sessionBridge);
}
