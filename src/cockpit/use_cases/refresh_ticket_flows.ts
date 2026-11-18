import { ChangeQuery } from "@/change/models/change_query";
import { ChangeError } from "@/change/models/errors";
import type { ChangeListing, TicketChanges } from "@/change/models/ticket_changes";
import type { FindTicketChanges } from "@/change/use_cases/find_ticket_changes";
import type { ListRecentChanges } from "@/change/use_cases/list_recent_changes";
import type { FlowCachePort } from "@/cockpit/adapters/flow_cache_port";
import { BlockState, type BlockStateDTO } from "@/cockpit/models/block_state";
import { ColumnMove, type ColumnMoveDTO } from "@/cockpit/models/column_move";
import { RefreshProgress, type RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { BoardColumnViewDTO, SprintBoardDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";
import { type CheckedColumnDTO, type LevelFlowDTO, TicketFlow, type TicketFlowDTO } from "@/cockpit/models/ticket_flow";
import type { FlowLevelDTO } from "@/pipeline/models/pipeline";
import type { ProjectDefinition } from "@/pipeline/models/project_definition";

const MAXIMUM_PARALLEL_TICKETS = 4;

export interface RefreshTicketFlowsRequest {
  readonly board: SprintBoardDTO;
  readonly ticketKeys: readonly string[];
  readonly onProgress: (progress: RefreshProgressDTO) => void;
}

export interface RefreshTicketFlowsResult {
  readonly flows: ReadonlyMap<string, TicketFlowDTO>;
  readonly codeHostFailure: string | null;
}

interface TicketCheck {
  readonly card: TicketCardDTO;
  readonly columns: readonly BoardColumnViewDTO[];
  readonly changesOnce: () => Promise<TicketChanges>;
  readonly onProgress: (progress: RefreshProgressDTO) => void;
}

const once = <Outcome>(produce: () => Promise<Outcome>): (() => Promise<Outcome>) => {
  let pending: Promise<Outcome> | null = null;
  return () => {
    pending ??= produce();
    return pending;
  };
};

async function forEachInParallel<Item>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      await work(next);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
}

const isTrackerDone = (position: number, check: TicketCheck): boolean => {
  const ticketColumnIndex = check.card.columnIndex ?? -1;
  const isLastColumn = position === check.columns.length - 1;
  return ticketColumnIndex > position || (isLastColumn && ticketColumnIndex === position);
};

const trackerMoveFrom = (position: number, check: TicketCheck): ColumnMoveDTO | null =>
  position === check.card.columnIndex ? ColumnMove.forwardFrom(position, check.columns.length) : null;

export class RefreshTicketFlows {
  readonly #listRecentChanges: ListRecentChanges;
  readonly #findTicketChanges: FindTicketChanges;
  readonly #flowCache: FlowCachePort;
  readonly #projectDefinition: ProjectDefinition;

  constructor(
    listRecentChanges: ListRecentChanges,
    findTicketChanges: FindTicketChanges,
    flowCache: FlowCachePort,
    projectDefinition: ProjectDefinition,
  ) {
    this.#listRecentChanges = listRecentChanges;
    this.#findTicketChanges = findTicketChanges;
    this.#flowCache = flowCache;
    this.#projectDefinition = projectDefinition;
  }

  async execute(request: RefreshTicketFlowsRequest): Promise<RefreshTicketFlowsResult> {
    let codeHostFailure: string | null = null;
    const listingOnce = once(async (): Promise<ChangeListing> => {
      try {
        return await this.#listRecentChanges.execute(this.#changeQuery());
      } catch (error) {
        if (error instanceof ChangeError) {
          codeHostFailure = error.message;
        }
        throw error;
      }
    });
    const cards = request.board.cards.filter((card) => request.ticketKeys.includes(card.ticketKey));
    const flows = new Map<string, TicketFlowDTO>();
    await forEachInParallel(cards, MAXIMUM_PARALLEL_TICKETS, async (card) => {
      const flow = await this.#refreshTicket({
        card,
        columns: request.board.columns,
        changesOnce: once(async () =>
          this.#findTicketChanges.execute({ listing: await listingOnce(), ticketKey: card.ticketKey }),
        ),
        onProgress: request.onProgress,
      });
      this.#flowCache.save(this.#projectDefinition.project.projectKey, flow);
      flows.set(card.ticketKey, flow);
    });
    return { flows, codeHostFailure };
  }

  async #refreshTicket(check: TicketCheck): Promise<TicketFlowDTO> {
    const checkedColumns: CheckedColumnDTO[] = [];
    const lastColumnToCheck = check.card.columnIndex ?? -1;
    for (let position = 0; position <= lastColumnToCheck; position += 1) {
      const column = check.columns[position];
      if (column === undefined) {
        break;
      }
      const checkedColumn = await this.#checkColumn(column, position, check);
      checkedColumns.push(checkedColumn);
      if (checkedColumn.levels.some((level) => level.blocks.some((block) => !block.isFinished))) {
        break;
      }
    }
    check.onProgress(RefreshProgress.finished(check.card.ticketKey));
    return TicketFlow.assemble({
      ticketKey: check.card.ticketKey,
      columnKeys: check.columns.map((column) => column.columnKey),
      ticketColumnIndex: check.card.columnIndex,
      checkedColumns,
      refreshedAt: new Date(),
    }).toDTO();
  }

  async #checkColumn(column: BoardColumnViewDTO, position: number, check: TicketCheck): Promise<CheckedColumnDTO> {
    const levels: LevelFlowDTO[] = [];
    let isBlocked = false;
    for (const [levelIndex, level] of column.levels.entries()) {
      if (isBlocked) {
        levels.push({
          runsPerChange: level.runsPerChange,
          blocks: level.blocks.map((block) => BlockState.waits(block)),
        });
        continue;
      }
      check.onProgress(
        RefreshProgress.checking(
          check.card.ticketKey,
          { columnIndex: position, levelIndex },
          column.name,
          level.blocks.map((block) => block.title),
        ),
      );
      const blocks = await this.#checkLevel(level, position, check);
      levels.push({ runsPerChange: level.runsPerChange, blocks });
      isBlocked = blocks.some((block) => !block.isFinished);
    }
    return { columnKey: column.columnKey, levels };
  }

  async #checkLevel(level: FlowLevelDTO, position: number, check: TicketCheck): Promise<readonly BlockStateDTO[]> {
    const changeTemplate = level.runsPerChange ? level.blocks.find((block) => block.blockType === "change") : undefined;
    if (changeTemplate !== undefined) {
      return this.#checkChanges(changeTemplate, check);
    }
    return level.blocks.map((template) =>
      template.blockType === "tracker"
        ? BlockState.forTracker(template, isTrackerDone(position, check), trackerMoveFrom(position, check))
        : BlockState.notCheckedYet(template),
    );
  }

  async #checkChanges(template: FlowLevelDTO["blocks"][number], check: TicketCheck): Promise<readonly BlockStateDTO[]> {
    try {
      const ticketChanges = await check.changesOnce();
      if (ticketChanges.changes.length === 0) {
        return [BlockState.noChange(template)];
      }
      return ticketChanges.changes.map((ticketChange) =>
        BlockState.forChange(template, ticketChange, ticketChanges.viewerLogin),
      );
    } catch (error) {
      if (error instanceof ChangeError) {
        return [BlockState.changesUnavailable(template, error.message)];
      }
      throw error;
    }
  }

  #changeQuery(): ChangeQuery {
    const project = this.#projectDefinition.project;
    return ChangeQuery.create({
      repos: project.repos.map((repo) => ({ repoName: repo.name, githubRepository: repo.githubRepository })),
      keyPattern: project.code.keyPattern,
      mergedDays: project.code.mergedDays,
    });
  }
}
