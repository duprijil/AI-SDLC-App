import "@/cockpit/resources/cockpit.css";

import { type ReactElement, StrictMode, useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { BlockPopover, type PopoverTarget } from "@/cockpit/entrypoints/ui/block_popover";
import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import { CockpitScreen, type PromptHandOff } from "@/cockpit/entrypoints/ui/cockpit_screen";
import { MyTicketsScreen } from "@/cockpit/entrypoints/ui/my_tickets_screen";
import { useSprintBoard } from "@/cockpit/entrypoints/ui/use_sprint_board";
import type { BlockStateDTO } from "@/cockpit/models/block_state";
import type { PromptKind } from "@/cockpit/models/change_prompt";
import { CockpitError } from "@/cockpit/models/errors";

const ROOT_ELEMENT_ID = "root";

type Screen = { readonly name: "tickets" } | { readonly name: "cockpit"; readonly ticketKey: string };

function withTransition(change: () => void): void {
  document.startViewTransition(() => {
    flushSync(change);
  });
}

function CockpitApp(): ReactElement {
  const sprintBoard = useSprintBoard();
  const { board, scans, refreshingTicketKeys } = sprintBoard;
  const [screen, setScreen] = useState<Screen>({ name: "tickets" });
  const [morphingTicketKey, setMorphingTicketKey] = useState<string | null>(null);
  const [popoverTarget, setPopoverTarget] = useState<PopoverTarget | null>(null);
  const [promptHandOff, setPromptHandOff] = useState<PromptHandOff | null>(null);

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

  const blockClickFor = useCallback(
    (ticketKey: string) =>
      (block: BlockStateDTO, anchor: HTMLElement): void => {
        const card = board?.cards.find((boardCard) => boardCard.ticketKey === ticketKey);
        setPopoverTarget({
          ticketKey,
          ticketTitle: card?.title ?? "",
          block,
          anchorRect: anchor.getBoundingClientRect(),
        });
      },
    [board],
  );

  const sendPrompt = useCallback(
    (target: PopoverTarget, kind: PromptKind) => {
      sprintBoardBridge()
        .buildPrompt({
          kind,
          ticketKey: target.ticketKey,
          ticketTitle: target.ticketTitle,
          change: target.block.change,
          threads: target.block.threads,
        })
        .then((promptText) => {
          setPromptHandOff({ ticketKey: target.ticketKey, promptText, hasTimedOut: false });
          if (screen.name === "cockpit" && screen.ticketKey === target.ticketKey) {
            return;
          }
          openTicket(target.ticketKey);
        })
        .catch(() => {
          setPromptHandOff(null);
        });
    },
    [openTicket, screen],
  );

  const promptDelivered = useCallback(() => {
    setPromptHandOff(null);
  }, []);

  const promptTimedOut = useCallback(() => {
    setPromptHandOff((current) => (current === null ? null : { ...current, hasTimedOut: true }));
  }, []);

  const popover = popoverTarget !== null && (
    <BlockPopover
      target={popoverTarget}
      onClose={() => {
        setPopoverTarget(null);
      }}
      onRunAction={sprintBoard.runChangeAction}
      onSendPrompt={sendPrompt}
    />
  );

  if (screen.name === "cockpit") {
    return (
      <>
        <CockpitScreen
          board={board}
          ticketKey={screen.ticketKey}
          scan={scans.get(screen.ticketKey) ?? null}
          isRefreshing={refreshingTicketKeys.has(screen.ticketKey) || sprintBoard.isRefreshingAll}
          promptHandOff={promptHandOff}
          onRefresh={sprintBoard.refreshTicket}
          onSelectTicket={selectTicket}
          onBack={backToTickets}
          onBlockClick={blockClickFor(screen.ticketKey)}
          onPromptDelivered={promptDelivered}
          onPromptTimedOut={promptTimedOut}
        />
        {popover}
      </>
    );
  }
  return (
    <>
      <MyTicketsScreen
        board={board}
        isRefreshing={sprintBoard.isRefreshingAll}
        scans={scans}
        morphingTicketKey={morphingTicketKey}
        onRefresh={sprintBoard.refreshAll}
        onOpenTicket={openTicket}
        onBlockClick={blockClickFor}
      />
      {popover}
    </>
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
