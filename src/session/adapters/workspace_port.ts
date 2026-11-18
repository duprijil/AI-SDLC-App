import type { WorkspaceFileDTO } from "@/session/models/workspace_file";

export interface WorkspacePort {
  prepare(ticketKey: string): string;
  writeFile(file: WorkspaceFileDTO): string;
}
