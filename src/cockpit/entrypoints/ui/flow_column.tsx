import type { ReactElement } from "react";

import type { BoardColumnViewDTO } from "@/cockpit/models/sprint_board";
import type { FlowLevelDTO } from "@/pipeline/models/pipeline";

export type ColumnState = "passed" | "current" | "unchecked";

export interface FlowColumnProps {
  readonly column: BoardColumnViewDTO;
  readonly state: ColumnState;
}

const COLUMN_CAPTION: Record<ColumnState, string> = {
  passed: "✓ done",
  current: "● status",
  unchecked: "not checked",
};

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

function FlowConnector({ fromCount, toCount }: { readonly fromCount: number; readonly toCount: number }): ReactElement {
  return (
    <svg className="conn" viewBox="0 0 100 20" preserveAspectRatio="none">
      <path d={connectorPath(fromCount, toCount)} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function FlowLevel({ level, state }: { readonly level: FlowLevelDTO; readonly state: ColumnState }): ReactElement {
  const blockStyle = state === "unchecked" ? "b-idle" : "b-plan";
  return (
    <div className="lvl">
      {level.blocks.map((block) => (
        <div key={block.blockId} className={`blk ${blockStyle} ${level.runsPerChange ? "each" : ""}`}>
          <b>{block.title}</b>
          <span>
            {block.blockType} · {level.runsPerChange ? "× each change" : "once"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FlowColumn({ column, state }: FlowColumnProps): ReactElement {
  return (
    <div className={`col col-${state}`}>
      <div className="colh">
        {column.name}
        <span>{COLUMN_CAPTION[state]}</span>
      </div>
      <div className="flow">
        {column.levels.map((level, levelIndex) => (
          <div key={level.blocks.map((block) => block.blockId).join("+")} className="flow-step">
            {levelIndex > 0 && (
              <FlowConnector
                fromCount={column.levels[levelIndex - 1]?.blocks.length ?? 1}
                toCount={level.blocks.length}
              />
            )}
            <FlowLevel level={level} state={state} />
          </div>
        ))}
      </div>
    </div>
  );
}
