import { ipcMain, shell, type WebContents } from "electron";

import { ChangeError } from "@/change/models/errors";
import {
  readChangeAction,
  readGithubUrl,
  readPromptRequest,
  readStatusMoveRequest,
} from "@/cockpit/entrypoints/api/cockpit_payload";
import type { CockpitContainer } from "@/cockpit/entrypoints/container";
import type { ChangeActionResultDTO } from "@/cockpit/models/change_action";
import { CockpitConfigurationError } from "@/cockpit/models/errors";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";
import {
  type AttentionChangeDTO,
  SPRINT_BOARD_CHANNEL,
  type TicketRefreshDTO,
} from "@/cockpit/models/sprint_board_bridge";
import type { StatusMovePreviewDTO, StatusMoveResultDTO } from "@/cockpit/models/status_move_action";
import { readText } from "@/session/entrypoints/api/ipc_payload";
import type { AgentSessionDTO } from "@/session/models/agent_session";
import { SprintCacheError } from "@/ticket/models/errors";

export interface CockpitIpcOptions {
  readonly container: CockpitContainer;
  readonly onConfigurationProblems: (problems: readonly string[]) => void;
}

const sendToRenderer = (webContents: WebContents, channel: string, payload: unknown): void => {
  if (!webContents.isDestroyed()) {
    webContents.send(channel, payload);
  }
};

export function publishAttention(
  webContents: WebContents,
  container: CockpitContainer,
  session: AgentSessionDTO,
): void {
  const change: AttentionChangeDTO = {
    ticketKey: session.ticketKey,
    attention: container.reassessAttention().execute(session),
  };
  sendToRenderer(webContents, SPRINT_BOARD_CHANNEL.attention, change);
}

async function refreshTicket(
  container: CockpitContainer,
  ticketKey: string,
  webContents: WebContents,
): Promise<TicketRefreshDTO> {
  const activityOf = (key: string): ReturnType<CockpitContainer["agentActivityOf"]> => container.agentActivityOf(key);
  const board = container.showCachedSprintBoard().execute(activityOf);
  if (board === null) {
    return { card: null, codeHostFailure: null };
  }
  const result = await container.refreshTicketFlows().execute({
    board: board.toDTO(),
    ticketKeys: [ticketKey],
    onProgress: (progress: RefreshProgressDTO) => {
      sendToRenderer(webContents, SPRINT_BOARD_CHANNEL.progress, progress);
    },
  });
  return {
    card: board.withFlows(result.flows, activityOf).cardFor(ticketKey),
    codeHostFailure: result.codeHostFailure,
  };
}

export function registerCockpitIpc(options: CockpitIpcOptions): void {
  const container = options.container;
  const logger = container.logger("cockpit.cockpit_ipc");
  const activityOf = (key: string): ReturnType<CockpitContainer["agentActivityOf"]> => container.agentActivityOf(key);

  const reportConfiguration = (error: unknown): void => {
    if (error instanceof CockpitConfigurationError) {
      options.onConfigurationProblems(error.problems);
    }
  };

  ipcMain.handle(SPRINT_BOARD_CHANNEL.cached, (): SprintBoardDTO | null => {
    try {
      return container.showCachedSprintBoard().execute(activityOf)?.toDTO() ?? null;
    } catch (error) {
      if (error instanceof SprintCacheError) {
        logger.error("Sprint cache ignored", { reason: error.message });
        return null;
      }
      reportConfiguration(error);
      throw error;
    }
  });

  ipcMain.handle(SPRINT_BOARD_CHANNEL.refreshAll, async (event): Promise<SprintBoardDTO> => {
    try {
      const board = await container.refreshSprintBoard().execute();
      const result = await container.refreshTicketFlows().execute({
        board: board.toDTO(),
        ticketKeys: board.ticketKeys(),
        onProgress: (progress) => {
          sendToRenderer(event.sender, SPRINT_BOARD_CHANNEL.progress, progress);
        },
      });
      if (result.codeHostFailure !== null) {
        logger.error("GitHub refresh failed", { reason: result.codeHostFailure });
      }
      return board.withFlows(result.flows, activityOf).withCodeHostFailure(result.codeHostFailure).toDTO();
    } catch (error) {
      reportConfiguration(error);
      throw error;
    }
  });

  ipcMain.handle(SPRINT_BOARD_CHANNEL.refreshTicket, async (event, ticketKeyPayload: unknown) =>
    refreshTicket(container, readText(ticketKeyPayload, "ticketKey"), event.sender),
  );

  ipcMain.handle(
    SPRINT_BOARD_CHANNEL.changeAction,
    async (event, ticketKeyPayload: unknown, actionPayload: unknown): Promise<ChangeActionResultDTO> => {
      const ticketKey = readText(ticketKeyPayload, "ticketKey");
      let failure: string | null = null;
      try {
        await container.runChangeAction().execute(readChangeAction(actionPayload));
      } catch (error) {
        if (!(error instanceof ChangeError)) {
          throw error;
        }
        failure = error.message;
        logger.error("Change action refused", { ticketKey, reason: failure });
      }
      const refreshed = await refreshTicket(container, ticketKey, event.sender);
      return { failure, card: refreshed.card };
    },
  );

  ipcMain.handle(SPRINT_BOARD_CHANNEL.changePrompt, (_event, requestPayload: unknown): string =>
    container.buildChangePrompt().execute(readPromptRequest(requestPayload)),
  );

  ipcMain.handle(
    SPRINT_BOARD_CHANNEL.movePreview,
    async (_event, requestPayload: unknown): Promise<StatusMovePreviewDTO> =>
      container.previewStatusMove().execute(readStatusMoveRequest(requestPayload)),
  );

  ipcMain.handle(SPRINT_BOARD_CHANNEL.move, async (event, requestPayload: unknown): Promise<StatusMoveResultDTO> => {
    const move = readStatusMoveRequest(requestPayload);
    const result = await container.runStatusMove().execute({
      move,
      activityOf,
      onProgress: (progress) => {
        sendToRenderer(event.sender, SPRINT_BOARD_CHANNEL.progress, progress);
      },
    });
    if (result.failure !== null) {
      logger.error("Status move refused", { ticketKey: move.ticketKey, reason: result.failure });
    }
    return result;
  });

  ipcMain.handle(SPRINT_BOARD_CHANNEL.openInTracker, async (_event, ticketKeyPayload: unknown): Promise<void> => {
    await shell.openExternal(container.trackerBrowseUrl(readText(ticketKeyPayload, "ticketKey")));
  });

  ipcMain.handle(SPRINT_BOARD_CHANNEL.openExternal, async (_event, urlPayload: unknown): Promise<void> => {
    await shell.openExternal(readGithubUrl(urlPayload));
  });
}
