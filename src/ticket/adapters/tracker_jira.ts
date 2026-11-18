import { z } from "zod";

import type { SecretText } from "@/core/models/secret_text";
import type { TrackerPort } from "@/ticket/adapters/tracker_port";
import { Board } from "@/ticket/models/board";
import {
  BoardNotFoundError,
  type TicketError,
  TicketNotFoundError,
  TrackerAuthError,
  TrackerUnavailableError,
  TransitionRefusedError,
} from "@/ticket/models/errors";
import { Ticket } from "@/ticket/models/ticket";
import { Transition } from "@/ticket/models/transition";

const REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const PAGE_SIZE = 100;
const MAXIMUM_PAGES = 20;
const SEARCH_FIELDS = ["summary", "status"];
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_NOT_FOUND = 404;
const STATUS_NO_CONTENT = 204;
const TRANSITION_REFUSAL_STATUSES: readonly number[] = [400, 409, 422];

const boardConfigurationSchema = z.object({
  columnConfig: z.object({
    columns: z.array(z.object({ name: z.string(), statuses: z.array(z.object({ id: z.string() })) })),
  }),
});

const issueSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string().nullish(),
    status: z.object({ id: z.string(), name: z.string() }),
  }),
});

const transitionsSchema = z.object({
  transitions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      to: z.object({ id: z.string(), name: z.string() }),
    }),
  ),
});

const searchPageSchema = z.object({
  issues: z.array(issueSchema),
  nextPageToken: z.string().nullish(),
  isLast: z.boolean().optional(),
});

const errorMessagesSchema = z.object({
  errorMessages: z.array(z.string()).default([]),
  errors: z.record(z.string(), z.string()).default({}),
});

interface JiraRequest {
  readonly path: string;
  readonly method: "GET" | "POST";
  readonly body?: unknown;
  readonly notFound: () => TicketError;
  readonly refusal?: (reason: string) => TicketError;
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
      notFound: () => new BoardNotFoundError(`Jira has no board ${String(boardId)}`),
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

  async ticket(ticketKey: string): Promise<Ticket> {
    const answer = await this.#request({
      path: `/rest/api/3/issue/${encodeURIComponent(ticketKey)}?fields=${SEARCH_FIELDS.join(",")}`,
      method: "GET",
      notFound: () => new TicketNotFoundError(`Jira has no ticket ${ticketKey}, or it's not visible to you`),
    });
    return this.#toTicket(this.#shape(issueSchema, answer));
  }

  async transitions(ticketKey: string): Promise<readonly Transition[]> {
    const answer = await this.#request({
      path: `/rest/api/3/issue/${encodeURIComponent(ticketKey)}/transitions`,
      method: "GET",
      notFound: () => new TicketNotFoundError(`Jira has no ticket ${ticketKey}, or it's not visible to you`),
    });
    return this.#shape(transitionsSchema, answer).transitions.map((transition) =>
      Transition.create({
        transitionId: transition.id,
        name: transition.name,
        targetStatusId: transition.to.id,
        targetStatusName: transition.to.name,
      }),
    );
  }

  async transition(ticketKey: string, transitionId: string): Promise<void> {
    await this.#request({
      path: `/rest/api/3/issue/${encodeURIComponent(ticketKey)}/transitions`,
      method: "POST",
      body: { transition: { id: transitionId } },
      notFound: () => new TicketNotFoundError(`Jira has no ticket ${ticketKey}, or it's not visible to you`),
      refusal: (reason) => new TransitionRefusedError(`Jira refused to move ${ticketKey}: ${reason}`),
    });
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
      notFound: () => new BoardNotFoundError("Jira has no search API"),
    });
    return this.#shape(searchPageSchema, answer);
  }

  #toTicket(issue: z.infer<typeof issueSchema>): Ticket {
    return Ticket.create({
      ticketKey: issue.key,
      title: issue.fields.summary ?? "",
      statusId: issue.fields.status.id,
      statusName: issue.fields.status.name,
    });
  }

  async #request(request: JiraRequest): Promise<unknown> {
    const response = await this.#send(request);
    const failure = await this.#failureOf(response, request);
    if (failure !== null) {
      throw failure;
    }
    if (response.status === STATUS_NO_CONTENT) {
      return null;
    }
    try {
      return await response.json();
    } catch (cause) {
      throw new TrackerUnavailableError("Jira sent an answer that isn't JSON", { cause });
    }
  }

  async #failureOf(response: Response, request: JiraRequest): Promise<TicketError | null> {
    if (response.status === STATUS_UNAUTHORIZED || response.status === STATUS_FORBIDDEN) {
      return new TrackerAuthError("Jira rejected the credentials in .env.secrets (JIRA_EMAIL, JIRA_API_TOKEN)");
    }
    if (response.status === STATUS_NOT_FOUND) {
      return request.notFound();
    }
    if (request.refusal !== undefined && TRANSITION_REFUSAL_STATUSES.includes(response.status)) {
      return request.refusal(await this.#errorMessages(response));
    }
    if (response.status === STATUS_BAD_REQUEST) {
      return new TrackerUnavailableError(`Jira rejected the request: ${await this.#errorMessages(response)}`);
    }
    if (!response.ok) {
      return new TrackerUnavailableError(`Jira answered with status ${String(response.status)}`);
    }
    return null;
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
    if (!parsed.success) {
      return "no reason given";
    }
    const fieldMessages = Object.entries(parsed.data.errors).map(([field, message]) => `${field}: ${message}`);
    const messages = [...parsed.data.errorMessages, ...fieldMessages];
    return messages.length > 0 ? messages.join("; ") : "no reason given";
  }

  #shape<Schema extends z.ZodType>(schema: Schema, answer: unknown): z.infer<Schema> {
    const parsed = schema.safeParse(answer);
    if (!parsed.success) {
      throw new TrackerUnavailableError("Jira's answer had an unexpected shape", { cause: parsed.error });
    }
    return parsed.data;
  }
}
