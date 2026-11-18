import type { TrackerPort } from "@/ticket/adapters/tracker_port";
import type { StatusMoveTargetDTO } from "@/ticket/models/status_move";
import type { TransitionDTO } from "@/ticket/models/transition";
import type { FindStatusTransition } from "@/ticket/use_cases/find_status_transition";

export class MoveTicket {
  readonly #tracker: TrackerPort;
  readonly #findStatusTransition: FindStatusTransition;

  constructor(tracker: TrackerPort, findStatusTransition: FindStatusTransition) {
    this.#tracker = tracker;
    this.#findStatusTransition = findStatusTransition;
  }

  async execute(target: StatusMoveTargetDTO): Promise<TransitionDTO> {
    const { transition } = await this.#findStatusTransition.execute(target);
    await this.#tracker.transition(target.ticketKey, transition.transitionId);
    return transition;
  }
}
