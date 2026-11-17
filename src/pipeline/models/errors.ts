export class PipelineError extends Error {
  override readonly name: string = "PipelineError";
}

export class InvalidProjectConfigError extends PipelineError {
  override readonly name: string = "InvalidProjectConfigError";
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}
