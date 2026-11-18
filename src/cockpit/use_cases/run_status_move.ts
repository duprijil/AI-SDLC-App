import type { FlowCachePort } from "@/cockpit/adapters/flow_cache_port";
import { CockpitError, FlowCacheError } from "@/cockpit/models/errors";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { ActivityLookup, SprintBoard } from "@/cockpit/models/sprint_board";
import {
  StatusMovePlan,
  type StatusMoveRequestDTO,
  type StatusMoveResultDTO,
} from "@/cockpit/models/status_move_action";
import type { TicketFlowDTO } from "@/cockpit/models/ticket_flow";
import type { RefreshSprintBoard } from "@/cockpit/use_cases/refresh_sprint_board";
import type { RefreshTicketFlows } from "@/cockpit/use_cases/refresh_ticket_flows";
import { TicketError, TicketStatusChangedError } from "@/ticket/models/errors";
import type { MoveTicket } from "@/ticket/use_cases/move_ticket";
import type { ReadCachedSprint } from "@/ticket/use_cases/read_cached_sprint";

export interface RunStatusMoveRequest {
  readonly move: StatusMoveRequestDTO;
  readonly activityOf: ActivityLookup;
  readonly onProgress: (progress: RefreshProgressDTO) => void;
}

export interface StatusMoveSteps {
  readonly readCachedSprint: ReadCachedSprint;
  readonly moveTicket: MoveTicket;
  readonly refreshSprintBoard: RefreshSprintBoard;
  readonly refreshTicketFlows: RefreshTicketFlows;
  readonly flowCache: FlowCachePort;
}

export class RunStatusMove {
  readonly #steps: StatusMoveSteps;
  readonly #projectKey: string;

  constructor(steps: StatusMoveSteps, projectKey: string) {
    this.#steps = steps;
    this.#projectKey = projectKey;
  }

  async execute(request: RunStatusMoveRequest): Promise<StatusMoveResultDTO> {
    let failure: string | null = null;
    try {
      const plan = StatusMovePlan.resolve(this.#steps.readCachedSprint.execute(this.#projectKey), request.move);
      await this.#steps.moveTicket.execute(plan.target);
    } catch (error) {
      if (!(error instanceof TicketError || error instanceof CockpitError)) {
        throw error;
      }
      if (!(error instanceof TicketStatusChangedError)) {
        return { failure: error.message, board: null };
      }
      failure = error.message;
    }
    const board = await this.#boardAfterMove(request);
    return { failure, board: board.toDTO() };
  }

  async #boardAfterMove(request: RunStatusMoveRequest): Promise<SprintBoard> {
    const ticketKey = request.move.ticketKey;
    const board = (await this.#steps.refreshSprintBoard.execute()).withFlows(this.#cachedFlows(), request.activityOf);
    if (board.cardFor(ticketKey) === null) {
      return board;
    }
    const result = await this.#steps.refreshTicketFlows.execute({
      board: board.toDTO(),
      ticketKeys: [ticketKey],
      onProgress: request.onProgress,
    });
    return board.withFlows(result.flows, request.activityOf).withCodeHostFailure(result.codeHostFailure);
  }

  #cachedFlows(): ReadonlyMap<string, TicketFlowDTO> {
    try {
      return this.#steps.flowCache.readAll(this.#projectKey);
    } catch (error) {
      if (error instanceof FlowCacheError) {
        return new Map();
      }
      throw error;
    }
  }
}
