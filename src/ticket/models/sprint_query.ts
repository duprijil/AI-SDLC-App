import { ensure } from "@/core/models/invariant";
import { InvalidSprintQueryError } from "@/ticket/models/errors";

export interface SprintQueryDTO {
  readonly projectKey: string;
  readonly boardId: number;
  readonly scopeJql: string;
  readonly hiddenStatusNames: readonly string[];
}

export class SprintQuery {
  readonly projectKey: string;
  readonly boardId: number;
  readonly scopeJql: string;
  readonly hiddenStatusNames: readonly string[];

  private constructor(query: SprintQueryDTO) {
    this.projectKey = query.projectKey;
    this.boardId = query.boardId;
    this.scopeJql = query.scopeJql;
    this.hiddenStatusNames = Object.freeze([...query.hiddenStatusNames]);
  }

  static create(query: SprintQueryDTO): SprintQuery {
    ensure(query.projectKey !== "", () => new InvalidSprintQueryError("The project key must not be empty"));
    ensure(
      Number.isInteger(query.boardId) && query.boardId > 0,
      () => new InvalidSprintQueryError(`The board id must be a positive integer: ${String(query.boardId)}`),
    );
    ensure(query.scopeJql.trim() !== "", () => new InvalidSprintQueryError("The scope JQL must not be empty"));
    return new SprintQuery(query);
  }
}
