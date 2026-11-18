import type { AgentTokenPort } from "@/session/adapters/agent_token_port";
import type { SessionStorePort } from "@/session/adapters/session_store_port";

export class ResolveAgentTicket {
  readonly #agentTokens: AgentTokenPort;
  readonly #sessionStore: SessionStorePort;

  constructor(agentTokens: AgentTokenPort, sessionStore: SessionStorePort) {
    this.#agentTokens = agentTokens;
    this.#sessionStore = sessionStore;
  }

  execute(token: string): string | null {
    const sessionId = this.#agentTokens.sessionFor(token);
    if (sessionId === null) {
      return null;
    }
    const session = this.#sessionStore.find(sessionId);
    return session?.isActive() === true ? session.ticketKey : null;
  }
}
