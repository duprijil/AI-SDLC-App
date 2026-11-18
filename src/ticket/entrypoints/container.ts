import { join } from "node:path";

import { loadProjectConfig, type ProjectConfig, type ProjectSecrets } from "@/config";
import type { SprintCachePort } from "@/ticket/adapters/sprint_cache_port";
import { SprintCacheSqlite } from "@/ticket/adapters/sprint_cache_sqlite";
import { TrackerJira } from "@/ticket/adapters/tracker_jira";
import type { TrackerPort } from "@/ticket/adapters/tracker_port";
import { FetchSprint } from "@/ticket/use_cases/fetch_sprint";
import { FetchTicketDetails } from "@/ticket/use_cases/fetch_ticket_details";
import { FindStatusTransition } from "@/ticket/use_cases/find_status_transition";
import { MoveTicket } from "@/ticket/use_cases/move_ticket";
import { ReadCachedSprint } from "@/ticket/use_cases/read_cached_sprint";

const CACHE_FILE_NAME = "cache.sqlite";

export class TicketContainer {
  readonly #tracker: TrackerPort;
  readonly #sprintCache: SprintCachePort;

  constructor(trackerSiteUrl: string, secrets: ProjectSecrets) {
    const config: ProjectConfig = loadProjectConfig();
    this.#tracker = new TrackerJira(trackerSiteUrl, secrets.jiraEmail, secrets.jiraApiToken);
    this.#sprintCache = new SprintCacheSqlite(join(config.appDataRoot, CACHE_FILE_NAME));
  }

  fetchSprint(): FetchSprint {
    return new FetchSprint(this.#tracker, this.#sprintCache);
  }

  readCachedSprint(): ReadCachedSprint {
    return new ReadCachedSprint(this.#sprintCache);
  }

  fetchTicketDetails(): FetchTicketDetails {
    return new FetchTicketDetails(this.#tracker);
  }

  findStatusTransition(): FindStatusTransition {
    return new FindStatusTransition(this.#tracker);
  }

  moveTicket(): MoveTicket {
    return new MoveTicket(this.#tracker, this.findStatusTransition());
  }
}
