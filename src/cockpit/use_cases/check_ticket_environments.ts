import type { Change } from "@/change/models/change";
import type { RepoDeployDTO } from "@/cockpit/models/deploy_view";
import { DeliveryError } from "@/delivery/models/errors";
import type { CheckEnvironment } from "@/delivery/use_cases/check_environment";
import type { Project, RepoDTO } from "@/pipeline/models/project";

export interface TicketEnvironmentRequest {
  readonly changes: readonly Change[];
  readonly envName: string;
}

interface RepoChanges {
  readonly repo: RepoDTO;
  readonly changes: readonly Change[];
}

const mergedByRepo = (changes: readonly Change[], project: Project): readonly RepoChanges[] => {
  const merged = changes.filter((change) => change.isMerged() && change.mergeCommitId !== null);
  return project.repos
    .map((repo) => ({ repo, changes: merged.filter((change) => change.repoName === repo.name) }))
    .filter((group) => group.changes.length > 0);
};

export class CheckTicketEnvironments {
  readonly #checkEnvironment: CheckEnvironment;
  readonly #project: Project;

  constructor(checkEnvironment: CheckEnvironment, project: Project) {
    this.#checkEnvironment = checkEnvironment;
    this.#project = project;
  }

  async execute(request: TicketEnvironmentRequest): Promise<readonly RepoDeployDTO[]> {
    const groups = mergedByRepo(request.changes, this.#project);
    const repos = await Promise.all(groups.map((group) => this.#checkRepo(group, request.envName)));
    return repos.filter((repo): repo is RepoDeployDTO => repo !== null);
  }

  async #checkRepo(group: RepoChanges, envName: string): Promise<RepoDeployDTO | null> {
    const environment = group.repo.environments[envName];
    const base = { repoName: group.repo.name, envName };
    if (environment === undefined || environment.delivery === "none") {
      return null;
    }
    if (environment.delivery === "manual") {
      return { ...base, kind: "manual", promoteLink: environment.promoteLink };
    }
    if (group.repo.checkoutPath === null) {
      return { ...base, kind: "unchecked", reason: `repos.${group.repo.name}.path is not set` };
    }
    try {
      const state = await this.#checkEnvironment.execute({
        repoName: group.repo.name,
        githubRepository: group.repo.githubRepository,
        checkoutPath: group.repo.checkoutPath,
        envName,
        workflow: environment.workflow,
        branch: environment.branch ?? group.changes[0]?.baseBranchName ?? "",
        commitIds: group.changes.map((change) => change.mergeCommitId ?? ""),
      });
      return { ...base, kind: "checked", state };
    } catch (error) {
      if (error instanceof DeliveryError) {
        return { ...base, kind: "unchecked", reason: error.message };
      }
      throw error;
    }
  }
}
