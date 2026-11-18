import type { ReactElement } from "react";

import { FailureBanner, LiveStatus, TicketRefreshStatus } from "@/cockpit/entrypoints/ui/board_status";
import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import { SessionTerminal } from "@/cockpit/entrypoints/ui/session_terminal";
import { TicketGraph, type TicketGraphProps } from "@/cockpit/entrypoints/ui/ticket_graph";
import { TicketList } from "@/cockpit/entrypoints/ui/ticket_list";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";

export interface PromptHandOff {
  readonly ticketKey: string;
  readonly promptText: string;
  readonly hasTimedOut: boolean;
  readonly remainingPrompts: readonly string[];
}

export interface CockpitScreenProps {
  readonly board: SprintBoardDTO | null;
  readonly ticketKey: string;
  readonly scan: RefreshProgressDTO | null;
  readonly isRefreshing: boolean;
  readonly promptHandOff: PromptHandOff | null;
  readonly onRefresh: (ticketKey: string) => void;
  readonly onSelectTicket: (ticketKey: string) => void;
  readonly onBack: () => void;
  readonly onBlockClick: TicketGraphProps["onBlockClick"];
  readonly onMoveClick: TicketGraphProps["onMoveClick"];
  readonly onPromptDelivered: () => void;
  readonly onPromptTimedOut: () => void;
}

function PromptFallback({ promptHandOff }: { readonly promptHandOff: PromptHandOff }): ReactElement {
  return (
    <div className="banner">
      Claude Code wasn't ready, so the prompt wasn't pasted.
      <button
        type="button"
        className="btn"
        onClick={() => void navigator.clipboard.writeText(promptHandOff.promptText)}
      >
        Copy prompt
      </button>
    </div>
  );
}

export function CockpitScreen(props: CockpitScreenProps): ReactElement {
  const { board, ticketKey, scan, isRefreshing, promptHandOff } = props;
  const card = board?.cards.find((boardCard) => boardCard.ticketKey === ticketKey) ?? null;
  const prompt = promptHandOff?.ticketKey === ticketKey && !promptHandOff.hasTimedOut ? promptHandOff.promptText : null;
  return (
    <section className="screen cockpit-screen">
      <TicketList cards={board?.cards ?? []} selectedTicketKey={ticketKey} onSelect={props.onSelectTicket} />
      <main className="focus">
        <div className="thead">
          <button type="button" className="btn icon" title="All tickets" onClick={props.onBack}>
            ←
          </button>
          <h1 style={{ viewTransitionName: "ticket-title" }}>
            <span className="key">{ticketKey}</span>
            {card?.title ?? "This ticket is no longer in the sprint"}
          </h1>
          <div className="acts">
            <TicketRefreshStatus
              card={card}
              columnNames={(board?.columns ?? []).map((column) => column.name)}
              scan={scan}
            />
            {card !== null && <span className="pill">{card.statusName.toUpperCase()}</span>}
            <button
              type="button"
              className="btn"
              onClick={() => {
                props.onRefresh(ticketKey);
              }}
              disabled={isRefreshing}
            >
              ↻ Refresh
            </button>
            <LiveStatus board={board} />
            <button
              type="button"
              className="btn icon"
              title="Open in Jira"
              onClick={() => void sprintBoardBridge().openInTracker(ticketKey)}
            >
              ↗
            </button>
          </div>
        </div>
        <FailureBanner board={board} />
        {promptHandOff?.ticketKey === ticketKey && promptHandOff.hasTimedOut && (
          <PromptFallback promptHandOff={promptHandOff} />
        )}
        <div className="cockpit-graph" style={{ viewTransitionName: "ticket-graph" }}>
          <TicketGraph
            columns={board?.columns ?? []}
            card={card}
            scan={scan}
            onBlockClick={props.onBlockClick}
            onMoveClick={props.onMoveClick}
          />
        </div>
        <div className="tui">
          <SessionTerminal
            key={ticketKey}
            ticketKey={ticketKey}
            pendingPrompt={prompt}
            onPromptDelivered={props.onPromptDelivered}
            onPromptTimedOut={props.onPromptTimedOut}
          />
        </div>
      </main>
    </section>
  );
}
