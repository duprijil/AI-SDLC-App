import { z } from "zod";

import type { DraftStorePort } from "@/session/adapters/draft_store_port";
import { SqliteDatabase } from "@/session/adapters/sqlite_database";
import { DRAFT_KINDS, type DraftDTO, type DraftKind } from "@/session/models/draft";
import { SessionRecordError } from "@/session/models/errors";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS drafts (
    ticket_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    used_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS drafts_by_ticket ON drafts (ticket_key, kind, target)",
];
const SELECT_OPEN = `SELECT ticket_key, kind, target, text, created_at FROM drafts
  WHERE ticket_key = ? AND used_at IS NULL ORDER BY created_at ASC, rowid ASC`;
const INSERT_DRAFT = `INSERT INTO drafts (ticket_key, kind, target, text, created_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)`;
const MARK_USED = "UPDATE drafts SET used_at = ? WHERE ticket_key = ? AND kind = ? AND target = ? AND used_at IS NULL";

const rowSchema = z.object({
  ticket_key: z.string(),
  kind: z.enum(DRAFT_KINDS),
  target: z.string(),
  text: z.string(),
  created_at: z.string(),
});

export class DraftStoreSqlite implements DraftStorePort {
  readonly #database: SqliteDatabase;

  constructor(databaseFilePath: string) {
    this.#database = new SqliteDatabase(databaseFilePath, SCHEMA);
  }

  record(draft: DraftDTO): void {
    this.#run(() => {
      const database = this.#database.open();
      database.prepare(MARK_USED).run(draft.createdAt, draft.ticketKey, draft.kind, draft.target);
      database.prepare(INSERT_DRAFT).run(draft.ticketKey, draft.kind, draft.target, draft.text, draft.createdAt);
    });
  }

  openDrafts(ticketKey: string): readonly DraftDTO[] {
    const rows: unknown[] = this.#run(() => this.#database.open().prepare(SELECT_OPEN).all(ticketKey));
    return rows.flatMap((row) => {
      const parsed = rowSchema.safeParse(row);
      return parsed.success
        ? [
            {
              ticketKey: parsed.data.ticket_key,
              kind: parsed.data.kind,
              target: parsed.data.target,
              text: parsed.data.text,
              createdAt: parsed.data.created_at,
            },
          ]
        : [];
    });
  }

  markUsed(ticketKey: string, kind: DraftKind, target: string, usedAt: string): void {
    this.#run(() => this.#database.open().prepare(MARK_USED).run(usedAt, ticketKey, kind, target));
  }

  #run<Outcome>(statement: () => Outcome): Outcome {
    try {
      return statement();
    } catch (cause) {
      throw new SessionRecordError("The drafts can't be used", { cause });
    }
  }
}
