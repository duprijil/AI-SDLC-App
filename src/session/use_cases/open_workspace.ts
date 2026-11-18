import type { WorkspacePort } from "@/session/adapters/workspace_port";

export class OpenWorkspace {
  readonly #workspace: WorkspacePort;

  constructor(workspace: WorkspacePort) {
    this.#workspace = workspace;
  }

  execute(ticketKey: string): string {
    return this.#workspace.prepare(ticketKey);
  }
}
