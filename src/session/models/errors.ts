export class SessionError extends Error {
  override readonly name: string = "SessionError";
}

export class InvalidTerminalSizeError extends SessionError {
  override readonly name: string = "InvalidTerminalSizeError";
}

export class InvalidAgentSessionError extends SessionError {
  override readonly name: string = "InvalidAgentSessionError";
}

export class InvalidAgentPromptError extends SessionError {
  override readonly name: string = "InvalidAgentPromptError";
}

export class InvalidHookEndpointError extends SessionError {
  override readonly name: string = "InvalidHookEndpointError";
}

export class UnknownHookEventError extends SessionError {
  override readonly name: string = "UnknownHookEventError";
}

export class SessionNotFoundError extends SessionError {
  override readonly name: string = "SessionNotFoundError";
}

export class TerminalSpawnError extends SessionError {
  override readonly name: string = "TerminalSpawnError";
}

export class WorkspaceUnavailableError extends SessionError {
  override readonly name: string = "WorkspaceUnavailableError";
}

export class HookSettingsWriteError extends SessionError {
  override readonly name: string = "HookSettingsWriteError";
}

export class InvalidWorkspaceFileError extends SessionError {
  override readonly name: string = "InvalidWorkspaceFileError";
}
