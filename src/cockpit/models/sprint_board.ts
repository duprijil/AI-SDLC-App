import { PipelineBoardMismatchError } from "@/cockpit/models/errors";
import { ensure } from "@/core/models/invariant";
import type { FlowLevelDTO, Pipeline } from "@/pipeline/models/pipeline";
import type { SprintSnapshot } from "@/ticket/models/sprint_snapshot";
import type { Ticket } from "@/ticket/models/ticket";

export type SprintBoardSource = "cache" | "live";

export interface BoardColumnViewDTO {
  readonly columnKey: string;
  readonly name: string;
  readonly levels: readonly FlowLevelDTO[];
}

export interface TicketCardDTO {
  readonly ticketKey: string;
  readonly title: string;
  readonly statusName: string;
  readonly columnIndex: number | null;
}

export interface SprintBoardDTO {
  readonly projectName: string;
  readonly columns: readonly BoardColumnViewDTO[];
  readonly cards: readonly TicketCardDTO[];
  readonly source: SprintBoardSource;
  readonly fetchedAt: string | null;
  readonly failure: string | null;
}

export interface SprintBoardCompositionDTO {
  readonly projectName: string;
  readonly pipeline: Pipeline;
  readonly snapshot: SprintSnapshot;
  readonly source: SprintBoardSource;
}

const ticketKeyOrder = new Intl.Collator("en", { numeric: true });

const byFurthestColumn = (left: TicketCardDTO, right: TicketCardDTO): number => {
  const leftIndex = left.columnIndex ?? -1;
  const rightIndex = right.columnIndex ?? -1;
  return rightIndex - leftIndex || ticketKeyOrder.compare(left.ticketKey, right.ticketKey);
};

export class SprintBoard {
  readonly #board: SprintBoardDTO;

  private constructor(board: SprintBoardDTO) {
    this.#board = board;
  }

  static compose(composition: SprintBoardCompositionDTO): SprintBoard {
    const board = composition.snapshot.board;
    const boardColumnKeys = board.columns.map((column) => column.columnKey);
    const unknownColumnKeys = composition.pipeline
      .columnKeys()
      .filter((columnKey) => !boardColumnKeys.includes(columnKey));
    ensure(
      unknownColumnKeys.length === 0,
      () =>
        new PipelineBoardMismatchError(
          unknownColumnKeys.map(
            (columnKey) =>
              `pipeline.yaml: columns.${columnKey}: the board has no such column (board columns: ${boardColumnKeys.join(", ")})`,
          ),
        ),
    );
    const toCard = (ticket: Ticket): TicketCardDTO => ({
      ticketKey: ticket.ticketKey,
      title: ticket.title,
      statusName: ticket.statusName,
      columnIndex: board.columnIndexFor(ticket.statusId),
    });
    return new SprintBoard({
      projectName: composition.projectName,
      columns: board.columns.map((column) => ({
        columnKey: column.columnKey,
        name: column.name,
        levels: composition.pipeline.columnFor(column.columnKey)?.levels ?? [],
      })),
      cards: composition.snapshot.tickets.map(toCard).sort(byFurthestColumn),
      source: composition.source,
      fetchedAt: composition.snapshot.fetchedAt,
      failure: null,
    });
  }

  static empty(projectName: string): SprintBoard {
    return new SprintBoard({ projectName, columns: [], cards: [], source: "live", fetchedAt: null, failure: null });
  }

  withFailure(failure: string): SprintBoard {
    return new SprintBoard({ ...this.#board, failure });
  }

  toDTO(): SprintBoardDTO {
    return this.#board;
  }
}
