import type { FlowCachePort } from "@/cockpit/adapters/flow_cache_port";
import { FlowCacheError } from "@/cockpit/models/errors";
import { type ActivityLookup, SprintBoard } from "@/cockpit/models/sprint_board";
import type { TicketFlowDTO } from "@/cockpit/models/ticket_flow";
import type { ProjectDefinition } from "@/pipeline/models/project_definition";
import type { ReadCachedSprint } from "@/ticket/use_cases/read_cached_sprint";

export class ShowCachedSprintBoard {
  readonly #readCachedSprint: ReadCachedSprint;
  readonly #flowCache: FlowCachePort;
  readonly #projectDefinition: ProjectDefinition;

  constructor(readCachedSprint: ReadCachedSprint, flowCache: FlowCachePort, projectDefinition: ProjectDefinition) {
    this.#readCachedSprint = readCachedSprint;
    this.#flowCache = flowCache;
    this.#projectDefinition = projectDefinition;
  }

  execute(activityOf: ActivityLookup): SprintBoard | null {
    const project = this.#projectDefinition.project;
    const snapshot = this.#readCachedSprint.execute(project.projectKey);
    if (snapshot === null) {
      return null;
    }
    const board = SprintBoard.compose({
      projectName: project.name,
      pipeline: this.#projectDefinition.pipeline,
      snapshot,
      source: "cache",
    });
    return board.withFlows(this.#cachedFlows(), activityOf);
  }

  #cachedFlows(): ReadonlyMap<string, TicketFlowDTO> {
    try {
      return this.#flowCache.readAll(this.#projectDefinition.project.projectKey);
    } catch (error) {
      if (error instanceof FlowCacheError) {
        return new Map();
      }
      throw error;
    }
  }
}
