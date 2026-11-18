import type { CodeHostPort } from "@/change/adapters/code_host_port";
import type { ChangeRefDTO } from "@/change/models/change";
import type { MergeMethod } from "@/change/models/change_query";
import { MergeRefusedError } from "@/change/models/errors";

export interface MergeChangeRequest {
  readonly change: ChangeRefDTO;
  readonly mergeMethod: MergeMethod;
}

export class MergeChange {
  readonly #codeHost: CodeHostPort;

  constructor(codeHost: CodeHostPort) {
    this.#codeHost = codeHost;
  }

  async execute(request: MergeChangeRequest): Promise<void> {
    const liveReview = await this.#codeHost.review(request.change);
    if (liveReview.headCommitId !== request.change.headCommitId) {
      throw new MergeRefusedError("New commits arrived since the last refresh; refresh and check them first");
    }
    if (!liveReview.isReadyToMerge()) {
      throw new MergeRefusedError(`Not merged: ${liveReview.mergeBlocker()}`);
    }
    await this.#codeHost.merge(request.change, request.mergeMethod);
  }
}
