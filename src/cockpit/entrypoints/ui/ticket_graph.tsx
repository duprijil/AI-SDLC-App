import { Fragment, type ReactElement } from "react";

import { FlowColumn, type FlowColumnProps } from "@/cockpit/entrypoints/ui/flow_column";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { BoardColumnViewDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";
import type { ColumnFlowState, GateDTO } from "@/cockpit/models/ticket_flow";

export interface TicketGraphProps {
  readonly columns: readonly BoardColumnViewDTO[];
  readonly card: TicketCardDTO | null;
  readonly scan: RefreshProgressDTO | null;
  readonly onBlockClick: FlowColumnProps["onBlockClick"];
}

function fallbackState(position: number, columnIndex: number | null): ColumnFlowState {
  if (columnIndex === null || position > columnIndex) {
    return "unchecked";
  }
  return position === columnIndex ? "current" : "passed";
}

function fallbackGate(position: number, columnIndex: number | null): GateDTO {
  const isPassed = columnIndex !== null && position < columnIndex;
  return { state: isPassed ? "passed" : "locked", doneCount: 0, totalCount: 0 };
}

const GATE_LABEL: Record<GateDTO["state"], (gate: GateDTO) => string> = {
  passed: () => "✓",
  pending: (gate) => `${String(gate.doneCount)}/${String(gate.totalCount)}`,
  ready: () => "→",
  locked: () => "·",
};

export function TicketGraph({ columns, card, scan, onBlockClick }: TicketGraphProps): ReactElement {
  const columnIndex = card?.columnIndex ?? null;
  return (
    <div className="gwrap">
      <div className="g">
        {columns.map((column, position) => {
          const gate = card?.flow?.gates[position - 1] ?? fallbackGate(position - 1, columnIndex);
          return (
            <Fragment key={column.columnKey}>
              {position > 0 && (
                <div className={`ggate gate-${gate.state}`}>
                  <div
                    className={`gate g-${gate.state}`}
                    title={gate.state === "ready" ? "Every block is done. Status moves arrive in M3." : undefined}
                  >
                    {GATE_LABEL[gate.state](gate)}
                  </div>
                </div>
              )}
              <FlowColumn
                column={column}
                position={position}
                fallbackState={fallbackState(position, columnIndex)}
                flowColumn={card?.flow?.columns[position] ?? null}
                scan={scan}
                onBlockClick={onBlockClick}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
