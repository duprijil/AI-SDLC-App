import type { PromptTemplatePort } from "@/pipeline/adapters/prompt_template_port";
import { DEFAULT_PROMPTS } from "@/pipeline/models/default_prompts";

export class WriteDefaultPrompts {
  readonly #templates: PromptTemplatePort;

  constructor(templates: PromptTemplatePort) {
    this.#templates = templates;
  }

  execute(projectKey: string): readonly string[] {
    return Object.entries(DEFAULT_PROMPTS)
      .filter(([templateName, text]) => this.#templates.writeIfMissing(projectKey, templateName, text))
      .map(([templateName]) => templateName);
  }
}
