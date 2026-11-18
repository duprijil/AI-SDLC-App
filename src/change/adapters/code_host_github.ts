import { z } from "zod";

import type { ChangeListRequest, CodeHostPort } from "@/change/adapters/code_host_port";
import { Change, type ChangeRefDTO } from "@/change/models/change";
import type { MergeMethod } from "@/change/models/change_query";
import {
  ChangeReview,
  type ChecksState,
  type MergeState,
  type ReviewDecision,
  type ReviewVerdict,
} from "@/change/models/change_review";
import {
  BranchUpdateRefusedError,
  CodeHostAuthError,
  CodeHostRateLimitError,
  CodeHostUnavailableError,
  MergeRefusedError,
} from "@/change/models/errors";
import type { SecretText } from "@/core/models/secret_text";

const GRAPHQL_URL = "https://api.github.com/graphql";
const REQUEST_TIMEOUT_MILLISECONDS = 20_000;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const BOT_TYPENAME = "Bot";
const BOT_SUFFIX = "[bot]";
const GHOST_LOGIN = "ghost";

const CHANGE_FIELDS = `fragment ChangeFields on PullRequest {
  id number title url headRefName state isDraft updatedAt headRefOid mergedAt author { login }
}`;

const LIST_QUERY = `query ListChanges($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    open: pullRequests(states: OPEN, first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { ...ChangeFields } }
    merged: pullRequests(states: MERGED, first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { ...ChangeFields } }
  }
}
${CHANGE_FIELDS}`;

const REVIEW_QUERY = `query ReviewChange($id: ID!) {
  node(id: $id) {
    ... on PullRequest {
      id headRefOid updatedAt mergeStateStatus mergeable reviewDecision
      commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }
      reviews(last: 50) { nodes { author { login __typename } state submittedAt } }
      reviewThreads(first: 50) {
        nodes { id isResolved path line comments(last: 10) { nodes { author { login __typename } body createdAt } } }
      }
    }
  }
}`;

const VIEWER_QUERY = "query Viewer { viewer { login } }";

const MERGE_MUTATION = `mutation Merge($id: ID!, $method: PullRequestMergeMethod!, $head: GitObjectID!) {
  mergePullRequest(input: {pullRequestId: $id, mergeMethod: $method, expectedHeadOid: $head}) { pullRequest { id } }
}`;

const UPDATE_BRANCH_MUTATION = `mutation UpdateBranch($id: ID!, $head: GitObjectID!) {
  updatePullRequestBranch(input: {pullRequestId: $id, expectedHeadOid: $head}) { pullRequest { id } }
}`;

const REPLY_MUTATION = `mutation Reply($thread: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $thread, body: $body}) { comment { id } }
}`;

const RESOLVE_MUTATION = `mutation Resolve($thread: ID!) {
  resolveReviewThread(input: {threadId: $thread}) { thread { id } }
}`;

const actorSchema = z.object({ login: z.string(), __typename: z.string().optional() }).nullable();

const changeNodeSchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  headRefName: z.string(),
  state: z.enum(["OPEN", "MERGED", "CLOSED"]),
  isDraft: z.boolean(),
  updatedAt: z.string(),
  headRefOid: z.string(),
  mergedAt: z.string().nullable(),
  author: actorSchema,
});

const listSchema = z.object({
  repository: z
    .object({
      open: z.object({ nodes: z.array(changeNodeSchema) }),
      merged: z.object({ nodes: z.array(changeNodeSchema) }),
    })
    .nullable(),
});

const reviewSchema = z.object({
  node: z.object({
    id: z.string(),
    headRefOid: z.string(),
    updatedAt: z.string(),
    mergeStateStatus: z.string(),
    mergeable: z.string(),
    reviewDecision: z.string().nullable(),
    commits: z.object({
      nodes: z.array(
        z.object({
          commit: z.object({
            committedDate: z.string(),
            statusCheckRollup: z.object({ state: z.string() }).nullable(),
          }),
        }),
      ),
    }),
    reviews: z.object({
      nodes: z.array(z.object({ author: actorSchema, state: z.string(), submittedAt: z.string().nullable() })),
    }),
    reviewThreads: z.object({
      nodes: z.array(
        z.object({
          id: z.string(),
          isResolved: z.boolean(),
          path: z.string(),
          line: z.number().nullable(),
          comments: z.object({
            nodes: z.array(z.object({ author: actorSchema, body: z.string(), createdAt: z.string() })),
          }),
        }),
      ),
    }),
  }),
});

