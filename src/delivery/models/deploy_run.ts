import { CommitId } from "@/delivery/models/commit_id";

export type DeployRunStatus = "queued" | "in_progress" | "completed";

export interface DeployRunDTO {
  readonly runId: number;
  readonly status: DeployRunStatus;
  readonly conclusion: string | null;
  readonly headCommitId: string;
  readonly url: string;
  readonly createdAt: string;
}

const SUCCESS = "success";
const FAILED_CONCLUSIONS: readonly string[] = ["failure", "cancelled", "timed_out", "startup_failure"];

export class DeployRun {
  readonly runId: number;
  readonly status: DeployRunStatus;
  readonly conclusion: string | null;
  readonly headCommitId: string;
  readonly url: string;
  readonly createdAt: string;

  private constructor(run: DeployRunDTO) {
    this.runId = run.runId;
    this.status = run.status;
    this.conclusion = run.conclusion;
    this.headCommitId = run.headCommitId;
    this.url = run.url;
    this.createdAt = run.createdAt;
  }

  static create(run: DeployRunDTO): DeployRun {
    CommitId.ensureValid(run.headCommitId);
    return new DeployRun(run);
  }

  isSuccessful(): boolean {
    return this.status === "completed" && this.conclusion === SUCCESS;
  }

  isRunning(): boolean {
    return this.status !== "completed";
  }

  isFailed(): boolean {
    return this.status === "completed" && FAILED_CONCLUSIONS.includes(this.conclusion ?? "");
  }

  toDTO(): DeployRunDTO {
    return {
      runId: this.runId,
      status: this.status,
      conclusion: this.conclusion,
      headCommitId: this.headCommitId,
      url: this.url,
      createdAt: this.createdAt,
    };
  }
}
