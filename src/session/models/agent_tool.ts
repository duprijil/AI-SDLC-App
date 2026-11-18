export const SDLC_SERVER_NAME = "sdlc";

export const SDLC_TOOLS = Object.freeze({
  getContext: "get_context",
  draft: "draft",
  checkpoint: "checkpoint",
  codeComment: "code_comment",
  merge: "merge",
});

const qualified = (toolName: string): string => `mcp__${SDLC_SERVER_NAME}__${toolName}`;

export interface AgentToolPolicyDTO {
  readonly allow: readonly string[];
  readonly ask: readonly string[];
  readonly deny: readonly string[];
}

export const AGENT_TOOL_POLICY: AgentToolPolicyDTO = Object.freeze({
  allow: [qualified(SDLC_TOOLS.getContext), qualified(SDLC_TOOLS.draft), qualified(SDLC_TOOLS.checkpoint)],
  ask: [qualified(SDLC_TOOLS.codeComment), qualified(SDLC_TOOLS.merge)],
  deny: ["Bash(gh pr merge:*)", "Bash(gh pr comment:*)", "Bash(gh pr review:*)", "Bash(gh api:*)"],
});
