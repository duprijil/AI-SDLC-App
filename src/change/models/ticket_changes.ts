import type { Change } from "@/change/models/change";
import type { ChangeReview } from "@/change/models/change_review";

export interface TicketChange {
  readonly change: Change;
  readonly review: ChangeReview | null;
  readonly failure: string | null;
}

export class ChangeListing {
  readonly viewerLogin: string;
  readonly changes: readonly Change[];
  readonly keyPattern: string;

  constructor(viewerLogin: string, changes: readonly Change[], keyPattern: string) {
    this.viewerLogin = viewerLogin;
    this.changes = Object.freeze([...changes]);
    this.keyPattern = keyPattern;
  }

  forTicket(ticketKey: string): readonly Change[] {
    return this.changes
      .filter((change) => change.mentions(ticketKey, this.keyPattern))
      .sort((left, right) => left.repoName.localeCompare(right.repoName) || left.number - right.number);
  }
}

export class TicketChanges {
  readonly viewerLogin: string;
  readonly changes: readonly TicketChange[];

  constructor(viewerLogin: string, changes: readonly TicketChange[]) {
    this.viewerLogin = viewerLogin;
    this.changes = Object.freeze([...changes]);
  }
}
