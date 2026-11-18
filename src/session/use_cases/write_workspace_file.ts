import type { WorkspacePort } from "@/session/adapters/workspace_port";
import { WorkspaceFile, type WorkspaceFileDTO } from "@/session/models/workspace_file";

export class WriteWorkspaceFile {
  readonly #workspace: WorkspacePort;

  constructor(workspace: WorkspacePort) {
    this.#workspace = workspace;
  }

  execute(file: WorkspaceFileDTO): string {
    return this.#workspace.writeFile(WorkspaceFile.ensureValid(file));
  }
}
