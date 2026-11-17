import { Fragment, type ReactElement } from "react";

import { type ColumnState, FlowColumn } from "@/cockpit/entrypoints/ui/flow_column";
import type { BoardColumnViewDTO } from "@/cockpit/models/sprint_board";

export interface TicketGraphProps {
  readonly columns: readonly BoardColumnViewDTO[];
  readonly columnIndex: number | null;
}

function stateOf(columnPosition: number, columnIndex: number | null): ColumnState {
  if (columnIndex === null || columnPosition > columnIndex) {
    return "unchecked";
  }
  return columnPosition === columnIndex ? "current" : "passed";
}

export function TicketGraph({ columns, columnIndex }: TicketGraphProps): ReactElement {
  return (
    <div className="gwrap">
      <div className="g">
        {columns.map((column, columnPosition) => {
          const isPassed = columnIndex !== null && columnPosition < columnIndex;
          return (
            <Fragment key={column.columnKey}>
              {columnPosition > 0 && (
                <div className={`ggate ${isPassed ? "passed" : ""}`}>
                  <div className={`gate ${isPassed ? "g-done" : "g-lock"}`}>{isPassed ? "✓" : "·"}</div>
                </div>
              )}
              <FlowColumn column={column} state={stateOf(columnPosition, columnIndex)} />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
