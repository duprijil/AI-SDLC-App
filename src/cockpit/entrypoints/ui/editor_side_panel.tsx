import type { ReactElement, ReactNode } from "react";

import { PromptChips } from "@/cockpit/entrypoints/ui/prompt_chips";
import type { PipelineEditorDTO } from "@/cockpit/models/pipeline_editor";
import { ACTION_STATES, BLOCK_TYPES, type BlockTemplateDTO, type BlockType } from "@/pipeline/models/pipeline";
import { DEFAULT_DONE_WHEN, type EditableBlockField, type PipelineEditDTO } from "@/pipeline/models/pipeline_edit";

export interface EditorSidePanelProps {
  readonly block: BlockTemplateDTO;
  readonly runsPerChange: boolean;
  readonly columnName: string;
  readonly editor: PipelineEditorDTO;
  readonly snippet: string;
  readonly problems: readonly string[];
  readonly apply: (edits: readonly PipelineEditDTO[]) => Promise<boolean>;
  readonly onSelect: (blockId: string | null) => void;
}

const fieldEdit = (block: BlockTemplateDTO, field: EditableBlockField, value: string | null): PipelineEditDTO => ({
  op: "set_block_field",
  blockId: block.blockId,
  field,
  value,
});

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="fld">
      <label>{label}</label>
      {children}
    </div>
  );
}

function TextField(props: {
  readonly label: string;
  readonly value: string;
  readonly fieldKey: string;
  readonly onCommit: (value: string) => void;
}): ReactElement {
  return (
    <Field label={props.label}>
      <input
        key={props.fieldKey}
        className="inp"
        defaultValue={props.value}
        onBlur={(event) => {
          if (event.target.value !== props.value) {
            props.onCommit(event.target.value.trim());
          }
        }}
      />
    </Field>
  );
}

function EnvSelect(props: {
  readonly value: string | null;
  readonly envNames: readonly string[];
  readonly onChange: (envName: string) => void;
}): ReactElement {
  return (
    <select
      className="inp"
      value={props.value ?? ""}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    >
      <option value="" disabled>
        choose an env
      </option>
      {props.envNames.map((envName) => (
        <option key={envName} value={envName}>
          {envName}
        </option>
      ))}
    </select>
  );
}

function DoneWhen(props: EditorSidePanelProps): ReactElement {
  const { block, apply, editor } = props;
  switch (block.blockType) {
    case "change":
      return (
        <select
          className="inp"
          value={block.doneWhen ?? ""}
          onChange={(event) => void apply([fieldEdit(block, "done_when", event.target.value)])}
        >
          <option value="change.ready">change.ready (PR open, not a draft, CI not failing)</option>
          <option value="change.merged">change.merged</option>
        </select>
      );
    case "deploy":
      return (
        <EnvSelect
          value={block.envName}
          envNames={editor.envNames}
          onChange={(envName) =>
            void apply([
              fieldEdit(block, "env", envName),
              fieldEdit(block, "done_when", DEFAULT_DONE_WHEN.deploy(envName)),
            ])
          }
        />
      );
    case "attest":
      return (
        <EnvSelect
          value={block.envName}
          envNames={editor.envNames}
          onChange={(envName) =>
            void apply([
              fieldEdit(block, "pin", `env("${envName}").commits`),
              fieldEdit(block, "done_when", "attested"),
            ])
          }
        />
      );
    case "prompt":
      return (
        <input
          key={`${block.blockId}-kind`}
          className="inp code"
          defaultValue={block.checkpointKind ?? ""}
          placeholder="checkpoint kind, e.g. pm_note"
          onBlur={(event) =>
            void apply([fieldEdit(block, "done_when", `session.checkpoint(${event.target.value.trim()})`)])
          }
        />
      );
    case "tracker":
      return (
        <input
          key={`${block.blockId}-done`}
          className="inp code"
          defaultValue={block.doneWhen ?? ""}
          onBlur={(event) => void apply([fieldEdit(block, "done_when", event.target.value.trim())])}
        />
      );
  }
}

