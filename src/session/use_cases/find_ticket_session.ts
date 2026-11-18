import type { SessionStorePort } from "@/session/adapters/session_store_port";
import type { AgentSession } from "@/session/models/agent_session";

export class FindTicketSession {
  readonly #sessionStore: SessionStorePort;

  constructor(sessionStore: SessionStorePort) {
    this.#sessionStore = sessionStore;
  }

  execute(ticketKey: string): AgentSession | null {
    return this.#sessionStore.findActiveForTicket(ticketKey);
  }
}
