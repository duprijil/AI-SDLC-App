import type { DeployRun } from "@/delivery/models/deploy_run";

export interface DeployRunQuery {
  readonly githubRepository: string;
  readonly workflow: string;
  readonly branch: string;
}

export interface DeployRunPort {
  recentRuns(query: DeployRunQuery): Promise<readonly DeployRun[]>;
}
