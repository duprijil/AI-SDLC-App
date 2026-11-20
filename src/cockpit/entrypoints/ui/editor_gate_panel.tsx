import type { ReactElement } from "react";

import { PromptChips } from "@/cockpit/entrypoints/ui/prompt_chips";
import type { PipelineEditorDTO } from "@/cockpit/models/pipeline_editor";
import type { PipelineEditDTO } from "@/pipeline/models/pipeline_edit";

export interface EditorGatePanelProps {
  readonly columnKey: string;
  readonly fromName: string;
  readonly toName: string;
  readonly gatePrompts: readonly string[];
  readonly editor: PipelineEditorDTO;
  readonly apply: (edits: readonly PipelineEditDTO[]) => Promise<boolean>;
}

export function EditorGatePanel(props: EditorGatePanelProps): ReactElement {
  return (
    <aside className="side">
      <div className="side-kicker">Gate</div>
      <h3>
        {props.fromName} → {props.toName}
      </h3>
      <div className="fld">
        <label>Opens when</label>
        <div className="inp">every block in &quot;{props.fromName}&quot; is done</div>
        <div className="hint">Fixed rule, not configurable. You move the status, after a confirm.</div>
      </div>
      <div className="fld">
        <label>After the move, send to Claude Code</label>
        <PromptChips
          selected={props.gatePrompts}
          available={props.editor.promptTemplates}
          onChange={(templateNames) =>
            void props.apply([{ op: "set_gate_prompts", columnKey: props.columnKey, templateNames }])
          }
        />
      </div>
    </aside>
  );
}
