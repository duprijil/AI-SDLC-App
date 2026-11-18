export class TicketError extends Error {
  override readonly name: string = "TicketError";
}

export class InvalidTicketError extends TicketError {
  override readonly name: string = "InvalidTicketError";
}

export class InvalidBoardError extends TicketError {
  override readonly name: string = "InvalidBoardError";
}

export class InvalidSprintQueryError extends TicketError {
  override readonly name: string = "InvalidSprintQueryError";
}

export class TrackerUnavailableError extends TicketError {
  override readonly name: string = "TrackerUnavailableError";
}

export class TrackerAuthError extends TicketError {
  override readonly name: string = "TrackerAuthError";
}

export class BoardNotFoundError extends TicketError {
  override readonly name: string = "BoardNotFoundError";
}

export class SprintCacheError extends TicketError {
  override readonly name: string = "SprintCacheError";
}

export class TicketNotFoundError extends TicketError {
  override readonly name: string = "TicketNotFoundError";
}

export class InvalidTransitionError extends TicketError {
  override readonly name: string = "InvalidTransitionError";
}

export class TransitionRefusedError extends TicketError {
  override readonly name: string = "TransitionRefusedError";
}

export class TicketStatusChangedError extends TicketError {
  override readonly name: string = "TicketStatusChangedError";
  readonly currentStatusName: string;

  constructor(ticketKey: string, currentStatusName: string) {
    super(`${ticketKey} is now in ${currentStatusName}. Nothing was moved.`);
    this.currentStatusName = currentStatusName;
  }
}

export class StatusNotReachableError extends TicketError {
  override readonly name: string = "StatusNotReachableError";
  readonly allowedTransitions: readonly string[];

  constructor(ticketKey: string, targetColumnName: string, allowedTransitions: readonly string[]) {
    const allowed = allowedTransitions.length === 0 ? "none" : allowedTransitions.join(", ");
    super(`No Jira transition takes ${ticketKey} to ${targetColumnName}. Allowed from here: ${allowed}`);
    this.allowedTransitions = allowedTransitions;
  }
}
