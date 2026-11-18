import type { ThreadViewDTO } from "@/cockpit/models/block_state";
import type { PromptRequestDTO } from "@/cockpit/models/prompt_request";
import { WorkspaceBrief, type WorkspaceBriefDTO } from "@/cockpit/models/workspace_brief";
import type { PromptValues as Values } from "@/pipeline/models/prompt_template";

const threadLines = (threads: readonly ThreadViewDTO[]): string =>
  threads.length === 0
    ? "(none)"
    : threads
        .flatMap((thread, index) => [
          `${String(index + 1)}. ${thread.location}, last comment by ${thread.lastAuthorLogin}:`,
          ...thread.lastCommentBody.split("\n").map((line) => `   > ${line}`),
        ])
        .join("\n");

const description = (brief: WorkspaceBriefDTO): string => {
  if (brief.detailsFailure !== null) {
    return `(The description couldn't be loaded: ${brief.detailsFailure}. Ask me for it.)`;
  }
  return brief.description === null || brief.description === "" ? "(none)" : brief.description;
};

const comments = (brief: WorkspaceBriefDTO): string =>
  brief.comments.length === 0
    ? "(none)"
    : brief.comments
        .map((comment) => `- ${comment.authorName}, ${comment.createdAt.slice(0, 10)}: ${comment.body}`)
        .join("\n");

export const PromptValues = {
  of(request: PromptRequestDTO, brief: WorkspaceBriefDTO): Values {
    const change = request.change;
    return {
      "ticket.key": request.ticketKey,
      "ticket.title": brief.title || request.ticketTitle,
      "ticket.url": brief.trackerUrl,
      "ticket.description": description(brief),
      "ticket.comments": comments(brief),
      repos: WorkspaceBrief.repoLines(brief).join("\n"),
      threads: threadLines(request.threads),
      runs: request.runUrls.length === 0 ? "(none)" : request.runUrls.map((url) => `Failed run: ${url}`).join("\n"),
      ...(change === null
        ? {}
        : {
            "change.url": change.url,
            "change.repo": change.repoName,
            "change.branch": change.branchName,
            "change.folder": WorkspaceBrief.folderOf(brief, change.repoName) ?? `(no worktree for ${change.repoName})`,
          }),
    };
  },
};
