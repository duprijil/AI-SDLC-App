import type { ReactElement } from "react";

import { BoardStatus, FailureBanner } from "@/cockpit/entrypoints/ui/board_status";
import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import { SessionTerminal } from "@/cockpit/entrypoints/ui/session_terminal";
import { TicketGraph } from "@/cockpit/entrypoints/ui/ticket_graph";
import { TicketList } from "@/cockpit/entrypoints/ui/ticket_list";
import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";

export interface CockpitScreenProps {
  readonly board: SprintBoardDTO | null;
  readonly ticketKey: string;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
  readonly onSelectTicket: (ticketKey: string) => void;
  readonly onBack: () => void;
}

export function CockpitScreen({
  board,
  ticketKey,
  isRefreshing,
  onRefresh,
  onSelectTicket,
  onBack,
}: CockpitScreenProps): ReactElement {
  const card = board?.cards.find((boardCard) => boardCard.ticketKey === ticketKey) ?? null;
  return (
    <section className="screen cockpit-screen">
      <TicketList cards={board?.cards ?? []} selectedTicketKey={ticketKey} onSelect={onSelectTicket} />
      <main className="focus">
        <div className="thead">
          <button type="button" className="btn icon" title="All tickets" onClick={onBack}>
            ←
          </button>
          <h1 style={{ viewTransitionName: "ticket-title" }}>
            <span className="key">{ticketKey}</span>
            {card?.title ?? "This ticket is no longer in the sprint"}
          </h1>
          <div className="acts">
            <BoardStatus board={board} isRefreshing={isRefreshing} />
            {card !== null && <span className="pill">{card.statusName.toUpperCase()}</span>}
            <button type="button" className="btn" onClick={onRefresh} disabled={isRefreshing}>
              ↻ Refresh
            </button>
            <button
              type="button"
              className="btn icon"
              title="Open in Jira"
              onClick={() => {
                void sprintBoardBridge().openInTracker(ticketKey);
              }}
            >
              ↗
            </button>
          </div>
        </div>
        <FailureBanner board={board} />
        <div className="cockpit-graph" style={{ viewTransitionName: "ticket-graph" }}>
          <TicketGraph columns={board?.columns ?? []} columnIndex={card?.columnIndex ?? null} />
        </div>
        <div className="tui">
          <SessionTerminal key={ticketKey} ticketKey={ticketKey} />
        </div>
      </main>
    </section>
  );
}
