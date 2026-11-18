import "@/cockpit/resources/cockpit.css";

import { type ReactElement, StrictMode, useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { BlockPopover, type PopoverTarget } from "@/cockpit/entrypoints/ui/block_popover";
import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import { CockpitScreen, type PromptHandOff } from "@/cockpit/entrypoints/ui/cockpit_screen";
import { MyTicketsScreen } from "@/cockpit/entrypoints/ui/my_tickets_screen";
import { StatusMovePopover, type StatusMoveTarget } from "@/cockpit/entrypoints/ui/status_move_popover";
import { useSprintBoard } from "@/cockpit/entrypoints/ui/use_sprint_board";
import type { BlockStateDTO } from "@/cockpit/models/block_state";
import type { ColumnMoveDTO } from "@/cockpit/models/column_move";
import { CockpitError } from "@/cockpit/models/errors";
import type { PromptKind, PromptRequestDTO } from "@/cockpit/models/prompt_request";
import type { StatusMoveRequestDTO } from "@/cockpit/models/status_move_action";

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
  const [moveTarget, setMoveTarget] = useState<StatusMoveTarget | null>(null);
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

  const moveClickFor = useCallback(
    (ticketKey: string) =>
      (move: ColumnMoveDTO, anchor: HTMLElement): void => {
        setMoveTarget({ ticketKey, move, anchorRect: anchor.getBoundingClientRect() });
      },
    [],
  );

  const blockClickFor = useCallback(
    (ticketKey: string) =>
      (block: BlockStateDTO, anchor: HTMLElement): void => {
        if (block.moveTo !== null) {
          moveClickFor(ticketKey)(block.moveTo, anchor);
          return;
        }
        const card = board?.cards.find((boardCard) => boardCard.ticketKey === ticketKey);
        setPopoverTarget({
          ticketKey,
          ticketTitle: card?.title ?? "",
          block,
          anchorRect: anchor.getBoundingClientRect(),
        });
      },
    [board, moveClickFor],
  );

  const handOffPrompts = useCallback(
    async (request: PromptRequestDTO): Promise<string | null> => {
      try {
        const [promptText, ...remainingPrompts] = await sprintBoardBridge().buildPrompt(request);
        if (promptText === undefined) {
          return "There is no prompt to send";
        }
        setPromptHandOff({ ticketKey: request.ticketKey, promptText, hasTimedOut: false, remainingPrompts });
        if (screen.name !== "cockpit" || screen.ticketKey !== request.ticketKey) {
          openTicket(request.ticketKey);
        }
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "The prompt couldn't be built";
      }
    },
    [openTicket, screen],
  );

  const sendPrompt = useCallback(
    (target: PopoverTarget, kind: PromptKind): Promise<string | null> =>
      handOffPrompts({
        kind,
        ticketKey: target.ticketKey,
        ticketTitle: target.ticketTitle,
        change: target.block.change,
        threads: target.block.threads,
        runUrls: target.block.deployLines.flatMap((line) =>
          line.state === "failed" && line.runUrl !== null ? [line.runUrl] : [],
        ),
        templateNames: target.block.promptTemplates,
      }),
    [handOffPrompts],
  );

  const moveStatus = useCallback(
    async (request: StatusMoveRequestDTO): Promise<string | null> => {
      const result = await sprintBoard.moveStatus(request);
      if (result.failure === null && result.promptTemplates.length > 0) {
        const card = board?.cards.find((boardCard) => boardCard.ticketKey === request.ticketKey);
        return handOffPrompts({
          kind: "block_prompt",
          ticketKey: request.ticketKey,
          ticketTitle: card?.title ?? "",
          change: null,
          threads: [],
          runUrls: [],
          templateNames: result.promptTemplates,
        });
      }
      return result.failure;
    },
    [board, handOffPrompts, sprintBoard],
  );

  const promptDelivered = useCallback(() => {
    setPromptHandOff((current) => {
      const [promptText, ...remainingPrompts] = current?.remainingPrompts ?? [];
      return current === null || promptText === undefined ? null : { ...current, promptText, remainingPrompts };
    });
  }, []);

  const promptTimedOut = useCallback(() => {
    setPromptHandOff((current) => (current === null ? null : { ...current, hasTimedOut: true }));
  }, []);

  const popover = (
    <>
      {popoverTarget !== null && (
        <BlockPopover
          target={popoverTarget}
          onClose={() => {
            setPopoverTarget(null);
          }}
          onRunAction={sprintBoard.runChangeAction}
          onTickAttestation={sprintBoard.tickAttestation}
          onRecordCheckpoint={sprintBoard.recordCheckpoint}
          onSendPrompt={sendPrompt}
        />
      )}
      {moveTarget !== null && (
        <StatusMovePopover
          key={`${moveTarget.ticketKey}-${String(moveTarget.move.columnIndex)}`}
          target={moveTarget}
          columnName={board?.columns[moveTarget.move.columnIndex]?.name ?? ""}
          onClose={() => {
            setMoveTarget(null);
          }}
          onMove={moveStatus}
        />
      )}
    </>
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
          onMoveClick={moveClickFor(screen.ticketKey)}
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
        onMoveClick={moveClickFor}
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
