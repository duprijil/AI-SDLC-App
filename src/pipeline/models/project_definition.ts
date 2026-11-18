import { ensure } from "@/core/models/invariant";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";
import type { Pipeline } from "@/pipeline/models/pipeline";
import type { Project } from "@/pipeline/models/project";

export class ProjectDefinition {
  readonly project: Project;
  readonly pipeline: Pipeline;

  private constructor(project: Project, pipeline: Pipeline) {
    this.project = project;
    this.pipeline = pipeline;
  }

  static combine(project: Project, pipeline: Pipeline): ProjectDefinition {
    const environmentNames = project.environmentNames();
    const problems = pipeline
      .environmentBlocks()
      .filter((block) => block.envName !== null && !environmentNames.has(block.envName))
      .map(
        (block) => `pipeline.yaml: block ${block.blockId}: env ${block.envName ?? ""} is on no repo in project.yaml`,
      );
    ensure(problems.length === 0, () => new InvalidProjectConfigError(problems));
    return new ProjectDefinition(project, pipeline);
  }
}
