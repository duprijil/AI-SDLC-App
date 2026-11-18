import type { PromptTemplatePort } from "@/pipeline/adapters/prompt_template_port";
import { DEFAULT_PROMPTS } from "@/pipeline/models/default_prompts";
import { PromptTemplateError } from "@/pipeline/models/errors";
import { PromptTemplate } from "@/pipeline/models/prompt_template";

export class ReadPromptTemplate {
  readonly #templates: PromptTemplatePort;

  constructor(templates: PromptTemplatePort) {
    this.#templates = templates;
  }

  execute(projectKey: string, templateName: string): string {
    const name = PromptTemplate.ensureName(templateName);
    const text = this.#templates.read(projectKey, name) ?? DEFAULT_PROMPTS[name] ?? null;
    if (text === null) {
      throw new PromptTemplateError(`${name} doesn't exist in projects/${projectKey}/`);
    }
    return text;
  }
}
