import type { PromptTemplatePort } from "@/pipeline/adapters/prompt_template_port";
import { DEFAULT_PROMPTS } from "@/pipeline/models/default_prompts";

export class ListPromptTemplates {
  readonly #templates: PromptTemplatePort;

  constructor(templates: PromptTemplatePort) {
    this.#templates = templates;
  }

  execute(projectKey: string): readonly string[] {
    return [...new Set([...this.#templates.list(projectKey), ...Object.keys(DEFAULT_PROMPTS)])].sort();
  }
}
