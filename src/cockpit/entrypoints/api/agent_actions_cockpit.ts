import { AttestationError } from "@/attestation/models/errors";
import { ChangeError } from "@/change/models/errors";
import { AgentContext } from "@/cockpit/models/agent_context";
import { CockpitError } from "@/cockpit/models/errors";
import type { SprintBoardDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";
import type { PrepareTicketWorkspace } from "@/cockpit/use_cases/prepare_ticket_workspace";
import type { RunChangeAction } from "@/cockpit/use_cases/run_change_action";
import type { Pipeline } from "@/pipeline/models/pipeline";
import type {
  AgentActionsPort,
  AgentCommentRequest,
  AgentDraftRequest,
  AgentMergeRequest,
} from "@/session/adapters/agent_actions_port";
import { AgentActionRefusedError } from "@/session/models/errors";
import type { FindDrafts } from "@/session/use_cases/find_drafts";
import type { RecordCheckpoint } from "@/session/use_cases/record_checkpoint";
import type { RecordDraft } from "@/session/use_cases/record_draft";
import type { UseDraft } from "@/session/use_cases/use_draft";

export interface AgentActionSteps {
  readonly cachedBoard: () => SprintBoardDTO | null;
  readonly refreshTicket: (ticketKey: string) => Promise<TicketCardDTO | null>;
  readonly prepareTicketWorkspace: PrepareTicketWorkspace;
  readonly runChangeAction: RunChangeAction;
  readonly recordDraft: RecordDraft;
  readonly findDrafts: FindDrafts;
  readonly useDraft: UseDraft;
  readonly recordCheckpoint: RecordCheckpoint;
  readonly pipeline: Pipeline;
}

async function refused<Outcome>(run: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ChangeError || error instanceof CockpitError || error instanceof AttestationError) {
      throw new AgentActionRefusedError(error.message, { cause: error });
    }
    throw error;
  }
}

export class AgentActionsCockpit implements AgentActionsPort {
  readonly #steps: AgentActionSteps;

  constructor(steps: AgentActionSteps) {
    this.#steps = steps;
  }

  context(ticketKey: string): Promise<unknown> {
    return refused(async () => {
      const board = this.#steps.cachedBoard();
      const card = board?.cards.find((candidate) => candidate.ticketKey === ticketKey) ?? null;
      const brief = await this.#steps.prepareTicketWorkspace.briefFor(ticketKey);
      return AgentContext.of(board, card, brief, this.#steps.findDrafts.execute(ticketKey));
    });
  }

  draft(ticketKey: string, request: AgentDraftRequest): Promise<string> {
    return refused(async () => {
      if (request.kind === "thread_reply" && !AgentContext.hasThread(this.#cachedCard(ticketKey), request.target)) {
        throw new AgentActionRefusedError(
          `${request.target} is not an open review thread of ${ticketKey}. Call get_context for the thread ids.`,
        );
      }
      if (request.kind === "note" && this.#steps.pipeline.promptBlock(request.target) === null) {
        throw new AgentActionRefusedError(`${request.target} is not a prompt block of the pipeline`);
      }
      this.#steps.recordDraft.execute({ ticketKey, ...request, createdAt: new Date().toISOString() });
      await this.#steps.refreshTicket(ticketKey);
      return `Stored the ${request.kind} draft for ${request.target}. The developer sees it on the graph.`;
    });
  }

  checkpoint(ticketKey: string, kind: string, summary: string): Promise<string> {
    return refused(async () => {
      const blocks = this.#steps.pipeline.checkpointBlocks(kind);
      if (blocks.length === 0) {
        throw new AgentActionRefusedError(`No prompt block waits for session.checkpoint(${kind})`);
      }
      const recordedAt = new Date().toISOString();
      for (const block of blocks) {
        this.#steps.recordCheckpoint.execute({
          ticketKey,
          blockId: block.blockId,
          state: "done",
          note: summary,
          recordedAt,
        });
      }
      await this.#steps.refreshTicket(ticketKey);
      return `Marked done: ${blocks.map((block) => block.title).join(", ")}.`;
    });
  }

  comment(ticketKey: string, request: AgentCommentRequest): Promise<string> {
    return refused(async () => {
      const match = AgentContext.findChange(await this.#steps.refreshTicket(ticketKey), request.repo, request.number);
      if (match === null) {
        throw new AgentActionRefusedError(
          `${request.repo}#${String(request.number)} is not a pull request of ${ticketKey}`,
        );
      }
      if (!match.threads.some((thread) => thread.threadId === request.threadId)) {
        throw new AgentActionRefusedError(
          `${request.threadId} is not an open thread waiting for a reply on ${request.repo}#${String(request.number)}`,
        );
      }
      await this.#steps.runChangeAction.execute({
        kind: "reply",
        threadId: request.threadId,
        replyText: request.body,
        shouldResolve: request.shouldResolve,
      });
      this.#steps.useDraft.execute(ticketKey, "thread_reply", request.threadId);
      await this.#steps.refreshTicket(ticketKey);
      return `Posted the reply on ${match.change.url}${request.shouldResolve ? " and resolved the thread" : ""}.`;
    });
  }

  merge(ticketKey: string, request: AgentMergeRequest): Promise<string> {
    return refused(async () => {
      const match = AgentContext.findChange(await this.#steps.refreshTicket(ticketKey), request.repo, request.number);
      if (match === null) {
        throw new AgentActionRefusedError(
          `${request.repo}#${String(request.number)} is not a pull request of ${ticketKey}`,
        );
      }
      await this.#steps.runChangeAction.execute({ kind: "merge", change: match.change });
      await this.#steps.refreshTicket(ticketKey);
      return `Merged ${match.change.url}.`;
    });
  }

  #cachedCard(ticketKey: string): TicketCardDTO | null {
    return this.#steps.cachedBoard()?.cards.find((candidate) => candidate.ticketKey === ticketKey) ?? null;
  }
}
