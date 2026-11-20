import type { PipelineColumnDTO } from "@/pipeline/models/pipeline";

export interface DraftProblemDTO {
  readonly blockId: string | null;
  readonly message: string;
}

export interface PipelineDraftDTO {
  readonly hash: string;
  readonly text: string;
  readonly columns: readonly PipelineColumnDTO[] | null;
  readonly problems: readonly DraftProblemDTO[];
  readonly snippets: Readonly<Record<string, string>>;
  readonly editFailure: string | null;
}

const BLOCK_PATTERN = /block ([a-z][a-z0-9_]*)/;

export const PipelineDraft = {
  problem(message: string): DraftProblemDTO {
    return { blockId: BLOCK_PATTERN.exec(message)?.[1] ?? null, message };
  },

  boardProblems(columns: readonly PipelineColumnDTO[], boardColumnKeys: readonly string[]): readonly string[] {
    return columns
      .filter((column) => !boardColumnKeys.includes(column.columnKey))
      .map(
        (column) =>
          `pipeline.yaml: columns.${column.columnKey}: the board has no such column (board columns: ${boardColumnKeys.join(", ")})`,
      );
  },
};
