import type { CodeHostPort } from "@/change/adapters/code_host_port";
import { InvalidChangeError } from "@/change/models/errors";

export interface ReplyToThreadRequest {
  readonly threadId: string;
  readonly replyText: string;
  readonly shouldResolve: boolean;
}

export class ReplyToThread {
  readonly #codeHost: CodeHostPort;

  constructor(codeHost: CodeHostPort) {
    this.#codeHost = codeHost;
  }

  async execute(request: ReplyToThreadRequest): Promise<void> {
    if (request.replyText.trim() === "") {
      throw new InvalidChangeError("A reply must not be empty");
    }
    await this.#codeHost.replyToThread(request.threadId, request.replyText);
    if (request.shouldResolve) {
      await this.#codeHost.resolveThread(request.threadId);
    }
  }
}
