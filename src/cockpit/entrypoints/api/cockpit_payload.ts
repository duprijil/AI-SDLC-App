import { z } from "zod";

import type { ChangeActionDTO } from "@/cockpit/models/change_action";
import { type ChangePromptRequestDTO, PROMPT_KINDS } from "@/cockpit/models/change_prompt";
import { CockpitError } from "@/cockpit/models/errors";
import type { StatusMoveRequestDTO } from "@/cockpit/models/status_move_action";

const GITHUB_ORIGIN = "https://github.com";

const changeViewSchema = z.object({
  pullRequestId: z.string(),
  githubRepository: z.string(),
  repoName: z.string(),
  number: z.number(),
  title: z.string(),
  branchName: z.string(),
  url: z.string(),
  headCommitId: z.string(),
});

const threadViewSchema = z.object({
  threadId: z.string(),
  location: z.string(),
  lastAuthorLogin: z.string(),
  lastCommentBody: z.string(),
});

const changeActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("merge"), change: changeViewSchema }),
  z.object({ kind: z.literal("update_branch"), change: changeViewSchema }),
  z.object({
    kind: z.literal("reply"),
    threadId: z.string().min(1),
    replyText: z.string(),
    shouldResolve: z.boolean(),
  }),
]);

const promptRequestSchema = z.object({
  kind: z.enum(PROMPT_KINDS),
  ticketKey: z.string(),
  ticketTitle: z.string(),
  change: changeViewSchema.nullable(),
  threads: z.array(threadViewSchema),
});

const statusMoveRequestSchema = z.object({
  ticketKey: z.string().min(1),
  targetColumnIndex: z.number().int().nonnegative(),
});

export class InvalidCockpitPayloadError extends CockpitError {
  override readonly name: string = "InvalidCockpitPayloadError";
}

function parse<Schema extends z.ZodType>(schema: Schema, payload: unknown, subject: string): z.infer<Schema> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new InvalidCockpitPayloadError(`Invalid ${subject}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function readChangeAction(payload: unknown): ChangeActionDTO {
  return parse(changeActionSchema, payload, "change action");
}

export function readPromptRequest(payload: unknown): ChangePromptRequestDTO {
  return parse(promptRequestSchema, payload, "prompt request");
}

export function readStatusMoveRequest(payload: unknown): StatusMoveRequestDTO {
  return parse(statusMoveRequestSchema, payload, "status move");
}

export function readGithubUrl(payload: unknown): string {
  const url = parse(z.string(), payload, "link");
  if (!URL.canParse(url) || new URL(url).origin !== GITHUB_ORIGIN) {
    throw new InvalidCockpitPayloadError(`Only GitHub links can be opened: ${url}`);
  }
  return url;
}
