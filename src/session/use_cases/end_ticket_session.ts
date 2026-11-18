import type { PtyPort } from "@/session/adapters/pty_port";
import type { SessionRecordPort } from "@/session/adapters/session_record_port";
import type { SessionStorePort } from "@/session/adapters/session_store_port";
import { SessionRecordError } from "@/session/models/errors";

export class EndTicketSession {
  readonly #sessionStore: SessionStorePort;
  readonly #sessionRecords: SessionRecordPort;
  readonly #terminal: PtyPort;

  constructor(sessionStore: SessionStorePort, sessionRecords: SessionRecordPort, terminal: PtyPort) {
    this.#sessionStore = sessionStore;
    this.#sessionRecords = sessionRecords;
    this.#terminal = terminal;
  }

  execute(ticketKey: string): boolean {
    const running = this.#sessionStore.findActiveForTicket(ticketKey);
    if (running !== null) {
      this.#sessionStore.save(running.withStatus("ended"));
      this.#terminal.kill(running.sessionId);
    }
    try {
      this.#sessionRecords.markEnded(ticketKey, new Date().toISOString());
    } catch (error) {
      if (!(error instanceof SessionRecordError)) {
        throw error;
      }
    }
    return running !== null;
  }
}
