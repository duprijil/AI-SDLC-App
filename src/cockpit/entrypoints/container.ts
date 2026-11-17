import { DesktopWindowSettings } from "@/cockpit/models/desktop_window_settings";
import { CockpitConfigurationError } from "@/cockpit/models/errors";
import { RefreshSprintBoard } from "@/cockpit/use_cases/refresh_sprint_board";
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
  readonly #sessionContainer: SessionContainer;

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
    this.#sessionContainer = new SessionContainer();
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
    return new ShowCachedSprintBoard(this.#ticketContainer.readCachedSprint(), this.#projectDefinition);
  }

  refreshSprintBoard(): RefreshSprintBoard {
    return new RefreshSprintBoard(
      this.#ticketContainer.fetchSprint(),
      this.#ticketContainer.readCachedSprint(),
      this.#projectDefinition,
    );
  }

  trackerBrowseUrl(ticketKey: string): string {
    return this.#projectDefinition.project.tracker.browseUrl(ticketKey);
  }
}
