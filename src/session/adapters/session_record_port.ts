import type { SessionRecordDTO } from "@/session/models/session_record";

export interface SessionRecordPort {
  latestFor(ticketKey: string): SessionRecordDTO | null;
  save(record: SessionRecordDTO): void;
  markEnded(ticketKey: string, endedAt: string): void;
}
