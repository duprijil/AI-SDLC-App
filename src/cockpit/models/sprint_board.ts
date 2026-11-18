import { type AgentActivity, Attention, type AttentionKind } from "@/cockpit/models/attention";
import { PipelineBoardMismatchError } from "@/cockpit/models/errors";
import type { TicketFlowDTO } from "@/cockpit/models/ticket_flow";
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
  readonly flow: TicketFlowDTO | null;
  readonly attention: AttentionKind;
}

export interface SprintBoardDTO {
  readonly projectName: string;
  readonly columns: readonly BoardColumnViewDTO[];
  readonly cards: readonly TicketCardDTO[];
  readonly source: SprintBoardSource;
  readonly fetchedAt: string | null;
  readonly failure: string | null;
  readonly codeHostFailure: string | null;
}

export interface SprintBoardCompositionDTO {
  readonly projectName: string;
  readonly pipeline: Pipeline;
  readonly snapshot: SprintSnapshot;
  readonly source: SprintBoardSource;
}

export type ActivityLookup = (ticketKey: string) => AgentActivity;

const ticketKeyOrder = new Intl.Collator("en", { numeric: true });

const byAttentionThenColumn = (left: TicketCardDTO, right: TicketCardDTO): number =>
  Attention.rank(left.attention) - Attention.rank(right.attention) ||
  (right.columnIndex ?? -1) - (left.columnIndex ?? -1) ||
  ticketKeyOrder.compare(left.ticketKey, right.ticketKey);

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
    const lastColumnIndex = board.columns.length - 1;
    const toCard = (ticket: Ticket): TicketCardDTO => {
      const columnIndex = board.columnIndexFor(ticket.statusId);
      return {
        ticketKey: ticket.ticketKey,
        title: ticket.title,
        statusName: ticket.statusName,
        columnIndex,
        flow: null,
        attention: Attention.ofFlow({
          isInLastColumn: columnIndex === lastColumnIndex,
          hasFailure: false,
          needsYou: false,
        }),
      };
    };
    return new SprintBoard({
      projectName: composition.projectName,
      columns: board.columns.map((column) => ({
        columnKey: column.columnKey,
        name: column.name,
        levels: composition.pipeline.columnFor(column.columnKey)?.levels ?? [],
      })),
      cards: composition.snapshot.tickets.map(toCard).sort(byAttentionThenColumn),
      source: composition.source,
      fetchedAt: composition.snapshot.fetchedAt,
      failure: null,
      codeHostFailure: null,
    });
  }

  static empty(projectName: string): SprintBoard {
    return new SprintBoard({
      projectName,
      columns: [],
      cards: [],
      source: "live",
      fetchedAt: null,
      failure: null,
      codeHostFailure: null,
    });
  }

  withFlows(flows: ReadonlyMap<string, TicketFlowDTO>, activityOf: ActivityLookup): SprintBoard {
    const cards = this.#board.cards.map((card): TicketCardDTO => {
      const flow = flows.get(card.ticketKey) ?? card.flow;
      const flowAttention = flow?.flowAttention ?? card.attention;
      return { ...card, flow, attention: Attention.combine(flowAttention, activityOf(card.ticketKey)) };
    });
    return new SprintBoard({ ...this.#board, cards: cards.sort(byAttentionThenColumn) });
  }

  withFailure(failure: string): SprintBoard {
    return new SprintBoard({ ...this.#board, failure });
  }

  withCodeHostFailure(codeHostFailure: string | null): SprintBoard {
    return new SprintBoard({ ...this.#board, codeHostFailure });
  }

  cardFor(ticketKey: string): TicketCardDTO | null {
    return this.#board.cards.find((card) => card.ticketKey === ticketKey) ?? null;
  }

  ticketKeys(): readonly string[] {
    return this.#board.cards.map((card) => card.ticketKey);
  }

  toDTO(): SprintBoardDTO {
    return this.#board;
  }
}
