import type { ReactElement } from "react";

import type { BlockStateDTO } from "@/cockpit/models/block_state";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { BoardColumnViewDTO } from "@/cockpit/models/sprint_board";
import type { ColumnFlowDTO, ColumnFlowState, LevelFlowDTO } from "@/cockpit/models/ticket_flow";
import type { FlowLevelDTO } from "@/pipeline/models/pipeline";

export interface FlowColumnProps {
  readonly column: BoardColumnViewDTO;
  readonly position: number;
  readonly fallbackState: ColumnFlowState;
  readonly flowColumn: ColumnFlowDTO | null;
  readonly scan: RefreshProgressDTO | null;
  readonly onBlockClick: (block: BlockStateDTO, anchor: HTMLElement) => void;
}

function caption(state: ColumnFlowState, flowColumn: ColumnFlowDTO | null): string {
  const counts = flowColumn === null ? "" : `${String(flowColumn.doneCount)} of ${String(flowColumn.totalCount)} done`;
  switch (state) {
    case "passed":
      return "✓ done";
    case "current":
      return counts === "" ? "● status" : `● ${counts}`;
    case "stopped":
      return `stopped · ${counts}`;
    case "unchecked":
      return "not checked";
  }
}

function connectorPath(fromCount: number, toCount: number): string {
  const centerOf = (index: number, count: number): number => ((2 * index + 1) / (2 * count)) * 100;
  const paths: string[] = [];
  for (let fromIndex = 0; fromIndex < fromCount; fromIndex += 1) {
    for (let toIndex = 0; toIndex < toCount; toIndex += 1) {
      const start = centerOf(fromIndex, fromCount);
      const end = centerOf(toIndex, toCount);
      paths.push(`M${String(start)},0 C${String(start)},11 ${String(end)},9 ${String(end)},20`);
    }
  }
  return paths.join(" ");
}

function scanClass(position: number, levelIndex: number, scan: RefreshProgressDTO | null): string {
  if (scan === null) {
    return "";
  }
  if (position === scan.columnIndex && levelIndex === scan.levelIndex) {
    return "scan-now";
  }
  const isAhead = position > scan.columnIndex || (position === scan.columnIndex && levelIndex > scan.levelIndex);
  return isAhead ? "scan-wait" : "";
}

function TemplateLevel({
  level,
  state,
}: {
  readonly level: FlowLevelDTO;
  readonly state: ColumnFlowState;
}): ReactElement {
  const blockStyle = state === "unchecked" ? "b-idle" : "b-plan";
  return (
    <>
      {level.blocks.map((block) => (
        <div key={block.blockId} className={`blk ${blockStyle} ${level.runsPerChange ? "each" : ""}`}>
          <b>{block.title}</b>
          <span>
            {block.blockType} · {level.runsPerChange ? "× each change" : "once"}
          </span>
        </div>
      ))}
    </>
  );
}

function StateLevel({
  level,
  onBlockClick,
}: {
  readonly level: LevelFlowDTO;
  readonly onBlockClick: FlowColumnProps["onBlockClick"];
}): ReactElement {
  return (
    <>
      {level.blocks.map((block, blockIndex) => (
        <button
          type="button"
          key={`${block.blockId}-${String(blockIndex)}`}
          className={`blk b-${block.tone}`}
          onClick={(event) => {
            event.stopPropagation();
            onBlockClick(block, event.currentTarget);
          }}
        >
          <b>{block.title}</b>
          <span>{block.caption}</span>
        </button>
      ))}
    </>
  );
}

export function FlowColumn({
  column,
  position,
  fallbackState,
  flowColumn,
  scan,
  onBlockClick,
}: FlowColumnProps): ReactElement {
  const state = flowColumn?.state ?? fallbackState;
  const checkedLevels = flowColumn !== null && flowColumn.levels.length > 0 ? flowColumn.levels : null;
  const levelCount = checkedLevels?.length ?? column.levels.length;
  return (
    <div className={`col col-${state}`}>
      <div className="colh">
        {column.name}
        <span>{caption(state, flowColumn)}</span>
      </div>
      <div className="flow">
        {Array.from({ length: levelCount }, (_unused, levelIndex) => {
          const templateLevel = column.levels[levelIndex];
          const checkedLevel = checkedLevels?.[levelIndex];
          const previousCount =
            checkedLevels?.[levelIndex - 1]?.blocks.length ?? column.levels[levelIndex - 1]?.blocks.length ?? 1;
          const currentCount = checkedLevel?.blocks.length ?? templateLevel?.blocks.length ?? 1;
          return (
            <div
              key={`${column.columnKey}-${String(levelIndex)}`}
              className={`flow-step ${scanClass(position, levelIndex, scan)}`}
            >
              {levelIndex > 0 && (
                <svg className="conn" viewBox="0 0 100 20" preserveAspectRatio="none">
                  <path d={connectorPath(previousCount, currentCount)} vectorEffect="non-scaling-stroke" />
                </svg>
              )}
              <div className="lvl">
                {checkedLevel === undefined ? (
                  templateLevel !== undefined && <TemplateLevel level={templateLevel} state={state} />
                ) : (
                  <StateLevel level={checkedLevel} onBlockClick={onBlockClick} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
