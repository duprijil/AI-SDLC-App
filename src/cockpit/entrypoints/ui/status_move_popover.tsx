import { type ReactElement, useEffect, useState } from "react";

import { POPOVER_WIDTH, popoverPosition } from "@/cockpit/entrypoints/ui/block_popover";
import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import { ConfirmButton } from "@/cockpit/entrypoints/ui/confirm_button";
import type { ColumnMoveDTO } from "@/cockpit/models/column_move";
import type { StatusMovePreviewDTO, StatusMoveRequestDTO } from "@/cockpit/models/status_move_action";

export interface StatusMoveTarget {
  readonly ticketKey: string;
  readonly move: ColumnMoveDTO;
  readonly anchorRect: DOMRect;
}

export interface StatusMovePopoverProps {
  readonly target: StatusMoveTarget;
  readonly columnName: string;
  readonly onClose: () => void;
  readonly onMove: (request: StatusMoveRequestDTO) => Promise<string | null>;
}

type PreviewLoad =
  | { readonly step: "loading" }
  | { readonly step: "loaded"; readonly preview: StatusMovePreviewDTO }
  | { readonly step: "failed"; readonly reason: string };

function OpenInJira({ ticketKey }: { readonly ticketKey: string }): ReactElement {
  return (
    <div className="row">
      <button type="button" className="btn" onClick={() => void sprintBoardBridge().openInTracker(ticketKey)}>
        Open in Jira ↗
      </button>
    </div>
  );
}

function PreviewBody({
  load,
  props,
}: {
  readonly load: PreviewLoad;
  readonly props: StatusMovePopoverProps;
}): ReactElement {
  if (load.step === "loading") {
    return <div className="q">Checking the transitions in Jira…</div>;
  }
  if (load.step === "failed") {
    return <div className="pop-failure">{load.reason}</div>;
  }
  const preview = load.preview;
  if (preview.refusal !== null || preview.transitionLabel === null) {
    return <div className="pop-failure">{preview.refusal ?? "No transition found"}</div>;
  }
  const verb = preview.direction === "forward" ? "Move to" : "Move back to";
  return (
    <>
      <div className="q">
        {preview.fromStatusName} → {preview.toColumnName}, with the Jira transition “{preview.transitionLabel}”.
      </div>
      <ConfirmButton
        label={`${verb} ${preview.toColumnName}`}
        confirmation={`Jira re-checks that ${preview.ticketKey} is still in ${preview.fromStatusName}, then runs “${preview.transitionLabel}”.`}
        onConfirm={() =>
          props.onMove({ ticketKey: props.target.ticketKey, targetColumnIndex: props.target.move.columnIndex })
        }
        onDone={props.onClose}
      />
    </>
  );
}

export function StatusMovePopover(props: StatusMovePopoverProps): ReactElement {
  const { target, columnName, onClose } = props;
  const [load, setLoad] = useState<PreviewLoad>({ step: "loading" });

  useEffect(() => {
    let isCurrent = true;
    sprintBoardBridge()
      .previewStatusMove({ ticketKey: target.ticketKey, targetColumnIndex: target.move.columnIndex })
      .then((preview) => {
        if (isCurrent) {
          setLoad({ step: "loaded", preview });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoad({ step: "failed", reason: error instanceof Error ? error.message : "unknown" });
        }
      });
    return (): void => {
      isCurrent = false;
    };
  }, [target.ticketKey, target.move.columnIndex]);

  const { left, top } = popoverPosition(target.anchorRect);
  const question =
    target.move.direction === "forward"
      ? `Move ${target.ticketKey} to ${columnName}?`
      : `Move ${target.ticketKey} back to ${columnName}?`;
  return (
    <>
      <div className="pop-backdrop" onClick={onClose} />
      <div className="pop" style={{ left, top, width: POPOVER_WIDTH }}>
        <h4>{question}</h4>
        <PreviewBody load={load} props={props} />
        <OpenInJira ticketKey={target.ticketKey} />
      </div>
    </>
  );
}
