import { ensure } from "@/core/models/invariant";
import { CommitId } from "@/delivery/models/commit_id";
import { InvalidDeliveryTargetError } from "@/delivery/models/errors";

const GITHUB_REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export interface EnvironmentTargetDTO {
  readonly repoName: string;
  readonly githubRepository: string;
  readonly checkoutPath: string;
  readonly envName: string;
  readonly workflow: string;
  readonly branch: string;
  readonly commitIds: readonly string[];
}

export class EnvironmentTarget {
  readonly repoName: string;
  readonly githubRepository: string;
  readonly checkoutPath: string;
  readonly envName: string;
  readonly workflow: string;
  readonly branch: string;
  readonly commitIds: readonly string[];

  private constructor(target: EnvironmentTargetDTO) {
    this.repoName = target.repoName;
    this.githubRepository = target.githubRepository;
    this.checkoutPath = target.checkoutPath;
    this.envName = target.envName;
    this.workflow = target.workflow;
    this.branch = target.branch;
    this.commitIds = Object.freeze(target.commitIds.map((commitId) => CommitId.ensureValid(commitId)));
  }

  static create(target: EnvironmentTargetDTO): EnvironmentTarget {
    ensure(
      GITHUB_REPOSITORY_PATTERN.test(target.githubRepository),
      () => new InvalidDeliveryTargetError(`Not a GitHub repository: ${target.githubRepository}`),
    );
    ensure(target.workflow.trim() !== "", () => new InvalidDeliveryTargetError("A deploy needs a workflow"));
    ensure(target.branch.trim() !== "", () => new InvalidDeliveryTargetError("A deploy needs a branch"));
    return new EnvironmentTarget(target);
  }

  runsKey(): string {
    return `${this.githubRepository}|${this.workflow}|${this.branch}`;
  }
}
