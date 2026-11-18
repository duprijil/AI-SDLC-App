import { ensure } from "@/core/models/invariant";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";
import { PromptTemplate } from "@/pipeline/models/prompt_template";

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
  readonly promptActions: Readonly<Record<string, readonly string[]>>;
  readonly promptFile: string | null;
  readonly checkpointKind: string | null;
}

export const ACTION_STATES: Readonly<Record<BlockType, readonly string[]>> = Object.freeze({
  change: [
    "none",
    "draft",
    "ci_failing",
    "ready",
    "conflict",
    "feedback",
    "behind",
    "approved",
    "in_review",
    "merged",
    "drafted",
  ],
  deploy: ["waiting", "deploying", "failed", "partial", "done", "n_a", "manual"],
  attest: ["open", "stale", "done"],
  tracker: ["open", "done"],
  prompt: ["open", "done"],
});

export interface PromptReferenceDTO {
  readonly templateName: string;
  readonly hasChange: boolean;
  readonly where: string;
}

const ATTESTED_CHECK = "attested";
const CHECKPOINT_CHECK_PREFIX = "session.checkpoint(";

export interface FlowLevelDTO {
  readonly runsPerChange: boolean;
  readonly blocks: readonly BlockTemplateDTO[];
}

export interface PipelineColumnDTO {
  readonly columnKey: string;
  readonly levels: readonly FlowLevelDTO[];
  readonly gatePrompts: readonly string[];
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

function actionProblems(column: PipelineColumnDTO): readonly string[] {
  const blocks = column.levels.flatMap((level) => level.blocks);
  const blockProblems = blocks.flatMap((block) => {
    const blockPath = `columns.${column.columnKey}: block ${block.blockId}`;
    const allowed = ACTION_STATES[block.blockType];
    const stateProblems = Object.keys(block.promptActions)
      .filter((state) => !allowed.includes(state))
      .map(
        (state) =>
          `${blockPath}: actions.${state} is not a state of a ${block.blockType} block (${allowed.join(", ")})`,
      );
    const names = [
      ...Object.values(block.promptActions).flat(),
      ...(block.promptFile === null ? [] : [block.promptFile]),
    ];
    const nameProblems = names
      .filter((name) => !PromptTemplate.isName(name))
      .map((name) => `${blockPath}: a prompt is a file prompts/<name>.md: ${name}`);
    const promptBlockProblems =
      block.blockType !== "prompt"
        ? []
        : [
            ...(block.promptFile === null ? [`${blockPath}: a prompt block needs prompt: prompts/<name>.md`] : []),
            ...(block.doneWhen === null ||
            (block.doneWhen.startsWith(CHECKPOINT_CHECK_PREFIX) && block.checkpointKind !== null)
              ? []
              : [`${blockPath}: a prompt block is done_when: session.checkpoint(<snake_case kind>)`]),
          ];
    return [...stateProblems, ...nameProblems, ...promptBlockProblems];
  });
  const gateProblems = column.gatePrompts
    .filter((name) => !PromptTemplate.isName(name))
    .map((name) => `columns.${column.columnKey}.gate.then: a prompt is a file prompts/<name>.md: ${name}`);
  return [...blockProblems, ...gateProblems];
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
    ...pipeline.columns.flatMap(actionProblems),
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

  promptReferences(): readonly PromptReferenceDTO[] {
    return this.columns.flatMap((column) => [
      ...column.levels.flatMap((level) =>
        level.blocks.flatMap((block) => {
          const where = `columns.${column.columnKey}: block ${block.blockId}`;
          const fromActions = Object.values(block.promptActions)
            .flat()
            .map((templateName) => ({ templateName, hasChange: block.blockType === "change", where }));
          const fromBlock =
            block.promptFile === null ? [] : [{ templateName: block.promptFile, hasChange: false, where }];
          return [...fromActions, ...fromBlock];
        }),
      ),
      ...column.gatePrompts.map((templateName) => ({
        templateName,
        hasChange: false,
        where: `columns.${column.columnKey}.gate`,
      })),
    ]);
  }

  checkpointBlocks(kind: string): readonly BlockTemplateDTO[] {
    return this.columns.flatMap((column) =>
      column.levels.flatMap((level) =>
        level.blocks.filter((block) => block.blockType === "prompt" && block.checkpointKind === kind),
      ),
    );
  }

  promptBlock(blockId: string): BlockTemplateDTO | null {
    return (
      this.columns
        .flatMap((column) => column.levels.flatMap((level) => level.blocks))
        .find((block) => block.blockType === "prompt" && block.blockId === blockId) ?? null
    );
  }

  promptsAfterForwardMove(fromColumnKey: string): readonly string[] {
    const column = this.columnFor(fromColumnKey);
    if (column === null) {
      return [];
    }
    const trackerPrompts = column.levels
      .flatMap((level) => level.blocks)
      .filter((block) => block.blockType === "tracker")
      .flatMap((block) => block.promptActions["open"] ?? []);
    return [...new Set([...trackerPrompts, ...column.gatePrompts])];
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
