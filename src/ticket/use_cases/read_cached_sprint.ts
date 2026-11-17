import type { SprintCachePort } from "@/ticket/adapters/sprint_cache_port";
import type { SprintSnapshot } from "@/ticket/models/sprint_snapshot";

export class ReadCachedSprint {
  readonly #sprintCache: SprintCachePort;

  constructor(sprintCache: SprintCachePort) {
    this.#sprintCache = sprintCache;
  }

  execute(projectKey: string): SprintSnapshot | null {
    return this.#sprintCache.read(projectKey);
  }
}
