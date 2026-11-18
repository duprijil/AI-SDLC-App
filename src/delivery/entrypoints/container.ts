import type { ProjectSecrets } from "@/config";
import { DeployRunGithubActions } from "@/delivery/adapters/deploy_run_github_actions";
import type { DeployRunPort } from "@/delivery/adapters/deploy_run_port";
import { GitCli } from "@/delivery/adapters/git_cli";
import type { GitPort } from "@/delivery/adapters/git_port";
import { CheckEnvironment } from "@/delivery/use_cases/check_environment";
import { PrepareWorktree } from "@/delivery/use_cases/prepare_worktree";
import { VerifyCheckouts } from "@/delivery/use_cases/verify_checkouts";

export class DeliveryContainer {
  readonly #deployRuns: DeployRunPort;
  readonly #git: GitPort;

  constructor(secrets: ProjectSecrets) {
    this.#deployRuns = new DeployRunGithubActions(secrets.githubToken);
    this.#git = new GitCli();
  }

  checkEnvironment(): CheckEnvironment {
    return new CheckEnvironment(this.#deployRuns, this.#git);
  }

  prepareWorktree(): PrepareWorktree {
    return new PrepareWorktree(this.#git);
  }

  verifyCheckouts(): VerifyCheckouts {
    return new VerifyCheckouts(this.#git);
  }
}
