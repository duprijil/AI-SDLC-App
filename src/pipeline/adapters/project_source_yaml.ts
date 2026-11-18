import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import { parseDocument } from "yaml";
import { z } from "zod";

import type { ProjectSourcePort } from "@/pipeline/adapters/project_source_port";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";
import {
  BLOCK_TYPES,
  type ChangeCheck,
  type FlowLevelDTO,
  Pipeline,
  type PipelineColumnDTO,
} from "@/pipeline/models/pipeline";
import {
  COMMIT_SOURCES,
  DEFAULT_BRANCH_PATTERN,
  type EnvironmentSourceDTO,
  MERGE_METHODS,
  Project,
  type RepoSourceDTO,
} from "@/pipeline/models/project";

const PROJECT_FILE_NAME = "project.yaml";
const PIPELINE_FILE_NAME = "pipeline.yaml";

const blockSchema = z.looseObject({
  id: z.string().min(1),
  type: z.enum(BLOCK_TYPES),
  title: z.string().min(1).optional(),
  done_when: z.string().optional(),
  env: z.string().min(1).optional(),
  pin: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  actions: z.record(z.string(), z.array(z.unknown())).default({}),
});

const sessionActionSchema = z.looseObject({ session: z.string().min(1) });

const sessionPromptsOf = (actions: readonly unknown[]): readonly string[] =>
  actions.flatMap((action) => {
    const parsed = sessionActionSchema.safeParse(action);
    return parsed.success ? [parsed.data.session] : [];
  });

const PIN_PATTERN = /^env\("([\w-]+)"\)\.commits$/;

const environmentSchema = z.union([
  z.literal("none").transform((): EnvironmentSourceDTO => ({ delivery: "none" })),
  z
    .looseObject({ same_as: z.string().min(1) })
    .transform((environment): EnvironmentSourceDTO => ({ delivery: "same_as", envName: environment.same_as })),
  z
    .looseObject({
      delivery: z.literal("github_actions"),
      workflow: z.string().min(1),
      branch: z.string().min(1).optional(),
      commit: z.enum(COMMIT_SOURCES).default("run.head_sha"),
    })
    .transform((environment): EnvironmentSourceDTO => ({
      delivery: "github_actions",
      workflow: environment.workflow,
      branch: environment.branch ?? null,
      commitSource: environment.commit,
    })),
  z
    .looseObject({ delivery: z.literal("manual"), promote_link: z.url().optional() })
    .transform((environment): EnvironmentSourceDTO => ({
      delivery: "manual",
      promoteLink: environment.promote_link ?? null,
    })),
]);

const repoSchema = z.looseObject({
  name: z.string().min(1),
  github: z.string().min(1),
  path: z.string().min(1).optional(),
  envs: z.record(z.string(), environmentSchema).default({}),
});

const levelSchema = z.union([z.array(blockSchema).min(1), z.looseObject({ each_change: blockSchema })]);

const pipelineSchema = z.object({
  columns: z.record(
    z.string(),
    z.looseObject({
      flow: z.array(levelSchema).default([]),
      gate: z.looseObject({ then: z.array(z.unknown()).default([]) }).optional(),
    }),
  ),
});

const projectSchema = z.looseObject({
  name: z.string().min(1),
  tracker: z.looseObject({
    type: z.literal("jira"),
    site: z.string().min(1),
    board_id: z.number().int().positive(),
    scope: z.string().min(1),
    hide_statuses: z.array(z.string()).default([]),
  }),
  code: z.looseObject({
    link: z.looseObject({
      key_pattern: z.string().min(1),
      merged_days: z.number().int().positive().default(45),
    }),
    merge: z.looseObject({ method: z.enum(MERGE_METHODS).default("squash") }).default({ method: "squash" }),
    branch: z.string().min(1).default(DEFAULT_BRANCH_PATTERN),
  }),
  repos: z.array(repoSchema).default([]),
});

const CHANGE_CHECK_BY_DONE_WHEN: Readonly<Record<string, ChangeCheck>> = {
  "change.ready": "ready",
  "change.merged": "merged",
};

type BlockEntry = z.infer<typeof blockSchema>;
type LevelEntry = z.infer<typeof levelSchema>;

