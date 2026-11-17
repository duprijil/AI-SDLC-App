import type { Board } from "@/ticket/models/board";
import type { Ticket } from "@/ticket/models/ticket";

export interface TrackerPort {
  boardColumns(boardId: number): Promise<Board>;
  sprintTickets(scopeJql: string): Promise<readonly Ticket[]>;
}
