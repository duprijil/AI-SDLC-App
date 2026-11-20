import type { BlockType } from "@/pipeline/models/pipeline";

export const EDITABLE_BLOCK_FIELDS = ["id", "title", "type", "done_when", "env", "pin", "prompt"] as const;

export type EditableBlockField = (typeof EDITABLE_BLOCK_FIELDS)[number];

export type PipelineEditDTO =
  | {
      readonly op: "set_block_field";
      readonly blockId: string;
      readonly field: EditableBlockField;
      readonly value: string | null;
    }
  | { readonly op: "set_runs"; readonly blockId: string; readonly runsPerChange: boolean }
  | { readonly op: "add_level"; readonly columnKey: string }
  | {
      readonly op: "add_block";
      readonly columnKey: string;
      readonly levelIndex: number;
      readonly blockId: string;
      readonly blockType: BlockType;
    }
  | { readonly op: "move_block"; readonly blockId: string; readonly direction: "up" | "down" }
  | { readonly op: "remove_block"; readonly blockId: string }
  | {
      readonly op: "set_state_prompts";
      readonly blockId: string;
      readonly state: string;
      readonly templateNames: readonly string[];
    }
  | { readonly op: "set_gate_prompts"; readonly columnKey: string; readonly templateNames: readonly string[] };

export interface PipelineFileDTO {
  readonly text: string;
  readonly hash: string;
}

export const DEFAULT_DONE_WHEN: Readonly<Record<BlockType, (envName: string | null) => string>> = {
  change: () => "change.merged",
  deploy: (envName) => `env("${envName ?? "dev"}").contains(changes)`,
  attest: () => "attested",
  tracker: () => 'tracker.status_after("<column>")',
  prompt: () => "session.checkpoint(step)",
};