const viewerSchema = z.object({ viewer: z.object({ login: z.string() }) });

const answerSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ message: z.string(), type: z.string().optional() })).optional(),
});

const MERGE_STATE: Readonly<Record<string, MergeState>> = {
  CLEAN: "clean",
  HAS_HOOKS: "clean",
  BEHIND: "behind",
  DIRTY: "conflict",
  BLOCKED: "blocked",
  UNSTABLE: "unstable",
  DRAFT: "draft",
};

const CHECKS_STATE: Readonly<Record<string, ChecksState>> = {
  SUCCESS: "passing",
  FAILURE: "failing",
  ERROR: "failing",
  PENDING: "pending",
  EXPECTED: "pending",
};

const REVIEW_DECISION: Readonly<Record<string, ReviewDecision>> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  REVIEW_REQUIRED: "review_required",
};

const REVIEW_VERDICT: Readonly<Record<string, ReviewVerdict>> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  COMMENTED: "commented",
  DISMISSED: "dismissed",
};

const MERGE_METHOD: Readonly<Record<MergeMethod, string>> = { squash: "SQUASH", merge: "MERGE", rebase: "REBASE" };

type Actor = z.infer<typeof actorSchema>;

const loginOf = (actor: Actor): string => actor?.login ?? GHOST_LOGIN;

const isBot = (actor: Actor): boolean =>
  actor?.__typename === BOT_TYPENAME || (actor?.login.endsWith(BOT_SUFFIX) ?? false);

class GraphqlFailure {
  readonly messages: readonly string[];

  constructor(messages: readonly string[]) {
    this.messages = messages;
  }
}

export class CodeHostGithub implements CodeHostPort {
  readonly #token: SecretText;
  #viewerLogin: Promise<string> | null = null;

  constructor(token: SecretText) {
    this.#token = token;
  }

  viewerLogin(): Promise<string> {
    this.#viewerLogin ??= this.#query(VIEWER_QUERY, {}, viewerSchema).then((answer) => answer.viewer.login);
    return this.#viewerLogin;
  }

  async listChanges(request: ChangeListRequest): Promise<readonly Change[]> {
    const [owner = "", name = ""] = request.githubRepository.split("/");
    const answer = await this.#query(LIST_QUERY, { owner, name }, listSchema);
    if (answer.repository === null) {
      throw new CodeHostUnavailableError(`GitHub has no repository ${request.githubRepository} for GITHUB_TOKEN`);
    }
    const recentlyMerged = answer.repository.merged.nodes.filter(
      (node) => node.mergedAt !== null && Date.parse(node.mergedAt) >= request.mergedSince.getTime(),
    );
    return [...answer.repository.open.nodes, ...recentlyMerged].map((node) =>
      Change.create({
        pullRequestId: node.id,
        repoName: request.repoName,
        githubRepository: request.githubRepository,
        number: node.number,
        title: node.title,
        branchName: node.headRefName,
        url: node.url,
        authorLogin: loginOf(node.author),
        state: node.state === "MERGED" ? "merged" : "open",
        isDraft: node.isDraft,
        updatedAt: node.updatedAt,
        headCommitId: node.headRefOid,
      }),
    );
  }

  async review(change: ChangeRefDTO): Promise<ChangeReview> {
    const { node } = await this.#query(REVIEW_QUERY, { id: change.pullRequestId }, reviewSchema);
    const lastCommit = node.commits.nodes.at(-1)?.commit;
    const mergeState =
      node.mergeable === "CONFLICTING" ? "conflict" : (MERGE_STATE[node.mergeStateStatus] ?? "unknown");
    return ChangeReview.create({
      pullRequestId: node.id,
      headCommitId: node.headRefOid,
      updatedAt: node.updatedAt,
      lastCommitAt: lastCommit?.committedDate ?? node.updatedAt,
      mergeState,
      checks: CHECKS_STATE[lastCommit?.statusCheckRollup?.state ?? ""] ?? "none",
      reviewDecision: REVIEW_DECISION[node.reviewDecision ?? ""] ?? "none",
      reviews: node.reviews.nodes.map((review) => ({
        authorLogin: loginOf(review.author),
        isBot: isBot(review.author),
        verdict: REVIEW_VERDICT[review.state] ?? "pending",
        submittedAt: review.submittedAt ?? node.updatedAt,
      })),
      threads: node.reviewThreads.nodes.map((thread) => ({
        threadId: thread.id,
        path: thread.path,
        line: thread.line,
        isResolved: thread.isResolved,
        comments: thread.comments.nodes.map((comment) => ({
          authorLogin: loginOf(comment.author),
          isBot: isBot(comment.author),
          body: comment.body,
          createdAt: comment.createdAt,
        })),
      })),
    });
  }

