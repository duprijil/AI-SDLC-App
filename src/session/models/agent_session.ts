import { ensure } from "@/core/models/invariant";
import { InvalidAgentSessionError } from "@/session/models/errors";

export type SessionStatus = "starting" | "working" | "waiting" | "idle" | "ended";

export interface AgentSessionDTO {
  readonly sessionId: string;
  readonly ticketKey: string;
  readonly workspacePath: string;
  readonly status: SessionStatus;
}

export interface AgentSessionStartDTO {
  readonly sessionId: string;
  readonly ticketKey: string;
  readonly workspacePath: string;
}

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TICKET_KEY_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;

export class AgentSession {
  readonly sessionId: string;
  readonly ticketKey: string;
  readonly workspacePath: string;
  readonly status: SessionStatus;

  private constructor(session: AgentSessionDTO) {
    this.sessionId = session.sessionId;
    this.ticketKey = session.ticketKey;
    this.workspacePath = session.workspacePath;
    this.status = session.status;
  }

  static start(session: AgentSessionStartDTO): AgentSession {
    ensure(
      SESSION_ID_PATTERN.test(session.sessionId),
      () => new InvalidAgentSessionError(`Session id must be a UUID: ${session.sessionId}`),
    );
    ensure(
      TICKET_KEY_PATTERN.test(session.ticketKey),
      () => new InvalidAgentSessionError(`Ticket key must look like ABC-123: ${session.ticketKey}`),
    );
    ensure(session.workspacePath !== "", () => new InvalidAgentSessionError("Workspace path must not be empty"));
    return new AgentSession({ ...session, status: "starting" });
  }

  isActive(): boolean {
    return this.status !== "ended";
  }

  withStatus(status: SessionStatus): AgentSession {
    if (!this.isActive()) {
      return this;
    }
    return new AgentSession({ ...this.toDTO(), status });
  }

  toDTO(): AgentSessionDTO {
    return {
      sessionId: this.sessionId,
      ticketKey: this.ticketKey,
      workspacePath: this.workspacePath,
      status: this.status,
    };
  }
}
