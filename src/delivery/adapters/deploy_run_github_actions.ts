import { z } from "zod";

import type { SecretText } from "@/core/models/secret_text";
import type { DeployRunPort, DeployRunQuery } from "@/delivery/adapters/deploy_run_port";
import { DeployRun } from "@/delivery/models/deploy_run";
import {
  DeliveryAuthError,
  type DeliveryError,
  DeliveryRateLimitError,
  DeliveryUnavailableError,
  WorkflowNotFoundError,
} from "@/delivery/models/errors";

const API_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const RUNS_PER_PAGE = 20;
const STATUS_NOT_MODIFIED = 304;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_NOT_FOUND = 404;
const STATUS_TOO_MANY_REQUESTS = 429;

const runsSchema = z.object({
  workflow_runs: z.array(
    z.object({
      id: z.number(),
      status: z.string(),
      conclusion: z.string().nullable(),
      head_sha: z.string(),
      html_url: z.string(),
      created_at: z.string(),
    }),
  ),
});

type RunsAnswer = z.infer<typeof runsSchema>;

interface CachedRuns {
  readonly etag: string;
  readonly runs: readonly DeployRun[];
}

const toStatus = (status: string): DeployRun["status"] => {
  if (status === "completed") {
    return "completed";
  }
  return status === "in_progress" ? "in_progress" : "queued";
};

const toRuns = (answer: RunsAnswer): readonly DeployRun[] =>
  answer.workflow_runs.map((run) =>
    DeployRun.create({
      runId: run.id,
      status: toStatus(run.status),
      conclusion: run.conclusion,
      headCommitId: run.head_sha,
      url: run.html_url,
      createdAt: run.created_at,
    }),
  );

export class DeployRunGithubActions implements DeployRunPort {
  readonly #token: SecretText;
  readonly #cache = new Map<string, CachedRuns>();

  constructor(token: SecretText) {
    this.#token = token;
  }

  async recentRuns(query: DeployRunQuery): Promise<readonly DeployRun[]> {
    const url = this.#runsUrl(query);
    const cached = this.#cache.get(url);
    const response = await this.#send(url, cached?.etag ?? null);
    if (response.status === STATUS_NOT_MODIFIED && cached !== undefined) {
      return cached.runs;
    }
    const failure = this.#failureOf(response, query);
    if (failure !== null) {
      throw failure;
    }
    const parsed = runsSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new DeliveryUnavailableError("GitHub's workflow runs had an unexpected shape", { cause: parsed.error });
    }
    const runs = toRuns(parsed.data);
    const etag = response.headers.get("etag");
    if (etag !== null) {
      this.#cache.set(url, { etag, runs });
    }
    return runs;
  }

  #runsUrl(query: DeployRunQuery): string {
    const workflow = encodeURIComponent(query.workflow);
    const branch = encodeURIComponent(query.branch);
    return `${API_URL}/repos/${query.githubRepository}/actions/workflows/${workflow}/runs?branch=${branch}&per_page=${String(RUNS_PER_PAGE)}`;
  }

  #failureOf(response: Response, query: DeployRunQuery): DeliveryError | null {
    if (response.headers.get("x-ratelimit-remaining") === "0" || response.status === STATUS_TOO_MANY_REQUESTS) {
      const resetAt = new Date(Number(response.headers.get("x-ratelimit-reset") ?? "0") * 1000);
      return new DeliveryRateLimitError(`GitHub's rate limit is used up until ${resetAt.toLocaleTimeString()}`);
    }
    if (response.status === STATUS_UNAUTHORIZED || response.status === STATUS_FORBIDDEN) {
      return new DeliveryAuthError("GitHub rejected GITHUB_TOKEN for workflow runs (it needs Actions: read)");
    }
    if (response.status === STATUS_NOT_FOUND) {
      return new WorkflowNotFoundError(`No workflow ${query.workflow} in ${query.githubRepository}`);
    }
    if (!response.ok) {
      return new DeliveryUnavailableError(`GitHub answered with status ${String(response.status)}`);
    }
    return null;
  }

  async #send(url: string, etag: string | null): Promise<Response> {
    try {
      return await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.#token.reveal()}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(etag === null ? {} : { "If-None-Match": etag }),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      });
    } catch (cause) {
      throw new DeliveryUnavailableError("GitHub is unreachable", { cause });
    }
  }
}
