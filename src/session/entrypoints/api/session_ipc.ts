import { ipcMain, type WebContents } from "electron";

import { readTerminalSize, readText } from "@/session/entrypoints/api/ipc_payload";
import type { SessionContainer } from "@/session/entrypoints/container";
import type { AgentSessionDTO } from "@/session/models/agent_session";
import type { HookEndpoint } from "@/session/models/hook_endpoint";
import { SESSION_CHANNEL, type SessionExitDTO, type SessionOutputDTO } from "@/session/models/session_bridge";
import { TerminalSize } from "@/session/models/terminal_size";

export type PrepareWorkspace = (ticketKey: string) => Promise<readonly string[]>;

export interface SessionIpcOptions {
  readonly container: SessionContainer;
  readonly hookEndpoint: HookEndpoint;
  readonly prepareWorkspace: PrepareWorkspace;
}

const PREPARE_TIMEOUT_MILLISECONDS = 60_000;
const NOTE_STYLE = "\u001b[33m";
const RESET_STYLE = "\u001b[0m";

async function preparationNotes(prepareWorkspace: PrepareWorkspace, ticketKey: string): Promise<readonly string[]> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<readonly string[]>((resolveNotes) => {
    timer = setTimeout(() => {
      resolveNotes([
        `The workspace took over ${String(PREPARE_TIMEOUT_MILLISECONDS / 1000)} s to prepare; starting with what's ready.`,
      ]);
    }, PREPARE_TIMEOUT_MILLISECONDS);
  });
  try {
    return await Promise.race([prepareWorkspace(ticketKey), timeout]);
  } catch (error) {
    return [`The workspace could not be prepared: ${error instanceof Error ? error.message : "unknown"}`];
  } finally {
    clearTimeout(timer);
  }
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
  const preparing = new Map<string, Promise<readonly string[]>>();
  const prepareOnce = async (ticketKey: string): Promise<readonly string[]> => {
    const running = preparing.get(ticketKey);
    if (running !== undefined) {
      await running;
      return [];
    }
    const pending = preparationNotes(options.prepareWorkspace, ticketKey).finally(() => {
      preparing.delete(ticketKey);
    });
    preparing.set(ticketKey, pending);
    return pending;
  };

  ipcMain.handle(SESSION_CHANNEL.start, async (event, ticketKeyPayload: unknown, sizePayload: unknown) => {
    const ticketKey = readText(ticketKeyPayload, "ticketKey");
    const size = TerminalSize.create(readTerminalSize(sizePayload));
    if (options.container.findTicketSession().execute(ticketKey) === null) {
      const notes = await prepareOnce(ticketKey);
      for (const note of notes) {
        const output: SessionOutputDTO = { ticketKey, chunk: `${NOTE_STYLE}${note}${RESET_STYLE}\r\n` };
        sendToRenderer(event.sender, SESSION_CHANNEL.output, output);
      }
    }
    const session = options.container.startAgentSession().execute({
      ticketKey,
      hookEndpoint: options.hookEndpoint,
      size,
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
    const started: AgentSessionDTO = session.toDTO();
    return started;
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
