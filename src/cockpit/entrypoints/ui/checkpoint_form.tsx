import { type ReactElement, useState } from "react";

import { ConfirmButton } from "@/cockpit/entrypoints/ui/confirm_button";
import type { BlockStateDTO } from "@/cockpit/models/block_state";
import type { CheckpointRequestDTO } from "@/cockpit/models/checkpoint_action";

export interface CheckpointFormProps {
  readonly ticketKey: string;
  readonly block: BlockStateDTO;
  readonly onRecord: (request: CheckpointRequestDTO) => Promise<string | null>;
  readonly onDone: () => void;
}

export function CheckpointForm({ ticketKey, block, onRecord, onDone }: CheckpointFormProps): ReactElement {
  const [note, setNote] = useState("");
  if (block.kind === "prompt_done") {
    return (
      <ConfirmButton
        label="Reopen"
        confirmation={`Reopen ${block.title} for ${ticketKey}? It will count as unfinished again.`}
        onConfirm={() => onRecord({ ticketKey, blockId: block.blockId, state: "open", note: "" })}
        onDone={onDone}
      />
    );
  }
  return (
    <div className="checkpoint">
      <textarea
        className="reply"
        placeholder="Optional note"
        maxLength={2000}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      <ConfirmButton
        label="Mark done"
        confirmation={`Mark ${block.title} as done for ${ticketKey}?`}
        onConfirm={() => onRecord({ ticketKey, blockId: block.blockId, state: "done", note })}
        onDone={onDone}
      />
    </div>
  );
}
