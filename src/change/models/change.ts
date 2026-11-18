import { InvalidChangeError } from "@/change/models/errors";
import { ensure } from "@/core/models/invariant";

export type ChangeState = "open" | "merged";

export interface ChangeRefDTO {
  readonly pullRequestId: string;
  readonly githubRepository: string;
  readonly number: number;
  readonly headCommitId: string;
}

export interface ChangeDTO {
  readonly pullRequestId: string;
  readonly repoName: string;
  readonly githubRepository: string;
  readonly number: number;
  readonly title: string;
  readonly branchName: string;
  readonly url: string;
  readonly authorLogin: string;
  readonly state: ChangeState;
  readonly isDraft: boolean;
  readonly updatedAt: string;
  readonly headCommitId: string;
}

export class Change {
  readonly pullRequestId: string;
  readonly repoName: string;
  readonly githubRepository: string;
  readonly number: number;
  readonly title: string;
  readonly branchName: string;
  readonly url: string;
  readonly authorLogin: string;
  readonly state: ChangeState;
  readonly isDraft: boolean;
  readonly updatedAt: string;
  readonly headCommitId: string;

  private constructor(change: ChangeDTO) {
    this.pullRequestId = change.pullRequestId;
    this.repoName = change.repoName;
    this.githubRepository = change.githubRepository;
    this.number = change.number;
    this.title = change.title;
    this.branchName = change.branchName;
    this.url = change.url;
    this.authorLogin = change.authorLogin;
    this.state = change.state;
    this.isDraft = change.isDraft;
    this.updatedAt = change.updatedAt;
    this.headCommitId = change.headCommitId;
  }

  static create(change: ChangeDTO): Change {
    ensure(
      Number.isInteger(change.number) && change.number > 0,
      () => new InvalidChangeError(`A pull request number must be positive: ${String(change.number)}`),
    );
    ensure(change.pullRequestId !== "", () => new InvalidChangeError("A pull request needs its id"));
    return new Change(change);
  }

  mentions(ticketKey: string, keyPattern: string): boolean {
    const keyExpression = new RegExp(keyPattern, "gi");
    const mentionedKeys = [...this.title.matchAll(keyExpression), ...this.branchName.matchAll(keyExpression)].map(
      (match) => match[0].toUpperCase(),
    );
    return mentionedKeys.includes(ticketKey.toUpperCase());
  }

  isMerged(): boolean {
    return this.state === "merged";
  }

  label(): string {
    return `#${String(this.number)} ${this.repoName}`;
  }

  ref(): ChangeRefDTO {
    return {
      pullRequestId: this.pullRequestId,
      githubRepository: this.githubRepository,
      number: this.number,
      headCommitId: this.headCommitId,
    };
  }

  toDTO(): ChangeDTO {
    return {
      pullRequestId: this.pullRequestId,
      repoName: this.repoName,
      githubRepository: this.githubRepository,
      number: this.number,
      title: this.title,
      branchName: this.branchName,
      url: this.url,
      authorLogin: this.authorLogin,
      state: this.state,
      isDraft: this.isDraft,
      updatedAt: this.updatedAt,
      headCommitId: this.headCommitId,
    };
  }
}
