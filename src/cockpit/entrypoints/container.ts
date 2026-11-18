import { join } from "node:path";

import { AttestationContainer } from "@/attestation/entrypoints/container";
import { ChangeContainer } from "@/change/entrypoints/container";
import { BriefStoreMemory } from "@/cockpit/adapters/brief_store_memory";
import type { BriefStorePort } from "@/cockpit/adapters/brief_store_port";
import type { FlowCachePort } from "@/cockpit/adapters/flow_cache_port";
import { FlowCacheSqlite } from "@/cockpit/adapters/flow_cache_sqlite";
import { type AgentActivity, Attention } from "@/cockpit/models/attention";
import { DesktopWindowSettings } from "@/cockpit/models/desktop_window_settings";
import { CockpitConfigurationError } from "@/cockpit/models/errors";
import { CheckTicketEnvironments } from "@/cockpit/use_cases/check_ticket_environments";
import { EndFinishedSessions } from "@/cockpit/use_cases/end_finished_sessions";
import { PrepareTicketWorkspace } from "@/cockpit/use_cases/prepare_ticket_workspace";
import { PreviewStatusMove } from "@/cockpit/use_cases/preview_status_move";
import { ReassessAttention } from "@/cockpit/use_cases/reassess_attention";
import { RefreshSprintBoard } from "@/cockpit/use_cases/refresh_sprint_board";
import { RefreshTicketFlows } from "@/cockpit/use_cases/refresh_ticket_flows";
import { RenderBlockPrompt } from "@/cockpit/use_cases/render_block_prompt";
import { RunAttestation } from "@/cockpit/use_cases/run_attestation";
import { RunChangeAction } from "@/cockpit/use_cases/run_change_action";
import { RunStatusMove } from "@/cockpit/use_cases/run_status_move";
import { ShowCachedSprintBoard } from "@/cockpit/use_cases/show_cached_sprint_board";
import {
  loadProjectConfig,
  loadProjectSecrets,
  type ProjectConfig,
  ProjectConfigError,
  type ProjectSecrets,
} from "@/config";
import { LoggerConsole } from "@/core/adapters/logger_console";
import type { LoggerPort } from "@/core/adapters/logger_port";
import { DeliveryContainer } from "@/delivery/entrypoints/container";
import { PipelineContainer } from "@/pipeline/entrypoints/container";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";
import type { ProjectDefinition } from "@/pipeline/models/project_definition";
import { SessionContainer } from "@/session/entrypoints/container";
import { TicketContainer } from "@/ticket/entrypoints/container";

const WINDOW_TITLE = "Ticket Cockpit";
const CACHE_FILE_NAME = "cache.sqlite";

function collectProblems<Loaded>(load: () => Loaded, problems: string[]): Loaded | null {
  try {
    return load();
  } catch (error) {
    if (error instanceof ProjectConfigError || error instanceof InvalidProjectConfigError) {
      problems.push(...error.problems);
      return null;
    }
    throw error;
  }
}

export class CockpitContainer {
  readonly #config: ProjectConfig;
  readonly #projectDefinition: ProjectDefinition;
  readonly #ticketContainer: TicketContainer;
  readonly #changeContainer: ChangeContainer;
  readonly #deliveryContainer: DeliveryContainer;
  readonly #attestationContainer: AttestationContainer;
  readonly #sessionContainer: SessionContainer;
  readonly #flowCache: FlowCachePort;
  readonly #pipelineContainer: PipelineContainer;
  readonly #briefStore: BriefStorePort;

  constructor() {
    const problems: string[] = [];
    const pipelineContainer = new PipelineContainer();
    const config = collectProblems(loadProjectConfig, problems);
    const secrets: ProjectSecrets | null = collectProblems(loadProjectSecrets, problems);
    const projectDefinition =
      config === null
        ? null
        : collectProblems(() => pipelineContainer.loadProject().execute(config.activeProject), problems);
    if (config === null || secrets === null || projectDefinition === null) {
      throw new CockpitConfigurationError(problems);
    }
    this.#config = config;
    this.#pipelineContainer = pipelineContainer;
    this.#projectDefinition = projectDefinition;
    this.#ticketContainer = new TicketContainer(projectDefinition.project.tracker.siteUrl, secrets);
    this.#changeContainer = new ChangeContainer(secrets);
    this.#deliveryContainer = new DeliveryContainer(secrets);
    this.#attestationContainer = new AttestationContainer();
    this.#sessionContainer = new SessionContainer();
    this.#flowCache = new FlowCacheSqlite(join(config.appDataRoot, CACHE_FILE_NAME));
    this.#briefStore = new BriefStoreMemory();
  }

  session(): SessionContainer {
    return this.#sessionContainer;
  }

  logger(loggerName: string): LoggerPort {
    return new LoggerConsole(loggerName);
  }

  desktopWindowSettings(): DesktopWindowSettings {
    return DesktopWindowSettings.create({
      title: `${WINDOW_TITLE} · ${this.#projectDefinition.project.name}`,
      width: this.#config.windowWidth,
      height: this.#config.windowHeight,
      rendererDevUrl: this.#config.rendererDevUrl,
    });
  }

