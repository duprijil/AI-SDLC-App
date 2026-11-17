import type { SprintCachePort } from "@/ticket/adapters/sprint_cache_port";
import type { TrackerPort } from "@/ticket/adapters/tracker_port";
import type { SprintQuery } from "@/ticket/models/sprint_query";
import { SprintSnapshot } from "@/ticket/models/sprint_snapshot";

export class FetchSprint {
  readonly #tracker: TrackerPort;
  readonly #sprintCache: SprintCachePort;

  constructor(tracker: TrackerPort, sprintCache: SprintCachePort) {
    this.#tracker = tracker;
    this.#sprintCache = sprintCache;
  }

  async execute(query: SprintQuery): Promise<SprintSnapshot> {
    const [board, tickets] = await Promise.all([
      this.#tracker.boardColumns(query.boardId),
      this.#tracker.sprintTickets(query.scopeJql),
    ]);
    const snapshot = SprintSnapshot.capture({
      board,
      tickets,
      hiddenStatusNames: query.hiddenStatusNames,
      fetchedAt: new Date(),
    });
    this.#sprintCache.save(query.projectKey, snapshot);
    return snapshot;
  }
}
