import { type ReactElement, useState } from "react";

import { ConfirmButton } from "@/cockpit/entrypoints/ui/confirm_button";
import type { ThreadViewDTO } from "@/cockpit/models/block_state";
import type { ChangeActionDTO } from "@/cockpit/models/change_action";

export interface ThreadReplyProps {
  readonly thread: ThreadViewDTO;
  readonly onRunAction: (action: ChangeActionDTO) => Promise<string | null>;
  readonly onDone: () => void;
}

export function ThreadReply({ thread, onRunAction, onDone }: ThreadReplyProps): ReactElement {
  const [replyText, setReplyText] = useState("");
  const [shouldResolve, setShouldResolve] = useState(true);
  return (
    <div className="thread">
      <div className="thread-head">
        {thread.location} · <b>{thread.lastAuthorLogin}</b>
      </div>
      <div className="quote">{thread.lastCommentBody}</div>
      <textarea
        className="reply"
        placeholder="Your reply…"
        value={replyText}
        onChange={(event) => {
          setReplyText(event.target.value);
        }}
      />
      <label className="resolve">
        <input
          type="checkbox"
          checked={shouldResolve}
          onChange={(event) => {
            setShouldResolve(event.target.checked);
          }}
        />
        Resolve the thread after replying
      </label>
      <ConfirmButton
        label="Reply"
        confirmation={`Post this reply on ${thread.location}${shouldResolve ? " and resolve the thread" : ""}?`}
        isDisabled={replyText.trim() === ""}
        onConfirm={() => onRunAction({ kind: "reply", threadId: thread.threadId, replyText, shouldResolve })}
        onDone={onDone}
      />
    </div>
  );
}
