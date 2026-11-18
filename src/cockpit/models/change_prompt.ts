import type { ChangeViewDTO, ThreadViewDTO } from "@/cockpit/models/block_state";
import { CockpitError } from "@/cockpit/models/errors";
import { CONTEXT_FILE_NAME, WorkspaceBrief, type WorkspaceBriefDTO } from "@/cockpit/models/workspace_brief";

export const PROMPT_KINDS = [
  "build_ticket",
  "fix_ci",
  "resolve_conflict",
  "address_feedback",
  "diagnose_deploy",
] as const;

export type PromptKind = (typeof PROMPT_KINDS)[number];

export interface ChangePromptRequestDTO {
  readonly kind: PromptKind;
  readonly ticketKey: string;
  readonly ticketTitle: string;
  readonly change: ChangeViewDTO | null;
  readonly threads: readonly ThreadViewDTO[];
  readonly runUrls: readonly string[];
}

interface PromptInput {
  readonly request: ChangePromptRequestDTO;
  readonly brief: WorkspaceBriefDTO | null;
}

const CLOSING_LINE = `Your workspace's ${CONTEXT_FILE_NAME} has the full ticket and the conventions.`;

const changeLine = (input: PromptInput, change: ChangeViewDTO): string => {
  const folder = input.brief === null ? null : WorkspaceBrief.folderOf(input.brief, change.repoName);
  const where = folder === null ? "" : ` Work in ${folder}.`;
  return `Pull request: ${change.url} (${change.repoName} #${String(change.number)}, branch ${change.branchName}).${where}`;
};

const descriptionLines = (brief: WorkspaceBriefDTO | null): readonly string[] => {
  if (brief === null) {
    return [];
  }
  if (brief.detailsFailure !== null) {
    return [`The ticket's description couldn't be loaded (${brief.detailsFailure}); ask me for it.`];
  }
  return ["Ticket description:", brief.description === null || brief.description === "" ? "(none)" : brief.description];
};

const repoLines = (brief: WorkspaceBriefDTO | null): readonly string[] =>
  brief === null ? [] : ["Repos (each a git worktree on the ticket's branch):", ...WorkspaceBrief.repoLines(brief)];

const threadLines = (threads: readonly ThreadViewDTO[]): readonly string[] =>
  threads.flatMap((thread, index) => [
    `${String(index + 1)}. ${thread.location}, last comment by ${thread.lastAuthorLogin}:`,
    ...thread.lastCommentBody.split("\n").map((line) => `   > ${line}`),
  ]);

function requireChange(input: PromptInput): string {
  const request = input.request;
  if (request.change === null) {
    throw new CockpitError(`The ${request.kind} prompt needs a pull request`);
  }
  return changeLine(input, request.change);
}

const PROMPT_BUILDERS: Readonly<Record<PromptKind, (input: PromptInput) => readonly string[]>> = {
  build_ticket: ({ request, brief }) => [
    `Build ${request.ticketKey}: ${request.ticketTitle}.`,
    ...descriptionLines(brief),
    ...repoLines(brief),
    "Plan the change, implement it in the right repo folder, commit, push the branch, and open a pull request whose title starts with the ticket key.",
  ],
  fix_ci: (input) => [
    `Fix the failing CI checks for ${input.request.ticketKey}.`,
    requireChange(input),
    "Find the failing checks, fix the cause, and push to the same branch.",
  ],
  resolve_conflict: (input) => [
    `Resolve the merge conflict for ${input.request.ticketKey}.`,
    requireChange(input),
    "Merge the base branch into this branch, resolve the conflicts, check that it builds, and push.",
  ],
  address_feedback: (input) => [
    `Address the review feedback for ${input.request.ticketKey}.`,
    requireChange(input),
    "Open threads waiting for a reply:",
    ...threadLines(input.request.threads),
    "Fix what the reviewers asked for and push. Draft a short reply for each thread, but don't post it.",
  ],
  diagnose_deploy: ({ request, brief }) => [
    `Diagnose the failed deployment for ${request.ticketKey}: ${request.ticketTitle}.`,
    ...request.runUrls.map((runUrl) => `Failed run: ${runUrl}`),
    ...repoLines(brief),
    "Read the run's logs (for example with gh run view --log-failed), find the cause, and propose a fix.",
    "Don't re-run or trigger any deployment.",
  ],
};

export const ChangePrompt = {
  text(request: ChangePromptRequestDTO, brief: WorkspaceBriefDTO | null): string {
    return [...PROMPT_BUILDERS[request.kind]({ request, brief }), CLOSING_LINE].join("\n");
  },
};
