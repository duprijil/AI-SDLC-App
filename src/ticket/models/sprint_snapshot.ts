import { ensure } from "@/core/models/invariant";
import { Board, type BoardDTO } from "@/ticket/models/board";
import { InvalidTicketError } from "@/ticket/models/errors";
import { Ticket, type TicketDTO } from "@/ticket/models/ticket";

export interface SprintSnapshotDTO {
  readonly board: BoardDTO;
  readonly tickets: readonly TicketDTO[];
  readonly fetchedAt: string;
}

export interface SprintCaptureDTO {
  readonly board: Board;
  readonly tickets: readonly Ticket[];
  readonly hiddenStatusNames: readonly string[];
  readonly fetchedAt: Date;
}

export class SprintSnapshot {
  readonly board: Board;
  readonly tickets: readonly Ticket[];
  readonly fetchedAt: string;

  private constructor(board: Board, tickets: readonly Ticket[], fetchedAt: string) {
    this.board = board;
    this.tickets = tickets;
    this.fetchedAt = fetchedAt;
  }

  static capture(capture: SprintCaptureDTO): SprintSnapshot {
    const visibleTickets = capture.tickets.filter((ticket) => !ticket.isHiddenBy(capture.hiddenStatusNames));
    return new SprintSnapshot(capture.board, Object.freeze(visibleTickets), capture.fetchedAt.toISOString());
  }

  static fromDTO(snapshot: SprintSnapshotDTO): SprintSnapshot {
    ensure(
      !Number.isNaN(Date.parse(snapshot.fetchedAt)),
      () => new InvalidTicketError(`Snapshot time is not a date: ${snapshot.fetchedAt}`),
    );
    return new SprintSnapshot(
      Board.fromDTO(snapshot.board),
      Object.freeze(snapshot.tickets.map((ticket) => Ticket.create(ticket))),
      snapshot.fetchedAt,
    );
  }

  toDTO(): SprintSnapshotDTO {
    return {
      board: this.board.toDTO(),
      tickets: this.tickets.map((ticket) => ticket.toDTO()),
      fetchedAt: this.fetchedAt,
    };
  }
}
