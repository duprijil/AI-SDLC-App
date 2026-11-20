import type { ProjectSourcePort } from "@/pipeline/adapters/project_source_port";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";
import type { Pipeline } from "@/pipeline/models/pipeline";
import type { Project } from "@/pipeline/models/project";
import { ProjectDefinition } from "@/pipeline/models/project_definition";
import type { CheckPromptReferences } from "@/pipeline/use_cases/check_prompt_references";

export class LoadProject {
  readonly #projectSource: ProjectSourcePort;
  readonly #checkPromptReferences: CheckPromptReferences;

  constructor(projectSource: ProjectSourcePort, checkPromptReferences: CheckPromptReferences) {
    this.#projectSource = projectSource;
    this.#checkPromptReferences = checkPromptReferences;
  }

  execute(projectKey: string): ProjectDefinition {
    const problems: string[] = [];
    const project = this.#collect(() => this.#projectSource.loadProject(projectKey), problems);
    const pipeline = this.#collect(() => this.#projectSource.loadPipeline(projectKey), problems);
    if (project === null || pipeline === null) {
      throw new InvalidProjectConfigError(problems);
    }
    const definition = ProjectDefinition.combine(project, pipeline);
    const templateProblems = this.#checkPromptReferences.execute(projectKey, pipeline);
    if (templateProblems.length > 0) {
      throw new InvalidProjectConfigError(templateProblems);
    }
    return definition;
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
