import type { ReactElement } from "react";

import { BoardStatus, FailureBanner } from "@/cockpit/entrypoints/ui/board_status";
import { TicketCard } from "@/cockpit/entrypoints/ui/ticket_card";
import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";

export interface MyTicketsScreenProps {
  readonly board: SprintBoardDTO | null;
  readonly isRefreshing: boolean;
  readonly morphingTicketKey: string | null;
  readonly onRefresh: () => void;
  readonly onOpenTicket: (ticketKey: string) => void;
}

function EmptyState({ board, isRefreshing }: Pick<MyTicketsScreenProps, "board" | "isRefreshing">): ReactElement {
  if (board === null) {
    return <div className="empty">{isRefreshing ? "Loading your sprint…" : "No sprint loaded yet."}</div>;
  }
  return <div className="empty">No tickets match the project's scope.</div>;
}

export function MyTicketsScreen({
  board,
  isRefreshing,
  morphingTicketKey,
  onRefresh,
  onOpenTicket,
}: MyTicketsScreenProps): ReactElement {
  const cards = board?.cards ?? [];
  return (
    <section className="screen tickets-screen">
      <div className="tl">
        <div className="tl-top">
          <h2>My tickets</h2>
          <span className="tl-project">{board?.projectName ?? ""}</span>
          <span className="spacer" />
          <BoardStatus board={board} isRefreshing={isRefreshing} />
          <button type="button" className="btn" onClick={onRefresh} disabled={isRefreshing}>
            ↻ Refresh
          </button>
        </div>
        <FailureBanner board={board} />
        {cards.length === 0 ? (
          <EmptyState board={board} isRefreshing={isRefreshing} />
        ) : (
          cards.map((card) => (
            <TicketCard
              key={card.ticketKey}
              card={card}
              columns={board?.columns ?? []}
              isMorphing={card.ticketKey === morphingTicketKey}
              onOpen={onOpenTicket}
            />
          ))
        )}
      </div>
    </section>
  );
}
