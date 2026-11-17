import { z } from "zod";

import type { SecretText } from "@/core/models/secret_text";
import type { TrackerPort } from "@/ticket/adapters/tracker_port";
import { Board } from "@/ticket/models/board";
import { BoardNotFoundError, TrackerAuthError, TrackerUnavailableError } from "@/ticket/models/errors";
import { Ticket } from "@/ticket/models/ticket";

const REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const PAGE_SIZE = 100;
const MAXIMUM_PAGES = 20;
const SEARCH_FIELDS = ["summary", "status"];
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_NOT_FOUND = 404;

const boardConfigurationSchema = z.object({
  columnConfig: z.object({
    columns: z.array(z.object({ name: z.string(), statuses: z.array(z.object({ id: z.string() })) })),
  }),
});

const searchPageSchema = z.object({
  issues: z.array(
    z.object({
      key: z.string(),
      fields: z.object({
        summary: z.string().nullish(),
        status: z.object({ id: z.string(), name: z.string() }),
      }),
    }),
  ),
  nextPageToken: z.string().nullish(),
  isLast: z.boolean().optional(),
});

const errorMessagesSchema = z.object({ errorMessages: z.array(z.string()).default([]) });

interface JiraRequest {
  readonly path: string;
  readonly method: "GET" | "POST";
  readonly body?: unknown;
  readonly notFoundSubject: string;
}

export class TrackerJira implements TrackerPort {
  readonly #siteUrl: string;
  readonly #email: SecretText;
  readonly #apiToken: SecretText;

  constructor(siteUrl: string, email: SecretText, apiToken: SecretText) {
    this.#siteUrl = siteUrl;
    this.#email = email;
    this.#apiToken = apiToken;
  }

  async boardColumns(boardId: number): Promise<Board> {
    const answer = await this.#request({
      path: `/rest/agile/1.0/board/${String(boardId)}/configuration`,
      method: "GET",
      notFoundSubject: `board ${String(boardId)}`,
    });
    const configuration = this.#shape(boardConfigurationSchema, answer);
    return Board.create(
      configuration.columnConfig.columns.map((column) => ({
        name: column.name,
        statusIds: column.statuses.map((status) => status.id),
      })),
    );
  }

  async sprintTickets(scopeJql: string): Promise<readonly Ticket[]> {
    const tickets: Ticket[] = [];
    let nextPageToken: string | null = null;
    for (let pageNumber = 0; pageNumber < MAXIMUM_PAGES; pageNumber += 1) {
      const page = await this.#searchPage(scopeJql, nextPageToken);
      tickets.push(...page.issues.map((issue) => this.#toTicket(issue)));
      nextPageToken = page.nextPageToken ?? null;
      if (nextPageToken === null || page.isLast === true) {
        return tickets;
      }
    }
    return tickets;
  }

  async #searchPage(scopeJql: string, nextPageToken: string | null): Promise<z.infer<typeof searchPageSchema>> {
    const answer = await this.#request({
      path: "/rest/api/3/search/jql",
      method: "POST",
      body: {
        jql: scopeJql,
        fields: SEARCH_FIELDS,
        maxResults: PAGE_SIZE,
        ...(nextPageToken === null ? {} : { nextPageToken }),
      },
      notFoundSubject: "search API",
    });
    return this.#shape(searchPageSchema, answer);
  }

  #toTicket(issue: z.infer<typeof searchPageSchema>["issues"][number]): Ticket {
    return Ticket.create({
      ticketKey: issue.key,
      title: issue.fields.summary ?? "",
      statusId: issue.fields.status.id,
      statusName: issue.fields.status.name,
    });
  }

  async #request(request: JiraRequest): Promise<unknown> {
    const response = await this.#send(request);
    if (response.status === STATUS_UNAUTHORIZED || response.status === STATUS_FORBIDDEN) {
      throw new TrackerAuthError("Jira rejected the credentials in .env.secrets (JIRA_EMAIL, JIRA_API_TOKEN)");
    }
    if (response.status === STATUS_NOT_FOUND) {
      throw new BoardNotFoundError(`Jira has no ${request.notFoundSubject}`);
    }
    if (response.status === STATUS_BAD_REQUEST) {
      throw new TrackerUnavailableError(`Jira rejected the request: ${await this.#errorMessages(response)}`);
    }
    if (!response.ok) {
      throw new TrackerUnavailableError(`Jira answered with status ${String(response.status)}`);
    }
    try {
      return await response.json();
    } catch (cause) {
      throw new TrackerUnavailableError("Jira sent an answer that isn't JSON", { cause });
    }
  }

  async #send(request: JiraRequest): Promise<Response> {
    try {
      return await fetch(`${this.#siteUrl}${request.path}`, {
        method: request.method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.#email.reveal()}:${this.#apiToken.reveal()}`).toString("base64")}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      });
    } catch (cause) {
      throw new TrackerUnavailableError(`Jira at ${this.#siteUrl} is unreachable`, { cause });
    }
  }

  async #errorMessages(response: Response): Promise<string> {
    const parsed = errorMessagesSchema.safeParse(await response.json().catch(() => ({})));
    return parsed.success && parsed.data.errorMessages.length > 0
      ? parsed.data.errorMessages.join("; ")
      : "no reason given";
  }

  #shape<Schema extends z.ZodType>(schema: Schema, answer: unknown): z.infer<Schema> {
    const parsed = schema.safeParse(answer);
    if (!parsed.success) {
      throw new TrackerUnavailableError("Jira's answer had an unexpected shape", { cause: parsed.error });
    }
    return parsed.data;
  }
}
