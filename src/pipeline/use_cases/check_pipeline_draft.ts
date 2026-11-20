import type { PipelineDocumentPort } from "@/pipeline/adapters/pipeline_document_port";
import type { ProjectSourcePort } from "@/pipeline/adapters/project_source_port";
import { InvalidProjectConfigError, PipelineEditError } from "@/pipeline/models/errors";
import { Pipeline, type PipelineColumnDTO } from "@/pipeline/models/pipeline";
import { PipelineDraft, type PipelineDraftDTO } from "@/pipeline/models/pipeline_draft";
import type { PipelineEditDTO, PipelineFileDTO } from "@/pipeline/models/pipeline_edit";
import type { Project } from "@/pipeline/models/project";
import { ProjectDefinition } from "@/pipeline/models/project_definition";
import type { CheckPromptReferences } from "@/pipeline/use_cases/check_prompt_references";

export interface PipelineDraftRequest {
  readonly project: Project;
  readonly file: PipelineFileDTO;
  readonly edits: readonly PipelineEditDTO[];
  readonly boardColumnKeys: readonly string[];
}

export class CheckPipelineDraft {
  readonly #documents: PipelineDocumentPort;
  readonly #projectSource: ProjectSourcePort;
  readonly #checkPromptReferences: CheckPromptReferences;

  constructor(
    documents: PipelineDocumentPort,
    projectSource: ProjectSourcePort,
    checkPromptReferences: CheckPromptReferences,
  ) {
    this.#documents = documents;
    this.#projectSource = projectSource;
    this.#checkPromptReferences = checkPromptReferences;
  }

  execute(request: PipelineDraftRequest): PipelineDraftDTO {
    const problems: string[] = [];
    const edited = this.#editedText(request);
    const text = edited.text;
    const columns = this.#columns(request.project.projectKey, text, problems);
    if (columns !== null) {
      problems.push(...this.#ruleProblems(request, columns));
    }
    return {
      hash: request.file.hash,
      text,
      columns,
      problems: problems.map((problem) => PipelineDraft.problem(problem)),
      snippets: this.#documents.blockSnippets(text),
      editFailure: edited.failure,
    };
  }

  #editedText(request: PipelineDraftRequest): { readonly text: string; readonly failure: string | null } {
    try {
      return { text: this.#documents.apply(request.file.text, request.edits), failure: null };
    } catch (error) {
      if (error instanceof PipelineEditError) {
        return { text: request.file.text, failure: error.message };
      }
      throw error;
    }
  }

  #columns(projectKey: string, text: string, problems: string[]): readonly PipelineColumnDTO[] | null {
    try {
      return this.#projectSource.pipelineColumnsFromText(projectKey, text);
    } catch (error) {
      if (error instanceof InvalidProjectConfigError) {
        problems.push(...error.problems);
        return null;
      }
      throw error;
    }
  }

  #ruleProblems(request: PipelineDraftRequest, columns: readonly PipelineColumnDTO[]): readonly string[] {
    const ruleProblems = [
      ...Pipeline.problemsOf({ columns }).map((problem) => `pipeline.yaml: ${problem}`),
      ...PipelineDraft.boardProblems(columns, request.boardColumnKeys),
    ];
    if (ruleProblems.length > 0) {
      return ruleProblems;
    }
    const pipeline = Pipeline.create({ columns });
    try {
      ProjectDefinition.combine(request.project, pipeline);
    } catch (error) {
      if (!(error instanceof InvalidProjectConfigError)) {
        throw error;
      }
      return error.problems;
    }
    return this.#checkPromptReferences.execute(request.project.projectKey, pipeline);
  }
}
