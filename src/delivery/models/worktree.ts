export interface WorktreeEntryDTO {
  readonly folder: string;
  readonly branch: string | null;
}

export interface WorktreeRequestDTO {
  readonly repoName: string;
  readonly checkoutPath: string;
  readonly folder: string;
  readonly changeBranch: string | null;
  readonly changeBaseBranch: string | null;
  readonly newBranch: string;
}

export type WorktreeResultDTO =
  | {
      readonly kind: "ready";
      readonly repoName: string;
      readonly folder: string;
      readonly branch: string;
      readonly baseBranch: string;
      readonly wasReused: boolean;
      readonly note: string | null;
    }
  | {
      readonly kind: "skipped";
      readonly repoName: string;
      readonly folder: string;
      readonly reason: string;
    };

const BRANCH_PREFIX = "refs/heads/";

export const Worktree = {
  entriesOf(porcelain: string): readonly WorktreeEntryDTO[] {
    return porcelain
      .split("\n\n")
      .map((block) => block.split("\n"))
      .flatMap((lines) => {
        const folder = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
        const branchRef = lines.find((line) => line.startsWith("branch "))?.slice("branch ".length) ?? null;
        if (folder === undefined) {
          return [];
        }
        const branch = branchRef?.startsWith(BRANCH_PREFIX) === true ? branchRef.slice(BRANCH_PREFIX.length) : null;
        return [{ folder, branch }];
      });
  },

  holderOf(entries: readonly WorktreeEntryDTO[], branch: string, folder: string): WorktreeEntryDTO | null {
    return entries.find((entry) => entry.branch === branch && entry.folder !== folder) ?? null;
  },
};
