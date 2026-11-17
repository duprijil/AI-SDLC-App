import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";

export const SPRINT_BOARD_BRIDGE_GLOBAL = "cockpitBoard";

export const SPRINT_BOARD_CHANNEL = Object.freeze({
  cached: "board:cached",
  refresh: "board:refresh",
  openInTracker: "board:open-in-tracker",
});

export interface SprintBoardBridge {
  cached(): Promise<SprintBoardDTO | null>;
  refresh(): Promise<SprintBoardDTO>;
  openInTracker(ticketKey: string): Promise<void>;
}
