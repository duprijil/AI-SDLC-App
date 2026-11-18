import type { BriefStorePort } from "@/cockpit/adapters/brief_store_port";
import type { WorkspaceBriefDTO } from "@/cockpit/models/workspace_brief";

export class BriefStoreMemory implements BriefStorePort {
  readonly #briefs = new Map<string, WorkspaceBriefDTO>();

  read(ticketKey: string): WorkspaceBriefDTO | null {
    return this.#briefs.get(ticketKey) ?? null;
  }

  save(brief: WorkspaceBriefDTO): void {
    this.#briefs.set(brief.ticketKey, brief);
  }
}
