import type { AgentLaunchCommand } from "@/session/models/agent_launch_command";
import type { TerminalSize } from "@/session/models/terminal_size";

export interface PtyListener {
  onOutput(chunk: string): void;
  onExit(exitCode: number): void;
}

export interface PtySpawnRequest {
  readonly sessionId: string;
  readonly launchCommand: AgentLaunchCommand;
  readonly workingDirectory: string;
  readonly size: TerminalSize;
}

export interface PtyPort {
  spawn(request: PtySpawnRequest, listener: PtyListener): void;
  attach(sessionId: string, listener: PtyListener): void;
  write(sessionId: string, keystrokes: string): void;
  resize(sessionId: string, size: TerminalSize): void;
  killAll(): void;
}
