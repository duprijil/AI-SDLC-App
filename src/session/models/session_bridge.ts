import type { AgentSessionDTO } from "@/session/models/agent_session";
import type { TerminalSizeDTO } from "@/session/models/terminal_size";

export const SESSION_BRIDGE_GLOBAL = "cockpitSession";

export const SESSION_CHANNEL = Object.freeze({
  start: "session:start",
  input: "session:input",
  resize: "session:resize",
  prompt: "session:prompt",
  output: "session:output",
  status: "session:status",
  exit: "session:exit",
});

export type Unsubscribe = () => void;

export interface SessionBridge {
  start(size: TerminalSizeDTO): Promise<AgentSessionDTO>;
  sendInput(sessionId: string, keystrokes: string): void;
  resize(sessionId: string, size: TerminalSizeDTO): void;
  sendPrompt(sessionId: string, promptText: string): Promise<void>;
  onOutput(listener: (chunk: string) => void): Unsubscribe;
  onStatus(listener: (session: AgentSessionDTO) => void): Unsubscribe;
  onExit(listener: (exitCode: number) => void): Unsubscribe;
}
