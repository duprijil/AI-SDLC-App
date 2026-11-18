import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import type { AttestationStorePort } from "@/attestation/adapters/attestation_store_port";
import { Attestation, type AttestationKeyDTO } from "@/attestation/models/attestation";
import { AttestationError, AttestationStoreError } from "@/attestation/models/errors";

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS attestations (
  project_key TEXT NOT NULL,
  ticket_key TEXT NOT NULL,
  block_id TEXT NOT NULL,
  pins_json TEXT NOT NULL,
  ticked_by TEXT NOT NULL,
  ticked_at TEXT NOT NULL
)`;
const CREATE_INDEX = `CREATE INDEX IF NOT EXISTS attestations_by_block
  ON attestations (project_key, ticket_key, block_id, ticked_at)`;
const SELECT_LATEST = `SELECT pins_json, ticked_by, ticked_at FROM attestations
  WHERE project_key = ? AND ticket_key = ? AND block_id = ? ORDER BY ticked_at DESC, rowid DESC LIMIT 1`;
const INSERT_ATTESTATION = `INSERT INTO attestations (project_key, ticket_key, block_id, pins_json, ticked_by, ticked_at)
  VALUES (?, ?, ?, ?, ?, ?)`;

const rowSchema = z.object({ pins_json: z.string(), ticked_by: z.string(), ticked_at: z.string() });
const pinsSchema = z.record(z.string(), z.string());

export class AttestationStoreSqlite implements AttestationStorePort {
  readonly #databaseFilePath: string;
  #database: DatabaseSync | null = null;

  constructor(databaseFilePath: string) {
    this.#databaseFilePath = databaseFilePath;
  }

  latest(key: AttestationKeyDTO): Attestation | null {
    const row: unknown = this.#run(() =>
      this.#open().prepare(SELECT_LATEST).get(key.projectKey, key.ticketKey, key.blockId),
    );
    if (row === undefined) {
      return null;
    }
    const parsedRow = rowSchema.safeParse(row);
    if (!parsedRow.success) {
      return null;
    }
    const pins = pinsSchema.safeParse(this.#parseJson(parsedRow.data.pins_json));
    if (!pins.success) {
      return null;
    }
    try {
      return Attestation.create({
        ...key,
        pins: pins.data,
        tickedBy: parsedRow.data.ticked_by,
        tickedAt: parsedRow.data.ticked_at,
      });
    } catch (error) {
      if (error instanceof AttestationError) {
        return null;
      }
      throw error;
    }
  }

  record(attestation: Attestation): void {
    this.#run(() =>
      this.#open()
        .prepare(INSERT_ATTESTATION)
        .run(
          attestation.projectKey,
          attestation.ticketKey,
          attestation.blockId,
          JSON.stringify(attestation.pins),
          attestation.tickedBy,
          attestation.tickedAt,
        ),
    );
  }

  #parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  #run<Outcome>(statement: () => Outcome): Outcome {
    try {
      return statement();
    } catch (cause) {
      throw new AttestationStoreError("The attestation store can't be used", { cause });
    }
  }

  #open(): DatabaseSync {
    if (this.#database !== null) {
      return this.#database;
    }
    mkdirSync(dirname(this.#databaseFilePath), { recursive: true });
    const database = new DatabaseSync(this.#databaseFilePath);
    database.exec(CREATE_TABLE);
    database.exec(CREATE_INDEX);
    this.#database = database;
    return database;
  }
}
