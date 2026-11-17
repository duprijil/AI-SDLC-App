import "@/cockpit/resources/cockpit.css";

import { type ReactElement, StrictMode, useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import { CockpitScreen } from "@/cockpit/entrypoints/ui/cockpit_screen";
import { MyTicketsScreen } from "@/cockpit/entrypoints/ui/my_tickets_screen";
import { CockpitError } from "@/cockpit/models/errors";
import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";

const ROOT_ELEMENT_ID = "root";

type Screen = { readonly name: "tickets" } | { readonly name: "cockpit"; readonly ticketKey: string };

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : "unknown");

function withTransition(change: () => void): void {
  document.startViewTransition(() => {
    flushSync(change);
  });
}

function CockpitApp(): ReactElement {
  const [board, setBoard] = useState<SprintBoardDTO | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: "tickets" });
  const [morphingTicketKey, setMorphingTicketKey] = useState<string | null>(null);

  const showFailure = useCallback((error: unknown) => {
    setBoard((current) => (current === null ? null : { ...current, failure: reasonOf(error) }));
  }, []);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    sprintBoardBridge()
      .refresh()
      .then(setBoard)
      .catch(showFailure)
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [showFailure]);

  useEffect(() => {
    sprintBoardBridge()
      .cached()
      .then((cachedBoard) => {
        if (cachedBoard !== null) {
          setBoard(cachedBoard);
        }
      })
      .catch(showFailure)
      .finally(refresh);
  }, [refresh, showFailure]);

  const openTicket = useCallback((ticketKey: string) => {
    flushSync(() => {
      setMorphingTicketKey(ticketKey);
    });
    withTransition(() => {
      setScreen({ name: "cockpit", ticketKey });
    });
  }, []);

  const selectTicket = useCallback((ticketKey: string) => {
    withTransition(() => {
      setScreen({ name: "cockpit", ticketKey });
    });
  }, []);

  const backToTickets = useCallback(() => {
    if (screen.name !== "cockpit") {
      return;
    }
    const ticketKey = screen.ticketKey;
    flushSync(() => {
      setMorphingTicketKey(ticketKey);
    });
    withTransition(() => {
      setScreen({ name: "tickets" });
      document.querySelector(`[data-ticket-key="${ticketKey}"]`)?.scrollIntoView({ block: "center" });
    });
  }, [screen]);

  if (screen.name === "cockpit") {
    return (
      <CockpitScreen
        board={board}
        ticketKey={screen.ticketKey}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
        onSelectTicket={selectTicket}
        onBack={backToTickets}
      />
    );
  }
  return (
    <MyTicketsScreen
      board={board}
      isRefreshing={isRefreshing}
      morphingTicketKey={morphingTicketKey}
      onRefresh={refresh}
      onOpenTicket={openTicket}
    />
  );
}

export function mountCockpit(): void {
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (rootElement === null) {
    throw new CockpitError(`Missing #${ROOT_ELEMENT_ID} element`);
  }
  createRoot(rootElement).render(
    <StrictMode>
      <CockpitApp />
    </StrictMode>,
  );
}
