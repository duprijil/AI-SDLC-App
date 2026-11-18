export type ColumnMoveDirection = "forward" | "back";

export interface ColumnMoveDTO {
  readonly direction: ColumnMoveDirection;
  readonly columnIndex: number;
}

export const ColumnMove = {
  forwardFrom(columnIndex: number, columnCount: number): ColumnMoveDTO | null {
    return columnIndex + 1 < columnCount ? { direction: "forward", columnIndex: columnIndex + 1 } : null;
  },

  backTo(columnIndex: number): ColumnMoveDTO {
    return { direction: "back", columnIndex };
  },
};
