import { z } from "zod";

import type { SessionRecordPort } from "@/session/adapters/session_record_port";
import { SqliteDatabase } from "@/session/adapters/sqlite_database";
import { SessionRecordError } from "@/session/models/errors";
import type { SessionRecordDTO } from "@/session/models/session_record";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sessions (
    ticket_key TEXT NOT NULL,
    session_id TEXT PRIMARY KEY,
    workspace_path TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS sessions_by_ticket ON sessions (ticket_key, started_at)",
];
const SELECT_LATEST = `SELECT ticket_key, session_id, workspace_path, started_at, ended_at FROM sessions
  WHERE ticket_key = ? ORDER BY started_at DESC, rowid DESC LIMIT 1`;
const INSERT_RECORD = `INSERT INTO sessions (ticket_key, session_id, workspace_path, started_at, ended_at)
  VALUES (?, ?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET ended_at = excluded.ended_at`;
const MARK_ENDED = "UPDATE sessions SET ended_at = ? WHERE ticket_key = ? AND ended_at IS NULL";

const rowSchema = z.object({
  ticket_key: z.string(),
  session_id: z.string(),
  workspace_path: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
});

export class SessionRecordSqlite implements SessionRecordPort {
  readonly #database: SqliteDatabase;

  constructor(databaseFilePath: string) {
    this.#database = new SqliteDatabase(databaseFilePath, SCHEMA);
  }

  latestFor(ticketKey: string): SessionRecordDTO | null {
    const row: unknown = this.#run(() => this.#database.open().prepare(SELECT_LATEST).get(ticketKey));
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) {
      return null;
    }
    return {
      ticketKey: parsed.data.ticket_key,
      sessionId: parsed.data.session_id,
      workspacePath: parsed.data.workspace_path,
      startedAt: parsed.data.started_at,
      endedAt: parsed.data.ended_at,
    };
  }

  save(record: SessionRecordDTO): void {
    this.#run(() =>
      this.#database
        .open()
        .prepare(INSERT_RECORD)
        .run(record.ticketKey, record.sessionId, record.workspacePath, record.startedAt, record.endedAt),
    );
  }

  markEnded(ticketKey: string, endedAt: string): void {
    this.#run(() => this.#database.open().prepare(MARK_ENDED).run(endedAt, ticketKey));
  }

  #run<Outcome>(statement: () => Outcome): Outcome {
    try {
      return statement();
    } catch (cause) {
      throw new SessionRecordError("The session records can't be used", { cause });
    }
  }
}
