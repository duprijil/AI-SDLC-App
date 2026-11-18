import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class SqliteDatabase {
  readonly #databaseFilePath: string;
  readonly #schema: readonly string[];
  #database: DatabaseSync | null = null;

  constructor(databaseFilePath: string, schema: readonly string[]) {
    this.#databaseFilePath = databaseFilePath;
    this.#schema = schema;
  }

  open(): DatabaseSync {
    if (this.#database !== null) {
      return this.#database;
    }
    mkdirSync(dirname(this.#databaseFilePath), { recursive: true });
    const database = new DatabaseSync(this.#databaseFilePath);
    for (const statement of this.#schema) {
      database.exec(statement);
    }
    this.#database = database;
    return database;
  }
}
