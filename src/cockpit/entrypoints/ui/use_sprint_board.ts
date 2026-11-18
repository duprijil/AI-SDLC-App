import { useCallback, useEffect, useState } from "react";

import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import type { ChangeActionDTO } from "@/cockpit/models/change_action";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { SprintBoardDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";
import type { AttentionChangeDTO } from "@/cockpit/models/sprint_board_bridge";

export interface SprintBoardState {
  readonly board: SprintBoardDTO | null;
  readonly isRefreshingAll: boolean;
  readonly refreshingTicketKeys: ReadonlySet<string>;
  readonly scans: ReadonlyMap<string, RefreshProgressDTO>;
  readonly refreshAll: () => void;
  readonly refreshTicket: (ticketKey: string) => void;
  readonly runChangeAction: (ticketKey: string, action: ChangeActionDTO) => Promise<string | null>;
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : "unknown");

const replaceCard = (board: SprintBoardDTO | null, card: TicketCardDTO | null): SprintBoardDTO | null => {
  if (board === null || card === null) {
    return board;
  }
  return {
    ...board,
    cards: board.cards.map((boardCard) => (boardCard.ticketKey === card.ticketKey ? card : boardCard)),
  };
};

const replaceAttention = (board: SprintBoardDTO | null, change: AttentionChangeDTO): SprintBoardDTO | null => {
  if (board === null) {
    return board;
  }
  return {
    ...board,
    cards: board.cards.map((card) =>
      card.ticketKey === change.ticketKey ? { ...card, attention: change.attention } : card,
    ),
  };
};

const withScan = (
  scans: ReadonlyMap<string, RefreshProgressDTO>,
  progress: RefreshProgressDTO,
): ReadonlyMap<string, RefreshProgressDTO> => {
  const nextScans = new Map(scans);
  if (progress.isFinished) {
    nextScans.delete(progress.ticketKey);
  } else {
    nextScans.set(progress.ticketKey, progress);
  }
  return nextScans;
};

const toggled = (keys: ReadonlySet<string>, ticketKey: string, isIncluded: boolean): ReadonlySet<string> => {
  const nextKeys = new Set(keys);
  if (isIncluded) {
    nextKeys.add(ticketKey);
  } else {
    nextKeys.delete(ticketKey);
  }
  return nextKeys;
};

export function useSprintBoard(): SprintBoardState {
  const [board, setBoard] = useState<SprintBoardDTO | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshingTicketKeys, setRefreshingTicketKeys] = useState<ReadonlySet<string>>(new Set());
  const [scans, setScans] = useState<ReadonlyMap<string, RefreshProgressDTO>>(new Map());

  const showFailure = useCallback((error: unknown) => {
    setBoard((current) => (current === null ? null : { ...current, failure: reasonOf(error) }));
  }, []);

  const refreshAll = useCallback(() => {
    setIsRefreshingAll(true);
    sprintBoardBridge()
      .refreshAll()
      .then(setBoard)
      .catch(showFailure)
      .finally(() => {
        setIsRefreshingAll(false);
        setScans(new Map());
      });
  }, [showFailure]);

  const refreshTicket = useCallback(
    (ticketKey: string) => {
      setRefreshingTicketKeys((keys) => toggled(keys, ticketKey, true));
      sprintBoardBridge()
        .refreshTicket(ticketKey)
        .then((refreshed) => {
          setBoard((current) => {
            const updated = replaceCard(current, refreshed.card);
            return updated === null ? null : { ...updated, codeHostFailure: refreshed.codeHostFailure };
          });
        })
        .catch(showFailure)
        .finally(() => {
          setRefreshingTicketKeys((keys) => toggled(keys, ticketKey, false));
        });
    },
    [showFailure],
  );

  const runChangeAction = useCallback(async (ticketKey: string, action: ChangeActionDTO): Promise<string | null> => {
    const result = await sprintBoardBridge().runChangeAction(ticketKey, action);
    setBoard((current) => replaceCard(current, result.card));
    return result.failure;
  }, []);

  useEffect(() => {
    const bridge = sprintBoardBridge();
    const stopProgress = bridge.onProgress((progress) => {
      setScans((current) => withScan(current, progress));
    });
    const stopAttention = bridge.onAttention((change) => {
      setBoard((current) => replaceAttention(current, change));
    });
    return (): void => {
      stopProgress();
      stopAttention();
    };
  }, []);

  useEffect(() => {
    sprintBoardBridge()
      .cached()
      .then((cachedBoard) => {
        if (cachedBoard !== null) {
          setBoard(cachedBoard);
        }
      })
      .catch(showFailure)
      .finally(refreshAll);
  }, [refreshAll, showFailure]);

  return { board, isRefreshingAll, refreshingTicketKeys, scans, refreshAll, refreshTicket, runChangeAction };
}
