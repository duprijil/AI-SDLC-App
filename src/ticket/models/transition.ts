import { ensure } from "@/core/models/invariant";
import { InvalidTransitionError } from "@/ticket/models/errors";

export interface TransitionDTO {
  readonly transitionId: string;
  readonly name: string;
  readonly targetStatusId: string;
  readonly targetStatusName: string;
}

export class Transition {
  readonly transitionId: string;
  readonly name: string;
  readonly targetStatusId: string;
  readonly targetStatusName: string;

  private constructor(transition: TransitionDTO) {
    this.transitionId = transition.transitionId;
    this.name = transition.name;
    this.targetStatusId = transition.targetStatusId;
    this.targetStatusName = transition.targetStatusName;
  }

  static create(transition: TransitionDTO): Transition {
    ensure(transition.transitionId !== "", () => new InvalidTransitionError("A transition needs an id"));
    ensure(
      transition.targetStatusId !== "",
      () => new InvalidTransitionError(`Transition ${transition.name} has no target status`),
    );
    return new Transition(transition);
  }

  label(): string {
    return `${this.name} → ${this.targetStatusName}`;
  }

  toDTO(): TransitionDTO {
    return {
      transitionId: this.transitionId,
      name: this.name,
      targetStatusId: this.targetStatusId,
      targetStatusName: this.targetStatusName,
    };
  }
}
