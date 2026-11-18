import { ensure } from "@/core/models/invariant";
import { InvalidCheckpointError } from "@/session/models/errors";

const MAXIMUM_NOTE_LENGTH = 2000;

export type CheckpointState = "done" | "open";

export interface CheckpointDTO {
  readonly ticketKey: string;
  readonly blockId: string;
  readonly state: CheckpointState;
  readonly note: string;
  readonly recordedAt: string;
}

export const Checkpoint = {
  ensureValid(checkpoint: CheckpointDTO): CheckpointDTO {
    ensure(
      checkpoint.ticketKey !== "" && checkpoint.blockId !== "",
      () => new InvalidCheckpointError("A checkpoint needs a ticket and a block"),
    );
    ensure(
      checkpoint.note.length <= MAXIMUM_NOTE_LENGTH,
      () => new InvalidCheckpointError(`A checkpoint note is at most ${String(MAXIMUM_NOTE_LENGTH)} characters`),
    );
    return { ...checkpoint, note: checkpoint.note.trim() };
  },

  isDone(checkpoint: CheckpointDTO | null): boolean {
    return checkpoint?.state === "done";
  },
};
