import type { ReactElement, ReactNode } from "react";

import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import { ConfirmButton } from "@/cockpit/entrypoints/ui/confirm_button";
import { ThreadReply } from "@/cockpit/entrypoints/ui/thread_reply";
import type { BlockStateDTO, BlockStateKind, ChangeViewDTO } from "@/cockpit/models/block_state";
import type { ChangeActionDTO } from "@/cockpit/models/change_action";
import type { PromptKind } from "@/cockpit/models/change_prompt";

const POPOVER_WIDTH = 380;
const POPOVER_GAP = 8;

export interface PopoverTarget {
  readonly ticketKey: string;
  readonly ticketTitle: string;
  readonly block: BlockStateDTO;
  readonly anchorRect: DOMRect;
}

export interface BlockPopoverProps {
  readonly target: PopoverTarget;
  readonly onClose: () => void;
  readonly onRunAction: (ticketKey: string, action: ChangeActionDTO) => Promise<string | null>;
  readonly onSendPrompt: (target: PopoverTarget, kind: PromptKind) => void;
}

interface PopoverContext extends BlockPopoverProps {
  readonly change: ChangeViewDTO | null;
}

function OpenLinks({ change }: { readonly change: ChangeViewDTO | null }): ReactElement | null {
  if (change === null) {
    return null;
  }
  return (
    <div className="row">
      <button type="button" className="btn" onClick={() => void sprintBoardBridge().openExternal(change.url)}>
        Open PR ↗
      </button>
      <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(change.url)}>
        Copy link
      </button>
    </div>
  );
}

function PromptButton({
  context,
  kind,
  label,
}: {
  readonly context: PopoverContext;
  readonly kind: PromptKind;
  readonly label: string;
}): ReactElement {
  return (
    <button
      type="button"
      className="btn ai"
      onClick={() => {
        context.onSendPrompt(context.target, kind);
        context.onClose();
      }}
    >
      ▶ {label} in Claude Code
    </button>
  );
}

function changeAction(
  context: PopoverContext,
  label: string,
  confirmation: string,
  kind: "merge" | "update_branch",
): ReactNode {
  const change = context.change;
  if (change === null) {
    return null;
  }
  return (
    <ConfirmButton
      label={label}
      confirmation={confirmation}
      onConfirm={() => context.onRunAction(context.target.ticketKey, { kind, change })}
      onDone={context.onClose}
    />
  );
}

const ACTIONS: Partial<Record<BlockStateKind, (context: PopoverContext) => ReactNode>> = {
  no_change: (context) => <PromptButton context={context} kind="build_ticket" label="Build the ticket" />,
  ci_failing: (context) => (
    <div className="row">
      <PromptButton context={context} kind="fix_ci" label="Fix CI" />
      {context.change !== null && (
        <button
          type="button"
          className="btn"
          onClick={() => void sprintBoardBridge().openExternal(`${context.change?.url ?? ""}/checks`)}
        >
          Open checks ↗
        </button>
      )}
    </div>
  ),
  conflict: (context) => <PromptButton context={context} kind="resolve_conflict" label="Resolve the conflict" />,
  feedback: (context) => (
    <>
      {context.target.block.threads.map((thread) => (
        <ThreadReply
          key={thread.threadId}
          thread={thread}
          onRunAction={(action) => context.onRunAction(context.target.ticketKey, action)}
          onDone={context.onClose}
        />
      ))}
      <PromptButton context={context} kind="address_feedback" label="Address the feedback" />
    </>
  ),
  behind: (context) =>
    changeAction(
      context,
      "Update branch",
      `Update ${context.target.block.title} with the latest commits of its base branch?`,
      "update_branch",
    ),
  approved: (context) =>
    changeAction(
      context,
      "Merge",
      `Merge ${context.target.block.title}? GitHub re-checks that it's still approved and clean first.`,
      "merge",
    ),
};

export function BlockPopover(props: BlockPopoverProps): ReactElement {
  const { target, onClose } = props;
  const context: PopoverContext = { ...props, change: target.block.change };
  const left = Math.max(POPOVER_GAP, Math.min(target.anchorRect.left, window.innerWidth - POPOVER_WIDTH - POPOVER_GAP));
  const top = target.anchorRect.bottom + POPOVER_GAP;
  return (
    <>
      <div className="pop-backdrop" onClick={onClose} />
      <div className="pop" style={{ left, top, width: POPOVER_WIDTH }}>
        <h4>
          {target.block.title} · {target.block.caption}
        </h4>
        <div className="q">
          {target.ticketKey} · {target.block.change?.title ?? target.ticketTitle}
        </div>
        {ACTIONS[target.block.kind]?.(context)}
        <OpenLinks change={target.block.change} />
      </div>
    </>
  );
}
