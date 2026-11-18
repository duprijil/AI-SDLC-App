import type { ChangeViewDTO, ThreadViewDTO } from "@/cockpit/models/block_state";
import { DEFAULT_PROMPT_NAMES } from "@/pipeline/models/default_prompts";

export const PROMPT_KINDS = [
  "build_ticket",
  "fix_ci",
  "resolve_conflict",
  "address_feedback",
  "diagnose_deploy",
  "block_prompt",
] as const;

export type PromptKind = (typeof PROMPT_KINDS)[number];

export interface PromptRequestDTO {
  readonly kind: PromptKind;
  readonly ticketKey: string;
  readonly ticketTitle: string;
  readonly change: ChangeViewDTO | null;
  readonly threads: readonly ThreadViewDTO[];
  readonly runUrls: readonly string[];
  readonly templateNames: readonly string[];
}

const DEFAULT_TEMPLATE: Readonly<Record<PromptKind, string | null>> = {
  build_ticket: DEFAULT_PROMPT_NAMES.buildTicket,
  fix_ci: DEFAULT_PROMPT_NAMES.fixCi,
  resolve_conflict: DEFAULT_PROMPT_NAMES.resolveConflict,
  address_feedback: DEFAULT_PROMPT_NAMES.addressFeedback,
  diagnose_deploy: DEFAULT_PROMPT_NAMES.diagnoseDeploy,
  block_prompt: null,
};

export const PromptRequest = {
  templateNames(request: PromptRequestDTO): readonly string[] {
    if (request.templateNames.length > 0) {
      return request.templateNames;
    }
    const fallback = DEFAULT_TEMPLATE[request.kind];
    return fallback === null ? [] : [fallback];
  },
};