  async merge(change: ChangeRefDTO, mergeMethod: MergeMethod): Promise<void> {
    await this.#mutate(
      MERGE_MUTATION,
      { id: change.pullRequestId, method: MERGE_METHOD[mergeMethod], head: change.headCommitId },
      (messages) => new MergeRefusedError(`GitHub refused the merge: ${messages.join("; ")}`),
    );
  }

  async updateBranch(change: ChangeRefDTO): Promise<void> {
    await this.#mutate(
      UPDATE_BRANCH_MUTATION,
      { id: change.pullRequestId, head: change.headCommitId },
      (messages) => new BranchUpdateRefusedError(`GitHub refused to update the branch: ${messages.join("; ")}`),
    );
  }

  async replyToThread(threadId: string, body: string): Promise<void> {
    await this.#mutate(
      REPLY_MUTATION,
      { thread: threadId, body },
      (messages) => new CodeHostUnavailableError(`GitHub refused the reply: ${messages.join("; ")}`),
    );
  }

  async resolveThread(threadId: string): Promise<void> {
    await this.#mutate(
      RESOLVE_MUTATION,
      { thread: threadId },
      (messages) => new CodeHostUnavailableError(`GitHub refused to resolve the thread: ${messages.join("; ")}`),
    );
  }

  async #mutate(
    mutation: string,
    variables: Readonly<Record<string, unknown>>,
    refusal: (messages: readonly string[]) => Error,
  ): Promise<void> {
    const answer = await this.#post(mutation, variables);
    if (answer instanceof GraphqlFailure) {
      throw refusal(answer.messages);
    }
  }

  async #query<Schema extends z.ZodType>(
    query: string,
    variables: Readonly<Record<string, unknown>>,
    schema: Schema,
  ): Promise<z.infer<Schema>> {
    const answer = await this.#post(query, variables);
    if (answer instanceof GraphqlFailure) {
      throw new CodeHostUnavailableError(`GitHub refused the query: ${answer.messages.join("; ")}`);
    }
    const parsed = schema.safeParse(answer);
    if (!parsed.success) {
      throw new CodeHostUnavailableError("GitHub's answer had an unexpected shape", { cause: parsed.error });
    }
    return parsed.data;
  }

  async #post(query: string, variables: Readonly<Record<string, unknown>>): Promise<unknown> {
    const response = await this.#send(query, variables);
    this.#rejectHttpFailure(response);
    const answer = answerSchema.safeParse(await response.json().catch(() => null));
    if (!answer.success) {
      throw new CodeHostUnavailableError("GitHub sent an answer that isn't GraphQL");
    }
    const errors = answer.data.errors ?? [];
    if (errors.some((error) => error.type === "RATE_LIMITED")) {
      throw new CodeHostRateLimitError("GitHub's rate limit is used up; try again later");
    }
    return errors.length > 0 ? new GraphqlFailure(errors.map((error) => error.message)) : answer.data.data;
  }

  async #send(query: string, variables: Readonly<Record<string, unknown>>): Promise<Response> {
    try {
      return await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.#token.reveal()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      });
    } catch (cause) {
      throw new CodeHostUnavailableError("GitHub is unreachable", { cause });
    }
  }

  #rejectHttpFailure(response: Response): void {
    if (response.headers.get("x-ratelimit-remaining") === "0") {
      const resetAt = new Date(Number(response.headers.get("x-ratelimit-reset") ?? "0") * 1000);
      throw new CodeHostRateLimitError(`GitHub's rate limit is used up until ${resetAt.toLocaleTimeString()}`);
    }
    if (response.status === STATUS_UNAUTHORIZED || response.status === STATUS_FORBIDDEN) {
      throw new CodeHostAuthError("GitHub rejected GITHUB_TOKEN in .env.secrets");
    }
    if (!response.ok) {
      throw new CodeHostUnavailableError(`GitHub answered with status ${String(response.status)}`);
    }
  }
}
