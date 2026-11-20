import { loadProjectConfig, type ProjectConfig } from "@/config";
import type { PipelineDocumentPort } from "@/pipeline/adapters/pipeline_document_port";
import { PipelineDocumentYaml } from "@/pipeline/adapters/pipeline_document_yaml";
import type { ProjectSourcePort } from "@/pipeline/adapters/project_source_port";
import { ProjectSourceYaml } from "@/pipeline/adapters/project_source_yaml";
import { PromptTemplateFiles } from "@/pipeline/adapters/prompt_template_files";
import type { PromptTemplatePort } from "@/pipeline/adapters/prompt_template_port";
import { CheckPipelineDraft } from "@/pipeline/use_cases/check_pipeline_draft";
import { CheckPromptReferences } from "@/pipeline/use_cases/check_prompt_references";
import { ListPromptTemplates } from "@/pipeline/use_cases/list_prompt_templates";
import { LoadProject } from "@/pipeline/use_cases/load_project";
import { OpenPipelineDraft } from "@/pipeline/use_cases/open_pipeline_draft";
import { ReadPromptTemplate } from "@/pipeline/use_cases/read_prompt_template";
import { SavePipelineDraft } from "@/pipeline/use_cases/save_pipeline_draft";
import { WriteDefaultPrompts } from "@/pipeline/use_cases/write_default_prompts";

export class PipelineContainer {
  readonly #projectSource: ProjectSourcePort;
  readonly #templates: PromptTemplatePort;
  readonly #documents: PipelineDocumentPort;

  constructor() {
    const config: ProjectConfig = loadProjectConfig();
    this.#projectSource = new ProjectSourceYaml(config.projectsRoot);
    this.#templates = new PromptTemplateFiles(config.projectsRoot);
    this.#documents = new PipelineDocumentYaml(config.projectsRoot);
  }

  loadProject(): LoadProject {
    return new LoadProject(this.#projectSource, this.#checkPromptReferences());
  }

  readPromptTemplate(): ReadPromptTemplate {
    return new ReadPromptTemplate(this.#templates);
  }

  writeDefaultPrompts(): WriteDefaultPrompts {
    return new WriteDefaultPrompts(this.#templates);
  }

  listPromptTemplates(): ListPromptTemplates {
    return new ListPromptTemplates(this.#templates);
  }

  openPipelineDraft(): OpenPipelineDraft {
    return new OpenPipelineDraft(this.#documents);
  }

  checkPipelineDraft(): CheckPipelineDraft {
    return new CheckPipelineDraft(this.#documents, this.#projectSource, this.#checkPromptReferences());
  }

  savePipelineDraft(): SavePipelineDraft {
    return new SavePipelineDraft(this.#documents, this.checkPipelineDraft());
  }

  #checkPromptReferences(): CheckPromptReferences {
    return new CheckPromptReferences(this.#templates);
  }
}
