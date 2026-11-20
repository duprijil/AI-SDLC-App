import { type ReactElement, useState } from "react";

import { EditorFlow, type EditorSelection } from "@/cockpit/entrypoints/ui/editor_flow";
import { EditorGatePanel } from "@/cockpit/entrypoints/ui/editor_gate_panel";
import { EditorSidePanel } from "@/cockpit/entrypoints/ui/editor_side_panel";
import { EnvironmentsTable } from "@/cockpit/entrypoints/ui/environments_table";
import type { PipelineDraftState } from "@/cockpit/entrypoints/ui/use_pipeline_draft";
import type { BlockTemplateDTO, PipelineColumnDTO } from "@/pipeline/models/pipeline";

export interface PipelineEditorScreenProps {
  readonly state: PipelineDraftState;
  readonly onBack: () => void;
  readonly onResync: () => void;
}

interface BlockPlace {
  readonly block: BlockTemplateDTO;
  readonly runsPerChange: boolean;
  readonly columnKey: string;
}

const placeOf = (columns: readonly PipelineColumnDTO[], blockId: string): BlockPlace | null => {
  for (const column of columns) {
    for (const level of column.levels) {
      const block = level.blocks.find((candidate) => candidate.blockId === blockId);
      if (block !== undefined) {
        return { block, runsPerChange: level.runsPerChange, columnKey: column.columnKey };
      }
    }
  }
  return null;
};

const freeBlockId = (columns: readonly PipelineColumnDTO[]): string => {
  const used = new Set(
    columns.flatMap((column) => column.levels.flatMap((level) => level.blocks.map((b) => b.blockId))),
  );
  let index = 1;
  while (used.has(`block_${String(index)}`)) {
    index += 1;
  }
  return `block_${String(index)}`;
};

function Header({ props }: { readonly props: PipelineEditorScreenProps }): ReactElement {
  const { state } = props;
  const problemCount = state.draft?.problems.length ?? 0;
  return (
    <div className="tl-top">
      <button
        type="button"
        className="btn icon"
        title="Back to My tickets"
        onClick={() => {
          if (state.editCount === 0 || window.confirm("Drop the unsaved changes to the pipeline?")) {
            props.onBack();
          }
        }}
      >
        ←
      </button>
      <h2>Pipeline</h2>
      <span className="muted-path">
        {state.editor?.filePath ?? ""} · {String(state.editCount)} unsaved changes
      </span>
      <span className="spacer" />
      <button type="button" className="btn" onClick={props.onResync}>
        ⟳ Resync columns
      </button>
      <button type="button" className="btn" disabled={state.editCount === 0} onClick={state.discard}>
        Discard
      </button>
      <button
        type="button"
        className="btn pri"
        disabled={state.editCount === 0 || problemCount > 0 || state.isSaving}
        onClick={state.save}
      >
        {state.isSaving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function SidePanel({
  props,
  selection,
  setSelection,
}: {
  readonly props: PipelineEditorScreenProps;
  readonly selection: EditorSelection;
  readonly setSelection: (selection: EditorSelection) => void;
}): ReactElement | null {
  const { editor, draft } = props.state;
  if (editor === null || draft?.columns === null || draft === null || selection === null) {
    return null;
  }
  const columns = draft.columns;
  if (selection.kind === "gate") {
    const position = editor.columns.findIndex((column) => column.columnKey === selection.columnKey);
    return (
      <EditorGatePanel
        columnKey={selection.columnKey}
        fromName={editor.columns[position]?.name ?? selection.columnKey}
        toName={editor.columns[position + 1]?.name ?? ""}
        gatePrompts={columns.find((column) => column.columnKey === selection.columnKey)?.gatePrompts ?? []}
        editor={editor}
        apply={props.state.apply}
      />
    );
  }
  const place = placeOf(columns, selection.blockId);
  if (place === null) {
    return null;
  }
  return (
    <EditorSidePanel
      key={selection.blockId}
      block={place.block}
      runsPerChange={place.runsPerChange}
      columnName={editor.columns.find((column) => column.columnKey === place.columnKey)?.name ?? place.columnKey}
      editor={editor}
      snippet={draft.snippets[selection.blockId] ?? ""}
      problems={draft.problems.filter((problem) => problem.blockId === selection.blockId).map((p) => p.message)}
      apply={props.state.apply}
      onSelect={(blockId) => {
        setSelection(blockId === null ? null : { kind: "block", blockId });
      }}
    />
  );
}

export function PipelineEditorScreen(props: PipelineEditorScreenProps): ReactElement {
  const { editor, draft, notice, hasChangedOnDisk } = props.state;
  const [selection, setSelection] = useState<EditorSelection>(null);
  const columns = draft?.columns ?? [];
  return (
    <section className="screen editor-screen">
      <div className="tl">
        <Header props={props} />
        <div className="edsub">
          Columns come from Jira board <b>{String(editor?.boardId ?? "")}</b> and are read-only. Inside each column, the
          blocks run from top to bottom; stacked blocks run once per change, in parallel. Click a block or a gate.
        </div>
        {notice !== null && (
          <div className="banner">
            {notice}
            {hasChangedOnDisk && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  props.state.reload();
                }}
              >
                Reload
              </button>
            )}
          </div>
        )}
        {(draft?.problems.length ?? 0) > 0 && (
          <div className="problems">
            {draft?.problems.map((problem) => (
              <div key={problem.message} className="pop-failure">
                {problem.message}
              </div>
            ))}
          </div>
        )}
        <div className="editor-body">
          <div className="editor-main">
            <EditorFlow
              boardColumns={editor?.columns ?? []}
              pipelineColumns={columns}
              problems={draft?.problems ?? []}
              selection={selection}
              onSelect={setSelection}
              onAddLevel={(columnKey) => void props.state.apply([{ op: "add_level", columnKey }])}
              onAddBlock={(columnKey, levelIndex) => {
                const blockId = freeBlockId(columns);
                const columnName = editor?.columns.find((column) => column.columnKey === columnKey)?.name ?? "";
                void props.state
                  .apply([
                    { op: "add_block", columnKey, levelIndex, blockId, blockType: "tracker" },
                    {
                      op: "set_block_field",
                      blockId,
                      field: "done_when",
                      value: `tracker.status_after("${columnName}")`,
                    },
                  ])
                  .then((isApplied) => {
                    if (isApplied) {
                      setSelection({ kind: "block", blockId });
                    }
                  });
              }}
            />
            {editor !== null && <EnvironmentsTable editor={editor} />}
          </div>
          <SidePanel props={props} selection={selection} setSelection={setSelection} />
        </div>
      </div>
    </section>
  );
}
