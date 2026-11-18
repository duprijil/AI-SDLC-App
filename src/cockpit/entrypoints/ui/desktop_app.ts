import { join } from "node:path";

import { app, BrowserWindow, dialog } from "electron";

import { publishAttention, registerCockpitIpc } from "@/cockpit/entrypoints/api/cockpit_ipc";
import { CockpitContainer } from "@/cockpit/entrypoints/container";
import type { DesktopWindowSettings } from "@/cockpit/models/desktop_window_settings";
import { CockpitConfigurationError } from "@/cockpit/models/errors";
import { startHookServer } from "@/session/entrypoints/api/hook_server";
import { publishSessionStatus, registerSessionIpc } from "@/session/entrypoints/api/session_ipc";

const WINDOW_BACKGROUND = "#0a0e16";
const PRELOAD_BUNDLE = join(__dirname, "../preload/index.js");
const RENDERER_PAGE = join(__dirname, "../renderer/index.html");
const FAILURE_EXIT_CODE = 1;

function showConfigurationProblems(problems: readonly string[]): void {
  dialog.showErrorBox(
    "Ticket Cockpit can't start",
    ["Fix these problems, then start the app again:", "", ...problems.map((problem) => `• ${problem}`)].join("\n"),
  );
  app.exit(FAILURE_EXIT_CODE);
}

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
    publishAttention(window.webContents, container, session);
  });
  registerSessionIpc({
    container: container.session(),
    hookEndpoint: hookServer.endpoint,
    prepareWorkspace: (ticketKey) => container.prepareTicketWorkspace().execute(ticketKey),
  });
  registerCockpitIpc({ container, onConfigurationProblems: showConfigurationProblems });
  app.on("before-quit", () => {
    container.session().stopAgentSessions().execute();
    hookServer.close();
  });
  await loadRenderer(window, settings);
}

function buildContainer(): CockpitContainer | null {
  try {
    return new CockpitContainer();
  } catch (error) {
    if (error instanceof CockpitConfigurationError) {
      showConfigurationProblems(error.problems);
      return null;
    }
    throw error;
  }
}

export function startDesktopApp(): void {
  app.on("window-all-closed", () => {
    app.quit();
  });
  void app.whenReady().then(async () => {
    const container = buildContainer();
    if (container === null) {
      return;
    }
    const checkoutProblems = await container.verifyCheckouts();
    if (checkoutProblems.length > 0) {
      showConfigurationProblems(checkoutProblems);
      return;
    }
    try {
      await openCockpit(container);
    } catch (error) {
      container.logger("cockpit.desktop_app").error("Ticket Cockpit failed to start", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      app.exit(FAILURE_EXIT_CODE);
    }
  });
}
