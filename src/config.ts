import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";

const CONFIG_FILE_NAME = ".env.config";
const RENDERER_URL_VARIABLE = "ELECTRON_RENDERER_URL";
const HOME_PREFIX = "~/";

export class ProjectConfigError extends Error {
  override readonly name: string = "ProjectConfigError";
}

export interface ProjectConfig {
  readonly projectName: string;
  readonly envName: string;
  readonly agentCommand: string;
  readonly agentWorkspaceRoot: string;
  readonly agentSettingsRoot: string;
  readonly spikeTicketKey: string;
  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly rendererDevUrl: string | null;
}

type ConfigEntries = Readonly<Partial<Record<string, string>>>;

function readConfigEntries(): ConfigEntries {
  const configFilePath = resolve(process.cwd(), CONFIG_FILE_NAME);
  return parseEnv(readFileSync(configFilePath, "utf8"));
}

function requireText(entries: ConfigEntries, key: string): string {
  const text = entries[key];
  if (text === undefined || text === "") {
    throw new ProjectConfigError(`Missing ${key} in ${CONFIG_FILE_NAME}`);
  }
  return text;
}

function requirePositiveInteger(entries: ConfigEntries, key: string): number {
  const number = Number(requireText(entries, key));
  if (!Number.isInteger(number) || number <= 0) {
    throw new ProjectConfigError(`${key} in ${CONFIG_FILE_NAME} must be a positive integer`);
  }
  return number;
}

function requirePath(entries: ConfigEntries, key: string): string {
  const path = requireText(entries, key);
  return path.startsWith(HOME_PREFIX) ? join(homedir(), path.slice(HOME_PREFIX.length)) : resolve(path);
}

function readRendererDevUrl(): string | null {
  const rendererDevUrl = process.env[RENDERER_URL_VARIABLE];
  return rendererDevUrl === undefined || rendererDevUrl === "" ? null : rendererDevUrl;
}

export function loadProjectConfig(): ProjectConfig {
  const entries = readConfigEntries();
  return Object.freeze({
    projectName: requireText(entries, "PROJECT_NAME"),
    envName: requireText(entries, "ENV_NAME"),
    agentCommand: requireText(entries, "AGENT_COMMAND"),
    agentWorkspaceRoot: requirePath(entries, "AGENT_WORKSPACE_ROOT"),
    agentSettingsRoot: requirePath(entries, "AGENT_SETTINGS_ROOT"),
    spikeTicketKey: requireText(entries, "SPIKE_TICKET_KEY"),
    windowWidth: requirePositiveInteger(entries, "WINDOW_WIDTH"),
    windowHeight: requirePositiveInteger(entries, "WINDOW_HEIGHT"),
    rendererDevUrl: readRendererDevUrl(),
  });
}
