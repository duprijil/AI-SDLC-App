import type { PtyPort } from "@/session/adapters/pty_port";
import type { SessionStorePort } from "@/session/adapters/session_store_port";
import type { TerminalSize } from "@/session/models/terminal_size";

export interface ResizeTerminalRequest {
  readonly sessionId: string;
  readonly size: TerminalSize;
}

export class ResizeTerminal {
  readonly #sessionStore: SessionStorePort;
  readonly #terminal: PtyPort;

  constructor(sessionStore: SessionStorePort, terminal: PtyPort) {
    this.#sessionStore = sessionStore;
    this.#terminal = terminal;
  }

  execute(request: ResizeTerminalRequest): void {
    const session = this.#sessionStore.find(request.sessionId);
    if (session?.isActive() !== true) {
      return;
    }
    this.#terminal.resize(session.sessionId, request.size);
  }
}
