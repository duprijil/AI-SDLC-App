export interface CheckoutDTO {
  readonly repoName: string;
  readonly githubRepository: string;
  readonly checkoutPath: string;
}

const GITHUB_REMOTE_PATTERN = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i;

export const Checkout = {
  problemWith(checkout: CheckoutDTO, originUrl: string | null): string | null {
    if (originUrl === null) {
      return `repos.${checkout.repoName}.path: ${checkout.checkoutPath} is not a git checkout with an origin remote`;
    }
    const repository = GITHUB_REMOTE_PATTERN.exec(originUrl)?.[1];
    if (repository?.toLowerCase() !== checkout.githubRepository.toLowerCase()) {
      return `repos.${checkout.repoName}.path: origin of ${checkout.checkoutPath} is ${originUrl}, not github.com/${checkout.githubRepository}`;
    }
    return null;
  },
};
