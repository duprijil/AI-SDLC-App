import type { ReactElement } from "react";

import { TicketGraph } from "@/cockpit/entrypoints/ui/ticket_graph";
import type { BoardColumnViewDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";

export interface TicketCardProps {
  readonly card: TicketCardDTO;
  readonly columns: readonly BoardColumnViewDTO[];
  readonly isMorphing: boolean;
  readonly onOpen: (ticketKey: string) => void;
}

export function TicketCard({ card, columns, isMorphing, onOpen }: TicketCardProps): ReactElement {
  return (
    <button
      type="button"
      className="tcard"
      data-ticket-key={card.ticketKey}
      onClick={() => {
        onOpen(card.ticketKey);
      }}
    >
      <div className="tc-h">
        <div className="tc-title" style={{ viewTransitionName: isMorphing ? "ticket-title" : "none" }}>
          <span className="key">{card.ticketKey}</span>
          {card.title}
        </div>
        <span className="pill">{card.statusName.toUpperCase()}</span>
      </div>
      <div style={{ viewTransitionName: isMorphing ? "ticket-graph" : "none" }}>
        <TicketGraph columns={columns} columnIndex={card.columnIndex} />
      </div>
    </button>
  );
}
