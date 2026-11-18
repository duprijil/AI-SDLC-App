import { ReviewThread, type ReviewThreadDTO } from "@/change/models/review_thread";

export type MergeState = "clean" | "behind" | "conflict" | "blocked" | "unstable" | "draft" | "unknown";

export type ChecksState = "passing" | "failing" | "pending" | "none";

export type ReviewDecision = "approved" | "changes_requested" | "review_required" | "none";

export type ReviewVerdict = "approved" | "changes_requested" | "commented" | "dismissed" | "pending";

export interface ReviewDTO {
  readonly authorLogin: string;
  readonly isBot: boolean;
  readonly verdict: ReviewVerdict;
  readonly submittedAt: string;
}

export interface ChangeReviewDTO {
  readonly pullRequestId: string;
  readonly headCommitId: string;
  readonly updatedAt: string;
  readonly lastCommitAt: string;
  readonly mergeState: MergeState;
  readonly checks: ChecksState;
  readonly reviewDecision: ReviewDecision;
  readonly reviews: readonly ReviewDTO[];
  readonly threads: readonly ReviewThreadDTO[];
}

const VERDICTS: readonly ReviewVerdict[] = ["approved", "changes_requested", "dismissed"];

export class ChangeReview {
  readonly #review: ChangeReviewDTO;
  readonly threads: readonly ReviewThread[];

  private constructor(review: ChangeReviewDTO) {
    this.#review = review;
    this.threads = Object.freeze(review.threads.map((thread) => ReviewThread.create(thread)));
  }

  static create(review: ChangeReviewDTO): ChangeReview {
    return new ChangeReview(review);
  }

  get pullRequestId(): string {
    return this.#review.pullRequestId;
  }

  get headCommitId(): string {
    return this.#review.headCommitId;
  }

  get updatedAt(): string {
    return this.#review.updatedAt;
  }

  isCiFailing(): boolean {
    return this.#review.checks === "failing";
  }

  hasConflict(): boolean {
    return this.#review.mergeState === "conflict";
  }

  isBehind(): boolean {
    return this.#review.mergeState === "behind";
  }

  isApproved(): boolean {
    const checksAllow = this.#review.checks === "passing" || this.#review.checks === "none";
    return this.#review.reviewDecision === "approved" && checksAllow;
  }

  isReadyToMerge(): boolean {
    return this.isApproved() && this.#review.mergeState === "clean";
  }

  mergeBlocker(): string {
    if (!this.isApproved()) {
      return "the pull request is not approved with passing checks";
    }
    return `GitHub reports the merge state as ${this.#review.mergeState}`;
  }

  hasFeedbackFor(viewerLogin: string, authorLogin: string): boolean {
    if (authorLogin !== viewerLogin) {
      return false;
    }
    return (
      this.#changesRequestedSinceLastCommit(viewerLogin) ||
      this.threadsAwaitingReplyFrom(viewerLogin).length > 0 ||
      this.#humanCommentsSinceLastCommit(viewerLogin)
    );
  }

  threadsAwaitingReplyFrom(viewerLogin: string): readonly ReviewThread[] {
    return this.threads.filter((thread) => thread.awaitsReplyFrom(viewerLogin));
  }

  #changesRequestedSinceLastCommit(viewerLogin: string): boolean {
    const latestVerdictByReviewer = new Map<string, ReviewDTO>();
    for (const review of this.#humanReviewsBy(viewerLogin)) {
      if (VERDICTS.includes(review.verdict)) {
        latestVerdictByReviewer.set(review.authorLogin, review);
      }
    }
    return [...latestVerdictByReviewer.values()].some(
      (review) => review.verdict === "changes_requested" && this.#isAfterLastCommit(review.submittedAt),
    );
  }

  #humanCommentsSinceLastCommit(viewerLogin: string): boolean {
    return this.#humanReviewsBy(viewerLogin).some(
      (review) => review.verdict === "commented" && this.#isAfterLastCommit(review.submittedAt),
    );
  }

  #humanReviewsBy(viewerLogin: string): readonly ReviewDTO[] {
    return [...this.#review.reviews]
      .filter((review) => !review.isBot && review.authorLogin !== viewerLogin)
      .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt));
  }

  #isAfterLastCommit(timestamp: string): boolean {
    return Date.parse(timestamp) > Date.parse(this.#review.lastCommitAt);
  }

  toDTO(): ChangeReviewDTO {
    return this.#review;
  }
}
