import { ipcMain, shell } from "electron";

import type { CockpitContainer } from "@/cockpit/entrypoints/container";
import { CockpitConfigurationError } from "@/cockpit/models/errors";
import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";
import { SPRINT_BOARD_CHANNEL } from "@/cockpit/models/sprint_board_bridge";
import { readText } from "@/session/entrypoints/api/ipc_payload";
import { SprintCacheError } from "@/ticket/models/errors";

export interface CockpitIpcOptions {
  readonly container: CockpitContainer;
  readonly onConfigurationProblems: (problems: readonly string[]) => void;
}

export function registerCockpitIpc(options: CockpitIpcOptions): void {
  const logger = options.container.logger("cockpit.cockpit_ipc");

  const reportConfiguration = (error: unknown): void => {
    if (error instanceof CockpitConfigurationError) {
      options.onConfigurationProblems(error.problems);
    }
  };

  ipcMain.handle(SPRINT_BOARD_CHANNEL.cached, (): SprintBoardDTO | null => {
    try {
      return options.container.showCachedSprintBoard().execute()?.toDTO() ?? null;
    } catch (error) {
      if (error instanceof SprintCacheError) {
        logger.error("Sprint cache ignored", { reason: error.message });
        return null;
      }
      reportConfiguration(error);
      throw error;
    }
  });

  ipcMain.handle(SPRINT_BOARD_CHANNEL.refresh, async (): Promise<SprintBoardDTO> => {
    try {
      const board = await options.container.refreshSprintBoard().execute();
      const boardView = board.toDTO();
      if (boardView.failure !== null) {
        logger.error("Sprint refresh failed", { reason: boardView.failure });
      }
      return boardView;
    } catch (error) {
      reportConfiguration(error);
      throw error;
    }
  });

  ipcMain.handle(SPRINT_BOARD_CHANNEL.openInTracker, async (_event, ticketKeyPayload: unknown): Promise<void> => {
    await shell.openExternal(options.container.trackerBrowseUrl(readText(ticketKeyPayload, "ticketKey")));
  });
}
