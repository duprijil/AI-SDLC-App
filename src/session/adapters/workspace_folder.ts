import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { WorkspacePort } from "@/session/adapters/workspace_port";
import { WorkspaceUnavailableError } from "@/session/models/errors";

export class WorkspaceFolder implements WorkspacePort {
  readonly #workspaceRootPath: string;

  constructor(workspaceRootPath: string) {
    this.#workspaceRootPath = workspaceRootPath;
  }

  prepare(ticketKey: string): string {
    const workspacePath = join(this.#workspaceRootPath, ticketKey);
    try {
      mkdirSync(workspacePath, { recursive: true });
    } catch (cause) {
      throw new WorkspaceUnavailableError(`Could not create workspace ${workspacePath}`, { cause });
    }
    return workspacePath;
  }
}
