import type { ReactElement } from "react";

import { AttentionBadge } from "@/cockpit/entrypoints/ui/board_status";
import { TicketGraph, type TicketGraphProps } from "@/cockpit/entrypoints/ui/ticket_graph";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { BoardColumnViewDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";

export interface TicketCardProps {
  readonly card: TicketCardDTO;
  readonly columns: readonly BoardColumnViewDTO[];
  readonly scan: RefreshProgressDTO | null;
  readonly isMorphing: boolean;
  readonly onOpen: (ticketKey: string) => void;
  readonly onBlockClick: TicketGraphProps["onBlockClick"];
  readonly onMoveClick: TicketGraphProps["onMoveClick"];
}

export function TicketCard({
  card,
  columns,
  scan,
  isMorphing,
  onOpen,
  onBlockClick,
  onMoveClick,
}: TicketCardProps): ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`tcard tcard-${card.attention}`}
      data-ticket-key={card.ticketKey}
      onClick={() => {
        onOpen(card.ticketKey);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onOpen(card.ticketKey);
        }
      }}
    >
      <div className="tc-h">
        <div className="tc-title" style={{ viewTransitionName: isMorphing ? "ticket-title" : "none" }}>
          <span className="key">{card.ticketKey}</span>
          {card.title}
        </div>
        <AttentionBadge attention={card.attention} />
        <span className="pill">{card.statusName.toUpperCase()}</span>
      </div>
      <div style={{ viewTransitionName: isMorphing ? "ticket-graph" : "none" }}>
        <TicketGraph columns={columns} card={card} scan={scan} onBlockClick={onBlockClick} onMoveClick={onMoveClick} />
      </div>
    </div>
  );
}
