import { type ReactElement, type ReactNode, useState } from "react";

import { CheckpointForm } from "@/cockpit/entrypoints/ui/checkpoint_form";
import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import { ConfirmButton } from "@/cockpit/entrypoints/ui/confirm_button";
import { AttestDone, AttestTick, DeployLines } from "@/cockpit/entrypoints/ui/environment_parts";
import { ThreadReply } from "@/cockpit/entrypoints/ui/thread_reply";
import type { AttestTickRequestDTO } from "@/cockpit/models/attest_action";
import type { BlockStateDTO, BlockStateKind, ChangeViewDTO } from "@/cockpit/models/block_state";
import type { ChangeActionDTO } from "@/cockpit/models/change_action";
import type { CheckpointRequestDTO } from "@/cockpit/models/checkpoint_action";
import type { PromptKind } from "@/cockpit/models/prompt_request";

export const POPOVER_WIDTH = 380;
const POPOVER_GAP = 8;

export interface PopoverPosition {
  readonly left: number;
  readonly top: number;
}

export const popoverPosition = (anchorRect: DOMRect): PopoverPosition => ({
  left: Math.max(POPOVER_GAP, Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH - POPOVER_GAP)),
  top: anchorRect.bottom + POPOVER_GAP,
});

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
  readonly onTickAttestation: (request: AttestTickRequestDTO) => Promise<string | null>;
  readonly onRecordCheckpoint: (request: CheckpointRequestDTO) => Promise<string | null>;
  readonly onSendPrompt: (target: PopoverTarget, kind: PromptKind) => Promise<string | null>;
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
  const [failure, setFailure] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  return (
    <div className="confirm">
      <button
        type="button"
        className="btn ai"
        disabled={isBusy}
        onClick={() => {
          setIsBusy(true);
          setFailure(null);
          void context.onSendPrompt(context.target, kind).then((refusal) => {
            setIsBusy(false);
            if (refusal === null) {
              context.onClose();
              return;
            }
            setFailure(refusal);
          });
        }}
      >
        ▶ {label} in Claude Code
      </button>
      {failure !== null && <div className="pop-failure">{failure}</div>}
    </div>
  );
}

const BUILT_IN_PROMPT_KINDS: readonly BlockStateKind[] = [
  "no_change",
  "ci_failing",
  "conflict",
  "feedback",
  "drafted",
  "deploy_failed",
  "prompt_open",
  "prompt_done",
];

function PipelinePrompt({ context }: { readonly context: PopoverContext }): ReactElement | null {
  const block = context.target.block;
  if (block.promptTemplates.length === 0 || BUILT_IN_PROMPT_KINDS.includes(block.kind)) {
    return null;
  }
  return <PromptButton context={context} kind="block_prompt" label={`Send ${block.promptTemplates.join(", ")}`} />;
}

function NoteDraft({ note }: { readonly note: string }): ReactElement {
  return (
    <div className="thread">
      <div className="thread-head">Note drafted by Claude Code</div>
      <div className="quote">{note}</div>
      <div className="row">
        <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(note)}>
          Copy
        </button>
      </div>
    </div>
  );
}

function promptBlock(context: PopoverContext): ReactNode {
  const note = context.target.block.noteDraft;
  return (
    <>
      {note !== null && <NoteDraft note={note} />}
      <PromptButton context={context} kind="block_prompt" label="Send" />
      <CheckpointForm
        ticketKey={context.target.ticketKey}
        block={context.target.block}
        onRecord={context.onRecordCheckpoint}
        onDone={context.onClose}
      />
    </>
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

function attestTick(context: PopoverContext): ReactNode {
  const attestation = context.target.block.attestation;
  if (attestation === null) {
    return null;
  }
  return (
    <AttestTick
      ticketKey={context.target.ticketKey}
      block={context.target.block}
      attestation={attestation}
      onTick={context.onTickAttestation}
      onDone={context.onClose}
    />
  );
}

const deployLines = (context: PopoverContext): ReactNode => <DeployLines block={context.target.block} />;

function feedbackActions(context: PopoverContext): ReactNode {
  return (
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
  );
}

const ACTIONS: Partial<Record<BlockStateKind, (context: PopoverContext) => ReactNode>> = {
  deploy_na: deployLines,
  deploy_done: deployLines,
  deploy_running: deployLines,
  deploy_partial: deployLines,
  deploy_waiting: deployLines,
  deploy_manual: deployLines,
  deploy_failed: (context) => (
    <>
      <DeployLines block={context.target.block} />
      <PromptButton context={context} kind="diagnose_deploy" label="Diagnose the deploy failure" />
    </>
  ),
  could_not_check: (context) => (context.target.block.deployLines.length > 0 ? deployLines(context) : null),
  prompt_open: promptBlock,
  prompt_done: promptBlock,
  attest_open: attestTick,
  attest_stale: attestTick,
  attest_done: (context) =>
    context.target.block.attestation === null ? null : <AttestDone attestation={context.target.block.attestation} />,
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
  drafted: (context) => feedbackActions(context),
  feedback: (context) => feedbackActions(context),

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
  const { left, top } = popoverPosition(target.anchorRect);
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
        <PipelinePrompt context={context} />
        <OpenLinks change={target.block.change} />
      </div>
    </>
  );
}
