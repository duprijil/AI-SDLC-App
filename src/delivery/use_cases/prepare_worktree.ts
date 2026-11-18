import type { GitPort, WorktreeAddRequest } from "@/delivery/adapters/git_port";
import { DeliveryError } from "@/delivery/models/errors";
import {
  Worktree,
  type WorktreeEntryDTO,
  type WorktreeRequestDTO,
  type WorktreeResultDTO,
} from "@/delivery/models/worktree";

const ORIGIN = "origin";
const DETACHED = "(detached)";

export class PrepareWorktree {
  readonly #git: GitPort;

  constructor(git: GitPort) {
    this.#git = git;
  }

  async execute(request: WorktreeRequestDTO): Promise<WorktreeResultDTO> {
    try {
      return await this.#prepare(request);
    } catch (error) {
      if (error instanceof DeliveryError) {
        return { kind: "skipped", repoName: request.repoName, folder: request.folder, reason: error.message };
      }
      throw error;
    }
  }

  async #prepare(request: WorktreeRequestDTO): Promise<WorktreeResultDTO> {
    const note = await this.#fetch(request.checkoutPath);
    const entries = await this.#git.worktrees(request.checkoutPath);
    const defaultBranch = await this.#git.defaultBranch(request.checkoutPath);
    const baseBranch = request.changeBaseBranch ?? defaultBranch;
    const ready = { kind: "ready", repoName: request.repoName, folder: request.folder, baseBranch, note } as const;
    const existing = entries.find((entry) => entry.folder === request.folder);
    if (existing !== undefined) {
      return { ...ready, branch: existing.branch ?? DETACHED, wasReused: true };
    }
    const branch = request.changeBranch ?? request.newBranch;
    const refusal = await this.#refusal(request, entries, branch);
    if (refusal !== null) {
      return { kind: "skipped", repoName: request.repoName, folder: request.folder, reason: refusal };
    }
    await this.#git.addWorktree(await this.#addRequest(request, branch, defaultBranch));
    return { ...ready, branch, wasReused: false };
  }

  async #refusal(
    request: WorktreeRequestDTO,
    entries: readonly WorktreeEntryDTO[],
    branch: string,
  ): Promise<string | null> {
    if (!(await this.#git.isBranchName(request.checkoutPath, branch))) {
      return `${branch} is not a valid branch name`;
    }
    const holder = Worktree.holderOf(entries, branch, request.folder);
    if (holder !== null) {
      return `branch ${branch} is checked out in ${holder.folder}; the app won't take it from there`;
    }
    return null;
  }

  async #addRequest(request: WorktreeRequestDTO, branch: string, defaultBranch: string): Promise<WorktreeAddRequest> {
    const base = { checkoutPath: request.checkoutPath, folder: request.folder, branch };
    if (await this.#git.hasRef(request.checkoutPath, `refs/heads/${branch}`)) {
      return { ...base, startPoint: null, shouldTrack: false };
    }
    if (await this.#git.hasRef(request.checkoutPath, `refs/remotes/${ORIGIN}/${branch}`)) {
      return { ...base, startPoint: `${ORIGIN}/${branch}`, shouldTrack: true };
    }
    const remoteDefault = `refs/remotes/${ORIGIN}/${defaultBranch}`;
    const startPoint = (await this.#git.hasRef(request.checkoutPath, remoteDefault))
      ? `${ORIGIN}/${defaultBranch}`
      : defaultBranch;
    return { ...base, startPoint, shouldTrack: false };
  }

  async #fetch(checkoutPath: string): Promise<string | null> {
    try {
      await this.#git.fetch(checkoutPath);
      return null;
    } catch (error) {
      if (error instanceof DeliveryError) {
        return `not fetched: ${error.message}`;
      }
      throw error;
    }
  }
}
