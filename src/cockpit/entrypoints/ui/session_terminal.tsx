import "@xterm/xterm/css/xterm.css";

import { FitAddon } from "@xterm/addon-fit";
import { type ITheme, Terminal } from "@xterm/xterm";
import { type ReactElement, useEffect, useRef } from "react";

import { sessionBridge } from "@/cockpit/entrypoints/ui/session_bridge_window";
import type { AgentSessionDTO } from "@/session/models/agent_session";

const TERMINAL_FONT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const TERMINAL_FONT_SIZE = 13;
const TERMINAL_SCROLLBACK_LINES = 10_000;
const TERMINAL_THEME: ITheme = {
  background: "#05070b",
  foreground: "#c8d1e0",
  cursor: "#c8d1e0",
  selectionBackground: "#2a3850",
};

export interface SessionTerminalProps {
  readonly onSessionChanged: (session: AgentSessionDTO) => void;
  readonly onSessionExited: (exitCode: number) => void;
}

interface TerminalListeners {
  readonly onSessionChanged: (session: AgentSessionDTO) => void;
  readonly onSessionExited: (exitCode: number) => void;
}

function attachTerminal(host: HTMLDivElement, listeners: TerminalListeners): () => void {
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
    bridge.onOutput((chunk) => {
      terminal.write(chunk);
    }),
    bridge.onStatus(listeners.onSessionChanged),
    bridge.onExit(listeners.onSessionExited),
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
    .start({ columns: terminal.cols, rows: terminal.rows })
    .then((session) => {
      if (isDetached) {
        return;
      }
      sessionId = session.sessionId;
      listeners.onSessionChanged(session);
      terminal.focus();
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

export function SessionTerminal({ onSessionChanged, onSessionExited }: SessionTerminalProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return undefined;
    }
    return attachTerminal(host, { onSessionChanged, onSessionExited });
  }, [onSessionChanged, onSessionExited]);

  return <div className="session-terminal" ref={hostRef} />;
}
