import { ipcMain, type WebContents } from "electron";

import { readTerminalSize, readText } from "@/session/entrypoints/api/ipc_payload";
import type { SessionContainer } from "@/session/entrypoints/container";
import type { AgentSessionDTO } from "@/session/models/agent_session";
import type { HookEndpoint } from "@/session/models/hook_endpoint";
import { SESSION_CHANNEL, type SessionExitDTO, type SessionOutputDTO } from "@/session/models/session_bridge";
import { TerminalSize } from "@/session/models/terminal_size";

export interface SessionIpcOptions {
  readonly container: SessionContainer;
  readonly hookEndpoint: HookEndpoint;
}

const sendToRenderer = (webContents: WebContents, channel: string, payload: unknown): void => {
  if (!webContents.isDestroyed()) {
    webContents.send(channel, payload);
  }
};

export function publishSessionStatus(webContents: WebContents, session: AgentSessionDTO): void {
  sendToRenderer(webContents, SESSION_CHANNEL.status, session);
}

export function registerSessionIpc(options: SessionIpcOptions): void {
  const logger = options.container.logger("session.session_ipc");

  ipcMain.handle(SESSION_CHANNEL.start, (event, ticketKeyPayload: unknown, sizePayload: unknown): AgentSessionDTO => {
    const ticketKey = readText(ticketKeyPayload, "ticketKey");
    const session = options.container.startAgentSession().execute({
      ticketKey,
      hookEndpoint: options.hookEndpoint,
      size: TerminalSize.create(readTerminalSize(sizePayload)),
      listener: {
        onOutput: (chunk) => {
          const output: SessionOutputDTO = { ticketKey, chunk };
          sendToRenderer(event.sender, SESSION_CHANNEL.output, output);
        },
        onExit: (exitCode) => {
          logger.info("Agent session exited", { ticketKey, exitCode });
          const exit: SessionExitDTO = { ticketKey, exitCode };
          sendToRenderer(event.sender, SESSION_CHANNEL.exit, exit);
        },
      },
    });
    logger.info("Agent session ready", { sessionId: session.sessionId, ticketKey: session.ticketKey });
    return session.toDTO();
  });

  ipcMain.on(SESSION_CHANNEL.input, (_event, sessionIdPayload: unknown, keystrokesPayload: unknown) => {
    options.container.sendTerminalInput().execute({
      sessionId: readText(sessionIdPayload, "sessionId"),
      keystrokes: readText(keystrokesPayload, "keystrokes"),
    });
  });

  ipcMain.on(SESSION_CHANNEL.resize, (_event, sessionIdPayload: unknown, sizePayload: unknown) => {
    options.container.resizeTerminal().execute({
      sessionId: readText(sessionIdPayload, "sessionId"),
      size: TerminalSize.create(readTerminalSize(sizePayload)),
    });
  });

  ipcMain.handle(SESSION_CHANNEL.prompt, (_event, sessionIdPayload: unknown, promptPayload: unknown): void => {
    options.container.sendAgentPrompt().execute({
      sessionId: readText(sessionIdPayload, "sessionId"),
      promptText: readText(promptPayload, "promptText"),
    });
  });
}
