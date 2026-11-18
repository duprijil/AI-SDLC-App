import { Fragment, type ReactElement } from "react";

import { FlowColumn, type FlowColumnProps } from "@/cockpit/entrypoints/ui/flow_column";
import type { ColumnMoveDTO } from "@/cockpit/models/column_move";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { BoardColumnViewDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";
import type { ColumnFlowState, GateDTO } from "@/cockpit/models/ticket_flow";

export interface TicketGraphProps {
  readonly columns: readonly BoardColumnViewDTO[];
  readonly card: TicketCardDTO | null;
  readonly scan: RefreshProgressDTO | null;
  readonly onBlockClick: FlowColumnProps["onBlockClick"];
  readonly onMoveClick: (move: ColumnMoveDTO, anchor: HTMLElement) => void;
}

function fallbackState(position: number, columnIndex: number | null): ColumnFlowState {
  if (columnIndex === null || position > columnIndex) {
    return "unchecked";
  }
  return position === columnIndex ? "current" : "passed";
}

function fallbackGate(position: number, columnIndex: number | null): GateDTO {
  const isPassed = columnIndex !== null && position < columnIndex;
  return { state: isPassed ? "passed" : "locked", doneCount: 0, totalCount: 0, moveTo: null };
}

const GATE_LABEL: Record<GateDTO["state"], (gate: GateDTO) => string> = {
  passed: () => "✓",
  pending: (gate) => `${String(gate.doneCount)}/${String(gate.totalCount)}`,
  ready: () => "→",
  move_back: () => "←",
  locked: () => "·",
};

const GATE_HINT: Partial<Record<GateDTO["state"], string>> = {
  ready: "Every block is done. Click to move the ticket to the next column.",
  move_back: "This column is no longer complete. Click to move the ticket back to it.",
};

function Gate({
  gate,
  onMoveClick,
}: {
  readonly gate: GateDTO;
  readonly onMoveClick: TicketGraphProps["onMoveClick"];
}): ReactElement {
  const moveTo = gate.moveTo;
  if (moveTo === null) {
    return <div className={`gate g-${gate.state}`}>{GATE_LABEL[gate.state](gate)}</div>;
  }
  return (
    <button
      type="button"
      className={`gate g-${gate.state}`}
      title={GATE_HINT[gate.state]}
      onClick={(event) => {
        event.stopPropagation();
        onMoveClick(moveTo, event.currentTarget);
      }}
    >
      {GATE_LABEL[gate.state](gate)}
    </button>
  );
}

export function TicketGraph({ columns, card, scan, onBlockClick, onMoveClick }: TicketGraphProps): ReactElement {
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
                  <Gate gate={gate} onMoveClick={onMoveClick} />
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
