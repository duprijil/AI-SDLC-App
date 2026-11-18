import { CockpitError } from "@/cockpit/models/errors";
import {
  StatusMovePlan,
  type StatusMovePreviewDTO,
  type StatusMoveRequestDTO,
} from "@/cockpit/models/status_move_action";
import { TicketError } from "@/ticket/models/errors";
import { Transition } from "@/ticket/models/transition";
import type { FindStatusTransition } from "@/ticket/use_cases/find_status_transition";
import type { ReadCachedSprint } from "@/ticket/use_cases/read_cached_sprint";

export class PreviewStatusMove {
  readonly #readCachedSprint: ReadCachedSprint;
  readonly #findStatusTransition: FindStatusTransition;
  readonly #projectKey: string;

  constructor(readCachedSprint: ReadCachedSprint, findStatusTransition: FindStatusTransition, projectKey: string) {
    this.#readCachedSprint = readCachedSprint;
    this.#findStatusTransition = findStatusTransition;
    this.#projectKey = projectKey;
  }

  async execute(request: StatusMoveRequestDTO): Promise<StatusMovePreviewDTO> {
    const plan = StatusMovePlan.resolve(this.#readCachedSprint.execute(this.#projectKey), request);
    const preview = {
      ticketKey: plan.target.ticketKey,
      direction: plan.direction,
      fromStatusName: plan.fromStatusName,
      toColumnName: plan.target.targetColumnName,
    };
    try {
      const found = await this.#findStatusTransition.execute(plan.target);
      return { ...preview, transitionLabel: Transition.create(found.transition).label(), refusal: null };
    } catch (error) {
      if (error instanceof TicketError || error instanceof CockpitError) {
        return { ...preview, transitionLabel: null, refusal: error.message };
      }
      throw error;
    }
  }
}
