import type { WorkspaceBriefDTO } from "@/cockpit/models/workspace_brief";

export interface BriefStorePort {
  read(ticketKey: string): WorkspaceBriefDTO | null;
  save(brief: WorkspaceBriefDTO): void;
}
