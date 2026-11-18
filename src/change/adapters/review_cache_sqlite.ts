import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import type { CachedReview, ReviewCachePort } from "@/change/adapters/review_cache_port";
import { ChangeReview } from "@/change/models/change_review";
import { ReviewCacheError } from "@/change/models/errors";

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS change_review (
  pull_request_id TEXT PRIMARY KEY,
  review_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
)`;
const SELECT_REVIEW = "SELECT review_json, fetched_at FROM change_review WHERE pull_request_id = ?";
const UPSERT_REVIEW = `INSERT INTO change_review (pull_request_id, review_json, fetched_at) VALUES (?, ?, ?)
  ON CONFLICT(pull_request_id) DO UPDATE SET review_json = excluded.review_json, fetched_at = excluded.fetched_at`;

const commentSchema = z.object({
  authorLogin: z.string(),
  isBot: z.boolean(),
  body: z.string(),
  createdAt: z.string(),
});

const reviewSchema = z.object({
  pullRequestId: z.string(),
  headCommitId: z.string(),
  updatedAt: z.string(),
  lastCommitAt: z.string(),
  mergeState: z.enum(["clean", "behind", "conflict", "blocked", "unstable", "draft", "unknown"]),
  checks: z.enum(["passing", "failing", "pending", "none"]),
  reviewDecision: z.enum(["approved", "changes_requested", "review_required", "none"]),
  reviews: z.array(
    z.object({
      authorLogin: z.string(),
      isBot: z.boolean(),
      verdict: z.enum(["approved", "changes_requested", "commented", "dismissed", "pending"]),
      submittedAt: z.string(),
    }),
  ),
  threads: z.array(
    z.object({
      threadId: z.string(),
      path: z.string(),
      line: z.number().nullable(),
      isResolved: z.boolean(),
      comments: z.array(commentSchema),
    }),
  ),
});

const rowSchema = z.object({ review_json: z.string(), fetched_at: z.string() });

export class ReviewCacheSqlite implements ReviewCachePort {
  readonly #databaseFilePath: string;
  #database: DatabaseSync | null = null;

  constructor(databaseFilePath: string) {
    this.#databaseFilePath = databaseFilePath;
  }

  read(pullRequestId: string): CachedReview | null {
    try {
      const row: unknown = this.#open().prepare(SELECT_REVIEW).get(pullRequestId);
      if (row === undefined) {
        return null;
      }
      const cachedRow = rowSchema.parse(row);
      return {
        review: ChangeReview.create(reviewSchema.parse(JSON.parse(cachedRow.review_json))),
        fetchedAt: new Date(cachedRow.fetched_at),
      };
    } catch (cause) {
      throw new ReviewCacheError(`The review cache for ${pullRequestId} can't be read`, { cause });
    }
  }

  save(review: ChangeReview, fetchedAt: Date): void {
    try {
      this.#open()
        .prepare(UPSERT_REVIEW)
        .run(review.pullRequestId, JSON.stringify(review.toDTO()), fetchedAt.toISOString());
    } catch (cause) {
      throw new ReviewCacheError(`The review cache for ${review.pullRequestId} can't be written`, { cause });
    }
  }

  #open(): DatabaseSync {
    if (this.#database !== null) {
      return this.#database;
    }
    mkdirSync(dirname(this.#databaseFilePath), { recursive: true });
    const database = new DatabaseSync(this.#databaseFilePath);
    database.exec(CREATE_TABLE);
    this.#database = database;
    return database;
  }
}
