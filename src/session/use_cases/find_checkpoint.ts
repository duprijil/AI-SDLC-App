import type { CheckpointStorePort } from "@/session/adapters/checkpoint_store_port";
import type { CheckpointDTO } from "@/session/models/checkpoint";

export class FindCheckpoint {
  readonly #checkpoints: CheckpointStorePort;

  constructor(checkpoints: CheckpointStorePort) {
    this.#checkpoints = checkpoints;
  }

  execute(ticketKey: string, blockId: string): CheckpointDTO | null {
    return this.#checkpoints.latest(ticketKey, blockId);
  }
}
