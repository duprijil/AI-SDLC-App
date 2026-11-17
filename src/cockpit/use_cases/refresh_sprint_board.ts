import { SprintBoard } from "@/cockpit/models/sprint_board";
import type { ProjectDefinition } from "@/pipeline/models/project_definition";
import { SprintCacheError, TicketError } from "@/ticket/models/errors";
import { SprintQuery } from "@/ticket/models/sprint_query";
import type { SprintSnapshot } from "@/ticket/models/sprint_snapshot";
import type { FetchSprint } from "@/ticket/use_cases/fetch_sprint";
import type { ReadCachedSprint } from "@/ticket/use_cases/read_cached_sprint";

export class RefreshSprintBoard {
  readonly #fetchSprint: FetchSprint;
  readonly #readCachedSprint: ReadCachedSprint;
  readonly #projectDefinition: ProjectDefinition;

  constructor(fetchSprint: FetchSprint, readCachedSprint: ReadCachedSprint, projectDefinition: ProjectDefinition) {
    this.#fetchSprint = fetchSprint;
    this.#readCachedSprint = readCachedSprint;
    this.#projectDefinition = projectDefinition;
  }

  async execute(): Promise<SprintBoard> {
    const project = this.#projectDefinition.project;
    const query = SprintQuery.create({
      projectKey: project.projectKey,
      boardId: project.tracker.boardId,
      scopeJql: project.tracker.scopeJql,
      hiddenStatusNames: project.tracker.hiddenStatusNames,
    });
    try {
      return this.#compose(await this.#fetchSprint.execute(query), "live");
    } catch (error) {
      if (!(error instanceof TicketError)) {
        throw error;
      }
      return this.#fallback().withFailure(error.message);
    }
  }

  #fallback(): SprintBoard {
    const cachedSnapshot = this.#cachedSnapshot();
    return cachedSnapshot === null
      ? SprintBoard.empty(this.#projectDefinition.project.name)
      : this.#compose(cachedSnapshot, "cache");
  }

  #cachedSnapshot(): SprintSnapshot | null {
    try {
      return this.#readCachedSprint.execute(this.#projectDefinition.project.projectKey);
    } catch (error) {
      if (error instanceof SprintCacheError) {
        return null;
      }
      throw error;
    }
  }

  #compose(snapshot: SprintSnapshot, source: "live" | "cache"): SprintBoard {
    return SprintBoard.compose({
      projectName: this.#projectDefinition.project.name,
      pipeline: this.#projectDefinition.pipeline,
      snapshot,
      source,
    });
  }
}
