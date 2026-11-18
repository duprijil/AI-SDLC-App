import type { PinsDTO } from "@/attestation/models/pins";
import type { Change } from "@/change/models/change";
import type { ChangeReview } from "@/change/models/change_review";
import type { ReviewThread } from "@/change/models/review_thread";
import type { TicketChange } from "@/change/models/ticket_changes";
import type { ColumnMoveDTO } from "@/cockpit/models/column_move";
import { type DeployLineDTO, DeployView } from "@/cockpit/models/deploy_view";
import type { BlockTemplateDTO, ChangeCheck } from "@/pipeline/models/pipeline";
import type { DraftDTO } from "@/session/models/draft";

export type BlockStateKind =
  | "no_change"
  | "draft"
  | "ci_failing"
  | "ready"
  | "merged"
  | "conflict"
  | "feedback"
  | "behind"
  | "approved"
  | "in_review"
  | "drafted"
  | "tracker_done"
  | "tracker_open"
  | "deploy_na"
  | "deploy_done"
  | "deploy_failed"
  | "deploy_running"
  | "deploy_partial"
  | "deploy_waiting"
  | "deploy_manual"
  | "attest_open"
  | "attest_stale"
  | "attest_done"
  | "attest_waits"
  | "prompt_open"
  | "prompt_done"
  | "not_checked_yet"
  | "could_not_check"
  | "waits";

export type BlockTone = "ok" | "warn" | "fail" | "wait" | "lock" | "idle";

export interface ChangeViewDTO {
  readonly pullRequestId: string;
  readonly githubRepository: string;
  readonly repoName: string;
  readonly number: number;
  readonly title: string;
  readonly branchName: string;
  readonly url: string;
  readonly headCommitId: string;
}

export interface ThreadViewDTO {
  readonly threadId: string;
  readonly location: string;
  readonly lastAuthorLogin: string;
  readonly lastCommentBody: string;
  readonly draftText: string | null;
}

export interface AttestationViewDTO {
  readonly envName: string;
  readonly currentPins: PinsDTO;
  readonly tickedPins: PinsDTO | null;
  readonly tickedBy: string | null;
  readonly tickedAt: string | null;
}

export interface BlockStateDTO {
  readonly blockId: string;
  readonly title: string;
  readonly caption: string;
  readonly kind: BlockStateKind;
  readonly tone: BlockTone;
  readonly isFinished: boolean;
  readonly change: ChangeViewDTO | null;
  readonly threads: readonly ThreadViewDTO[];
  readonly moveTo: ColumnMoveDTO | null;
  readonly envName: string | null;
  readonly deployLines: readonly DeployLineDTO[];
  readonly attestation: AttestationViewDTO | null;
  readonly promptTemplates: readonly string[];
  readonly noteDraft: string | null;
}

interface KindMeta {
  readonly tone: BlockTone;
  readonly isFinished: boolean;
  readonly caption: string;
}

const KIND_META: Readonly<Record<BlockStateKind, KindMeta>> = {
  no_change: { tone: "wait", isFinished: false, caption: "No PR yet" },
  draft: { tone: "wait", isFinished: false, caption: "draft" },
  ci_failing: { tone: "fail", isFinished: false, caption: "CI failing" },
  ready: { tone: "ok", isFinished: true, caption: "ready for review" },
  merged: { tone: "ok", isFinished: true, caption: "merged" },
  conflict: { tone: "warn", isFinished: false, caption: "merge conflict" },
  feedback: { tone: "warn", isFinished: false, caption: "feedback" },
  behind: { tone: "warn", isFinished: false, caption: "behind its base" },
  approved: { tone: "warn", isFinished: false, caption: "approved · merge" },
  in_review: { tone: "wait", isFinished: false, caption: "in review" },
  drafted: { tone: "warn", isFinished: false, caption: "drafted reply · post it" },
  tracker_done: { tone: "ok", isFinished: true, caption: "done" },
  tracker_open: { tone: "wait", isFinished: false, caption: "waiting" },
  deploy_na: { tone: "ok", isFinished: true, caption: "n/a" },
  deploy_done: { tone: "ok", isFinished: true, caption: "deployed" },
  deploy_failed: { tone: "fail", isFinished: false, caption: "deploy failed" },
  deploy_running: { tone: "wait", isFinished: false, caption: "deploying" },
  deploy_partial: { tone: "wait", isFinished: false, caption: "partial" },
  deploy_waiting: { tone: "wait", isFinished: false, caption: "waiting for a deploy" },
  deploy_manual: { tone: "idle", isFinished: true, caption: "manual · not checked yet" },
  attest_open: { tone: "warn", isFinished: false, caption: "open · tick when validated" },
  attest_stale: { tone: "warn", isFinished: false, caption: "stale · the deployed commits changed" },
  attest_done: { tone: "ok", isFinished: true, caption: "validated" },
  attest_waits: { tone: "lock", isFinished: false, caption: "waits for the deployment" },
  prompt_open: { tone: "warn", isFinished: false, caption: "open · send or mark done" },
  prompt_done: { tone: "ok", isFinished: true, caption: "done" },
  not_checked_yet: { tone: "idle", isFinished: true, caption: "checked from M4" },
  could_not_check: { tone: "lock", isFinished: false, caption: "could not check" },
  waits: { tone: "lock", isFinished: false, caption: "waits for the block above" },
};

