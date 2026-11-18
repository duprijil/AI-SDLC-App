import { join } from "node:path";

import { ChangeContainer } from "@/change/entrypoints/container";
import type { FlowCachePort } from "@/cockpit/adapters/flow_cache_port";
import { FlowCacheSqlite } from "@/cockpit/adapters/flow_cache_sqlite";
import { type AgentActivity, Attention } from "@/cockpit/models/attention";
import { DesktopWindowSettings } from "@/cockpit/models/desktop_window_settings";
import { CockpitConfigurationError } from "@/cockpit/models/errors";
import { BuildChangePrompt } from "@/cockpit/use_cases/build_change_prompt";
import { ReassessAttention } from "@/cockpit/use_cases/reassess_attention";
import { RefreshSprintBoard } from "@/cockpit/use_cases/refresh_sprint_board";
import { RefreshTicketFlows } from "@/cockpit/use_cases/refresh_ticket_flows";
import { RunChangeAction } from "@/cockpit/use_cases/run_change_action";
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
  readonly #sessionContainer: SessionContainer;
  readonly #flowCache: FlowCachePort;

  constructor() {
    const problems: string[] = [];
    const config = collectProblems(loadProjectConfig, problems);
    const secrets: ProjectSecrets | null = collectProblems(loadProjectSecrets, problems);
    const projectDefinition =
      config === null
        ? null
        : collectProblems(() => new PipelineContainer().loadProject().execute(config.activeProject), problems);
    if (config === null || secrets === null || projectDefinition === null) {
      throw new CockpitConfigurationError(problems);
    }
    this.#config = config;
    this.#projectDefinition = projectDefinition;
    this.#ticketContainer = new TicketContainer(projectDefinition.project.tracker.siteUrl, secrets);
    this.#changeContainer = new ChangeContainer(secrets);
    this.#sessionContainer = new SessionContainer();
    this.#flowCache = new FlowCacheSqlite(join(config.appDataRoot, CACHE_FILE_NAME));
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
      this.#changeContainer.listRecentChanges(),
      this.#changeContainer.findTicketChanges(),
      this.#flowCache,
      this.#projectDefinition,
    );
  }

  runChangeAction(): RunChangeAction {
    return new RunChangeAction(
      this.#changeContainer.mergeChange(),
      this.#changeContainer.updateChangeBranch(),
      this.#changeContainer.replyToThread(),
      this.#projectDefinition.project.code.mergeMethod,
    );
  }

  buildChangePrompt(): BuildChangePrompt {
    return new BuildChangePrompt();
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
