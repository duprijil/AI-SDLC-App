import { ensure } from "@/core/models/invariant";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";

const TICKET_KEY_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;
const GITHUB_REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const MAXIMUM_MERGED_DAYS = 365;

export const MERGE_METHODS = ["squash", "merge", "rebase"] as const;

export type MergeMethod = (typeof MERGE_METHODS)[number];

export interface TrackerSettingsDTO {
  readonly siteUrl: string;
  readonly boardId: number;
  readonly scopeJql: string;
  readonly hiddenStatusNames: readonly string[];
}

export interface CodeSettingsDTO {
  readonly keyPattern: string;
  readonly mergedDays: number;
  readonly mergeMethod: MergeMethod;
}

export interface RepoDTO {
  readonly name: string;
  readonly githubRepository: string;
}

export interface ProjectDTO {
  readonly projectKey: string;
  readonly name: string;
  readonly tracker: TrackerSettingsDTO;
  readonly code: CodeSettingsDTO;
  readonly repos: readonly RepoDTO[];
}

const isHttpsUrl = (url: string): boolean => URL.canParse(url) && new URL(url).protocol === "https:";

const isRegularExpression = (pattern: string): boolean => {
  try {
    return new RegExp(pattern).source !== "";
  } catch {
    return false;
  }
};

export class TrackerSettings {
  readonly siteUrl: string;
  readonly boardId: number;
  readonly scopeJql: string;
  readonly hiddenStatusNames: readonly string[];

  private constructor(settings: TrackerSettingsDTO) {
    this.siteUrl = settings.siteUrl.replace(/\/+$/, "");
    this.boardId = settings.boardId;
    this.scopeJql = settings.scopeJql;
    this.hiddenStatusNames = Object.freeze([...settings.hiddenStatusNames]);
  }

  static create(settings: TrackerSettingsDTO): TrackerSettings {
    ensure(
      isHttpsUrl(settings.siteUrl),
      () => new InvalidProjectConfigError([`tracker.site must be an https URL: ${settings.siteUrl}`]),
    );
    ensure(
      Number.isInteger(settings.boardId) && settings.boardId > 0,
      () => new InvalidProjectConfigError(["tracker.board_id must be a positive integer"]),
    );
    ensure(settings.scopeJql.trim() !== "", () => new InvalidProjectConfigError(["tracker.scope must not be empty"]));
    return new TrackerSettings(settings);
  }

  browseUrl(ticketKey: string): string {
    ensure(TICKET_KEY_PATTERN.test(ticketKey), () => new InvalidProjectConfigError([`Not a ticket key: ${ticketKey}`]));
    return `${this.siteUrl}/browse/${ticketKey}`;
  }
}

export class CodeSettings {
  readonly keyPattern: string;
  readonly mergedDays: number;
  readonly mergeMethod: MergeMethod;

  private constructor(settings: CodeSettingsDTO) {
    this.keyPattern = settings.keyPattern;
    this.mergedDays = settings.mergedDays;
    this.mergeMethod = settings.mergeMethod;
  }

  static create(settings: CodeSettingsDTO): CodeSettings {
    ensure(
      isRegularExpression(settings.keyPattern),
      () =>
        new InvalidProjectConfigError([
          `code.link.key_pattern is not a valid regular expression: ${settings.keyPattern}`,
        ]),
    );
    ensure(
      Number.isInteger(settings.mergedDays) && settings.mergedDays > 0 && settings.mergedDays <= MAXIMUM_MERGED_DAYS,
      () =>
        new InvalidProjectConfigError([`code.link.merged_days must be between 1 and ${String(MAXIMUM_MERGED_DAYS)}`]),
    );
    return new CodeSettings(settings);
  }
}

export class Project {
  readonly projectKey: string;
  readonly name: string;
  readonly tracker: TrackerSettings;
  readonly code: CodeSettings;
  readonly repos: readonly RepoDTO[];

  private constructor(project: ProjectDTO, tracker: TrackerSettings, code: CodeSettings) {
    this.projectKey = project.projectKey;
    this.name = project.name;
    this.tracker = tracker;
    this.code = code;
    this.repos = Object.freeze([...project.repos]);
  }

  static create(project: ProjectDTO): Project {
    ensure(project.name.trim() !== "", () => new InvalidProjectConfigError(["name must not be empty"]));
    const repoNames = project.repos.map((repo) => repo.name);
    ensure(
      new Set(repoNames).size === repoNames.length,
      () => new InvalidProjectConfigError(["repos[].name must be unique"]),
    );
    const invalidRepositories = project.repos.filter((repo) => !GITHUB_REPOSITORY_PATTERN.test(repo.githubRepository));
    ensure(
      invalidRepositories.length === 0,
      () =>
        new InvalidProjectConfigError(
          invalidRepositories.map(
            (repo) => `repos.${repo.name}.github must look like owner/name: ${repo.githubRepository}`,
          ),
        ),
    );
    return new Project(project, TrackerSettings.create(project.tracker), CodeSettings.create(project.code));
  }
}
