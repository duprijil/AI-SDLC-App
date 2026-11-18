import type { Change } from "@/change/models/change";
import type { ChangeReview } from "@/change/models/change_review";
import type { ReviewThread } from "@/change/models/review_thread";
import type { TicketChange } from "@/change/models/ticket_changes";
import type { BlockTemplateDTO, ChangeCheck } from "@/pipeline/models/pipeline";

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
  | "tracker_done"
  | "tracker_open"
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
  tracker_done: { tone: "ok", isFinished: true, caption: "done" },
  tracker_open: { tone: "wait", isFinished: false, caption: "waiting" },
  not_checked_yet: { tone: "idle", isFinished: true, caption: "checked from M3/M4" },
  could_not_check: { tone: "lock", isFinished: false, caption: "could not check" },
  waits: { tone: "lock", isFinished: false, caption: "waits for the block above" },
};

const NEEDS_YOU_KINDS: readonly BlockStateKind[] = ["feedback", "conflict", "behind", "approved"];

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
  };
};

interface BlockStateParts {
  readonly title: string;
  readonly change?: ChangeViewDTO;
  readonly threads?: readonly ThreadViewDTO[];
  readonly caption?: string;
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

  forTracker(template: BlockTemplateDTO, isDone: boolean): BlockStateDTO {
    return blockState(template, isDone ? "tracker_done" : "tracker_open", { title: template.title });
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
    return block.kind === "ci_failing";
  },
};
