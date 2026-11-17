import type { AgentCliPort } from "@/session/adapters/agent_cli_port";
import type { HookSettingsPort } from "@/session/adapters/hook_settings_port";
import type { PtyListener, PtyPort } from "@/session/adapters/pty_port";
import type { SessionStorePort } from "@/session/adapters/session_store_port";
import type { WorkspacePort } from "@/session/adapters/workspace_port";
import { AgentSession } from "@/session/models/agent_session";
import type { HookEndpoint } from "@/session/models/hook_endpoint";
import type { TerminalSize } from "@/session/models/terminal_size";

export interface StartAgentSessionRequest {
  readonly ticketKey: string;
  readonly hookEndpoint: HookEndpoint;
  readonly size: TerminalSize;
  readonly listener: PtyListener;
}

export class StartAgentSession {
  readonly #sessionStore: SessionStorePort;
  readonly #terminal: PtyPort;
  readonly #workspace: WorkspacePort;
  readonly #hookSettings: HookSettingsPort;
  readonly #agentCli: AgentCliPort;

  constructor(
    sessionStore: SessionStorePort,
    terminal: PtyPort,
    workspace: WorkspacePort,
    hookSettings: HookSettingsPort,
    agentCli: AgentCliPort,
  ) {
    this.#sessionStore = sessionStore;
    this.#terminal = terminal;
    this.#workspace = workspace;
    this.#hookSettings = hookSettings;
    this.#agentCli = agentCli;
  }

  execute(request: StartAgentSessionRequest): AgentSession {
    const runningSession = this.#sessionStore.findActiveForTicket(request.ticketKey);
    if (runningSession !== null) {
      this.#terminal.attach(runningSession.sessionId, this.#tracking(runningSession.sessionId, request.listener));
      this.#terminal.resize(runningSession.sessionId, request.size);
      return runningSession;
    }
    return this.#launch(request);
  }

  #launch(request: StartAgentSessionRequest): AgentSession {
    const sessionId = crypto.randomUUID();
    const workspacePath = this.#workspace.prepare(request.ticketKey);
    const settingsFilePath = this.#hookSettings.write(sessionId, request.hookEndpoint);
    const session = AgentSession.start({ sessionId, ticketKey: request.ticketKey, workspacePath });
    this.#sessionStore.save(session);
    this.#terminal.spawn(
      {
        sessionId,
        launchCommand: this.#agentCli.launchCommand(sessionId, settingsFilePath),
        workingDirectory: workspacePath,
        size: request.size,
      },
      this.#tracking(sessionId, request.listener),
    );
    return session;
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

  #markEnded(sessionId: string): void {
    const session = this.#sessionStore.find(sessionId);
    if (session !== null) {
      this.#sessionStore.save(session.withStatus("ended"));
    }
  }
}
