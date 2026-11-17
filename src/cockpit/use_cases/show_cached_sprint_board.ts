import { SprintBoard } from "@/cockpit/models/sprint_board";
import type { ProjectDefinition } from "@/pipeline/models/project_definition";
import type { ReadCachedSprint } from "@/ticket/use_cases/read_cached_sprint";

export class ShowCachedSprintBoard {
  readonly #readCachedSprint: ReadCachedSprint;
  readonly #projectDefinition: ProjectDefinition;

  constructor(readCachedSprint: ReadCachedSprint, projectDefinition: ProjectDefinition) {
    this.#readCachedSprint = readCachedSprint;
    this.#projectDefinition = projectDefinition;
  }

  execute(): SprintBoard | null {
    const project = this.#projectDefinition.project;
    const snapshot = this.#readCachedSprint.execute(project.projectKey);
    if (snapshot === null) {
      return null;
    }
    return SprintBoard.compose({
      projectName: project.name,
      pipeline: this.#projectDefinition.pipeline,
      snapshot,
      source: "cache",
    });
  }
}
