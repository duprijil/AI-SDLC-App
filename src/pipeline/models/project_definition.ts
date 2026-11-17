import type { Pipeline } from "@/pipeline/models/pipeline";
import type { Project } from "@/pipeline/models/project";

export class ProjectDefinition {
  readonly project: Project;
  readonly pipeline: Pipeline;

  constructor(project: Project, pipeline: Pipeline) {
    this.project = project;
    this.pipeline = pipeline;
  }
}
