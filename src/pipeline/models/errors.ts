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

export class PromptTemplateError extends PipelineError {
  override readonly name: string = "PromptTemplateError";
}

export class PipelineFileError extends PipelineError {
  override readonly name: string = "PipelineFileError";
}

export class PipelineEditError extends PipelineError {
  override readonly name: string = "PipelineEditError";
}

export class PipelineFileChangedError extends PipelineError {
  override readonly name: string = "PipelineFileChangedError";
}
