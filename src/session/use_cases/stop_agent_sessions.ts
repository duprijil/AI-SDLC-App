import type { PtyPort } from "@/session/adapters/pty_port";
import type { SessionStorePort } from "@/session/adapters/session_store_port";

export class StopAgentSessions {
  readonly #sessionStore: SessionStorePort;
  readonly #terminal: PtyPort;

  constructor(sessionStore: SessionStorePort, terminal: PtyPort) {
    this.#sessionStore = sessionStore;
    this.#terminal = terminal;
  }

  execute(): number {
    const activeSessions = this.#sessionStore.listActive();
    this.#terminal.killAll();
    for (const session of activeSessions) {
      this.#sessionStore.save(session.withStatus("ended"));
    }
    return activeSessions.length;
  }
}
