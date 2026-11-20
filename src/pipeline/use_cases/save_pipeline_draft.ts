import type { PipelineDocumentPort } from "@/pipeline/adapters/pipeline_document_port";
import { PipelineEditError, PipelineFileChangedError } from "@/pipeline/models/errors";
import type { PipelineDraftDTO } from "@/pipeline/models/pipeline_draft";
import type { PipelineEditDTO } from "@/pipeline/models/pipeline_edit";
import type { Project } from "@/pipeline/models/project";
import type { CheckPipelineDraft } from "@/pipeline/use_cases/check_pipeline_draft";

export interface SavePipelineRequest {
  readonly project: Project;
  readonly expectedHash: string;
  readonly edits: readonly PipelineEditDTO[];
  readonly boardColumnKeys: readonly string[];
}

export class SavePipelineDraft {
  readonly #documents: PipelineDocumentPort;
  readonly #checkPipelineDraft: CheckPipelineDraft;

  constructor(documents: PipelineDocumentPort, checkPipelineDraft: CheckPipelineDraft) {
    this.#documents = documents;
    this.#checkPipelineDraft = checkPipelineDraft;
  }

  execute(request: SavePipelineRequest): PipelineDraftDTO {
    const file = this.#documents.read(request.project.projectKey);
    if (file.hash !== request.expectedHash) {
      throw new PipelineFileChangedError("pipeline.yaml changed outside the app. Reload to see it.");
    }
    const draft = this.#checkPipelineDraft.execute({
      project: request.project,
      file,
      edits: request.edits,
      boardColumnKeys: request.boardColumnKeys,
    });
    if (draft.editFailure !== null || draft.problems.length > 0) {
      const messages = [draft.editFailure ?? "", ...draft.problems.map((problem) => problem.message)];
      throw new PipelineEditError(messages.filter((message) => message !== "").join("\n"));
    }
    this.#documents.write(request.project.projectKey, draft.text);
    return draft;
  }
}
