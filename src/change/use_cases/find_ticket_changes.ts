import type { CodeHostPort } from "@/change/adapters/code_host_port";
import type { CachedReview, ReviewCachePort } from "@/change/adapters/review_cache_port";
import type { Change } from "@/change/models/change";
import type { ChangeReview } from "@/change/models/change_review";
import { ChangeError, ReviewCacheError } from "@/change/models/errors";
import { type ChangeListing, type TicketChange, TicketChanges } from "@/change/models/ticket_changes";

const REVIEW_MAXIMUM_AGE_MILLISECONDS = 600_000;

export interface FindTicketChangesRequest {
  readonly listing: ChangeListing;
  readonly ticketKey: string;
}

export class FindTicketChanges {
  readonly #codeHost: CodeHostPort;
  readonly #reviewCache: ReviewCachePort;

  constructor(codeHost: CodeHostPort, reviewCache: ReviewCachePort) {
    this.#codeHost = codeHost;
    this.#reviewCache = reviewCache;
  }

  async execute(request: FindTicketChangesRequest): Promise<TicketChanges> {
    const ticketChanges = await Promise.all(
      request.listing.forTicket(request.ticketKey).map((change) => this.#withReview(change)),
    );
    return new TicketChanges(request.listing.viewerLogin, ticketChanges);
  }

  async #withReview(change: Change): Promise<TicketChange> {
    if (change.isMerged()) {
      return { change, review: null, failure: null };
    }
    try {
      return { change, review: await this.#review(change), failure: null };
    } catch (error) {
      if (error instanceof ChangeError) {
        return { change, review: null, failure: error.message };
      }
      throw error;
    }
  }

  async #review(change: Change): Promise<ChangeReview> {
    const cachedReview = this.#cachedReview(change.pullRequestId);
    if (cachedReview !== null && this.#isFresh(cachedReview, change)) {
      return cachedReview.review;
    }
    const review = await this.#codeHost.review(change.ref());
    this.#remember(review);
    return review;
  }

  #isFresh(cachedReview: CachedReview, change: Change): boolean {
    const age = Date.now() - cachedReview.fetchedAt.getTime();
    return (
      cachedReview.review.headCommitId === change.headCommitId &&
      cachedReview.review.updatedAt === change.updatedAt &&
      age < REVIEW_MAXIMUM_AGE_MILLISECONDS
    );
  }

  #cachedReview(pullRequestId: string): CachedReview | null {
    try {
      return this.#reviewCache.read(pullRequestId);
    } catch (error) {
      if (error instanceof ReviewCacheError) {
        return null;
      }
      throw error;
    }
  }

  #remember(review: ChangeReview): void {
    try {
      this.#reviewCache.save(review, new Date());
    } catch (error) {
      if (!(error instanceof ReviewCacheError)) {
        throw error;
      }
    }
  }
}
