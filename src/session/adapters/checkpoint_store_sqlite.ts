import { z } from "zod";

import type { CheckpointStorePort } from "@/session/adapters/checkpoint_store_port";
import { SqliteDatabase } from "@/session/adapters/sqlite_database";
import type { CheckpointDTO } from "@/session/models/checkpoint";
import { SessionRecordError } from "@/session/models/errors";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS checkpoints (
    ticket_key TEXT NOT NULL,
    block_id TEXT NOT NULL,
    state TEXT NOT NULL,
    note TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS checkpoints_by_block ON checkpoints (ticket_key, block_id, recorded_at)",
];
const SELECT_LATEST = `SELECT ticket_key, block_id, state, note, recorded_at FROM checkpoints
  WHERE ticket_key = ? AND block_id = ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1`;
const INSERT_CHECKPOINT = `INSERT INTO checkpoints (ticket_key, block_id, state, note, recorded_at)
  VALUES (?, ?, ?, ?, ?)`;

const rowSchema = z.object({
  ticket_key: z.string(),
  block_id: z.string(),
  state: z.enum(["done", "open"]),
  note: z.string(),
  recorded_at: z.string(),
});

export class CheckpointStoreSqlite implements CheckpointStorePort {
  readonly #database: SqliteDatabase;

  constructor(databaseFilePath: string) {
    this.#database = new SqliteDatabase(databaseFilePath, SCHEMA);
  }

  latest(ticketKey: string, blockId: string): CheckpointDTO | null {
    const row: unknown = this.#run(() => this.#database.open().prepare(SELECT_LATEST).get(ticketKey, blockId));
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) {
      return null;
    }
    return {
      ticketKey: parsed.data.ticket_key,
      blockId: parsed.data.block_id,
      state: parsed.data.state,
      note: parsed.data.note,
      recordedAt: parsed.data.recorded_at,
    };
  }

  record(checkpoint: CheckpointDTO): void {
    this.#run(() =>
      this.#database
        .open()
        .prepare(INSERT_CHECKPOINT)
        .run(checkpoint.ticketKey, checkpoint.blockId, checkpoint.state, checkpoint.note, checkpoint.recordedAt),
    );
  }

  #run<Outcome>(statement: () => Outcome): Outcome {
    try {
      return statement();
    } catch (cause) {
      throw new SessionRecordError("The checkpoints can't be used", { cause });
    }
  }
}
