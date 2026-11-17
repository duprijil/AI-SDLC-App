import { type ReactElement, useCallback, useState } from "react";

import { sessionBridge } from "@/cockpit/entrypoints/ui/session_bridge_window";
import { SessionTerminal } from "@/cockpit/entrypoints/ui/session_terminal";
import type { AgentSessionDTO } from "@/session/models/agent_session";

const TEST_PROMPT = [
  "Reply with exactly one word: pong.",
  "This second line checks that a multi-line bracketed paste arrives as one prompt.",
].join("\n");

export function SpikeScreen(): ReactElement {
  const [session, setSession] = useState<AgentSessionDTO | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [promptFailure, setPromptFailure] = useState<string | null>(null);

  const onSessionChanged = useCallback((changedSession: AgentSessionDTO) => {
    setSession(changedSession);
  }, []);

  const onSessionExited = useCallback((sessionExitCode: number) => {
    setExitCode(sessionExitCode);
  }, []);

  const pasteTestPrompt = useCallback(() => {
    if (session === null) {
      return;
    }
    setPromptFailure(null);
    sessionBridge()
      .sendPrompt(session.sessionId, TEST_PROMPT)
      .catch((error: unknown) => {
        setPromptFailure(error instanceof Error ? error.message : "unknown");
      });
  }, [session]);

  const status = exitCode === null ? (session?.status ?? "connecting") : `exited (${String(exitCode)})`;

  return (
    <div className="spike-screen">
      <header className="spike-bar">
        <span className="spike-logo" />
        <span className="spike-title">Ticket Cockpit</span>
        <span className="spike-tag">M0 spike</span>
        <span className="spike-ticket">{session?.ticketKey ?? "…"}</span>
        <span className={`spike-status status-${session?.status ?? "starting"}`}>● {status}</span>
        {promptFailure !== null && <span className="spike-failure">{promptFailure}</span>}
        <button className="spike-button" type="button" onClick={pasteTestPrompt} disabled={session === null}>
          Paste test prompt
        </button>
      </header>
      <SessionTerminal onSessionChanged={onSessionChanged} onSessionExited={onSessionExited} />
    </div>
  );
}
