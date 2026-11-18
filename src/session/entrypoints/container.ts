import { loadProjectConfig, type ProjectConfig } from "@/config";
import { LoggerConsole } from "@/core/adapters/logger_console";
import type { LoggerPort } from "@/core/adapters/logger_port";
import { AgentCliClaudeCode } from "@/session/adapters/agent_cli_claude_code";
import type { AgentCliPort } from "@/session/adapters/agent_cli_port";
import { HookSettingsClaudeCode } from "@/session/adapters/hook_settings_claude_code";
import type { HookSettingsPort } from "@/session/adapters/hook_settings_port";
import { PtyNodePty } from "@/session/adapters/pty_node_pty";
import type { PtyPort } from "@/session/adapters/pty_port";
import { SessionStoreMemory } from "@/session/adapters/session_store_memory";
import type { SessionStorePort } from "@/session/adapters/session_store_port";
import { WorkspaceFolder } from "@/session/adapters/workspace_folder";
import type { WorkspacePort } from "@/session/adapters/workspace_port";
import { ApplyHookEvent } from "@/session/use_cases/apply_hook_event";
import { FindTicketSession } from "@/session/use_cases/find_ticket_session";
import { ResizeTerminal } from "@/session/use_cases/resize_terminal";
import { SendAgentPrompt } from "@/session/use_cases/send_agent_prompt";
import { SendTerminalInput } from "@/session/use_cases/send_terminal_input";
import { StartAgentSession } from "@/session/use_cases/start_agent_session";
import { StopAgentSessions } from "@/session/use_cases/stop_agent_sessions";

export class SessionContainer {
  readonly #sessionStore: SessionStorePort;
  readonly #terminal: PtyPort;
  readonly #workspace: WorkspacePort;
  readonly #hookSettings: HookSettingsPort;
  readonly #agentCli: AgentCliPort;

  constructor() {
    const config: ProjectConfig = loadProjectConfig();
    this.#sessionStore = new SessionStoreMemory();
    this.#terminal = new PtyNodePty();
    this.#workspace = new WorkspaceFolder(config.agentWorkspaceRoot);
    this.#hookSettings = new HookSettingsClaudeCode(config.agentSettingsRoot);
    this.#agentCli = new AgentCliClaudeCode(config.agentCommand);
  }

  logger(loggerName: string): LoggerPort {
    return new LoggerConsole(loggerName);
  }

  startAgentSession(): StartAgentSession {
    return new StartAgentSession(
      this.#sessionStore,
      this.#terminal,
      this.#workspace,
      this.#hookSettings,
      this.#agentCli,
    );
  }

  sendTerminalInput(): SendTerminalInput {
    return new SendTerminalInput(this.#sessionStore, this.#terminal);
  }

  sendAgentPrompt(): SendAgentPrompt {
    return new SendAgentPrompt(this.#sessionStore, this.#terminal);
  }

  resizeTerminal(): ResizeTerminal {
    return new ResizeTerminal(this.#sessionStore, this.#terminal);
  }

  applyHookEvent(): ApplyHookEvent {
    return new ApplyHookEvent(this.#sessionStore);
  }

  findTicketSession(): FindTicketSession {
    return new FindTicketSession(this.#sessionStore);
  }

  stopAgentSessions(): StopAgentSessions {
    return new StopAgentSessions(this.#sessionStore, this.#terminal);
  }
}
