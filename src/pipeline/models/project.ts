import { ensure } from "@/core/models/invariant";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";

const TICKET_KEY_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;

export interface TrackerSettingsDTO {
  readonly siteUrl: string;
  readonly boardId: number;
  readonly scopeJql: string;
  readonly hiddenStatusNames: readonly string[];
}

export interface ProjectDTO {
  readonly projectKey: string;
  readonly name: string;
  readonly tracker: TrackerSettingsDTO;
  readonly repoNames: readonly string[];
}

const isHttpsUrl = (url: string): boolean => URL.canParse(url) && new URL(url).protocol === "https:";

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

  toDTO(): TrackerSettingsDTO {
    return {
      siteUrl: this.siteUrl,
      boardId: this.boardId,
      scopeJql: this.scopeJql,
      hiddenStatusNames: this.hiddenStatusNames,
    };
  }
}

export class Project {
  readonly projectKey: string;
  readonly name: string;
  readonly tracker: TrackerSettings;
  readonly repoNames: readonly string[];

  private constructor(projectKey: string, name: string, tracker: TrackerSettings, repoNames: readonly string[]) {
    this.projectKey = projectKey;
    this.name = name;
    this.tracker = tracker;
    this.repoNames = repoNames;
  }

  static create(project: ProjectDTO): Project {
    ensure(project.name.trim() !== "", () => new InvalidProjectConfigError(["name must not be empty"]));
    ensure(
      new Set(project.repoNames).size === project.repoNames.length,
      () => new InvalidProjectConfigError(["repos[].name must be unique"]),
    );
    return new Project(
      project.projectKey,
      project.name,
      TrackerSettings.create(project.tracker),
      Object.freeze([...project.repoNames]),
    );
  }
}
