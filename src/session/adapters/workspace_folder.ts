import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { WorkspacePort } from "@/session/adapters/workspace_port";
import { WorkspaceUnavailableError } from "@/session/models/errors";
import type { WorkspaceFileDTO } from "@/session/models/workspace_file";

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

  writeFile(file: WorkspaceFileDTO): string {
    const filePath = join(this.prepare(file.ticketKey), file.fileName);
    try {
      writeFileSync(filePath, file.content, { encoding: "utf8", mode: 0o600 });
    } catch (cause) {
      throw new WorkspaceUnavailableError(`Could not write ${filePath}`, { cause });
    }
    return filePath;
  }
}
