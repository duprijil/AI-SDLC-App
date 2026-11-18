import type { ChangeReview } from "@/change/models/change_review";

export interface CachedReview {
  readonly review: ChangeReview;
  readonly fetchedAt: Date;
}

export interface ReviewCachePort {
  read(pullRequestId: string): CachedReview | null;
  save(review: ChangeReview, fetchedAt: Date): void;
}
