import type { CodeHostPort } from "@/change/adapters/code_host_port";
import type { ChangeQuery } from "@/change/models/change_query";
import { ChangeListing } from "@/change/models/ticket_changes";

export class ListRecentChanges {
  readonly #codeHost: CodeHostPort;

  constructor(codeHost: CodeHostPort) {
    this.#codeHost = codeHost;
  }

  async execute(query: ChangeQuery): Promise<ChangeListing> {
    const mergedSince = query.mergedSince(new Date());
    const [viewerLogin, ...changesPerRepo] = await Promise.all([
      this.#codeHost.viewerLogin(),
      ...query.repos.map((repo) =>
        this.#codeHost.listChanges({
          repoName: repo.repoName,
          githubRepository: repo.githubRepository,
          mergedSince,
        }),
      ),
    ]);
    return new ChangeListing(viewerLogin, changesPerRepo.flat(), query.keyPattern);
  }
}
