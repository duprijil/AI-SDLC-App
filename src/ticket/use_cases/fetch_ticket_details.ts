import type { TrackerPort } from "@/ticket/adapters/tracker_port";
import type { TicketDetailsDTO } from "@/ticket/models/ticket_details";

export class FetchTicketDetails {
  readonly #tracker: TrackerPort;

  constructor(tracker: TrackerPort) {
    this.#tracker = tracker;
  }

  execute(ticketKey: string): Promise<TicketDetailsDTO> {
    return this.#tracker.ticketDetails(ticketKey);
  }
}
