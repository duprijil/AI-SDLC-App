import { join } from "node:path";

import type { Change } from "@/change/models/change";
import { ChangeError } from "@/change/models/errors";
import type { ListRecentChanges } from "@/change/use_cases/list_recent_changes";
import type { BriefStorePort } from "@/cockpit/adapters/brief_store_port";
import { BranchName } from "@/cockpit/models/branch_name";
import { ProjectQueries } from "@/cockpit/models/project_queries";
import {
  type BriefRepoDTO,
  CONTEXT_FILE_NAME,
  WorkspaceBrief,
  type WorkspaceBriefDTO,
} from "@/cockpit/models/workspace_brief";
import type { PrepareWorktree } from "@/delivery/use_cases/prepare_worktree";
import type { Project, RepoDTO } from "@/pipeline/models/project";
import type { OpenWorkspace } from "@/session/use_cases/open_workspace";
import type { WriteWorkspaceFile } from "@/session/use_cases/write_workspace_file";
import { TicketError } from "@/ticket/models/errors";
import type { TicketDetailsDTO } from "@/ticket/models/ticket_details";
import type { FetchTicketDetails } from "@/ticket/use_cases/fetch_ticket_details";
import type { ReadCachedSprint } from "@/ticket/use_cases/read_cached_sprint";

export interface WorkspaceSteps {
  readonly fetchTicketDetails: FetchTicketDetails;
  readonly listRecentChanges: ListRecentChanges;
  readonly readCachedSprint: ReadCachedSprint;
  readonly openWorkspace: OpenWorkspace;
  readonly writeWorkspaceFile: WriteWorkspaceFile;
  readonly prepareWorktree: PrepareWorktree;
  readonly briefStore: BriefStorePort;
}

interface Outcome<Value> {
  readonly value: Value | null;
  readonly failure: string | null;
}

async function settle<Value>(
  produce: () => Promise<Value>,
  isExpected: (error: unknown) => error is Error,
): Promise<Outcome<Value>> {
  try {
    return { value: await produce(), failure: null };
  } catch (error) {
    if (isExpected(error)) {
      return { value: null, failure: error.message };
    }
    throw error;
  }
}

const isTicketError = (error: unknown): error is Error => error instanceof TicketError;
const isChangeError = (error: unknown): error is Error => error instanceof ChangeError;

const newestOpenChange = (changes: readonly Change[], repoName: string): Change | null =>
  changes
    .filter((change) => change.repoName === repoName && !change.isMerged())
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null;

export class PrepareTicketWorkspace {
  readonly #steps: WorkspaceSteps;
  readonly #project: Project;

  constructor(steps: WorkspaceSteps, project: Project) {
    this.#steps = steps;
    this.#project = project;
  }

  async execute(ticketKey: string): Promise<readonly string[]> {
    const brief = await this.#brief(ticketKey);
    this.#steps.writeWorkspaceFile.execute({
      ticketKey,
      fileName: CONTEXT_FILE_NAME,
      content: WorkspaceBrief.markdown(brief),
    });
    this.#steps.briefStore.save(brief);
    return WorkspaceBrief.notes(brief);
  }

  async briefFor(ticketKey: string): Promise<WorkspaceBriefDTO> {
    const known = this.#steps.briefStore.read(ticketKey);
    if (known !== null) {
      return known;
    }
    await this.execute(ticketKey);
    return this.#steps.briefStore.read(ticketKey) ?? (await this.#brief(ticketKey));
  }

  async #brief(ticketKey: string): Promise<WorkspaceBriefDTO> {
    const workspacePath = this.#steps.openWorkspace.execute(ticketKey);
    const [details, changes] = await Promise.all([
      settle(() => this.#steps.fetchTicketDetails.execute(ticketKey), isTicketError),
      settle(async () => {
        const listing = await this.#steps.listRecentChanges.execute(ProjectQueries.changeQuery(this.#project));
        return listing.forTicket(ticketKey);
      }, isChangeError),
    ]);
    const fallback = this.#boardTicket(ticketKey);
    const title = details.value?.title ?? fallback.title;
    const withPath = this.#project.repos.filter((repo) => repo.checkoutPath !== null);
    const repos = await Promise.all(
      withPath.map((repo) =>
        this.#prepareRepo(repo, { ticketKey, title, workspacePath, changes: changes.value ?? [] }),
      ),
    );
    return {
      ticketKey,
      title,
      statusName: details.value?.statusName ?? fallback.statusName,
      trackerUrl: this.#project.tracker.browseUrl(ticketKey),
      workspacePath,
      description: details.value?.description ?? null,
      comments: details.value?.comments ?? [],
      detailsFailure: details.failure,
      changesFailure: changes.failure,
      repos,
      reposWithoutPath: this.#project.repos.filter((repo) => repo.checkoutPath === null).map((repo) => repo.name),
    };
  }

  async #prepareRepo(
    repo: RepoDTO,
    ticket: { ticketKey: string; title: string; workspacePath: string; changes: readonly Change[] },
  ): Promise<BriefRepoDTO> {
    const change = newestOpenChange(ticket.changes, repo.name);
    const worktree = await this.#steps.prepareWorktree.execute({
      repoName: repo.name,
      checkoutPath: repo.checkoutPath ?? "",
      folder: join(ticket.workspacePath, repo.name),
      changeBranch: change?.branchName ?? null,
      changeBaseBranch: change?.baseBranchName ?? null,
      newBranch: BranchName.forTicket(this.#project.code.branchPattern, ticket.ticketKey, ticket.title),
    });
    return {
      repoName: repo.name,
      githubRepository: repo.githubRepository,
      worktree,
      pullRequestUrl: change?.url ?? null,
    };
  }

  #boardTicket(ticketKey: string): Pick<TicketDetailsDTO, "title" | "statusName"> {
    try {
      const ticket = this.#steps.readCachedSprint
        .execute(this.#project.projectKey)
        ?.tickets.find((candidate) => candidate.ticketKey === ticketKey);
      return { title: ticket?.title ?? ticketKey, statusName: ticket?.statusName ?? "unknown" };
    } catch (error) {
      if (error instanceof TicketError) {
        return { title: ticketKey, statusName: "unknown" };
      }
      throw error;
    }
  }
}
