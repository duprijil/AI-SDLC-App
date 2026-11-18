import type { WorktreeEntryDTO } from "@/delivery/models/worktree";

export interface WorktreeAddRequest {
  readonly checkoutPath: string;
  readonly folder: string;
  readonly branch: string;
  readonly startPoint: string | null;
  readonly shouldTrack: boolean;
}

export interface GitPort {
  fetch(checkoutPath: string): Promise<void>;
  contains(checkoutPath: string, deployedCommitId: string, commitId: string): Promise<boolean>;
  originUrl(checkoutPath: string): Promise<string | null>;
  defaultBranch(checkoutPath: string): Promise<string>;
  worktrees(checkoutPath: string): Promise<readonly WorktreeEntryDTO[]>;
  hasRef(checkoutPath: string, ref: string): Promise<boolean>;
  isBranchName(checkoutPath: string, branch: string): Promise<boolean>;
  addWorktree(request: WorktreeAddRequest): Promise<void>;
}
