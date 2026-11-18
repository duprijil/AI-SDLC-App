import type { CheckpointStorePort } from "@/session/adapters/checkpoint_store_port";
import { Checkpoint, type CheckpointDTO } from "@/session/models/checkpoint";

export class RecordCheckpoint {
  readonly #checkpoints: CheckpointStorePort;

  constructor(checkpoints: CheckpointStorePort) {
    this.#checkpoints = checkpoints;
  }

  execute(checkpoint: CheckpointDTO): CheckpointDTO {
    const valid = Checkpoint.ensureValid(checkpoint);
    this.#checkpoints.record(valid);
    return valid;
  }
}