const ACTION_STATE_OF: Readonly<Partial<Record<BlockStateKind, string>>> = {
  no_change: "none",
  draft: "draft",
  ci_failing: "ci_failing",
  ready: "ready",
  merged: "merged",
  conflict: "conflict",
  feedback: "feedback",
  behind: "behind",
  approved: "approved",
  in_review: "in_review",
  drafted: "drafted",
  tracker_open: "open",
  tracker_done: "done",
  deploy_na: "n_a",
  deploy_done: "done",
  deploy_failed: "failed",
  deploy_running: "deploying",
  deploy_partial: "partial",
  deploy_waiting: "waiting",
  deploy_manual: "manual",
  attest_open: "open",
  attest_stale: "stale",
  attest_done: "done",
  prompt_open: "open",
  prompt_done: "done",
};

const promptTemplatesFor = (template: BlockTemplateDTO, kind: BlockStateKind): readonly string[] => {
  const state = ACTION_STATE_OF[kind];
  const mapped = state === undefined ? [] : (template.promptActions[state] ?? []);
  if (mapped.length > 0 || template.promptFile === null) {
    return mapped;
  }
  return [template.promptFile];
};

const NEEDS_YOU_KINDS: readonly BlockStateKind[] = [
  "prompt_open",
  "drafted",
  "feedback",
  "conflict",
  "behind",
  "approved",
  "attest_open",
  "attest_stale",
];

const FAILURE_KINDS: readonly BlockStateKind[] = ["ci_failing", "deploy_failed"];

type ReviewRule = readonly [BlockStateKind, (review: ChangeReview, change: Change, viewerLogin: string) => boolean];

const MERGED_CHECK_RULES: readonly ReviewRule[] = [
  ["draft", (_review, change): boolean => change.isDraft],
  ["conflict", (review): boolean => review.hasConflict()],
  ["ci_failing", (review): boolean => review.isCiFailing()],
  ["feedback", (review, change, viewerLogin): boolean => review.hasFeedbackFor(viewerLogin, change.authorLogin)],
  ["behind", (review): boolean => review.isBehind()],
  ["approved", (review): boolean => review.isApproved()],
];

const READY_CHECK_RULES: readonly ReviewRule[] = [
  ["draft", (_review, change): boolean => change.isDraft],
  ["ci_failing", (review): boolean => review.isCiFailing()],
];

const toChangeView = (change: Change): ChangeViewDTO => ({
  pullRequestId: change.pullRequestId,
  githubRepository: change.githubRepository,
  repoName: change.repoName,
  number: change.number,
  title: change.title,
  branchName: change.branchName,
  url: change.url,
  headCommitId: change.headCommitId,
});

const toThreadView = (thread: ReviewThread): ThreadViewDTO => {
  const lastComment = thread.comments.at(-1);
  return {
    threadId: thread.threadId,
    location: thread.location(),
    lastAuthorLogin: lastComment?.authorLogin ?? "",
    lastCommentBody: lastComment?.body ?? "",
    draftText: null,
  };
};

interface BlockStateParts {
  readonly title: string;
  readonly change?: ChangeViewDTO;
  readonly threads?: readonly ThreadViewDTO[];
  readonly caption?: string;
  readonly moveTo?: ColumnMoveDTO | null;
  readonly deployLines?: readonly DeployLineDTO[];
  readonly attestation?: AttestationViewDTO | null;
}

function blockState(template: BlockTemplateDTO, kind: BlockStateKind, parts: BlockStateParts): BlockStateDTO {
  const meta = KIND_META[kind];
  return {
    blockId: template.blockId,
    title: parts.title,
    caption: parts.caption ?? meta.caption,
    kind,
    tone: meta.tone,
    isFinished: meta.isFinished,
    change: parts.change ?? null,
    threads: parts.threads ?? [],
    moveTo: parts.moveTo ?? null,
    envName: template.envName,
    deployLines: parts.deployLines ?? [],
    attestation: parts.attestation ?? null,
    promptTemplates: promptTemplatesFor(template, kind),
    noteDraft: null,
  };
}

