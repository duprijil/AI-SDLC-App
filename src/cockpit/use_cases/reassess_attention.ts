import type { FlowCachePort } from "@/cockpit/adapters/flow_cache_port";
import { Attention, type AttentionKind } from "@/cockpit/models/attention";
import type { AgentSessionDTO } from "@/session/models/agent_session";

export class ReassessAttention {
  readonly #flowCache: FlowCachePort;
  readonly #projectKey: string;

  constructor(flowCache: FlowCachePort, projectKey: string) {
    this.#flowCache = flowCache;
    this.#projectKey = projectKey;
  }

  execute(session: AgentSessionDTO): AttentionKind {
    const flow = this.#flowCache.read(this.#projectKey, session.ticketKey);
    return Attention.combine(flow?.flowAttention ?? "waiting", Attention.activityOf(session));
  }
}
