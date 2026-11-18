import type { AgentSessionDTO } from "@/session/models/agent_session";

export type AttentionKind = "failure" | "needs_you" | "agent_working" | "waiting" | "done";

export type AgentActivity = "working" | "waiting" | "idle" | "none";

export interface FlowSignals {
  readonly isInLastColumn: boolean;
  readonly hasFailure: boolean;
  readonly needsYou: boolean;
}

export const ATTENTION_ORDER: readonly AttentionKind[] = ["failure", "needs_you", "agent_working", "waiting", "done"];

export const Attention = {
  ofFlow(signals: FlowSignals): AttentionKind {
    if (signals.isInLastColumn) {
      return "done";
    }
    if (signals.hasFailure) {
      return "failure";
    }
    return signals.needsYou ? "needs_you" : "waiting";
  },

  combine(flowAttention: AttentionKind, agentActivity: AgentActivity): AttentionKind {
    if (flowAttention === "done" || flowAttention === "failure" || flowAttention === "needs_you") {
      return flowAttention;
    }
    if (agentActivity === "waiting") {
      return "needs_you";
    }
    return agentActivity === "working" ? "agent_working" : flowAttention;
  },

  activityOf(session: AgentSessionDTO | null): AgentActivity {
    if (session === null) {
      return "none";
    }
    if (session.status === "working" || session.status === "waiting") {
      return session.status;
    }
    return session.status === "ended" ? "none" : "idle";
  },

  rank(attention: AttentionKind): number {
    return ATTENTION_ORDER.indexOf(attention);
  },
};