export const BlockState = {
  forChange(template: BlockTemplateDTO, ticketChange: TicketChange, viewerLogin: string): BlockStateDTO {
    const change = ticketChange.change;
    const parts = { title: change.label(), change: toChangeView(change) };
    if (change.isMerged()) {
      return blockState(template, "merged", parts);
    }
    if (ticketChange.review === null) {
      return blockState(template, "could_not_check", {
        ...parts,
        caption: `could not check: ${ticketChange.failure ?? "no review data"}`,
      });
    }
    const review = ticketChange.review;
    const check: ChangeCheck = template.changeCheck ?? "merged";
    const rules = check === "ready" ? READY_CHECK_RULES : MERGED_CHECK_RULES;
    const fallback: BlockStateKind = check === "ready" ? "ready" : "in_review";
    const kind = rules.find(([, applies]) => applies(review, change, viewerLogin))?.[0] ?? fallback;
    const threads = kind === "feedback" ? review.threadsAwaitingReplyFrom(viewerLogin).map(toThreadView) : [];
    return blockState(template, kind, { ...parts, threads });
  },

  noChange(template: BlockTemplateDTO): BlockStateDTO {
    return blockState(template, "no_change", { title: template.title });
  },

  changesUnavailable(template: BlockTemplateDTO, reason: string): BlockStateDTO {
    return blockState(template, "could_not_check", { title: template.title, caption: `could not check: ${reason}` });
  },

  forTracker(template: BlockTemplateDTO, isDone: boolean, moveTo: ColumnMoveDTO | null): BlockStateDTO {
    if (isDone) {
      return blockState(template, "tracker_done", { title: template.title });
    }
    return blockState(template, "tracker_open", {
      title: template.title,
      ...(moveTo === null ? {} : { caption: "waiting · click to move", moveTo }),
    });
  },

  forDeploy(template: BlockTemplateDTO, deployLines: readonly DeployLineDTO[]): BlockStateDTO {
    const kind = DeployView.outcome(deployLines);
    const caption = kind === "deploy_partial" ? DeployView.partialCaption(deployLines) : undefined;
    const reason = deployLines.find((line) => line.state === "could_not_check")?.caption;
    return blockState(template, kind, {
      title: template.title,
      deployLines,
      ...(kind === "could_not_check" ? { caption: reason ?? "could not check" } : {}),
      ...(caption === undefined ? {} : { caption }),
    });
  },

  forAttest(
    template: BlockTemplateDTO,
    status: "open" | "stale" | "done",
    attestation: AttestationViewDTO,
  ): BlockStateDTO {
    const kinds = { open: "attest_open", stale: "attest_stale", done: "attest_done" } as const;
    return blockState(template, kinds[status], { title: template.title, attestation });
  },

  attestWaits(template: BlockTemplateDTO, reason: string): BlockStateDTO {
    return blockState(template, "attest_waits", { title: template.title, caption: reason });
  },

  withDrafts(block: BlockStateDTO, template: BlockTemplateDTO, drafts: readonly DraftDTO[]): BlockStateDTO {
    const replyFor = (threadId: string): string | null =>
      drafts.findLast((draft) => draft.kind === "thread_reply" && draft.target === threadId)?.text ?? null;
    const note = drafts.findLast((draft) => draft.kind === "note" && draft.target === block.blockId)?.text ?? null;
    const threads = block.threads.map((thread) => ({ ...thread, draftText: replyFor(thread.threadId) }));
    const isDrafted = block.kind === "feedback" && threads.some((thread) => thread.draftText !== null);
    if (!isDrafted) {
      return { ...block, threads, noteDraft: note };
    }
    const drafted = blockState(template, "drafted", { title: block.title, threads });
    return { ...drafted, change: block.change, noteDraft: note };
  },

  forPrompt(template: BlockTemplateDTO, isDone: boolean, note: string | null): BlockStateDTO {
    const caption = isDone && note !== null && note !== "" ? `done · ${note}` : undefined;
    return blockState(template, isDone ? "prompt_done" : "prompt_open", {
      title: template.title,
      ...(caption === undefined ? {} : { caption }),
    });
  },

  notCheckedYet(template: BlockTemplateDTO): BlockStateDTO {
    return blockState(template, "not_checked_yet", { title: template.title });
  },

  waits(template: BlockTemplateDTO): BlockStateDTO {
    return blockState(template, "waits", { title: template.title });
  },

  needsYou(block: BlockStateDTO): boolean {
    return NEEDS_YOU_KINDS.includes(block.kind);
  },

  isFailure(block: BlockStateDTO): boolean {
    return FAILURE_KINDS.includes(block.kind);
  },
};
