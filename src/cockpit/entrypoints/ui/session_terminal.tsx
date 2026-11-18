import "@xterm/xterm/css/xterm.css";

import { FitAddon } from "@xterm/addon-fit";
import { type ITheme, Terminal } from "@xterm/xterm";
import { type ReactElement, useEffect, useRef, useState } from "react";

import { sessionBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import type { AgentSessionDTO } from "@/session/models/agent_session";

const TERMINAL_FONT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const TERMINAL_FONT_SIZE = 13;
const TERMINAL_SCROLLBACK_LINES = 10_000;
const PROMPT_TIMEOUT_MILLISECONDS = 60_000;
const TERMINAL_THEME: ITheme = {
  background: "#05070b",
  foreground: "#c8d1e0",
  cursor: "#c8d1e0",
  selectionBackground: "#2a3850",
};

export interface SessionTerminalProps {
  readonly ticketKey: string;
  readonly pendingPrompt: string | null;
  readonly onPromptDelivered: () => void;
  readonly onPromptTimedOut: () => void;
}

function attachTerminal(
  host: HTMLDivElement,
  ticketKey: string,
  onSession: (session: AgentSessionDTO) => void,
): () => void {
  const bridge = sessionBridge();
  const terminal = new Terminal({
    fontFamily: TERMINAL_FONT_FAMILY,
    fontSize: TERMINAL_FONT_SIZE,
    cursorBlink: true,
    scrollback: TERMINAL_SCROLLBACK_LINES,
    theme: TERMINAL_THEME,
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(host);
  fitAddon.fit();

  let sessionId: string | null = null;
  let isDetached = false;
  const unsubscribers = [
    bridge.onOutput((output) => {
      if (output.ticketKey === ticketKey) {
        terminal.write(output.chunk);
      }
    }),
    bridge.onExit((exit) => {
      if (exit.ticketKey === ticketKey) {
        terminal.write(`\r\n[Claude Code exited with code ${String(exit.exitCode)}]\r\n`);
      }
    }),
    bridge.onStatus((session) => {
      if (session.ticketKey === ticketKey && !isDetached) {
        if (session.status !== "ended") {
          sessionId = session.sessionId;
        }
        onSession(session);
      }
    }),
  ];
  const keystrokeSubscription = terminal.onData((keystrokes) => {
    if (sessionId !== null) {
      bridge.sendInput(sessionId, keystrokes);
    }
  });
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    if (sessionId !== null) {
      bridge.resize(sessionId, { columns: terminal.cols, rows: terminal.rows });
    }
  });
  resizeObserver.observe(host);

  bridge
    .start(ticketKey, { columns: terminal.cols, rows: terminal.rows })
    .then((session) => {
      if (!isDetached) {
        sessionId = session.sessionId;
        onSession(session);
        terminal.focus();
      }
    })
    .catch((error: unknown) => {
      terminal.write(`\r\nCould not start the session: ${error instanceof Error ? error.message : "unknown"}\r\n`);
    });

  return () => {
    isDetached = true;
    resizeObserver.disconnect();
    keystrokeSubscription.dispose();
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
    terminal.dispose();
  };
}

export function SessionTerminal({
  ticketKey,
  pendingPrompt,
  onPromptDelivered,
  onPromptTimedOut,
}: SessionTerminalProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const deliveredPromptRef = useRef<string | null>(null);
  const [session, setSession] = useState<AgentSessionDTO | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return undefined;
    }
    return attachTerminal(host, ticketKey, setSession);
  }, [ticketKey]);

  useEffect(() => {
    if (pendingPrompt === null || session?.status !== "idle" || deliveredPromptRef.current === pendingPrompt) {
      return;
    }
    deliveredPromptRef.current = pendingPrompt;
    sessionBridge().sendPrompt(session.sessionId, pendingPrompt).then(onPromptDelivered).catch(onPromptTimedOut);
  }, [pendingPrompt, session, onPromptDelivered, onPromptTimedOut]);

  useEffect(() => {
    if (pendingPrompt === null) {
      return undefined;
    }
    const timeout = window.setTimeout(onPromptTimedOut, PROMPT_TIMEOUT_MILLISECONDS);
    return (): void => {
      window.clearTimeout(timeout);
    };
  }, [pendingPrompt, onPromptTimedOut]);

  return <div className="session-terminal" ref={hostRef} />;
}
