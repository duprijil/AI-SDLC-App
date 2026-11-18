import type { WorktreeResultDTO } from "@/delivery/models/worktree";
import type { TicketCommentDTO } from "@/ticket/models/ticket_details";

export const CONTEXT_FILE_NAME = "CLAUDE.md";

export interface BriefRepoDTO {
  readonly repoName: string;
  readonly githubRepository: string;
  readonly worktree: WorktreeResultDTO;
  readonly pullRequestUrl: string | null;
}

export interface WorkspaceBriefDTO {
  readonly ticketKey: string;
  readonly title: string;
  readonly statusName: string;
  readonly trackerUrl: string;
  readonly workspacePath: string;
  readonly description: string | null;
  readonly comments: readonly TicketCommentDTO[];
  readonly detailsFailure: string | null;
  readonly changesFailure: string | null;
  readonly repos: readonly BriefRepoDTO[];
  readonly reposWithoutPath: readonly string[];
}

const NO_DESCRIPTION = "(The ticket has no description.)";

const descriptionLines = (brief: WorkspaceBriefDTO): readonly string[] => {
  if (brief.detailsFailure !== null) {
    return [`The description couldn't be loaded: ${brief.detailsFailure}. Ask the developer for the details.`];
  }
  return [brief.description === null || brief.description === "" ? NO_DESCRIPTION : brief.description];
};

const commentLines = (comments: readonly TicketCommentDTO[]): readonly string[] =>
  comments.length === 0
    ? ["(No comments.)"]
    : comments.flatMap((comment) => [
        `- ${comment.authorName}, ${comment.createdAt.slice(0, 10)}:`,
        ...comment.body.split("\n").map((line) => `  > ${line}`),
      ]);

const repoLine = (repo: BriefRepoDTO): string => {
  const worktree = repo.worktree;
  if (worktree.kind === "skipped") {
    return `- **${repo.repoName}** (github.com/${repo.githubRepository}): no worktree. ${worktree.reason}.`;
  }
  const pullRequest = repo.pullRequestUrl === null ? "no PR yet" : `open PR ${repo.pullRequestUrl}`;
  return `- **${repo.repoName}** (github.com/${repo.githubRepository}): folder \`${worktree.folder}\`, branch \`${worktree.branch}\`, base \`${worktree.baseBranch}\`, ${pullRequest}.`;
};

const CONVENTIONS: readonly string[] = [
  "- Work only inside the repo folders listed above. Each one is a git worktree on this ticket's branch.",
  "- Start every commit message and PR title with the ticket key.",
  "- Push the ticket branch (`git push -u origin <branch>`) and open the PR against its base branch.",
  "- Don't merge PRs, and don't move the Jira status. The developer does both from the Ticket Cockpit app.",
  "- You have no Jira access. If something about the ticket is unclear or missing, ask the developer.",
  "",
  "## The `sdlc` tools (served by the Ticket Cockpit app)",
  "",
  "- `get_context`: the live state of this ticket (PRs, open review threads with their ids, pipeline blocks, deployments, drafts). Call it instead of guessing.",
  "- `draft`: hand a review reply (`thread_reply`, target = thread id) or a note (`note`, target = prompt block id) to the developer instead of posting it.",
  "- `checkpoint`: tell the app a pipeline step is done (`kind` from the prompt, with a short summary).",
  "- `code_comment` and `merge`: post a reply or merge a PR of this ticket. The developer approves each call.",
  "- Posting with `gh pr comment`, `gh pr review`, `gh pr merge` or `gh api` is blocked. Use the `sdlc` tools.",
];

export const WorkspaceBrief = {
  markdown(brief: WorkspaceBriefDTO): string {
    return [
      `# ${brief.ticketKey}: ${brief.title}`,
      "",
      `This folder is the workspace of ticket ${brief.ticketKey}, prepared by the Ticket Cockpit app. Jira status: ${brief.statusName}. Link: ${brief.trackerUrl}`,
      "",
      "## Ticket description",
      "",
      ...descriptionLines(brief),
      "",
      "## Latest comments",
      "",
      ...commentLines(brief.comments),
      "",
      "## Repos",
      "",
      ...WorkspaceBrief.repoLines(brief),
      ...(brief.changesFailure === null
        ? []
        : ["", `GitHub couldn't be read (${brief.changesFailure}), so open PRs may be missing.`]),
      "",
      "## Conventions",
      "",
      ...CONVENTIONS,
      "",
    ].join("\n");
  },

  repoLines(brief: WorkspaceBriefDTO): readonly string[] {
    const lines = brief.repos.map(repoLine);
    const withoutPath = brief.reposWithoutPath.map(
      (repoName) => `- **${repoName}**: no worktree, because it has no \`path\` in project.yaml.`,
    );
    const all = [...lines, ...withoutPath];
    return all.length === 0 ? ["(The project has no repos with a local checkout.)"] : all;
  },

  folderOf(brief: WorkspaceBriefDTO, repoName: string): string | null {
    const worktree = brief.repos.find((repo) => repo.repoName === repoName)?.worktree;
    return worktree?.kind === "ready" ? worktree.folder : null;
  },

  notes(brief: WorkspaceBriefDTO): readonly string[] {
    const repoNotes = brief.repos.map((repo) => {
      const worktree = repo.worktree;
      if (worktree.kind === "skipped") {
        return `${repo.repoName}: no worktree. ${worktree.reason}`;
      }
      const verb = worktree.wasReused ? "reused" : "created";
      const fetch = worktree.note === null ? "" : ` (${worktree.note})`;
      return `${repo.repoName}: ${verb} ${worktree.folder} on ${worktree.branch}${fetch}`;
    });
    const failures = [
      ...(brief.detailsFailure === null ? [] : [`Jira: ${brief.detailsFailure}`]),
      ...(brief.changesFailure === null ? [] : [`GitHub: ${brief.changesFailure}`]),
    ];
    return [...repoNotes, ...failures, `Context written to ${brief.workspacePath}/${CONTEXT_FILE_NAME}`];
  },
};
