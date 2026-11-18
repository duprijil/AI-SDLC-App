import type { ProjectSourcePort } from "@/pipeline/adapters/project_source_port";
import type { PromptTemplatePort } from "@/pipeline/adapters/prompt_template_port";
import { DEFAULT_PROMPTS } from "@/pipeline/models/default_prompts";
import { InvalidProjectConfigError, PromptTemplateError } from "@/pipeline/models/errors";
import type { Pipeline } from "@/pipeline/models/pipeline";
import type { Project } from "@/pipeline/models/project";
import { ProjectDefinition } from "@/pipeline/models/project_definition";
import { PromptTemplate } from "@/pipeline/models/prompt_template";

export class LoadProject {
  readonly #projectSource: ProjectSourcePort;
  readonly #templates: PromptTemplatePort;

  constructor(projectSource: ProjectSourcePort, templates: PromptTemplatePort) {
    this.#projectSource = projectSource;
    this.#templates = templates;
  }

  execute(projectKey: string): ProjectDefinition {
    const problems: string[] = [];
    const project = this.#collect(() => this.#projectSource.loadProject(projectKey), problems);
    const pipeline = this.#collect(() => this.#projectSource.loadPipeline(projectKey), problems);
    if (project === null || pipeline === null) {
      throw new InvalidProjectConfigError(problems);
    }
    const definition = ProjectDefinition.combine(project, pipeline);
    const templateProblems = this.#templateProblems(projectKey, pipeline);
    if (templateProblems.length > 0) {
      throw new InvalidProjectConfigError(templateProblems);
    }
    return definition;
  }

  #templateProblems(projectKey: string, pipeline: Pipeline): readonly string[] {
    return pipeline.promptReferences().flatMap((reference) => {
      const text = this.#readTemplate(projectKey, reference.templateName);
      if (text === null) {
        return [
          `pipeline.yaml: ${reference.where}: ${reference.templateName} doesn't exist in projects/${projectKey}/`,
        ];
      }
      return PromptTemplate.problems(reference.templateName, text, reference.hasChange).map(
        (problem) => `pipeline.yaml: ${reference.where}: ${problem}`,
      );
    });
  }

  #readTemplate(projectKey: string, templateName: string): string | null {
    try {
      return this.#templates.read(projectKey, templateName) ?? DEFAULT_PROMPTS[templateName] ?? null;
    } catch (error) {
      if (error instanceof PromptTemplateError) {
        return null;
      }
      throw error;
    }
  }

  #collect<Loaded extends Project | Pipeline>(load: () => Loaded, problems: string[]): Loaded | null {
    try {
      return load();
    } catch (error) {
      if (error instanceof InvalidProjectConfigError) {
        problems.push(...error.problems);
        return null;
      }
      throw error;
    }
  }
}
