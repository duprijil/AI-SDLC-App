import type { ReactElement } from "react";

import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";

export interface BoardStatusProps {
  readonly board: SprintBoardDTO | null;
  readonly isRefreshing: boolean;
}

const timeOf = (fetchedAt: string): string =>
  new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function statusText(board: SprintBoardDTO | null, isRefreshing: boolean): string {
  if (isRefreshing) {
    return "Refreshing…";
  }
  if (board?.fetchedAt === null || board === null) {
    return "Not loaded yet";
  }
  return `${board.source === "cache" ? "From cache" : "Refreshed"} · ${timeOf(board.fetchedAt)}`;
}

export function BoardStatus({ board, isRefreshing }: BoardStatusProps): ReactElement {
  return <span className="rstat">{statusText(board, isRefreshing)}</span>;
}

export function FailureBanner({ board }: { readonly board: SprintBoardDTO | null }): ReactElement | null {
  if (board?.failure === null || board === null) {
    return null;
  }
  return <div className="banner">Jira: {board.failure}</div>;
}
