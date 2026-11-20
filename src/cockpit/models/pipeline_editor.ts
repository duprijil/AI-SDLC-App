import type { PipelineDraftDTO } from "@/pipeline/models/pipeline_draft";
import type { PipelineEditDTO } from "@/pipeline/models/pipeline_edit";
import type { EnvironmentSettingsDTO, Project } from "@/pipeline/models/project";

export interface EditorColumnDTO {
  readonly columnKey: string;
  readonly name: string;
}

export interface EnvironmentRowDTO {
  readonly repoName: string;
  readonly cells: Readonly<Record<string, string>>;
}

export interface PipelineEditorDTO {
  readonly filePath: string;
  readonly boardId: number;
  readonly columns: readonly EditorColumnDTO[];
  readonly envNames: readonly string[];
  readonly environments: readonly EnvironmentRowDTO[];
  readonly promptTemplates: readonly string[];
  readonly draft: PipelineDraftDTO;
}

export interface PipelineCheckRequestDTO {
  readonly edits: readonly PipelineEditDTO[];
}

export interface PipelineSaveRequestDTO {
  readonly expectedHash: string;
  readonly edits: readonly PipelineEditDTO[];
}

export interface PipelineSaveResultDTO {
  readonly failure: string | null;
  readonly hasChangedOnDisk: boolean;
  readonly draft: PipelineDraftDTO | null;
}

const describe = (environment: EnvironmentSettingsDTO): string => {
  switch (environment.delivery) {
    case "github_actions":
      return `GH Actions · ${environment.workflow}`;
    case "manual":
      return environment.promoteLink === null ? "manual" : "manual · promote link";
    case "none":
      return "— (n/a)";
  }
};

export const PipelineEditor = {
  environmentRows(project: Project): readonly EnvironmentRowDTO[] {
    return project.repos.map((repo) => ({
      repoName: repo.name,
      cells: Object.fromEntries(
        Object.entries(repo.environments).map(([envName, environment]) => [envName, describe(environment)]),
      ),
    }));
  },
};
