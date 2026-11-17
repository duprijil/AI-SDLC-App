import type { SprintSnapshot } from "@/ticket/models/sprint_snapshot";

export interface SprintCachePort {
  read(projectKey: string): SprintSnapshot | null;
  save(projectKey: string, snapshot: SprintSnapshot): void;
}
