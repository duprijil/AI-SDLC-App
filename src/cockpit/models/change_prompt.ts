import type { ChangeViewDTO, ThreadViewDTO } from "@/cockpit/models/block_state";
import { CockpitError } from "@/cockpit/models/errors";

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

const changeLine = (change: ChangeViewDTO): string =>
  `Pull request: ${change.url} (${change.repoName} #${String(change.number)}, branch ${change.branchName}).`;

const threadLines = (threads: readonly ThreadViewDTO[]): readonly string[] =>
  threads.flatMap((thread, index) => [
    `${String(index + 1)}. ${thread.location}, last comment by ${thread.lastAuthorLogin}:`,
    ...thread.lastCommentBody.split("\n").map((line) => `   > ${line}`),
  ]);

function requireChange(request: ChangePromptRequestDTO): ChangeViewDTO {
  if (request.change === null) {
    throw new CockpitError(`The ${request.kind} prompt needs a pull request`);
  }
  return request.change;
}

const PROMPT_BUILDERS: Readonly<Record<PromptKind, (request: ChangePromptRequestDTO) => readonly string[]>> = {
  build_ticket: (request) => [
    `Build ${request.ticketKey}: ${request.ticketTitle}.`,
    "Read the ticket, plan the change, implement it, and open a pull request whose title starts with the ticket key.",
  ],
  fix_ci: (request) => [
    `Fix the failing CI checks for ${request.ticketKey}.`,
    changeLine(requireChange(request)),
    "Find the failing checks, fix the cause, and push to the same branch.",
  ],
  resolve_conflict: (request) => [
    `Resolve the merge conflict for ${request.ticketKey}.`,
    changeLine(requireChange(request)),
    "Merge the base branch into this branch, resolve the conflicts, check that it builds, and push.",
  ],
  address_feedback: (request) => [
    `Address the review feedback for ${request.ticketKey}.`,
    changeLine(requireChange(request)),
    "Open threads waiting for a reply:",
    ...threadLines(request.threads),
    "Fix what the reviewers asked for and push. Draft a short reply for each thread, but don't post it.",
  ],
  diagnose_deploy: (request) => [
    `Diagnose the failed deployment for ${request.ticketKey}: ${request.ticketTitle}.`,
    ...request.runUrls.map((runUrl) => `Failed run: ${runUrl}`),
    "Read the run's logs (for example with gh run view --log-failed), find the cause, and propose a fix.",
    "Don't re-run or trigger any deployment.",
  ],
};

export const ChangePrompt = {
  text(request: ChangePromptRequestDTO): string {
    return PROMPT_BUILDERS[request.kind](request).join("\n");
  },
};
