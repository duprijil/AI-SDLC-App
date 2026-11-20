import { Fragment, type ReactElement } from "react";

import type { EditorColumnDTO } from "@/cockpit/models/pipeline_editor";
import type { FlowLevelDTO, PipelineColumnDTO } from "@/pipeline/models/pipeline";
import type { DraftProblemDTO } from "@/pipeline/models/pipeline_draft";

export type EditorSelection =
  { readonly kind: "block"; readonly blockId: string } | { readonly kind: "gate"; readonly columnKey: string } | null;

export interface EditorFlowProps {
  readonly boardColumns: readonly EditorColumnDTO[];
  readonly pipelineColumns: readonly PipelineColumnDTO[];
  readonly problems: readonly DraftProblemDTO[];
  readonly selection: EditorSelection;
  readonly onSelect: (selection: EditorSelection) => void;
  readonly onAddLevel: (columnKey: string) => void;
  readonly onAddBlock: (columnKey: string, levelIndex: number) => void;
}

function Level({
  column,
  level,
  levelIndex,
  props,
}: {
  readonly column: EditorColumnDTO;
  readonly level: FlowLevelDTO;
  readonly levelIndex: number;
  readonly props: EditorFlowProps;
}): ReactElement {
  return (
    <div className="lvl">
      {level.blocks.map((block) => {
        const isSelected = props.selection?.kind === "block" && props.selection.blockId === block.blockId;
        const hasProblem = props.problems.some((problem) => problem.blockId === block.blockId);
        return (
          <button
            type="button"
            key={block.blockId}
            className={`blk b-plan ${level.runsPerChange ? "each" : ""} ${isSelected ? "sel" : ""} ${hasProblem ? "b-fail" : ""}`}
            onClick={() => {
              props.onSelect({ kind: "block", blockId: block.blockId });
            }}
          >
            <b>{block.title}</b>
            <span>
              {block.blockType} · {level.runsPerChange ? "× each change" : "once"}
            </span>
          </button>
        );
      })}
      {!level.runsPerChange && (
        <button
          type="button"
          className="blk add"
          title="Add a block to this level"
          onClick={() => {
            props.onAddBlock(column.columnKey, levelIndex);
          }}
        >
          +
        </button>
      )}
    </div>
  );
}

export function EditorFlow(props: EditorFlowProps): ReactElement {
  return (
    <div className="gwrap">
      <div className="g">
        {props.boardColumns.map((column, position) => {
          const pipelineColumn = props.pipelineColumns.find((candidate) => candidate.columnKey === column.columnKey);
          const previous = props.boardColumns[position - 1];
          const isGateSelected = props.selection?.kind === "gate" && props.selection.columnKey === previous?.columnKey;
          return (
            <Fragment key={column.columnKey}>
              {previous !== undefined && (
                <div className="ggate">
                  <button
                    type="button"
                    className={`gate g-tpl ${isGateSelected ? "sel" : ""}`}
                    title={`Gate ${previous.name} → ${column.name}`}
                    onClick={() => {
                      props.onSelect({ kind: "gate", columnKey: previous.columnKey });
                    }}
                  >
                    →
                  </button>
                </div>
              )}
              <div className="col col-current">
                <div className="colh">
                  {column.name}
                  <span>{column.columnKey}</span>
                </div>
                <div className="flow">
                  {(pipelineColumn?.levels ?? []).map((level, levelIndex) => (
                    <div key={`${column.columnKey}-${String(levelIndex)}`} className="flow-step">
                      <Level column={column} level={level} levelIndex={levelIndex} props={props} />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn add-level"
                    onClick={() => {
                      props.onAddLevel(column.columnKey);
                    }}
                  >
                    + Level
                  </button>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
