import { join } from "node:path";

import { loadProjectConfig, type ProjectConfig } from "@/config";
import { LoggerConsole } from "@/core/adapters/logger_console";
import type { LoggerPort } from "@/core/adapters/logger_port";
import { AgentCliClaudeCode } from "@/session/adapters/agent_cli_claude_code";
import type { AgentCliPort } from "@/session/adapters/agent_cli_port";
import { AgentTranscriptClaudeCode } from "@/session/adapters/agent_transcript_claude_code";
import type { AgentTranscriptPort } from "@/session/adapters/agent_transcript_port";
import type { CheckpointStorePort } from "@/session/adapters/checkpoint_store_port";
import { CheckpointStoreSqlite } from "@/session/adapters/checkpoint_store_sqlite";
import { HookSettingsClaudeCode } from "@/session/adapters/hook_settings_claude_code";
import type { HookSettingsPort } from "@/session/adapters/hook_settings_port";
import { PtyNodePty } from "@/session/adapters/pty_node_pty";
import type { PtyPort } from "@/session/adapters/pty_port";
import type { SessionRecordPort } from "@/session/adapters/session_record_port";
import { SessionRecordSqlite } from "@/session/adapters/session_record_sqlite";
import { SessionStoreMemory } from "@/session/adapters/session_store_memory";
import type { SessionStorePort } from "@/session/adapters/session_store_port";
import { WorkspaceFolder } from "@/session/adapters/workspace_folder";
import type { WorkspacePort } from "@/session/adapters/workspace_port";
import { ApplyHookEvent } from "@/session/use_cases/apply_hook_event";
import { EndTicketSession } from "@/session/use_cases/end_ticket_session";
import { FindCheckpoint } from "@/session/use_cases/find_checkpoint";
import { FindTicketSession } from "@/session/use_cases/find_ticket_session";
import { OpenWorkspace } from "@/session/use_cases/open_workspace";
import { RecordCheckpoint } from "@/session/use_cases/record_checkpoint";
import { ResizeTerminal } from "@/session/use_cases/resize_terminal";
import { SendAgentPrompt } from "@/session/use_cases/send_agent_prompt";
import { SendTerminalInput } from "@/session/use_cases/send_terminal_input";
import { StartAgentSession } from "@/session/use_cases/start_agent_session";
import { StopAgentSessions } from "@/session/use_cases/stop_agent_sessions";
import { WriteWorkspaceFile } from "@/session/use_cases/write_workspace_file";

const CACHE_FILE_NAME = "cache.sqlite";

export class SessionContainer {
  readonly #sessionStore: SessionStorePort;
  readonly #terminal: PtyPort;
  readonly #workspace: WorkspacePort;
  readonly #hookSettings: HookSettingsPort;
  readonly #agentCli: AgentCliPort;
  readonly #agentTranscript: AgentTranscriptPort;
  readonly #sessionRecords: SessionRecordPort;
  readonly #checkpoints: CheckpointStorePort;

  constructor() {
    const config: ProjectConfig = loadProjectConfig();
    this.#sessionStore = new SessionStoreMemory();
    this.#terminal = new PtyNodePty();
    this.#workspace = new WorkspaceFolder(config.agentWorkspaceRoot);
    this.#hookSettings = new HookSettingsClaudeCode(config.agentSettingsRoot);
    this.#agentCli = new AgentCliClaudeCode(config.agentCommand);
    this.#agentTranscript = new AgentTranscriptClaudeCode();
    this.#sessionRecords = new SessionRecordSqlite(join(config.appDataRoot, CACHE_FILE_NAME));
    this.#checkpoints = new CheckpointStoreSqlite(join(config.appDataRoot, CACHE_FILE_NAME));
  }

  logger(loggerName: string): LoggerPort {
    return new LoggerConsole(loggerName);
  }

  startAgentSession(): StartAgentSession {
    return new StartAgentSession({
      sessionStore: this.#sessionStore,
      sessionRecords: this.#sessionRecords,
      terminal: this.#terminal,
      workspace: this.#workspace,
      hookSettings: this.#hookSettings,
      agentCli: this.#agentCli,
      agentTranscript: this.#agentTranscript,
    });
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

  openWorkspace(): OpenWorkspace {
    return new OpenWorkspace(this.#workspace);
  }

  writeWorkspaceFile(): WriteWorkspaceFile {
    return new WriteWorkspaceFile(this.#workspace);
  }

  endTicketSession(): EndTicketSession {
    return new EndTicketSession(this.#sessionStore, this.#sessionRecords, this.#terminal);
  }

  recordCheckpoint(): RecordCheckpoint {
    return new RecordCheckpoint(this.#checkpoints);
  }

  findCheckpoint(): FindCheckpoint {
    return new FindCheckpoint(this.#checkpoints);
  }

  stopAgentSessions(): StopAgentSessions {
    return new StopAgentSessions(this.#sessionStore, this.#terminal);
  }
}
