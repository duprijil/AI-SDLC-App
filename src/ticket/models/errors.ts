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
