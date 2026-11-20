import { useCallback, useEffect, useState } from "react";

import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import type { PipelineEditorDTO } from "@/cockpit/models/pipeline_editor";
import type { PipelineDraftDTO } from "@/pipeline/models/pipeline_draft";
import type { PipelineEditDTO } from "@/pipeline/models/pipeline_edit";

export interface PipelineDraftState {
  readonly editor: PipelineEditorDTO | null;
  readonly draft: PipelineDraftDTO | null;
  readonly editCount: number;
  readonly notice: string | null;
  readonly hasChangedOnDisk: boolean;
  readonly isSaving: boolean;
  readonly apply: (edits: readonly PipelineEditDTO[]) => Promise<boolean>;
  readonly save: () => void;
  readonly discard: () => void;
  readonly reload: (nextNotice?: string | null) => void;
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : "unknown");

export function usePipelineDraft(onSaved: () => void): PipelineDraftState {
  const [editor, setEditor] = useState<PipelineEditorDTO | null>(null);
  const [draft, setDraft] = useState<PipelineDraftDTO | null>(null);
  const [edits, setEdits] = useState<readonly PipelineEditDTO[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasChangedOnDisk, setHasChangedOnDisk] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const reload = useCallback((nextNotice: string | null = null) => {
    sprintBoardBridge()
      .openPipeline()
      .then((opened) => {
        setEditor(opened);
        setDraft(opened.draft);
        setEdits([]);
        setHasChangedOnDisk(false);
        setNotice(nextNotice);
      })
      .catch((error: unknown) => {
        setNotice(reasonOf(error));
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const apply = useCallback(
    async (newEdits: readonly PipelineEditDTO[]): Promise<boolean> => {
      const nextEdits = [...edits, ...newEdits];
      try {
        const checked = await sprintBoardBridge().checkPipeline({ edits: nextEdits });
        if (checked.editFailure !== null) {
          setNotice(checked.editFailure);
          return false;
        }
        setEdits(nextEdits);
        setDraft(checked);
        setNotice(null);
        return true;
      } catch (error) {
        setNotice(reasonOf(error));
        return false;
      }
    },
    [edits],
  );

  const save = useCallback(() => {
    if (editor === null) {
      return;
    }
    setIsSaving(true);
    sprintBoardBridge()
      .savePipeline({ expectedHash: editor.draft.hash, edits })
      .then((result) => {
        setHasChangedOnDisk(result.hasChangedOnDisk);
        if (result.draft === null) {
          setNotice(result.failure);
          return;
        }
        reload(result.failure ?? "Saved pipeline.yaml. The board uses it now.");
        onSaved();
      })
      .catch((error: unknown) => {
        setNotice(reasonOf(error));
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [editor, edits, onSaved, reload]);

  const discard = useCallback(() => {
    setEdits([]);
    setDraft(editor?.draft ?? null);
    setNotice(null);
  }, [editor]);

  return { editor, draft, editCount: edits.length, notice, hasChangedOnDisk, isSaving, apply, save, discard, reload };
}
