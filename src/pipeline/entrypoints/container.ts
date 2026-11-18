import { loadProjectConfig, type ProjectConfig } from "@/config";
import type { ProjectSourcePort } from "@/pipeline/adapters/project_source_port";
import { ProjectSourceYaml } from "@/pipeline/adapters/project_source_yaml";
import { PromptTemplateFiles } from "@/pipeline/adapters/prompt_template_files";
import type { PromptTemplatePort } from "@/pipeline/adapters/prompt_template_port";
import { LoadProject } from "@/pipeline/use_cases/load_project";
import { ReadPromptTemplate } from "@/pipeline/use_cases/read_prompt_template";
import { WriteDefaultPrompts } from "@/pipeline/use_cases/write_default_prompts";

export class PipelineContainer {
  readonly #projectSource: ProjectSourcePort;
  readonly #templates: PromptTemplatePort;

  constructor() {
    const config: ProjectConfig = loadProjectConfig();
    this.#projectSource = new ProjectSourceYaml(config.projectsRoot);
    this.#templates = new PromptTemplateFiles(config.projectsRoot);
  }

  loadProject(): LoadProject {
    return new LoadProject(this.#projectSource, this.#templates);
  }

  readPromptTemplate(): ReadPromptTemplate {
    return new ReadPromptTemplate(this.#templates);
  }

  writeDefaultPrompts(): WriteDefaultPrompts {
    return new WriteDefaultPrompts(this.#templates);
  }
}
