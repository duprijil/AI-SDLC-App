import type { ColumnMoveDirection } from "@/cockpit/models/column_move";
import { InvalidStatusMoveError } from "@/cockpit/models/errors";
import type { SprintBoardDTO } from "@/cockpit/models/sprint_board";
import type { SprintSnapshot } from "@/ticket/models/sprint_snapshot";
import type { StatusMoveTargetDTO } from "@/ticket/models/status_move";

export interface StatusMoveRequestDTO {
  readonly ticketKey: string;
  readonly targetColumnIndex: number;
}

export interface StatusMovePreviewDTO {
  readonly ticketKey: string;
  readonly direction: ColumnMoveDirection;
  readonly fromStatusName: string;
  readonly toColumnName: string;
  readonly transitionLabel: string | null;
  readonly refusal: string | null;
}

export interface StatusMoveResultDTO {
  readonly failure: string | null;
  readonly board: SprintBoardDTO | null;
  readonly promptTemplates: readonly string[];
}

export interface StatusMovePlanDTO {
  readonly target: StatusMoveTargetDTO;
  readonly direction: ColumnMoveDirection;
  readonly fromStatusName: string;
  readonly fromColumnKey: string;
  readonly isIntoLastColumn: boolean;
}

export const StatusMovePlan = {
  resolve(snapshot: SprintSnapshot | null, request: StatusMoveRequestDTO): StatusMovePlanDTO {
    const ticket = snapshot?.tickets.find((candidate) => candidate.ticketKey === request.ticketKey);
    if (snapshot === null || ticket === undefined) {
      throw new InvalidStatusMoveError(`${request.ticketKey} is not on the board. Refresh and try again.`);
    }
    const currentColumnIndex = snapshot.board.columnIndexFor(ticket.statusId);
    const targetColumn = snapshot.board.columns[request.targetColumnIndex];
    const fromColumn = currentColumnIndex === null ? undefined : snapshot.board.columns[currentColumnIndex];
    if (fromColumn === undefined || targetColumn === undefined || currentColumnIndex === null) {
      throw new InvalidStatusMoveError(`${request.ticketKey} can't be moved from its current status`);
    }
    const isForward = request.targetColumnIndex === currentColumnIndex + 1;
    const isBack = request.targetColumnIndex < currentColumnIndex;
    if (!isForward && !isBack) {
      throw new InvalidStatusMoveError(`${request.ticketKey} moves one column forward, or back to an earlier column`);
    }
    return {
      target: {
        ticketKey: ticket.ticketKey,
        expectedStatusId: ticket.statusId,
        targetColumnName: targetColumn.name,
        targetStatusIds: targetColumn.statusIds,
      },
      direction: isForward ? "forward" : "back",
      fromStatusName: ticket.statusName,
      fromColumnKey: fromColumn.columnKey,
      isIntoLastColumn: request.targetColumnIndex === snapshot.board.columns.length - 1,
    };
  },
};
