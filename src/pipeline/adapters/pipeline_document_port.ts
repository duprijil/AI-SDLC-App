import type { PipelineEditDTO, PipelineFileDTO } from "@/pipeline/models/pipeline_edit";

export interface PipelineDocumentPort {
  read(projectKey: string): PipelineFileDTO;
  write(projectKey: string, text: string): void;
  apply(text: string, edits: readonly PipelineEditDTO[]): string;
  blockSnippets(text: string): Readonly<Record<string, string>>;
}
