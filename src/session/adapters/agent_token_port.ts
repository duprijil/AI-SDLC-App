export interface AgentTokenPort {
  issue(sessionId: string): string;
  sessionFor(token: string): string | null;
}
