export class ChangeError extends Error {
  override readonly name: string = "ChangeError";
}

export class InvalidChangeError extends ChangeError {
  override readonly name: string = "InvalidChangeError";
}

export class CodeHostAuthError extends ChangeError {
  override readonly name: string = "CodeHostAuthError";
}

export class CodeHostUnavailableError extends ChangeError {
  override readonly name: string = "CodeHostUnavailableError";
}

export class CodeHostRateLimitError extends ChangeError {
  override readonly name: string = "CodeHostRateLimitError";
}

export class MergeRefusedError extends ChangeError {
  override readonly name: string = "MergeRefusedError";
}

export class BranchUpdateRefusedError extends ChangeError {
  override readonly name: string = "BranchUpdateRefusedError";
}

export class ReviewCacheError extends ChangeError {
  override readonly name: string = "ReviewCacheError";
}
