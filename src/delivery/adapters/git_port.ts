export interface GitPort {
  fetch(checkoutPath: string): Promise<void>;
  contains(checkoutPath: string, deployedCommitId: string, commitId: string): Promise<boolean>;
  originUrl(checkoutPath: string): Promise<string | null>;
}
