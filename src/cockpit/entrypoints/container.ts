import { DesktopWindowSettings } from "@/cockpit/models/desktop_window_settings";
import { loadProjectConfig, type ProjectConfig } from "@/config";
import { LoggerConsole } from "@/core/adapters/logger_console";
import type { LoggerPort } from "@/core/adapters/logger_port";
import { SessionContainer } from "@/session/entrypoints/container";

const WINDOW_TITLE = "Ticket Cockpit";

export class CockpitContainer {
  readonly #config: ProjectConfig;
  readonly #sessionContainer: SessionContainer;

  constructor() {
    this.#config = loadProjectConfig();
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
      title: WINDOW_TITLE,
      width: this.#config.windowWidth,
      height: this.#config.windowHeight,
      rendererDevUrl: this.#config.rendererDevUrl,
    });
  }

  spikeTicketKey(): string {
    return this.#config.spikeTicketKey;
  }
}
