import type { Board } from "@/ticket/models/board";
import type { Ticket } from "@/ticket/models/ticket";
import type { Transition } from "@/ticket/models/transition";

export interface TrackerPort {
  boardColumns(boardId: number): Promise<Board>;
  sprintTickets(scopeJql: string): Promise<readonly Ticket[]>;
  ticket(ticketKey: string): Promise<Ticket>;
  transitions(ticketKey: string): Promise<readonly Transition[]>;
  transition(ticketKey: string, transitionId: string): Promise<void>;
}
