export class CockpitError extends Error {
  override readonly name: string = "CockpitError";
}

export class InvalidWindowSettingsError extends CockpitError {
  override readonly name: string = "InvalidWindowSettingsError";
}

export class SessionBridgeMissingError extends CockpitError {
  override readonly name: string = "SessionBridgeMissingError";
}

export class CockpitConfigurationError extends CockpitError {
  override readonly name: string = "CockpitConfigurationError";
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}

export class PipelineBoardMismatchError extends CockpitConfigurationError {
  override readonly name: string = "PipelineBoardMismatchError";
}

export class FlowCacheError extends CockpitError {
  override readonly name: string = "FlowCacheError";
}
