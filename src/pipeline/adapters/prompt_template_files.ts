import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { PromptTemplatePort } from "@/pipeline/adapters/prompt_template_port";
import { PromptTemplateError } from "@/pipeline/models/errors";
import { PromptTemplate } from "@/pipeline/models/prompt_template";

export class PromptTemplateFiles implements PromptTemplatePort {
  readonly #projectsRootPath: string;

  constructor(projectsRootPath: string) {
    this.#projectsRootPath = projectsRootPath;
  }

  read(projectKey: string, templateName: string): string | null {
    const filePath = this.#filePath(projectKey, templateName);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      return readFileSync(filePath, "utf8");
    } catch (cause) {
      throw new PromptTemplateError(`Could not read ${templateName}`, { cause });
    }
  }

  writeIfMissing(projectKey: string, templateName: string, text: string): boolean {
    const filePath = this.#filePath(projectKey, templateName);
    if (existsSync(filePath)) {
      return false;
    }
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, text, { encoding: "utf8", flag: "wx" });
      return true;
    } catch (cause) {
      throw new PromptTemplateError(`Could not write ${templateName}`, { cause });
    }
  }

  #filePath(projectKey: string, templateName: string): string {
    return join(this.#projectsRootPath, projectKey, PromptTemplate.ensureName(templateName));
  }
}
