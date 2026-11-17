import { join } from "node:path";

import { app, BrowserWindow } from "electron";

import { CockpitContainer } from "@/cockpit/entrypoints/container";
import type { DesktopWindowSettings } from "@/cockpit/models/desktop_window_settings";
import { startHookServer } from "@/session/entrypoints/api/hook_server";
import { publishSessionStatus, registerSessionIpc } from "@/session/entrypoints/api/session_ipc";

const WINDOW_BACKGROUND = "#0a0e16";
const PRELOAD_BUNDLE = join(__dirname, "../preload/index.js");
const RENDERER_PAGE = join(__dirname, "../renderer/index.html");

function createWindow(settings: DesktopWindowSettings): BrowserWindow {
  return new BrowserWindow({
    title: settings.title,
    width: settings.width,
    height: settings.height,
    backgroundColor: WINDOW_BACKGROUND,
    webPreferences: {
      preload: PRELOAD_BUNDLE,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
}

async function loadRenderer(window: BrowserWindow, settings: DesktopWindowSettings): Promise<void> {
  if (settings.rendererDevUrl !== null) {
    await window.loadURL(settings.rendererDevUrl);
    return;
  }
  await window.loadFile(RENDERER_PAGE);
}

async function openCockpit(container: CockpitContainer): Promise<void> {
  const settings = container.desktopWindowSettings();
  const window = createWindow(settings);
  const hookServer = await startHookServer(container.session(), (session) => {
    publishSessionStatus(window.webContents, session);
  });
  registerSessionIpc({
    container: container.session(),
    hookEndpoint: hookServer.endpoint,
    ticketKey: container.spikeTicketKey(),
  });
  app.on("before-quit", () => {
    container.session().stopAgentSessions().execute();
    hookServer.close();
  });
  await loadRenderer(window, settings);
}

export function startDesktopApp(): void {
  const container = new CockpitContainer();
  const logger = container.logger("cockpit.desktop_app");
  app.on("window-all-closed", () => {
    app.quit();
  });
  app
    .whenReady()
    .then(() => openCockpit(container))
    .catch((error: unknown) => {
      logger.error("Ticket Cockpit failed to start", { reason: error instanceof Error ? error.message : "unknown" });
      app.exit(1);
    });
}
