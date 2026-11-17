import { ensure } from "@/core/models/invariant";
import { InvalidTicketError } from "@/ticket/models/errors";

const TICKET_KEY_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;

export interface TicketDTO {
  readonly ticketKey: string;
  readonly title: string;
  readonly statusId: string;
  readonly statusName: string;
}

export class Ticket {
  readonly ticketKey: string;
  readonly title: string;
  readonly statusId: string;
  readonly statusName: string;

  private constructor(ticket: TicketDTO) {
    this.ticketKey = ticket.ticketKey;
    this.title = ticket.title;
    this.statusId = ticket.statusId;
    this.statusName = ticket.statusName;
  }

  static create(ticket: TicketDTO): Ticket {
    ensure(
      TICKET_KEY_PATTERN.test(ticket.ticketKey),
      () => new InvalidTicketError(`Ticket key must look like ABC-123: ${ticket.ticketKey}`),
    );
    ensure(ticket.statusId !== "", () => new InvalidTicketError(`Ticket ${ticket.ticketKey} has no status`));
    return new Ticket(ticket);
  }

  isHiddenBy(hiddenStatusNames: readonly string[]): boolean {
    const statusName = this.statusName.toLowerCase();
    return hiddenStatusNames.some((hiddenStatusName) => hiddenStatusName.toLowerCase() === statusName);
  }

  toDTO(): TicketDTO {
    return {
      ticketKey: this.ticketKey,
      title: this.title,
      statusId: this.statusId,
      statusName: this.statusName,
    };
  }
}
