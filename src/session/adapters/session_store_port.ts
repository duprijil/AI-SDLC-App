import type { AgentSession } from "@/session/models/agent_session";

export interface SessionStorePort {
  save(session: AgentSession): void;
  find(sessionId: string): AgentSession | null;
  findActiveForTicket(ticketKey: string): AgentSession | null;
  listActive(): readonly AgentSession[];
}
