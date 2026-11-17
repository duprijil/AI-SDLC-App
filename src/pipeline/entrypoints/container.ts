import { loadProjectConfig, type ProjectConfig } from "@/config";
import type { ProjectSourcePort } from "@/pipeline/adapters/project_source_port";
import { ProjectSourceYaml } from "@/pipeline/adapters/project_source_yaml";
import { LoadProject } from "@/pipeline/use_cases/load_project";

export class PipelineContainer {
  readonly #projectSource: ProjectSourcePort;

  constructor() {
    const config: ProjectConfig = loadProjectConfig();
    this.#projectSource = new ProjectSourceYaml(config.projectsRoot);
  }

  loadProject(): LoadProject {
    return new LoadProject(this.#projectSource);
  }
}
