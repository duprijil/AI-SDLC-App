import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { parseDocument } from "yaml";
import { z } from "zod";

import type { ProjectSourcePort } from "@/pipeline/adapters/project_source_port";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";
import { BLOCK_TYPES, type FlowLevelDTO, Pipeline, type PipelineColumnDTO } from "@/pipeline/models/pipeline";
import { Project } from "@/pipeline/models/project";

const PROJECT_FILE_NAME = "project.yaml";
const PIPELINE_FILE_NAME = "pipeline.yaml";

const blockSchema = z.looseObject({
  id: z.string().min(1),
  type: z.enum(BLOCK_TYPES),
  title: z.string().min(1).optional(),
});

const levelSchema = z.union([z.array(blockSchema).min(1), z.looseObject({ each_change: blockSchema })]);

const pipelineSchema = z.object({
  columns: z.record(z.string(), z.looseObject({ flow: z.array(levelSchema).default([]) })),
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
  repos: z.array(z.looseObject({ name: z.string().min(1) })).default([]),
});

type BlockEntry = z.infer<typeof blockSchema>;
type LevelEntry = z.infer<typeof levelSchema>;

const humanize = (blockId: string): string => {
  const words = blockId.replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

const toBlockTemplate = (block: BlockEntry): FlowLevelDTO["blocks"][number] => ({
  blockId: block.id,
  blockType: block.type,
  title: block.title ?? humanize(block.id),
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
        repoNames: entry.repos.map((repo) => repo.name),
      }),
    );
  }

  loadPipeline(projectKey: string): Pipeline {
    const displayPath = this.#displayPath(projectKey, PIPELINE_FILE_NAME);
    const entry = this.#parse(projectKey, PIPELINE_FILE_NAME, pipelineSchema);
    const columns: PipelineColumnDTO[] = Object.entries(entry.columns).map(([columnKey, column]) => ({
      columnKey,
      levels: column.flow.map(toFlowLevel),
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
