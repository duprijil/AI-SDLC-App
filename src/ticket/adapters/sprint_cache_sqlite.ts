import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import type { SprintCachePort } from "@/ticket/adapters/sprint_cache_port";
import { SprintCacheError } from "@/ticket/models/errors";
import { SprintSnapshot } from "@/ticket/models/sprint_snapshot";

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS sprint_snapshot (
  project_key TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
)`;
const SELECT_SNAPSHOT = "SELECT snapshot_json FROM sprint_snapshot WHERE project_key = ?";
const UPSERT_SNAPSHOT = `INSERT INTO sprint_snapshot (project_key, snapshot_json, fetched_at) VALUES (?, ?, ?)
  ON CONFLICT(project_key) DO UPDATE SET snapshot_json = excluded.snapshot_json, fetched_at = excluded.fetched_at`;

const snapshotSchema = z.object({
  board: z.object({
    columns: z.array(z.object({ columnKey: z.string(), name: z.string(), statusIds: z.array(z.string()) })),
  }),
  tickets: z.array(
    z.object({ ticketKey: z.string(), title: z.string(), statusId: z.string(), statusName: z.string() }),
  ),
  fetchedAt: z.string(),
});

const rowSchema = z.object({ snapshot_json: z.string() });

export class SprintCacheSqlite implements SprintCachePort {
  readonly #databaseFilePath: string;
  #database: DatabaseSync | null = null;

  constructor(databaseFilePath: string) {
    this.#databaseFilePath = databaseFilePath;
  }

  read(projectKey: string): SprintSnapshot | null {
    try {
      const row: unknown = this.#open().prepare(SELECT_SNAPSHOT).get(projectKey);
      if (row === undefined) {
        return null;
      }
      const snapshotJson = rowSchema.parse(row).snapshot_json;
      return SprintSnapshot.fromDTO(snapshotSchema.parse(JSON.parse(snapshotJson)));
    } catch (cause) {
      throw new SprintCacheError(`The sprint cache for ${projectKey} can't be read`, { cause });
    }
  }

  save(projectKey: string, snapshot: SprintSnapshot): void {
    try {
      this.#open().prepare(UPSERT_SNAPSHOT).run(projectKey, JSON.stringify(snapshot.toDTO()), snapshot.fetchedAt);
    } catch (cause) {
      throw new SprintCacheError(`The sprint cache for ${projectKey} can't be written`, { cause });
    }
  }

  #open(): DatabaseSync {
    if (this.#database !== null) {
      return this.#database;
    }
    mkdirSync(dirname(this.#databaseFilePath), { recursive: true });
    const database = new DatabaseSync(this.#databaseFilePath);
    database.exec(CREATE_TABLE);
    this.#database = database;
    return database;
  }
}
