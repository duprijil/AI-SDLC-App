import type { PtyPort } from "@/session/adapters/pty_port";
import type { SessionStorePort } from "@/session/adapters/session_store_port";
import { AgentPrompt } from "@/session/models/agent_prompt";
import { SessionNotFoundError } from "@/session/models/errors";

export interface SendAgentPromptRequest {
  readonly sessionId: string;
  readonly promptText: string;
}

export class SendAgentPrompt {
  readonly #sessionStore: SessionStorePort;
  readonly #terminal: PtyPort;

  constructor(sessionStore: SessionStorePort, terminal: PtyPort) {
    this.#sessionStore = sessionStore;
    this.#terminal = terminal;
  }

  execute(request: SendAgentPromptRequest): void {
    const prompt = AgentPrompt.create(request.promptText);
    const session = this.#sessionStore.find(request.sessionId);
    if (session?.isActive() !== true) {
      throw new SessionNotFoundError(`No active session ${request.sessionId}`);
    }
    this.#terminal.write(session.sessionId, prompt.pasteKeystrokes());
    this.#terminal.write(session.sessionId, prompt.submitKeystrokes());
  }
}