const humanize = (blockId: string): string => {
  const words = blockId.replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

const envNameOf = (block: BlockEntry): string | null => {
  if (block.type === "deploy") {
    return block.env ?? null;
  }
  if (block.type === "attest") {
    return PIN_PATTERN.exec(block.pin ?? "")?.[1] ?? null;
  }
  return null;
};

const toBlockTemplate = (block: BlockEntry): FlowLevelDTO["blocks"][number] => ({
  blockId: block.id,
  blockType: block.type,
  title: block.title ?? humanize(block.id),
  changeCheck: block.type === "change" ? (CHANGE_CHECK_BY_DONE_WHEN[block.done_when ?? ""] ?? null) : null,
  envName: envNameOf(block),
  doneWhen: block.done_when ?? null,
  promptActions: Object.fromEntries(
    Object.entries(block.actions)
      .map(([state, actions]) => [state, sessionPromptsOf(actions)] as const)
      .filter(([, prompts]) => prompts.length > 0),
  ),
  promptFile: block.prompt ?? null,
});

const expandHome = (path: string): string =>
  path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : resolve(path);

const toRepo = (repo: z.infer<typeof repoSchema>): RepoSourceDTO => ({
  name: repo.name,
  githubRepository: repo.github,
  checkoutPath: repo.path === undefined ? null : expandHome(repo.path),
  environments: repo.envs,
});

const toFlowLevel = (level: LevelEntry): FlowLevelDTO =>
  Array.isArray(level)
    ? { runsPerChange: false, blocks: level.map(toBlockTemplate) }
    : { runsPerChange: true, blocks: [toBlockTemplate(level.each_change)] };

export class ProjectSourceYaml implements ProjectSourcePort {
  readonly #projectsRootPath: string;

  constructor(projectsRootPath: string) {
    this.#projectsRootPath = projectsRootPath;
  }

  loadProject(projectKey: string): Project {
    const displayPath = this.#displayPath(projectKey, PROJECT_FILE_NAME);
    const entry = this.#parse(projectKey, PROJECT_FILE_NAME, projectSchema);
    return this.#build(displayPath, () =>
      Project.create({
        projectKey,
        name: entry.name,
        tracker: {
          siteUrl: entry.tracker.site,
          boardId: entry.tracker.board_id,
          scopeJql: entry.tracker.scope,
          hiddenStatusNames: entry.tracker.hide_statuses,
        },
        code: {
          keyPattern: entry.code.link.key_pattern,
          mergedDays: entry.code.link.merged_days,
          mergeMethod: entry.code.merge.method,
          branchPattern: entry.code.branch,
        },
        repos: entry.repos.map(toRepo),
      }),
    );
  }

  loadPipeline(projectKey: string): Pipeline {
    const displayPath = this.#displayPath(projectKey, PIPELINE_FILE_NAME);
    const entry = this.#parse(projectKey, PIPELINE_FILE_NAME, pipelineSchema);
    const columns: PipelineColumnDTO[] = Object.entries(entry.columns).map(([columnKey, column]) => ({
      columnKey,
      levels: column.flow.map(toFlowLevel),
      gatePrompts: sessionPromptsOf(column.gate?.then ?? []),
    }));
    return this.#build(displayPath, () => Pipeline.create({ columns }));
  }

  #parse<Schema extends z.ZodType>(projectKey: string, fileName: string, schema: Schema): z.infer<Schema> {
    const displayPath = this.#displayPath(projectKey, fileName);
    const filePath = join(this.#projectsRootPath, projectKey, fileName);
    if (!existsSync(filePath)) {
      throw new InvalidProjectConfigError([`${displayPath}: file is missing`]);
    }
    const document = parseDocument(readFileSync(filePath, "utf8"));
    if (document.errors.length > 0) {
      throw new InvalidProjectConfigError(document.errors.map((error) => `${displayPath}: ${error.message}`));
    }
    const parsed = schema.safeParse(document.toJS());
    if (!parsed.success) {
      throw new InvalidProjectConfigError(
        parsed.error.issues.map((issue) => `${displayPath}: ${issue.path.join(".") || "(root)"}: ${issue.message}`),
      );
    }
    return parsed.data;
  }

  #build<Model>(displayPath: string, buildModel: () => Model): Model {
    try {
      return buildModel();
    } catch (error) {
      if (error instanceof InvalidProjectConfigError) {
        throw new InvalidProjectConfigError(error.problems.map((problem) => `${displayPath}: ${problem}`));
      }
      throw error;
    }
  }

  #displayPath(projectKey: string, fileName: string): string {
    return `${basename(this.#projectsRootPath)}/${projectKey}/${fileName}`;
  }
}
