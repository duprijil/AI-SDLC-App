import type { AgentCliPort, AgentLaunchFiles } from "@/session/adapters/agent_cli_port";
import type { AgentLaunchCommand } from "@/session/models/agent_launch_command";

const sessionFiles = (files: AgentLaunchFiles): readonly string[] => [
  "--settings",
  files.settingsFilePath,
  "--mcp-config",
  files.mcpConfigFilePath,
];

export class AgentCliClaudeCode implements AgentCliPort {
  readonly #agentCommand: string;

  constructor(agentCommand: string) {
    this.#agentCommand = agentCommand;
  }

  launchCommand(sessionId: string, files: AgentLaunchFiles): AgentLaunchCommand {
    return { command: this.#agentCommand, commandArguments: ["--session-id", sessionId, ...sessionFiles(files)] };
  }

  resumeCommand(sessionId: string, files: AgentLaunchFiles): AgentLaunchCommand {
    return { command: this.#agentCommand, commandArguments: ["--resume", sessionId, ...sessionFiles(files)] };
  }
}
