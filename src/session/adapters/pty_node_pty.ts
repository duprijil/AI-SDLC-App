import { type IPty, spawn } from "node-pty";

import type { PtyListener, PtyPort, PtySpawnRequest } from "@/session/adapters/pty_port";
import { SessionNotFoundError, TerminalSpawnError } from "@/session/models/errors";
import type { TerminalSize } from "@/session/models/terminal_size";

const TERMINAL_NAME = "xterm-256color";
const SCROLLBACK_CHARACTERS = 262_144;

export class PtyNodePty implements PtyPort {
  readonly #terminals = new Map<string, IPty>();
  readonly #listeners = new Map<string, PtyListener>();
  readonly #scrollbacks = new Map<string, string>();

  spawn(request: PtySpawnRequest, listener: PtyListener): void {
    const terminal = this.#startTerminal(request);
    this.#terminals.set(request.sessionId, terminal);
    this.#listeners.set(request.sessionId, listener);
    this.#scrollbacks.set(request.sessionId, "");
    terminal.onData((chunk) => {
      this.#remember(request.sessionId, chunk);
      this.#listeners.get(request.sessionId)?.onOutput(chunk);
    });
    terminal.onExit(({ exitCode }) => {
      this.#listeners.get(request.sessionId)?.onExit(exitCode);
      this.#terminals.delete(request.sessionId);
      this.#listeners.delete(request.sessionId);
      this.#scrollbacks.delete(request.sessionId);
    });
  }

  attach(sessionId: string, listener: PtyListener): void {
    this.#terminal(sessionId);
    this.#listeners.set(sessionId, listener);
    const scrollback = this.#scrollbacks.get(sessionId) ?? "";
    if (scrollback !== "") {
      listener.onOutput(scrollback);
    }
  }

  write(sessionId: string, keystrokes: string): void {
    this.#terminal(sessionId).write(keystrokes);
  }

  resize(sessionId: string, size: TerminalSize): void {
    this.#terminal(sessionId).resize(size.columns, size.rows);
  }

  kill(sessionId: string): void {
    this.#terminals.get(sessionId)?.kill();
  }

  killAll(): void {
    for (const terminal of this.#terminals.values()) {
      terminal.kill();
    }
    this.#terminals.clear();
    this.#listeners.clear();
    this.#scrollbacks.clear();
  }

  #remember(sessionId: string, chunk: string): void {
    const scrollback = `${this.#scrollbacks.get(sessionId) ?? ""}${chunk}`;
    this.#scrollbacks.set(sessionId, scrollback.slice(-SCROLLBACK_CHARACTERS));
  }

  #startTerminal(request: PtySpawnRequest): IPty {
    try {
      return spawn(request.launchCommand.command, [...request.launchCommand.commandArguments], {
        name: TERMINAL_NAME,
        cols: request.size.columns,
        rows: request.size.rows,
        cwd: request.workingDirectory,
      });
    } catch (cause) {
      throw new TerminalSpawnError(`Could not start ${request.launchCommand.command}`, { cause });
    }
  }

  #terminal(sessionId: string): IPty {
    const terminal = this.#terminals.get(sessionId);
    if (terminal === undefined) {
      throw new SessionNotFoundError(`No running terminal for session ${sessionId}`);
    }
    return terminal;
  }
}
