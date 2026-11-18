import { StatusNotReachableError, TicketStatusChangedError } from "@/ticket/models/errors";
import type { Ticket } from "@/ticket/models/ticket";
import type { Transition } from "@/ticket/models/transition";

export interface StatusMoveTargetDTO {
  readonly ticketKey: string;
  readonly expectedStatusId: string;
  readonly targetColumnName: string;
  readonly targetStatusIds: readonly string[];
}

export const StatusMove = {
  ensureUnchanged(ticket: Ticket, target: StatusMoveTargetDTO): void {
    if (ticket.statusId !== target.expectedStatusId) {
      throw new TicketStatusChangedError(ticket.ticketKey, ticket.statusName);
    }
  },

  pick(transitions: readonly Transition[], target: StatusMoveTargetDTO): Transition {
    for (const statusId of target.targetStatusIds) {
      const transition = transitions.find((candidate) => candidate.targetStatusId === statusId);
      if (transition !== undefined) {
        return transition;
      }
    }
    throw new StatusNotReachableError(
      target.ticketKey,
      target.targetColumnName,
      transitions.map((transition) => transition.label()),
    );
  },
};
