import type { ChangeRefDTO } from "@/change/models/change";
import type { MergeMethod } from "@/change/models/change_query";
import type { MergeChange } from "@/change/use_cases/merge_change";
import type { ReplyToThread } from "@/change/use_cases/reply_to_thread";
import type { UpdateChangeBranch } from "@/change/use_cases/update_change_branch";
import type { ChangeViewDTO } from "@/cockpit/models/block_state";
import type { ChangeActionDTO } from "@/cockpit/models/change_action";

const toChangeRef = (change: ChangeViewDTO): ChangeRefDTO => ({
  pullRequestId: change.pullRequestId,
  githubRepository: change.githubRepository,
  number: change.number,
  headCommitId: change.headCommitId,
});

export class RunChangeAction {
  readonly #mergeChange: MergeChange;
  readonly #updateChangeBranch: UpdateChangeBranch;
  readonly #replyToThread: ReplyToThread;
  readonly #mergeMethod: MergeMethod;

  constructor(
    mergeChange: MergeChange,
    updateChangeBranch: UpdateChangeBranch,
    replyToThread: ReplyToThread,
    mergeMethod: MergeMethod,
  ) {
    this.#mergeChange = mergeChange;
    this.#updateChangeBranch = updateChangeBranch;
    this.#replyToThread = replyToThread;
    this.#mergeMethod = mergeMethod;
  }

  async execute(action: ChangeActionDTO): Promise<void> {
    switch (action.kind) {
      case "merge":
        await this.#mergeChange.execute({ change: toChangeRef(action.change), mergeMethod: this.#mergeMethod });
        return;
      case "update_branch":
        await this.#updateChangeBranch.execute(toChangeRef(action.change));
        return;
      case "reply":
        await this.#replyToThread.execute({
          threadId: action.threadId,
          replyText: action.replyText,
          shouldResolve: action.shouldResolve,
        });
        return;
    }
  }
}
