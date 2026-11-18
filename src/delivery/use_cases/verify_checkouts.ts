import type { GitPort } from "@/delivery/adapters/git_port";
import { Checkout, type CheckoutDTO } from "@/delivery/models/checkout";

export class VerifyCheckouts {
  readonly #git: GitPort;

  constructor(git: GitPort) {
    this.#git = git;
  }

  async execute(checkouts: readonly CheckoutDTO[]): Promise<readonly string[]> {
    const problems = await Promise.all(
      checkouts.map(async (checkout) =>
        Checkout.problemWith(checkout, await this.#git.originUrl(checkout.checkoutPath)),
      ),
    );
    return problems.filter((problem): problem is string => problem !== null);
  }
}
