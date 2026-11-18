import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";
import type { EndTicketSession } from "@/session/use_cases/end_ticket_session";

const lastColumnIndexOf = (board: SprintBoardDTO): number => board.columns.length - 1;

export class EndFinishedSessions {
  readonly #endTicketSession: EndTicketSession;

  constructor(endTicketSession: EndTicketSession) {
    this.#endTicketSession = endTicketSession;
  }

  execute(previous: SprintBoardDTO | null, current: SprintBoardDTO): readonly string[] {
    const lastColumnIndex = lastColumnIndexOf(current);
    const wasFinished = (ticketKey: string): boolean => {
      if (previous === null) {
        return false;
      }
      const card = previous.cards.find((candidate) => candidate.ticketKey === ticketKey);
      return card?.columnIndex === lastColumnIndexOf(previous);
    };
    const finished = current.cards
      .filter((card) => lastColumnIndex >= 0 && card.columnIndex === lastColumnIndex)
      .filter((card) => !wasFinished(card.ticketKey))
      .map((card) => card.ticketKey);
    for (const ticketKey of finished) {
      this.#endTicketSession.execute(ticketKey);
    }
    return finished;
  }
}