function typeEdits(block: BlockTemplateDTO, blockType: BlockType, columnName: string): readonly PipelineEditDTO[] {
  const doneWhen =
    blockType === "tracker" ? `tracker.status_after("${columnName}")` : DEFAULT_DONE_WHEN[blockType](null);
  return [
    fieldEdit(block, "type", blockType),
    fieldEdit(block, "done_when", doneWhen),
    ...(blockType === "deploy" ? [] : [fieldEdit(block, "env", null)]),
    ...(blockType === "attest" ? [] : [fieldEdit(block, "pin", null)]),
    ...(blockType === "prompt" ? [] : [fieldEdit(block, "prompt", null)]),
  ];
}

function StatePrompts(props: EditorSidePanelProps): ReactElement {
  const { block, apply, editor } = props;
  return (
    <Field label="Prompts per state">
      {ACTION_STATES[block.blockType].map((state) => (
        <div key={state} className="state-row">
          <span className="state-name">{state}</span>
          <PromptChips
            selected={block.promptActions[state] ?? []}
            available={editor.promptTemplates}
            onChange={(templateNames) =>
              void apply([{ op: "set_state_prompts", blockId: block.blockId, state, templateNames }])
            }
          />
        </div>
      ))}
    </Field>
  );
}

function BlockMoves(props: EditorSidePanelProps): ReactElement {
  const { block, apply, onSelect } = props;
  return (
    <div className="row">
      <button
        type="button"
        className="btn"
        onClick={() => void apply([{ op: "move_block", blockId: block.blockId, direction: "up" }])}
      >
        ↑ Level up
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => void apply([{ op: "move_block", blockId: block.blockId, direction: "down" }])}
      >
        ↓ Level down
      </button>
      <button
        type="button"
        className="btn danger"
        onClick={() => {
          if (window.confirm(`Delete block ${block.blockId}?`)) {
            void apply([{ op: "remove_block", blockId: block.blockId }]).then((isApplied) => {
              if (isApplied) {
                onSelect(null);
              }
            });
          }
        }}
      >
        Delete
      </button>
    </div>
  );
}

export function EditorSidePanel(props: EditorSidePanelProps): ReactElement {
  const { block, apply, editor, runsPerChange, columnName, onSelect } = props;
  return (
    <aside className="side">
      <div className="side-kicker">Block · {columnName}</div>
      <h3>{block.title}</h3>
      {props.problems.map((problem) => (
        <div key={problem} className="pop-failure">
          {problem}
        </div>
      ))}
      <TextField
        label="Id"
        value={block.blockId}
        fieldKey={`${block.blockId}-id`}
        onCommit={(value) => {
          void apply([fieldEdit(block, "id", value)]).then((isApplied) => {
            if (isApplied) {
              onSelect(value);
            }
          });
        }}
      />
      <TextField
        label="Title"
        value={block.title}
        fieldKey={`${block.blockId}-title`}
        onCommit={(value) => void apply([fieldEdit(block, "title", value === "" ? null : value)])}
      />
      <Field label="Type">
        <select
          className="inp"
          value={block.blockType}
          onChange={(event) => void apply(typeEdits(block, event.target.value as BlockType, columnName))}
        >
          {BLOCK_TYPES.map((blockType) => (
            <option key={blockType} value={blockType}>
              {blockType}
            </option>
          ))}
        </select>
      </Field>
      {block.blockType === "change" && (
        <Field label="Runs">
          <label className="resolve">
            <input
              type="checkbox"
              checked={runsPerChange}
              onChange={(event) =>
                void apply([{ op: "set_runs", blockId: block.blockId, runsPerChange: event.target.checked }])
              }
            />
            once per change, in parallel
          </label>
        </Field>
      )}
      <Field label="Done when">
        <DoneWhen {...props} />
      </Field>
      {block.blockType === "prompt" && (
        <Field label="Prompt">
          <select
            className="inp"
            value={block.promptFile ?? ""}
            onChange={(event) => void apply([fieldEdit(block, "prompt", event.target.value)])}
          >
            <option value="" disabled>
              choose a prompt file
            </option>
            {editor.promptTemplates.map((templateName) => (
              <option key={templateName} value={templateName}>
                {templateName}
              </option>
            ))}
          </select>
        </Field>
      )}
      <StatePrompts {...props} />
      <BlockMoves {...props} />
      <Field label="pipeline.yaml">
        <pre className="yaml">{props.snippet}</pre>
      </Field>
    </aside>
  );
}
