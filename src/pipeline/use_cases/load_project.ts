import type { ProjectSourcePort } from "@/pipeline/adapters/project_source_port";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";
import type { Pipeline } from "@/pipeline/models/pipeline";
import type { Project } from "@/pipeline/models/project";
import { ProjectDefinition } from "@/pipeline/models/project_definition";

export class LoadProject {
  readonly #projectSource: ProjectSourcePort;

  constructor(projectSource: ProjectSourcePort) {
    this.#projectSource = projectSource;
  }

  execute(projectKey: string): ProjectDefinition {
    const problems: string[] = [];
    const project = this.#collect(() => this.#projectSource.loadProject(projectKey), problems);
    const pipeline = this.#collect(() => this.#projectSource.loadPipeline(projectKey), problems);
    if (project === null || pipeline === null) {
      throw new InvalidProjectConfigError(problems);
    }
    return ProjectDefinition.combine(project, pipeline);
  }

  #collect<Loaded extends Project | Pipeline>(load: () => Loaded, problems: string[]): Loaded | null {
    try {
      return load();
    } catch (error) {
      if (error instanceof InvalidProjectConfigError) {
        problems.push(...error.problems);
        return null;
      }
      throw error;
    }
  }
}
