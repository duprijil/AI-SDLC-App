import type { SessionStorePort } from "@/session/adapters/session_store_port";
import type { AgentSession } from "@/session/models/agent_session";

export class SessionStoreMemory implements SessionStorePort {
  readonly #sessions = new Map<string, AgentSession>();

  save(session: AgentSession): void {
    this.#sessions.set(session.sessionId, session);
  }

  find(sessionId: string): AgentSession | null {
    return this.#sessions.get(sessionId) ?? null;
  }

  findActiveForTicket(ticketKey: string): AgentSession | null {
    return this.listActive().find((session) => session.ticketKey === ticketKey) ?? null;
  }

  listActive(): readonly AgentSession[] {
    return [...this.#sessions.values()].filter((session) => session.isActive());
  }
}
