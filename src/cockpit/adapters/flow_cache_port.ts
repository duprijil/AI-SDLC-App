import type { TicketFlowDTO } from "@/cockpit/models/ticket_flow";

export interface FlowCachePort {
  readAll(projectKey: string): ReadonlyMap<string, TicketFlowDTO>;
  read(projectKey: string, ticketKey: string): TicketFlowDTO | null;
  save(projectKey: string, flow: TicketFlowDTO): void;
}
