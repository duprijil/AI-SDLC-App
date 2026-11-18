import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import type { FlowCachePort } from "@/cockpit/adapters/flow_cache_port";
import { FlowCacheError } from "@/cockpit/models/errors";
import type { TicketFlowDTO } from "@/cockpit/models/ticket_flow";

const FLOW_FORMAT_VERSION = 4;
const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS ticket_flow (
  project_key TEXT NOT NULL,
  ticket_key TEXT NOT NULL,
  flow_json TEXT NOT NULL,
  PRIMARY KEY (project_key, ticket_key)
)`;
const SELECT_PROJECT_FLOWS = "SELECT flow_json FROM ticket_flow WHERE project_key = ?";
const SELECT_TICKET_FLOW = "SELECT flow_json FROM ticket_flow WHERE project_key = ? AND ticket_key = ?";
const UPSERT_FLOW = `INSERT INTO ticket_flow (project_key, ticket_key, flow_json) VALUES (?, ?, ?)
  ON CONFLICT(project_key, ticket_key) DO UPDATE SET flow_json = excluded.flow_json`;

const rowSchema = z.object({ flow_json: z.string() });

const storedFlowSchema = z.object({
  version: z.literal(FLOW_FORMAT_VERSION),
  flow: z.looseObject({
    ticketKey: z.string(),
    columns: z.array(z.unknown()),
    gates: z.array(z.unknown()),
    refreshedAt: z.string(),
    flowAttention: z.string(),
  }),
});

export class FlowCacheSqlite implements FlowCachePort {
  readonly #databaseFilePath: string;
  #database: DatabaseSync | null = null;

  constructor(databaseFilePath: string) {
    this.#databaseFilePath = databaseFilePath;
  }

  readAll(projectKey: string): ReadonlyMap<string, TicketFlowDTO> {
    const rows: unknown[] = this.#run(() => this.#open().prepare(SELECT_PROJECT_FLOWS).all(projectKey));
    const flows = rows.map((row) => this.#parse(row)).filter((flow): flow is TicketFlowDTO => flow !== null);
    return new Map(flows.map((flow) => [flow.ticketKey, flow]));
  }

  read(projectKey: string, ticketKey: string): TicketFlowDTO | null {
    const row: unknown = this.#run(() => this.#open().prepare(SELECT_TICKET_FLOW).get(projectKey, ticketKey));
    return row === undefined ? null : this.#parse(row);
  }

  save(projectKey: string, flow: TicketFlowDTO): void {
    const storedFlow = JSON.stringify({ version: FLOW_FORMAT_VERSION, flow });
    this.#run(() => this.#open().prepare(UPSERT_FLOW).run(projectKey, flow.ticketKey, storedFlow));
  }

  #parse(row: unknown): TicketFlowDTO | null {
    const parsedRow = rowSchema.safeParse(row);
    if (!parsedRow.success) {
      return null;
    }
    const storedFlow = storedFlowSchema.safeParse(JSON.parse(parsedRow.data.flow_json));
    return storedFlow.success ? (storedFlow.data.flow as unknown as TicketFlowDTO) : null;
  }

  #run<Outcome>(statement: () => Outcome): Outcome {
    try {
      return statement();
    } catch (cause) {
      throw new FlowCacheError("The ticket flow cache can't be used", { cause });
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
