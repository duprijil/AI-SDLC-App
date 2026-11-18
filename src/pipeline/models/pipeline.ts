import { ensure } from "@/core/models/invariant";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";

export const BLOCK_TYPES = ["change", "deploy", "attest", "tracker", "prompt"] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const CHANGE_CHECKS = ["ready", "merged"] as const;

export type ChangeCheck = (typeof CHANGE_CHECKS)[number];

export interface BlockTemplateDTO {
  readonly blockId: string;
  readonly blockType: BlockType;
  readonly title: string;
  readonly changeCheck: ChangeCheck | null;
  readonly envName: string | null;
  readonly doneWhen: string | null;
}

const ATTESTED_CHECK = "attested";

export interface FlowLevelDTO {
  readonly runsPerChange: boolean;
  readonly blocks: readonly BlockTemplateDTO[];
}

export interface PipelineColumnDTO {
  readonly columnKey: string;
  readonly levels: readonly FlowLevelDTO[];
}

export interface PipelineDTO {
  readonly columns: readonly PipelineColumnDTO[];
}

const SNAKE_CASE_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

const duplicatesOf = (names: readonly string[]): readonly string[] => [
  ...new Set(names.filter((name, index) => names.indexOf(name) !== index)),
];

function levelProblems(column: PipelineColumnDTO): readonly string[] {
  return column.levels.flatMap((level, levelIndex) => {
    const levelPath = `columns.${column.columnKey}.flow.${String(levelIndex)}`;
    if (level.blocks.length === 0) {
      return [`${levelPath}: a level needs at least one block`];
    }
    if (level.runsPerChange && level.blocks.length !== 1) {
      return [`${levelPath}: an each_change level has exactly one block`];
    }
    return [];
  });
}

function changeCheckProblems(column: PipelineColumnDTO): readonly string[] {
  return column.levels.flatMap((level) =>
    level.blocks.flatMap((block) => {
      const blockPath = `columns.${column.columnKey}: block ${block.blockId}`;
      if (block.blockType === "change" && block.changeCheck === null) {
        return [`${blockPath}: a change block needs done_when: change.ready or change.merged`];
      }
      if (block.blockType === "change" && !level.runsPerChange) {
        return [`${blockPath}: a change block belongs in an each_change level`];
      }
      return [];
    }),
  );
}

function environmentBlockProblems(column: PipelineColumnDTO): readonly string[] {
  return column.levels.flatMap((level) =>
    level.blocks.flatMap((block) => {
      const blockPath = `columns.${column.columnKey}: block ${block.blockId}`;
      if (block.blockType === "deploy" && block.envName === null) {
        return [`${blockPath}: a deploy block needs env: <env name>`];
      }
      if (block.blockType !== "attest") {
        return [];
      }
      return [
        ...(block.envName === null ? [`${blockPath}: an attest block needs pin: 'env("<env name>").commits'`] : []),
        ...(block.doneWhen === ATTESTED_CHECK ? [] : [`${blockPath}: an attest block needs done_when: attested`]),
      ];
    }),
  );
}

function pipelineProblems(pipeline: PipelineDTO): readonly string[] {
  const columnKeys = pipeline.columns.map((column) => column.columnKey);
  const blockIds = pipeline.columns.flatMap((column) =>
    column.levels.flatMap((level) => level.blocks.map((block) => block.blockId)),
  );
  return [
    ...columnKeys
      .filter((columnKey) => !SNAKE_CASE_PATTERN.test(columnKey))
      .map((columnKey) => `columns.${columnKey}: column keys are snake_case board column names`),
    ...blockIds
      .filter((blockId) => !SNAKE_CASE_PATTERN.test(blockId))
      .map((blockId) => `block ${blockId}: block ids are snake_case`),
    ...duplicatesOf(columnKeys).map((columnKey) => `columns.${columnKey}: defined twice`),
    ...duplicatesOf(blockIds).map((blockId) => `block ${blockId}: id is used twice`),
    ...pipeline.columns.flatMap(levelProblems),
    ...pipeline.columns.flatMap(changeCheckProblems),
    ...pipeline.columns.flatMap(environmentBlockProblems),
  ];
}

export class Pipeline {
  readonly columns: readonly PipelineColumnDTO[];

  private constructor(columns: readonly PipelineColumnDTO[]) {
    this.columns = columns;
  }

  static create(pipeline: PipelineDTO): Pipeline {
    const problems = pipelineProblems(pipeline);
    ensure(problems.length === 0, () => new InvalidProjectConfigError(problems));
    return new Pipeline(Object.freeze([...pipeline.columns]));
  }

  columnKeys(): readonly string[] {
    return this.columns.map((column) => column.columnKey);
  }

  environmentBlocks(): readonly BlockTemplateDTO[] {
    return this.columns.flatMap((column) =>
      column.levels.flatMap((level) => level.blocks.filter((block) => block.envName !== null)),
    );
  }

  columnFor(columnKey: string): PipelineColumnDTO | null {
    return this.columns.find((column) => column.columnKey === columnKey) ?? null;
  }

  toDTO(): PipelineDTO {
    return { columns: this.columns };
  }
}
