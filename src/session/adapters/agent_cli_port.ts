import type { AgentLaunchCommand } from "@/session/models/agent_launch_command";

export interface AgentLaunchFiles {
  readonly settingsFilePath: string;
  readonly mcpConfigFilePath: string;
}

export interface AgentCliPort {
  launchCommand(sessionId: string, files: AgentLaunchFiles): AgentLaunchCommand;
  resumeCommand(sessionId: string, files: AgentLaunchFiles): AgentLaunchCommand;
}
