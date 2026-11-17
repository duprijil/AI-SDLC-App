import { ensure } from "@/core/models/invariant";
import { InvalidBoardError } from "@/ticket/models/errors";

export interface BoardColumnDTO {
  readonly columnKey: string;
  readonly name: string;
  readonly statusIds: readonly string[];
}

export interface BoardColumnSourceDTO {
  readonly name: string;
  readonly statusIds: readonly string[];
}

export interface BoardDTO {
  readonly columns: readonly BoardColumnDTO[];
}

export const columnKeyFor = (columnName: string): string =>
  columnName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export class Board {
  readonly columns: readonly BoardColumnDTO[];

  private constructor(columns: readonly BoardColumnDTO[]) {
    this.columns = columns;
  }

  static create(columns: readonly BoardColumnSourceDTO[]): Board {
    ensure(columns.length > 0, () => new InvalidBoardError("The board has no columns"));
    const boardColumns = columns.map((column) => ({
      columnKey: columnKeyFor(column.name),
      name: column.name,
      statusIds: Object.freeze([...column.statusIds]),
    }));
    const columnKeys = boardColumns.map((column) => column.columnKey);
    ensure(
      columnKeys.every((columnKey) => columnKey !== ""),
      () => new InvalidBoardError("Every board column needs a name with letters or digits"),
    );
    ensure(
      new Set(columnKeys).size === columnKeys.length,
      () => new InvalidBoardError(`Board column names collide: ${columnKeys.join(", ")}`),
    );
    return new Board(Object.freeze(boardColumns));
  }

  static fromDTO(board: BoardDTO): Board {
    return Board.create(board.columns);
  }

  columnIndexFor(statusId: string): number | null {
    const columnIndex = this.columns.findIndex((column) => column.statusIds.includes(statusId));
    return columnIndex === -1 ? null : columnIndex;
  }

  toDTO(): BoardDTO {
    return { columns: this.columns };
  }
}
