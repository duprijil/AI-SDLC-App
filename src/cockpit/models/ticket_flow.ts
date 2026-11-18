import { Attention, type AttentionKind } from "@/cockpit/models/attention";
import { BlockState, type BlockStateDTO } from "@/cockpit/models/block_state";
import { ColumnMove, type ColumnMoveDTO } from "@/cockpit/models/column_move";

export type ColumnFlowState = "passed" | "current" | "stopped" | "unchecked";

export type GateState = "passed" | "pending" | "ready" | "move_back" | "locked";

export interface LevelFlowDTO {
  readonly runsPerChange: boolean;
  readonly blocks: readonly BlockStateDTO[];
}

export interface ColumnFlowDTO {
  readonly columnKey: string;
  readonly state: ColumnFlowState;
  readonly levels: readonly LevelFlowDTO[];
  readonly doneCount: number;
  readonly totalCount: number;
}

export interface GateDTO {
  readonly state: GateState;
  readonly doneCount: number;
  readonly totalCount: number;
  readonly moveTo: ColumnMoveDTO | null;
}

export interface TicketFlowDTO {
  readonly ticketKey: string;
  readonly columns: readonly ColumnFlowDTO[];
  readonly gates: readonly GateDTO[];
  readonly stoppedAtColumn: number | null;
  readonly refreshedAt: string;
  readonly flowAttention: AttentionKind;
}

export interface CheckedColumnDTO {
  readonly columnKey: string;
  readonly levels: readonly LevelFlowDTO[];
}

export interface TicketFlowPartsDTO {
  readonly ticketKey: string;
  readonly columnKeys: readonly string[];
  readonly ticketColumnIndex: number | null;
  readonly checkedColumns: readonly CheckedColumnDTO[];
  readonly refreshedAt: Date;
}

const blocksOf = (column: CheckedColumnDTO): readonly BlockStateDTO[] => column.levels.flatMap((level) => level.blocks);

const isComplete = (column: CheckedColumnDTO): boolean => blocksOf(column).every((block) => block.isFinished);

function columnState(
  position: number,
  parts: TicketFlowPartsDTO,
  checked: CheckedColumnDTO | undefined,
): ColumnFlowState {
  if (checked === undefined) {
    return "unchecked";
  }
  if (position === parts.ticketColumnIndex) {
    return "current";
  }
  return isComplete(checked) ? "passed" : "stopped";
}

interface GateMove {
  readonly state: GateState;
  readonly moveTo: ColumnMoveDTO | null;
}

function gateMove(position: number, parts: TicketFlowPartsDTO, checked: CheckedColumnDTO | undefined): GateMove {
  const ticketColumnIndex = parts.ticketColumnIndex ?? -1;
  if (checked === undefined || position > ticketColumnIndex) {
    return { state: "locked", moveTo: null };
  }
  if (!isComplete(checked)) {
    return position < ticketColumnIndex
      ? { state: "move_back", moveTo: ColumnMove.backTo(position) }
      : { state: "pending", moveTo: null };
  }
  if (position < ticketColumnIndex) {
    return { state: "passed", moveTo: null };
  }
  return { state: "ready", moveTo: ColumnMove.forwardFrom(position, parts.columnKeys.length) };
}

const isMoveGate = (gate: GateDTO): boolean => gate.state === "ready" || gate.state === "move_back";

export class TicketFlow {
  readonly #flow: TicketFlowDTO;

  private constructor(flow: TicketFlowDTO) {
    this.#flow = flow;
  }

  static assemble(parts: TicketFlowPartsDTO): TicketFlow {
    const columns = parts.columnKeys.map((columnKey, position): ColumnFlowDTO => {
      const checked = parts.checkedColumns[position];
      const blocks = checked === undefined ? [] : blocksOf(checked);
      return {
        columnKey,
        state: columnState(position, parts, checked),
        levels: checked?.levels ?? [],
        doneCount: blocks.filter((block) => block.isFinished).length,
        totalCount: blocks.length,
      };
    });
    const gates = columns.slice(0, -1).map((column, position): GateDTO => ({
      ...gateMove(position, parts, parts.checkedColumns[position]),
      doneCount: column.doneCount,
      totalCount: column.totalCount,
    }));
    const stoppedAt = columns.findIndex((column) => column.state === "stopped");
    const allBlocks = parts.checkedColumns.flatMap(blocksOf);
    const flowAttention = Attention.ofFlow({
      isInLastColumn: parts.ticketColumnIndex === parts.columnKeys.length - 1,
      hasFailure: allBlocks.some((block) => BlockState.isFailure(block)),
      needsYou: allBlocks.some((block) => BlockState.needsYou(block)) || gates.some(isMoveGate),
    });
    return new TicketFlow({
      ticketKey: parts.ticketKey,
      columns,
      gates,
      stoppedAtColumn: stoppedAt === -1 ? null : stoppedAt,
      refreshedAt: parts.refreshedAt.toISOString(),
      flowAttention,
    });
  }

  static fromDTO(flow: TicketFlowDTO): TicketFlow {
    return new TicketFlow(flow);
  }

  get ticketKey(): string {
    return this.#flow.ticketKey;
  }

  get flowAttention(): AttentionKind {
    return this.#flow.flowAttention;
  }

  toDTO(): TicketFlowDTO {
    return this.#flow;
  }
}
