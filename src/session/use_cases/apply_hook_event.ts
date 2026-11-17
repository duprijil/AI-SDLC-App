import type { SessionStorePort } from "@/session/adapters/session_store_port";
import type { AgentSession } from "@/session/models/agent_session";
import { SessionNotFoundError } from "@/session/models/errors";
import type { HookEvent } from "@/session/models/hook_event";

export class ApplyHookEvent {
  readonly #sessionStore: SessionStorePort;

  constructor(sessionStore: SessionStorePort) {
    this.#sessionStore = sessionStore;
  }

  execute(hookEvent: HookEvent): AgentSession {
    const session = this.#sessionStore.find(hookEvent.sessionId);
    if (session === null) {
      throw new SessionNotFoundError(`Hook event for unknown session ${hookEvent.sessionId}`);
    }
    const updatedSession = session.withStatus(hookEvent.sessionStatus());
    this.#sessionStore.save(updatedSession);
    return updatedSession;
  }
}
