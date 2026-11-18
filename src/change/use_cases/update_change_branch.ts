import type { CodeHostPort } from "@/change/adapters/code_host_port";
import type { ChangeRefDTO } from "@/change/models/change";

export class UpdateChangeBranch {
  readonly #codeHost: CodeHostPort;

  constructor(codeHost: CodeHostPort) {
    this.#codeHost = codeHost;
  }

  async execute(change: ChangeRefDTO): Promise<void> {
    await this.#codeHost.updateBranch(change);
  }
}
