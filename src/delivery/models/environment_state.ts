import type { DeployRun } from "@/delivery/models/deploy_run";
import type { EnvironmentTarget } from "@/delivery/models/environment_target";

export type LatestRunState = "running" | "failed" | "succeeded" | "other";

export interface EnvironmentStateDTO {
  readonly repoName: string;
  readonly envName: string;
  readonly deployedCommitId: string | null;
  readonly deployedRunUrl: string | null;
  readonly latestRunState: LatestRunState | null;
  readonly latestRunUrl: string | null;
  readonly containedCount: number;
  readonly totalCount: number;
  readonly fetchNote: string | null;
}

export interface EnvironmentAssessmentDTO {
  readonly target: EnvironmentTarget;
  readonly runs: readonly DeployRun[];
  readonly containedCommitIds: readonly string[];
  readonly fetchNote: string | null;
}

const latestRunState = (run: DeployRun): LatestRunState => {
  if (run.isRunning()) {
    return "running";
  }
  if (run.isFailed()) {
    return "failed";
  }
  return run.isSuccessful() ? "succeeded" : "other";
};

export const EnvironmentState = {
  deployedRun(runs: readonly DeployRun[]): DeployRun | null {
    return runs.find((run) => run.isSuccessful()) ?? null;
  },

  assess(assessment: EnvironmentAssessmentDTO): EnvironmentStateDTO {
    const deployed = EnvironmentState.deployedRun(assessment.runs);
    const latest = assessment.runs[0] ?? null;
    return {
      repoName: assessment.target.repoName,
      envName: assessment.target.envName,
      deployedCommitId: deployed?.headCommitId ?? null,
      deployedRunUrl: deployed?.url ?? null,
      latestRunState: latest === null ? null : latestRunState(latest),
      latestRunUrl: latest?.url ?? null,
      containedCount: assessment.containedCommitIds.length,
      totalCount: assessment.target.commitIds.length,
      fetchNote: assessment.fetchNote,
    };
  },

  isContained(state: EnvironmentStateDTO): boolean {
    return state.containedCount === state.totalCount;
  },
};
