import type { ReactElement } from "react";

import { ATTENTION_LABEL } from "@/cockpit/entrypoints/ui/board_status";
import type { TicketCardDTO } from "@/cockpit/models/sprint_board";

const BOARD_PREFIX_PATTERN = /^\[[^\]]+\]\s*/;

export interface TicketListProps {
  readonly cards: readonly TicketCardDTO[];
  readonly selectedTicketKey: string;
  readonly onSelect: (ticketKey: string) => void;
}

export function TicketList({ cards, selectedTicketKey, onSelect }: TicketListProps): ReactElement {
  return (
    <aside className="list">
      {cards.map((card) => (
        <button
          type="button"
          key={card.ticketKey}
          title={ATTENTION_LABEL[card.attention]}
          className={`li ${card.ticketKey === selectedTicketKey ? "sel" : ""} ${card.attention === "done" ? "dn" : ""}`}
          onClick={() => {
            onSelect(card.ticketKey);
          }}
        >
          <i className={`att att-${card.attention}`} />
          <div>
            <b>{card.ticketKey}</b>
            <span>{card.title.replace(BOARD_PREFIX_PATTERN, "")}</span>
          </div>
        </button>
      ))}
    </aside>
  );
}
