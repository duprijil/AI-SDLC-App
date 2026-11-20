import type { PromptTemplatePort } from "@/pipeline/adapters/prompt_template_port";
import { DEFAULT_PROMPTS } from "@/pipeline/models/default_prompts";
import { PromptTemplateError } from "@/pipeline/models/errors";
import type { Pipeline } from "@/pipeline/models/pipeline";
import { PromptTemplate } from "@/pipeline/models/prompt_template";

export class CheckPromptReferences {
  readonly #templates: PromptTemplatePort;

  constructor(templates: PromptTemplatePort) {
    this.#templates = templates;
  }

  execute(projectKey: string, pipeline: Pipeline): readonly string[] {
    return pipeline.promptReferences().flatMap((reference) => {
      const text = this.#read(projectKey, reference.templateName);
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

  #read(projectKey: string, templateName: string): string | null {
    try {
      return this.#templates.read(projectKey, templateName) ?? DEFAULT_PROMPTS[templateName] ?? null;
    } catch (error) {
      if (error instanceof PromptTemplateError) {
        return null;
      }
      throw error;
    }
  }
}
