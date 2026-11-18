import type { AgentLaunchCommand } from "@/session/models/agent_launch_command";

export interface AgentCliPort {
  launchCommand(sessionId: string, settingsFilePath: string): AgentLaunchCommand;
  resumeCommand(sessionId: string, settingsFilePath: string): AgentLaunchCommand;
}
