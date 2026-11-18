import { z } from "zod";

import type { AttestTickRequestDTO } from "@/cockpit/models/attest_action";
import type { ChangeActionDTO } from "@/cockpit/models/change_action";
import type { CheckpointRequestDTO } from "@/cockpit/models/checkpoint_action";
import { CockpitError } from "@/cockpit/models/errors";
import { PROMPT_KINDS, type PromptRequestDTO } from "@/cockpit/models/prompt_request";
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
  runUrls: z.array(z.url()).max(20).default([]),
  templateNames: z.array(z.string().min(1)).max(10).default([]),
});

const checkpointSchema = z.object({
  ticketKey: z.string().min(1),
  blockId: z.string().min(1),
  state: z.enum(["done", "open"]),
  note: z.string().max(2000),
});

const attestTickSchema = z.object({
  ticketKey: z.string().min(1),
  blockId: z.string().min(1),
  envName: z.string().min(1),
  expectedPins: z.record(z.string(), z.string()),
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

export function readCheckpointRequest(payload: unknown): CheckpointRequestDTO {
  return parse(checkpointSchema, payload, "checkpoint");
}

export function readPromptRequest(payload: unknown): PromptRequestDTO {
  return parse(promptRequestSchema, payload, "prompt request");
}

export function readStatusMoveRequest(payload: unknown): StatusMoveRequestDTO {
  return parse(statusMoveRequestSchema, payload, "status move");
}

export function readAttestTick(payload: unknown): AttestTickRequestDTO {
  return parse(attestTickSchema, payload, "attestation tick");
}

export function readExternalUrl(payload: unknown, configuredUrls: readonly string[]): string {
  const url = parse(z.string(), payload, "link");
  const isGithub = URL.canParse(url) && new URL(url).origin === GITHUB_ORIGIN;
  if (!isGithub && !configuredUrls.includes(url)) {
    throw new InvalidCockpitPayloadError(`Only GitHub links and promote links from project.yaml can be opened: ${url}`);
  }
  return url;
}