  showCachedSprintBoard(): ShowCachedSprintBoard {
    return new ShowCachedSprintBoard(
      this.#ticketContainer.readCachedSprint(),
      this.#flowCache,
      this.#projectDefinition,
    );
  }

  refreshSprintBoard(): RefreshSprintBoard {
    return new RefreshSprintBoard(
      this.#ticketContainer.fetchSprint(),
      this.#ticketContainer.readCachedSprint(),
      this.#projectDefinition,
    );
  }

  refreshTicketFlows(): RefreshTicketFlows {
    return new RefreshTicketFlows(
      {
        listRecentChanges: this.#changeContainer.listRecentChanges(),
        findTicketChanges: this.#changeContainer.findTicketChanges(),
        checkTicketEnvironments: this.#checkTicketEnvironments(),
        findAttestation: this.#attestationContainer.findAttestation(),
        findCheckpoint: this.#sessionContainer.findCheckpoint(),
        flowCache: this.#flowCache,
      },
      this.#projectDefinition,
    );
  }

  runAttestation(): RunAttestation {
    return new RunAttestation(
      {
        listRecentChanges: this.#changeContainer.listRecentChanges(),
        findTicketChanges: this.#changeContainer.findTicketChanges(),
        checkTicketEnvironments: this.#checkTicketEnvironments(),
        recordAttestation: this.#attestationContainer.recordAttestation(),
      },
      this.#projectDefinition.project,
    );
  }

  promoteLinks(): readonly string[] {
    return this.#projectDefinition.project.repos.flatMap((repo) =>
      Object.values(repo.environments).flatMap((env) =>
        env.delivery === "manual" && env.promoteLink !== null ? [env.promoteLink] : [],
      ),
    );
  }

  async verifyCheckouts(): Promise<readonly string[]> {
    const checkouts = this.#projectDefinition.project.repos.flatMap((repo) =>
      repo.checkoutPath !== null && Object.values(repo.environments).some((env) => env.delivery === "github_actions")
        ? [{ repoName: repo.name, githubRepository: repo.githubRepository, checkoutPath: repo.checkoutPath }]
        : [],
    );
    return this.#deliveryContainer.verifyCheckouts().execute(checkouts);
  }

  #checkTicketEnvironments(): CheckTicketEnvironments {
    return new CheckTicketEnvironments(this.#deliveryContainer.checkEnvironment(), this.#projectDefinition.project);
  }

  runChangeAction(): RunChangeAction {
    return new RunChangeAction(
      this.#changeContainer.mergeChange(),
      this.#changeContainer.updateChangeBranch(),
      this.#changeContainer.replyToThread(),
      this.#projectDefinition.project.code.mergeMethod,
    );
  }

  previewStatusMove(): PreviewStatusMove {
    return new PreviewStatusMove(
      this.#ticketContainer.readCachedSprint(),
      this.#ticketContainer.findStatusTransition(),
      this.#projectDefinition.project.projectKey,
    );
  }

  runStatusMove(): RunStatusMove {
    return new RunStatusMove(
      {
        readCachedSprint: this.#ticketContainer.readCachedSprint(),
        moveTicket: this.#ticketContainer.moveTicket(),
        refreshSprintBoard: this.refreshSprintBoard(),
        refreshTicketFlows: this.refreshTicketFlows(),
        flowCache: this.#flowCache,
        endTicketSession: this.#sessionContainer.endTicketSession(),
      },
      this.#projectDefinition.project.projectKey,
      this.#projectDefinition.pipeline,
    );
  }

  renderBlockPrompt(): RenderBlockPrompt {
    return new RenderBlockPrompt(
      this.prepareTicketWorkspace(),
      this.#pipelineContainer.readPromptTemplate(),
      this.#projectDefinition.project.projectKey,
    );
  }

  writeDefaultPrompts(): readonly string[] {
    return this.#pipelineContainer.writeDefaultPrompts().execute(this.#projectDefinition.project.projectKey);
  }

  endFinishedSessions(): EndFinishedSessions {
    return new EndFinishedSessions(this.#sessionContainer.endTicketSession());
  }

  prepareTicketWorkspace(): PrepareTicketWorkspace {
    return new PrepareTicketWorkspace(
      {
        fetchTicketDetails: this.#ticketContainer.fetchTicketDetails(),
        listRecentChanges: this.#changeContainer.listRecentChanges(),
        readCachedSprint: this.#ticketContainer.readCachedSprint(),
        openWorkspace: this.#sessionContainer.openWorkspace(),
        writeWorkspaceFile: this.#sessionContainer.writeWorkspaceFile(),
        prepareWorktree: this.#deliveryContainer.prepareWorktree(),
        briefStore: this.#briefStore,
      },
      this.#projectDefinition.project,
    );
  }

  reassessAttention(): ReassessAttention {
    return new ReassessAttention(this.#flowCache, this.#projectDefinition.project.projectKey);
  }

  agentActivityOf(ticketKey: string): AgentActivity {
    return Attention.activityOf(this.#sessionContainer.findTicketSession().execute(ticketKey)?.toDTO() ?? null);
  }

  trackerBrowseUrl(ticketKey: string): string {
    return this.#projectDefinition.project.tracker.browseUrl(ticketKey);
  }
}
