import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";

import { SecretText } from "@/core/models/secret_text";

const CONFIG_FILE_NAME = ".env.config";
const SECRETS_FILE_NAME = ".env.secrets";
const RENDERER_URL_VARIABLE = "ELECTRON_RENDERER_URL";
const HOME_PREFIX = "~/";

export class ProjectConfigError extends Error {
  override readonly name: string = "ProjectConfigError";
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}

export interface ProjectConfig {
  readonly projectName: string;
  readonly envName: string;
  readonly activeProject: string;
  readonly projectsRoot: string;
  readonly appDataRoot: string;
  readonly agentCommand: string;
  readonly agentWorkspaceRoot: string;
  readonly agentSettingsRoot: string;
  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly rendererDevUrl: string | null;
}

export interface ProjectSecrets {
  readonly jiraEmail: SecretText;
  readonly jiraApiToken: SecretText;
  readonly githubToken: SecretText;
}

type EnvEntries = Readonly<Partial<Record<string, string>>>;

class EnvFileReader {
  readonly #fileName: string;
  readonly #entries: EnvEntries;
  readonly #problems: string[] = [];

  constructor(fileName: string) {
    this.#fileName = fileName;
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) {
      this.#problems.push(`${fileName}: file is missing`);
      this.#entries = {};
      return;
    }
    this.#entries = parseEnv(readFileSync(filePath, "utf8"));
  }

  text(key: string): string {
    const text = this.#entries[key];
    if (text === undefined || text === "") {
      this.#problems.push(`${this.#fileName}: ${key} is missing`);
      return "";
    }
    return text;
  }

  positiveInteger(key: string): number {
    const number = Number(this.text(key));
    if (!Number.isInteger(number) || number <= 0) {
      this.#problems.push(`${this.#fileName}: ${key} must be a positive integer`);
    }
    return number;
  }

  path(key: string): string {
    const path = this.text(key);
    return path.startsWith(HOME_PREFIX) ? join(homedir(), path.slice(HOME_PREFIX.length)) : resolve(path);
  }

  failIfInvalid(): void {
    if (this.#problems.length > 0) {
      throw new ProjectConfigError(this.#problems);
    }
  }
}

function readRendererDevUrl(): string | null {
  const rendererDevUrl = process.env[RENDERER_URL_VARIABLE];
  return rendererDevUrl === undefined || rendererDevUrl === "" ? null : rendererDevUrl;
}

export function loadProjectConfig(): ProjectConfig {
  const reader = new EnvFileReader(CONFIG_FILE_NAME);
  const config: ProjectConfig = Object.freeze({
    projectName: reader.text("PROJECT_NAME"),
    envName: reader.text("ENV_NAME"),
    activeProject: reader.text("ACTIVE_PROJECT"),
    projectsRoot: reader.path("PROJECTS_ROOT"),
    appDataRoot: reader.path("APP_DATA_ROOT"),
    agentCommand: reader.text("AGENT_COMMAND"),
    agentWorkspaceRoot: reader.path("AGENT_WORKSPACE_ROOT"),
    agentSettingsRoot: reader.path("AGENT_SETTINGS_ROOT"),
    windowWidth: reader.positiveInteger("WINDOW_WIDTH"),
    windowHeight: reader.positiveInteger("WINDOW_HEIGHT"),
    rendererDevUrl: readRendererDevUrl(),
  });
  reader.failIfInvalid();
  return config;
}

export function loadProjectSecrets(): ProjectSecrets {
  const reader = new EnvFileReader(SECRETS_FILE_NAME);
  const secrets: ProjectSecrets = Object.freeze({
    jiraEmail: new SecretText(reader.text("JIRA_EMAIL")),
    jiraApiToken: new SecretText(reader.text("JIRA_API_TOKEN")),
    githubToken: new SecretText(reader.text("GITHUB_TOKEN")),
  });
  reader.failIfInvalid();
  return secrets;
}
