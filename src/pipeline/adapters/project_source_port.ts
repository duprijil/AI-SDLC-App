import type { Pipeline, PipelineColumnDTO } from "@/pipeline/models/pipeline";
import type { Project } from "@/pipeline/models/project";

export interface ProjectSourcePort {
  loadProject(projectKey: string): Project;
  loadPipeline(projectKey: string): Pipeline;
  pipelineColumnsFromText(projectKey: string, text: string): readonly PipelineColumnDTO[];
}
