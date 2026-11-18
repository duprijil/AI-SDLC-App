import type { TrackerPort } from "@/ticket/adapters/tracker_port";
import { StatusMove, type StatusMoveTargetDTO } from "@/ticket/models/status_move";
import type { TicketDTO } from "@/ticket/models/ticket";
import type { TransitionDTO } from "@/ticket/models/transition";

export interface StatusTransitionDTO {
  readonly ticket: TicketDTO;
  readonly transition: TransitionDTO;
}

export class FindStatusTransition {
  readonly #tracker: TrackerPort;

  constructor(tracker: TrackerPort) {
    this.#tracker = tracker;
  }

  async execute(target: StatusMoveTargetDTO): Promise<StatusTransitionDTO> {
    const [ticket, transitions] = await Promise.all([
      this.#tracker.ticket(target.ticketKey),
      this.#tracker.transitions(target.ticketKey),
    ]);
    StatusMove.ensureUnchanged(ticket, target);
    return { ticket: ticket.toDTO(), transition: StatusMove.pick(transitions, target).toDTO() };
  }
}
