import type { CheckpointDTO } from "@/session/models/checkpoint";

export interface CheckpointStorePort {
  latest(ticketKey: string, blockId: string): CheckpointDTO | null;
  record(checkpoint: CheckpointDTO): void;
}
