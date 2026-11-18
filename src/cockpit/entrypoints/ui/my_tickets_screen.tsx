import { type ReactElement, useState } from "react";

import { ATTENTION_LABEL, BoardStatus, FailureBanner, LiveStatus } from "@/cockpit/entrypoints/ui/board_status";
import { TicketCard, type TicketCardProps } from "@/cockpit/entrypoints/ui/ticket_card";
import { ATTENTION_ORDER, type AttentionKind } from "@/cockpit/models/attention";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";

type AttentionFilter = AttentionKind | "all";

const FILTERS: readonly AttentionFilter[] = ["all", "needs_you", "agent_working", "waiting", "done"];

const matches = (filter: AttentionFilter, attention: AttentionKind): boolean =>
  filter === "all" || attention === filter || (filter === "needs_you" && attention === "failure");

export interface MyTicketsScreenProps {
  readonly board: SprintBoardDTO | null;
  readonly isRefreshing: boolean;
  readonly scans: ReadonlyMap<string, RefreshProgressDTO>;
  readonly morphingTicketKey: string | null;
  readonly onRefresh: () => void;
  readonly onOpenTicket: (ticketKey: string) => void;
  readonly onBlockClick: (ticketKey: string) => TicketCardProps["onBlockClick"];
}

function EmptyState({ board, isRefreshing }: Pick<MyTicketsScreenProps, "board" | "isRefreshing">): ReactElement {
  if (board === null) {
    return <div className="empty">{isRefreshing ? "Loading your sprint…" : "No sprint loaded yet."}</div>;
  }
  return <div className="empty">No tickets here.</div>;
}

export function MyTicketsScreen({
  board,
  isRefreshing,
  scans,
  morphingTicketKey,
  onRefresh,
  onOpenTicket,
  onBlockClick,
}: MyTicketsScreenProps): ReactElement {
  const [filter, setFilter] = useState<AttentionFilter>("all");
  const allCards = board?.cards ?? [];
  const cards = allCards.filter((card) => matches(filter, card.attention));
  const countOf = (option: AttentionFilter): number =>
    allCards.filter((card) => matches(option, card.attention)).length;
  return (
    <section className="screen tickets-screen">
      <div className="tl">
        <div className="tl-top">
          <h2>My tickets</h2>
          <div className="filters">
            {FILTERS.filter((option) => option === "all" || ATTENTION_ORDER.includes(option)).map((option) => (
              <button
                type="button"
                key={option}
                className={`chip ${filter === option ? "on" : ""}`}
                onClick={() => {
                  setFilter(option);
                }}
              >
                {option === "all" ? "All" : ATTENTION_LABEL[option]}
                <b>{countOf(option)}</b>
              </button>
            ))}
          </div>
          <span className="spacer" />
          <BoardStatus board={board} isRefreshing={isRefreshing} />
          <button type="button" className="btn" onClick={onRefresh} disabled={isRefreshing}>
            ↻ Refresh all
          </button>
          <LiveStatus board={board} />
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
              scan={scans.get(card.ticketKey) ?? null}
              isMorphing={card.ticketKey === morphingTicketKey}
              onOpen={onOpenTicket}
              onBlockClick={onBlockClick(card.ticketKey)}
            />
          ))
        )}
      </div>
    </section>
  );
}
