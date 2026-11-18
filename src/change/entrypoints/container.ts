import { join } from "node:path";

import { CodeHostGithub } from "@/change/adapters/code_host_github";
import type { CodeHostPort } from "@/change/adapters/code_host_port";
import type { ReviewCachePort } from "@/change/adapters/review_cache_port";
import { ReviewCacheSqlite } from "@/change/adapters/review_cache_sqlite";
import { FindTicketChanges } from "@/change/use_cases/find_ticket_changes";
import { ListRecentChanges } from "@/change/use_cases/list_recent_changes";
import { MergeChange } from "@/change/use_cases/merge_change";
import { ReplyToThread } from "@/change/use_cases/reply_to_thread";
import { UpdateChangeBranch } from "@/change/use_cases/update_change_branch";
import { loadProjectConfig, type ProjectConfig, type ProjectSecrets } from "@/config";

const CACHE_FILE_NAME = "cache.sqlite";

export class ChangeContainer {
  readonly #codeHost: CodeHostPort;
  readonly #reviewCache: ReviewCachePort;

  constructor(secrets: ProjectSecrets) {
    const config: ProjectConfig = loadProjectConfig();
    this.#codeHost = new CodeHostGithub(secrets.githubToken);
    this.#reviewCache = new ReviewCacheSqlite(join(config.appDataRoot, CACHE_FILE_NAME));
  }

  listRecentChanges(): ListRecentChanges {
    return new ListRecentChanges(this.#codeHost);
  }

  findTicketChanges(): FindTicketChanges {
    return new FindTicketChanges(this.#codeHost, this.#reviewCache);
  }

  mergeChange(): MergeChange {
    return new MergeChange(this.#codeHost);
  }

  updateChangeBranch(): UpdateChangeBranch {
    return new UpdateChangeBranch(this.#codeHost);
  }

  replyToThread(): ReplyToThread {
    return new ReplyToThread(this.#codeHost);
  }
}
