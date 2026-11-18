import { AttestationError } from "@/attestation/models/errors";
import type { FindAttestation } from "@/attestation/use_cases/find_attestation";
import { ChangeError } from "@/change/models/errors";
import type { ChangeListing, TicketChanges } from "@/change/models/ticket_changes";
import type { FindTicketChanges } from "@/change/use_cases/find_ticket_changes";
import type { ListRecentChanges } from "@/change/use_cases/list_recent_changes";
import type { FlowCachePort } from "@/cockpit/adapters/flow_cache_port";
import { BlockState, type BlockStateDTO } from "@/cockpit/models/block_state";
import { ColumnMove, type ColumnMoveDTO } from "@/cockpit/models/column_move";
import { DeployView, type RepoDeployDTO } from "@/cockpit/models/deploy_view";
import { ProjectQueries } from "@/cockpit/models/project_queries";
import { RefreshProgress, type RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { BoardColumnViewDTO, SprintBoardDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";
import { type CheckedColumnDTO, type LevelFlowDTO, TicketFlow, type TicketFlowDTO } from "@/cockpit/models/ticket_flow";
import type { CheckTicketEnvironments } from "@/cockpit/use_cases/check_ticket_environments";
import type { BlockTemplateDTO, FlowLevelDTO } from "@/pipeline/models/pipeline";
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
  readonly environmentsOnce: (envName: string) => Promise<readonly RepoDeployDTO[]>;
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

export interface RefreshSteps {
  readonly listRecentChanges: ListRecentChanges;
  readonly findTicketChanges: FindTicketChanges;
  readonly checkTicketEnvironments: CheckTicketEnvironments;
  readonly findAttestation: FindAttestation;
  readonly flowCache: FlowCachePort;
}

const memoized = <Outcome>(produce: (key: string) => Promise<Outcome>): ((key: string) => Promise<Outcome>) => {
  const pending = new Map<string, Promise<Outcome>>();
  return (key) => {
    const existing = pending.get(key) ?? produce(key);
    pending.set(key, existing);
    return existing;
  };
};

export class RefreshTicketFlows {
  readonly #steps: RefreshSteps;
  readonly #projectDefinition: ProjectDefinition;

  constructor(steps: RefreshSteps, projectDefinition: ProjectDefinition) {
    this.#steps = steps;
    this.#projectDefinition = projectDefinition;
  }

  async execute(request: RefreshTicketFlowsRequest): Promise<RefreshTicketFlowsResult> {
    let codeHostFailure: string | null = null;
    const listingOnce = once(async (): Promise<ChangeListing> => {
      try {
        return await this.#steps.listRecentChanges.execute(ProjectQueries.changeQuery(this.#projectDefinition.project));
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
      const changesOnce = once(async () =>
        this.#steps.findTicketChanges.execute({ listing: await listingOnce(), ticketKey: card.ticketKey }),
      );
      const flow = await this.#refreshTicket({
        card,
        columns: request.board.columns,
        changesOnce,
        environmentsOnce: memoized(async (envName) =>
          this.#steps.checkTicketEnvironments.execute({
            changes: (await changesOnce()).changes.map((ticketChange) => ticketChange.change),
            envName,
          }),
        ),
        onProgress: request.onProgress,
      });
      this.#steps.flowCache.save(this.#projectDefinition.project.projectKey, flow);
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
    return Promise.all(level.blocks.map(async (template) => this.#checkBlock(template, position, check)));
  }

  async #checkBlock(template: BlockTemplateDTO, position: number, check: TicketCheck): Promise<BlockStateDTO> {
    try {
      switch (template.blockType) {
        case "tracker":
          return BlockState.forTracker(template, isTrackerDone(position, check), trackerMoveFrom(position, check));
        case "deploy":
          return BlockState.forDeploy(
            template,
            (await check.environmentsOnce(template.envName ?? "")).map((repo) => DeployView.lineOf(repo)),
          );
        case "attest":
          return await this.#checkAttest(template, check);
        default:
          return BlockState.notCheckedYet(template);
      }
    } catch (error) {
      if (error instanceof ChangeError || error instanceof AttestationError) {
        return BlockState.changesUnavailable(template, error.message);
      }
      throw error;
    }
  }

  async #checkAttest(template: BlockTemplateDTO, check: TicketCheck): Promise<BlockStateDTO> {
    const envName = template.envName ?? "";
    const pinned = DeployView.pins(await check.environmentsOnce(envName));
    if ("waitReason" in pinned) {
      return BlockState.attestWaits(template, pinned.waitReason);
    }
    const found = this.#steps.findAttestation.execute(
      {
        projectKey: this.#projectDefinition.project.projectKey,
        ticketKey: check.card.ticketKey,
        blockId: template.blockId,
      },
      pinned.pins,
    );
    return BlockState.forAttest(template, found.status, {
      envName,
      currentPins: pinned.pins,
      tickedPins: found.attestation?.pins ?? null,
      tickedBy: found.attestation?.tickedBy ?? null,
      tickedAt: found.attestation?.tickedAt ?? null,
    });
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
}
