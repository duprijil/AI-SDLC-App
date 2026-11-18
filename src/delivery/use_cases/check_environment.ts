import type { DeployRunPort } from "@/delivery/adapters/deploy_run_port";
import type { GitPort } from "@/delivery/adapters/git_port";
import type { DeployRun } from "@/delivery/models/deploy_run";
import { EnvironmentState, type EnvironmentStateDTO } from "@/delivery/models/environment_state";
import { EnvironmentTarget, type EnvironmentTargetDTO } from "@/delivery/models/environment_target";
import { DeliveryError } from "@/delivery/models/errors";

export class CheckEnvironment {
  readonly #deployRuns: DeployRunPort;
  readonly #git: GitPort;
  readonly #runs = new Map<string, Promise<readonly DeployRun[]>>();
  readonly #fetches = new Map<string, Promise<string | null>>();

  constructor(deployRuns: DeployRunPort, git: GitPort) {
    this.#deployRuns = deployRuns;
    this.#git = git;
  }

  async execute(targetDTO: EnvironmentTargetDTO): Promise<EnvironmentStateDTO> {
    const target = EnvironmentTarget.create(targetDTO);
    const runs = await this.#runsFor(target);
    const deployed = EnvironmentState.deployedRun(runs);
    if (deployed === null) {
      return EnvironmentState.assess({ target, runs, containedCommitIds: [], fetchNote: null });
    }
    const fetchNote = await this.#fetchOnce(target.checkoutPath);
    const containedCommitIds: string[] = [];
    for (const commitId of target.commitIds) {
      if (await this.#git.contains(target.checkoutPath, deployed.headCommitId, commitId)) {
        containedCommitIds.push(commitId);
      }
    }
    return EnvironmentState.assess({ target, runs, containedCommitIds, fetchNote });
  }

  #runsFor(target: EnvironmentTarget): Promise<readonly DeployRun[]> {
    const key = target.runsKey();
    const pending =
      this.#runs.get(key) ??
      this.#deployRuns.recentRuns({
        githubRepository: target.githubRepository,
        workflow: target.workflow,
        branch: target.branch,
      });
    this.#runs.set(key, pending);
    return pending;
  }

  #fetchOnce(checkoutPath: string): Promise<string | null> {
    const pending =
      this.#fetches.get(checkoutPath) ??
      this.#git.fetch(checkoutPath).then(
        () => null,
        (error: unknown) => {
          if (error instanceof DeliveryError) {
            return `not fetched: ${error.message}`;
          }
          throw error;
        },
      );
    this.#fetches.set(checkoutPath, pending);
    return pending;
  }
}
