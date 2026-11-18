import type { DraftKind } from "@/session/models/draft";

export interface AgentDraftRequest {
  readonly kind: DraftKind;
  readonly target: string;
  readonly text: string;
}

export interface AgentCommentRequest {
  readonly repo: string;
  readonly number: number;
  readonly threadId: string;
  readonly body: string;
  readonly shouldResolve: boolean;
}

export interface AgentMergeRequest {
  readonly repo: string;
  readonly number: number;
}

export interface AgentActionsPort {
  context(ticketKey: string): Promise<unknown>;
  draft(ticketKey: string, request: AgentDraftRequest): Promise<string>;
  checkpoint(ticketKey: string, kind: string, summary: string): Promise<string>;
  comment(ticketKey: string, request: AgentCommentRequest): Promise<string>;
  merge(ticketKey: string, request: AgentMergeRequest): Promise<string>;
}
