export class DeliveryError extends Error {
  override readonly name: string = "DeliveryError";
}

export class InvalidDeliveryTargetError extends DeliveryError {
  override readonly name: string = "InvalidDeliveryTargetError";
}

export class DeliveryAuthError extends DeliveryError {
  override readonly name: string = "DeliveryAuthError";
}

export class DeliveryRateLimitError extends DeliveryError {
  override readonly name: string = "DeliveryRateLimitError";
}

export class DeliveryUnavailableError extends DeliveryError {
  override readonly name: string = "DeliveryUnavailableError";
}

export class WorkflowNotFoundError extends DeliveryError {
  override readonly name: string = "WorkflowNotFoundError";
}

export class GitCommandError extends DeliveryError {
  override readonly name: string = "GitCommandError";
}

export class CommitNotFoundError extends DeliveryError {
  override readonly name: string = "CommitNotFoundError";
}
