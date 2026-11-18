export interface AgentTranscriptPort {
  exists(workspacePath: string, sessionId: string): boolean;
}
