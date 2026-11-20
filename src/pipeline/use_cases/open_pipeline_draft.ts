import type { PipelineDocumentPort } from "@/pipeline/adapters/pipeline_document_port";
import type { PipelineFileDTO } from "@/pipeline/models/pipeline_edit";

export class OpenPipelineDraft {
  readonly #documents: PipelineDocumentPort;

  constructor(documents: PipelineDocumentPort) {
    this.#documents = documents;
  }

  execute(projectKey: string): PipelineFileDTO {
    return this.#documents.read(projectKey);
  }
}
