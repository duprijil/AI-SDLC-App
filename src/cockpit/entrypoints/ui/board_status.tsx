import { type ReactElement, useState } from "react";

import type { AttentionKind } from "@/cockpit/models/attention";
import type { RefreshProgressDTO } from "@/cockpit/models/refresh_progress";
import type { SprintBoardDTO, TicketCardDTO } from "@/cockpit/models/sprint_board";

export const ATTENTION_LABEL: Readonly<Record<AttentionKind, string>> = {
  failure: "Failure",
  needs_you: "Needs you",
  agent_working: "Agent working",
  waiting: "Waiting",
  done: "Done",
};

const timeOf = (timestamp: string): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function AttentionBadge({ attention }: { readonly attention: AttentionKind }): ReactElement {
  return (
    <span className={`attl attl-${attention}`}>
      <i className={`att att-${attention}`} />
      {ATTENTION_LABEL[attention]}
    </span>
  );
}

export function BoardStatus({
  board,
  isRefreshing,
}: {
  readonly board: SprintBoardDTO | null;
  readonly isRefreshing: boolean;
}): ReactElement {
  if (isRefreshing) {
    return <span className="rstat">Refreshing…</span>;
  }
  if (board?.fetchedAt === null || board === null) {
    return <span className="rstat">Not loaded yet</span>;
  }
  return (
    <span className="rstat">
      {board.source === "cache" ? "From cache" : "Refreshed"} · {timeOf(board.fetchedAt)}
    </span>
  );
}

export function TicketRefreshStatus({
  card,
  columnNames,
  scan,
}: {
  readonly card: TicketCardDTO | null;
  readonly columnNames: readonly string[];
  readonly scan: RefreshProgressDTO | null;
}): ReactElement {
  if (scan !== null) {
    return (
      <span className="rstat">
        Checking <b>{scan.columnName}</b> · {scan.levelTitles.join(" ∥ ")}…
      </span>
    );
  }
  const flow = card?.flow ?? null;
  if (flow === null) {
    return <span className="rstat">Not checked yet</span>;
  }
  const stoppedAt = flow.stoppedAtColumn === null ? null : (columnNames[flow.stoppedAtColumn] ?? null);
  const currentColumn = card?.columnIndex === null || card === null ? null : (columnNames[card.columnIndex] ?? null);
  const where = stoppedAt === null ? `Checked through ${currentColumn ?? "the board"}` : `Stopped at ${stoppedAt}`;
  return (
    <span className="rstat">
      {where} · {timeOf(flow.refreshedAt)}
    </span>
  );
}

export function FailureBanner({ board }: { readonly board: SprintBoardDTO | null }): ReactElement | null {
  if (board === null || (board.failure === null && board.codeHostFailure === null)) {
    return null;
  }
  return (
    <div className="banner">
      {board.failure !== null && <div>Jira: {board.failure}</div>}
      {board.codeHostFailure !== null && <div>GitHub: {board.codeHostFailure}</div>}
    </div>
  );
}

export function LiveStatus({ board }: { readonly board: SprintBoardDTO | null }): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const jira = board?.failure ?? null;
  const github = board?.codeHostFailure ?? null;
  const hasProblem = jira !== null || github !== null;
  return (
    <span className="live-wrap">
      <button
        type="button"
        className="live"
        onClick={() => {
          setIsOpen(!isOpen);
        }}
      >
        <span className={`live-dot ${hasProblem ? "warn" : ""}`} />
        Live
      </button>
      {isOpen && (
        <div className="live-pop">
          <div className="live-row">
            <i className={`att ${jira === null ? "att-done" : "att-needs_you"}`} />
            Jira {jira === null ? "· connected" : `· ${jira}`}
          </div>
          <div className="live-row">
            <i className={`att ${github === null ? "att-done" : "att-needs_you"}`} />
            GitHub {github === null ? "· connected" : `· ${github}`}
          </div>
          <div className="live-row">
            <i className="att att-agent_working" />
            Claude Code · one session per ticket
          </div>
        </div>
      )}
    </span>
  );
}
