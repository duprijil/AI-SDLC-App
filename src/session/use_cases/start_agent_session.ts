import type { AgentCliPort } from "@/session/adapters/agent_cli_port";
import type { AgentTokenPort } from "@/session/adapters/agent_token_port";
import type { AgentTranscriptPort } from "@/session/adapters/agent_transcript_port";
import type { HookSettingsPort } from "@/session/adapters/hook_settings_port";
import type { McpConfigPort } from "@/session/adapters/mcp_config_port";
import type { PtyListener, PtyPort } from "@/session/adapters/pty_port";
import type { SessionRecordPort } from "@/session/adapters/session_record_port";
import type { SessionStorePort } from "@/session/adapters/session_store_port";
import type { WorkspacePort } from "@/session/adapters/workspace_port";
import { AgentSession } from "@/session/models/agent_session";
import { SessionRecordError } from "@/session/models/errors";
import type { HookEndpoint } from "@/session/models/hook_endpoint";
import { SessionRecord, type SessionRecordDTO } from "@/session/models/session_record";
import type { TerminalSize } from "@/session/models/terminal_size";

const FAST_FAILURE_MILLISECONDS = 5_000;
const RESUME_FAILED_NOTE = "\r\n\u001b[33mCouldn't resume the last session; started a new one.\u001b[0m\r\n";

export interface StartAgentSessionRequest {
  readonly ticketKey: string;
  readonly hookEndpoint: HookEndpoint;
  readonly size: TerminalSize;
  readonly listener: PtyListener;
}

export interface SessionStartPorts {
  readonly sessionStore: SessionStorePort;
  readonly sessionRecords: SessionRecordPort;
  readonly terminal: PtyPort;
  readonly workspace: WorkspacePort;
  readonly hookSettings: HookSettingsPort;
  readonly agentCli: AgentCliPort;
  readonly agentTranscript: AgentTranscriptPort;
  readonly agentTokens: AgentTokenPort;
  readonly mcpConfig: McpConfigPort;
}

interface Launch {
  readonly request: StartAgentSessionRequest;
  readonly sessionId: string;
  readonly workspacePath: string;
  readonly isResume: boolean;
}

export class StartAgentSession {
  readonly #ports: SessionStartPorts;

  constructor(ports: SessionStartPorts) {
    this.#ports = ports;
  }

  execute(request: StartAgentSessionRequest): AgentSession {
    const runningSession = this.#ports.sessionStore.findActiveForTicket(request.ticketKey);
    if (runningSession !== null) {
      this.#ports.terminal.attach(runningSession.sessionId, this.#tracking(runningSession.sessionId, request.listener));
      this.#ports.terminal.resize(runningSession.sessionId, request.size);
      return runningSession;
    }
    const workspacePath = this.#ports.workspace.prepare(request.ticketKey);
    const record = this.#lastRecord(request.ticketKey);
    if (
      SessionRecord.canResume(record, workspacePath) &&
      this.#ports.agentTranscript.exists(workspacePath, record.sessionId)
    ) {
      return this.#spawn({ request, sessionId: record.sessionId, workspacePath, isResume: true });
    }
    return this.#startFresh(request, workspacePath);
  }

  #startFresh(request: StartAgentSessionRequest, workspacePath: string): AgentSession {
    const sessionId = crypto.randomUUID();
    this.#saveRecord({
      ticketKey: request.ticketKey,
      sessionId,
      workspacePath,
      startedAt: new Date().toISOString(),
      endedAt: null,
    });
    return this.#spawn({ request, sessionId, workspacePath, isResume: false });
  }

  #spawn(launch: Launch): AgentSession {
    const files = {
      settingsFilePath: this.#ports.hookSettings.write(launch.sessionId, launch.request.hookEndpoint),
      mcpConfigFilePath: this.#ports.mcpConfig.write({
        sessionId: launch.sessionId,
        url: launch.request.hookEndpoint.mcpUrl(),
        token: this.#ports.agentTokens.issue(launch.sessionId),
      }),
    };
    const session = AgentSession.start({
      sessionId: launch.sessionId,
      ticketKey: launch.request.ticketKey,
      workspacePath: launch.workspacePath,
    });
    this.#ports.sessionStore.save(session);
    const launchCommand = launch.isResume
      ? this.#ports.agentCli.resumeCommand(launch.sessionId, files)
      : this.#ports.agentCli.launchCommand(launch.sessionId, files);
    const listener = launch.isResume
      ? this.#resumeTracking(launch)
      : this.#tracking(launch.sessionId, launch.request.listener);
    this.#ports.terminal.spawn(
      {
        sessionId: launch.sessionId,
        launchCommand,
        workingDirectory: launch.workspacePath,
        size: launch.request.size,
      },
      listener,
    );
    return session;
  }

  #resumeTracking(launch: Launch): PtyListener {
    const startedAt = Date.now();
    const listener = launch.request.listener;
    return {
      onOutput: (chunk): void => {
        listener.onOutput(chunk);
      },
      onExit: (exitCode): void => {
        this.#markEnded(launch.sessionId);
        if (exitCode !== 0 && Date.now() - startedAt < FAST_FAILURE_MILLISECONDS) {
          listener.onOutput(RESUME_FAILED_NOTE);
          this.#startFresh(launch.request, launch.workspacePath);
          return;
        }
        listener.onExit(exitCode);
      },
    };
  }

  #tracking(sessionId: string, listener: PtyListener): PtyListener {
    return {
      onOutput: (chunk): void => {
        listener.onOutput(chunk);
      },
      onExit: (exitCode): void => {
        this.#markEnded(sessionId);
        listener.onExit(exitCode);
      },
    };
  }

  #lastRecord(ticketKey: string): SessionRecordDTO | null {
    try {
      return this.#ports.sessionRecords.latestFor(ticketKey);
    } catch (error) {
      if (error instanceof SessionRecordError) {
        return null;
      }
      throw error;
    }
  }

  #saveRecord(record: SessionRecordDTO): void {
    try {
      this.#ports.sessionRecords.save(record);
    } catch (error) {
      if (!(error instanceof SessionRecordError)) {
        throw error;
      }
    }
  }

  #markEnded(sessionId: string): void {
    const session = this.#ports.sessionStore.find(sessionId);
    if (session !== null) {
      this.#ports.sessionStore.save(session.withStatus("ended"));
    }
  }
}
