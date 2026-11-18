import type { Change, ChangeRefDTO } from "@/change/models/change";
import type { MergeMethod } from "@/change/models/change_query";
import type { ChangeReview } from "@/change/models/change_review";

export interface ChangeListRequest {
  readonly repoName: string;
  readonly githubRepository: string;
  readonly mergedSince: Date;
}

export interface CodeHostPort {
  viewerLogin(): Promise<string>;
  listChanges(request: ChangeListRequest): Promise<readonly Change[]>;
  review(change: ChangeRefDTO): Promise<ChangeReview>;
  merge(change: ChangeRefDTO, mergeMethod: MergeMethod): Promise<void>;
  updateBranch(change: ChangeRefDTO): Promise<void>;
  replyToThread(threadId: string, body: string): Promise<void>;
  resolveThread(threadId: string): Promise<void>;
}
