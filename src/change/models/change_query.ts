import { InvalidChangeError } from "@/change/models/errors";
import { ensure } from "@/core/models/invariant";

export type MergeMethod = "squash" | "merge" | "rebase";

export interface CodeRepoDTO {
  readonly repoName: string;
  readonly githubRepository: string;
}

export interface ChangeQueryDTO {
  readonly repos: readonly CodeRepoDTO[];
  readonly keyPattern: string;
  readonly mergedDays: number;
}

export class ChangeQuery {
  readonly repos: readonly CodeRepoDTO[];
  readonly keyPattern: string;
  readonly mergedDays: number;

  private constructor(query: ChangeQueryDTO) {
    this.repos = Object.freeze([...query.repos]);
    this.keyPattern = query.keyPattern;
    this.mergedDays = query.mergedDays;
  }

  static create(query: ChangeQueryDTO): ChangeQuery {
    ensure(query.keyPattern !== "", () => new InvalidChangeError("The key pattern must not be empty"));
    ensure(
      Number.isInteger(query.mergedDays) && query.mergedDays > 0,
      () => new InvalidChangeError("Merged days must be a positive integer"),
    );
    return new ChangeQuery(query);
  }

  mergedSince(now: Date): Date {
    const millisecondsPerDay = 86_400_000;
    return new Date(now.getTime() - this.mergedDays * millisecondsPerDay);
  }
}
