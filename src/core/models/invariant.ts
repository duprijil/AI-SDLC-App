export function ensure(condition: boolean, buildError: () => Error): asserts condition {
  if (!condition) {
    throw buildError();
  }
}
