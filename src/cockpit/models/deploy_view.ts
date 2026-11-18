import type { PinsDTO } from "@/attestation/models/pins";
import { CommitId } from "@/delivery/models/commit_id";
import { EnvironmentState, type EnvironmentStateDTO } from "@/delivery/models/environment_state";

export type RepoDeployDTO =
  | {
      readonly kind: "checked";
      readonly repoName: string;
      readonly envName: string;
      readonly state: EnvironmentStateDTO;
    }
  | {
      readonly kind: "manual";
      readonly repoName: string;
      readonly envName: string;
      readonly promoteLink: string | null;
    }
  | {
      readonly kind: "unchecked";
      readonly repoName: string;
      readonly envName: string;
      readonly reason: string;
    };

export type DeployLineState = "done" | "failed" | "running" | "waiting" | "manual" | "could_not_check";

export interface DeployLineDTO {
  readonly repoName: string;
  readonly state: DeployLineState;
  readonly caption: string;
  readonly deployedCommitId: string | null;
  readonly runUrl: string | null;
  readonly promoteLink: string | null;
}

export type DeployOutcomeKind =
  | "deploy_na"
  | "deploy_done"
  | "deploy_failed"
  | "deploy_running"
  | "deploy_partial"
  | "deploy_waiting"
  | "deploy_manual"
  | "could_not_check";

export type PinsOutcomeDTO = { readonly pins: PinsDTO } | { readonly waitReason: string };

const checkedState = (state: EnvironmentStateDTO): DeployLineState => {
  if (EnvironmentState.isContained(state)) {
    return "done";
  }
  if (state.latestRunState === "running") {
    return "running";
  }
  return state.latestRunState === "failed" ? "failed" : "waiting";
};

function checkedCaption(state: EnvironmentStateDTO, lineState: DeployLineState): string {
  const deployed =
    state.deployedCommitId === null ? "no successful run yet" : `runs ${CommitId.short(state.deployedCommitId)}`;
  const counts = `${String(state.containedCount)}/${String(state.totalCount)} changes`;
  const status: Readonly<Record<DeployLineState, string>> = {
    done: deployed,
    running: `deploying · ${deployed}`,
    failed: `last run failed · ${deployed}`,
    waiting: `${deployed} · ${counts}`,
    manual: "manual",
    could_not_check: "could not check",
  };
  return [status[lineState], state.fetchNote].filter((part) => part !== null).join(" · ");
}

const countOf = (lines: readonly DeployLineDTO[], state: DeployLineState): number =>
  lines.filter((line) => line.state === state).length;

export const DeployView = {
  lineOf(repo: RepoDeployDTO): DeployLineDTO {
    const base = { repoName: repo.repoName, deployedCommitId: null, runUrl: null, promoteLink: null };
    if (repo.kind === "manual") {
      return { ...base, state: "manual", caption: "promoted by hand · not checked yet", promoteLink: repo.promoteLink };
    }
    if (repo.kind === "unchecked") {
      return { ...base, state: "could_not_check", caption: `could not check: ${repo.reason}` };
    }
    const lineState = checkedState(repo.state);
    return {
      ...base,
      state: lineState,
      caption: checkedCaption(repo.state, lineState),
      deployedCommitId: repo.state.deployedCommitId,
      runUrl: lineState === "done" ? repo.state.deployedRunUrl : (repo.state.latestRunUrl ?? repo.state.deployedRunUrl),
    };
  },

  outcome(lines: readonly DeployLineDTO[]): DeployOutcomeKind {
    if (lines.length === 0) {
      return "deploy_na";
    }
    const firstMatch = (["failed", "running", "could_not_check"] as const).find((state) => countOf(lines, state) > 0);
    if (firstMatch !== undefined) {
      return ({ failed: "deploy_failed", running: "deploy_running", could_not_check: "could_not_check" } as const)[
        firstMatch
      ];
    }
    const doneCount = countOf(lines, "done");
    const manualCount = countOf(lines, "manual");
    if (doneCount + manualCount === lines.length) {
      return manualCount > 0 ? "deploy_manual" : "deploy_done";
    }
    return doneCount > 0 ? "deploy_partial" : "deploy_waiting";
  },

  partialCaption(lines: readonly DeployLineDTO[]): string {
    const checked = lines.filter((line) => line.state !== "manual");
    return `partial ${String(countOf(checked, "done"))}/${String(checked.length)}`;
  },

  pins(repos: readonly RepoDeployDTO[]): PinsOutcomeDTO {
    const pins: Record<string, string> = {};
    for (const repo of repos) {
      if (repo.kind === "unchecked") {
        return { waitReason: `waits for the deployment: ${repo.reason}` };
      }
      if (repo.kind === "checked") {
        if (repo.state.deployedCommitId === null) {
          return { waitReason: `waits for the first deploy of ${repo.repoName}` };
        }
        pins[repo.repoName] = repo.state.deployedCommitId;
      }
    }
    return Object.keys(pins).length === 0 ? { waitReason: "waits for a merged change to pin" } : { pins };
  },
};
