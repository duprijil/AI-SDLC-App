import type { BlockStateDTO, ChangeViewDTO, ThreadViewDTO } from "@/cockpit/models/block_state";
import type { SprintBoardDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";
import type { WorkspaceBriefDTO } from "@/cockpit/models/workspace_brief";
import type { DraftDTO } from "@/session/models/draft";

export interface ChangeMatchDTO {
  readonly change: ChangeViewDTO;
  readonly threads: readonly ThreadViewDTO[];
}

const blocksOf = (card: TicketCardDTO | null): readonly BlockStateDTO[] =>
  card?.flow?.columns.flatMap((column) => column.levels.flatMap((level) => level.blocks)) ?? [];

const blockView = (block: BlockStateDTO): Record<string, unknown> => ({
  id: block.blockId,
  title: block.title,
  state: block.kind,
  caption: block.caption,
  ...(block.change === null
    ? {}
    : {
        pullRequest: {
          repo: block.change.repoName,
          github: block.change.githubRepository,
          number: block.change.number,
          title: block.change.title,
          url: block.change.url,
          branch: block.change.branchName,
        },
      }),
  ...(block.threads.length === 0
    ? {}
    : {
        openThreads: block.threads.map((thread) => ({
          threadId: thread.threadId,
          location: thread.location,
          lastAuthor: thread.lastAuthorLogin,
          lastComment: thread.lastCommentBody,
          draft: thread.draftText,
        })),
      }),
  ...(block.deployLines.length === 0 ? {} : { deployments: block.deployLines }),
  ...(block.noteDraft === null ? {} : { noteDraft: block.noteDraft }),
});

export const AgentContext = {
  of(
    board: SprintBoardDTO | null,
    card: TicketCardDTO | null,
    brief: WorkspaceBriefDTO,
    drafts: readonly DraftDTO[],
  ): unknown {
    return {
      ticket: {
        key: brief.ticketKey,
        title: brief.title,
        status: card?.statusName ?? brief.statusName,
        url: brief.trackerUrl,
        description: brief.description,
        comments: brief.comments,
      },
      repos: brief.repos.map((repo) => ({
        repo: repo.repoName,
        github: repo.githubRepository,
        worktree: repo.worktree,
        pullRequest: repo.pullRequestUrl,
      })),
      pipeline:
        card?.flow?.columns.map((column, position) => ({
          column: board?.columns[position]?.name ?? column.columnKey,
          state: column.state,
          blocks: column.levels.flatMap((level) => level.blocks).map(blockView),
        })) ?? [],
      lastRefresh: card?.flow?.refreshedAt ?? null,
      drafts,
    };
  },

  findChange(card: TicketCardDTO | null, repo: string, number: number): ChangeMatchDTO | null {
    const matches = blocksOf(card).filter(
      (block) =>
        block.change !== null &&
        block.change.number === number &&
        (block.change.repoName === repo || block.change.githubRepository === repo),
    );
    const first = matches[0]?.change ?? null;
    return first === null ? null : { change: first, threads: matches.flatMap((block) => block.threads) };
  },

  hasThread(card: TicketCardDTO | null, threadId: string): boolean {
    return blocksOf(card).some((block) => block.threads.some((thread) => thread.threadId === threadId));
  },
};
