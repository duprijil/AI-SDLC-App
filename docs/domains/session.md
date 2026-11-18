# session

Normal domain. Runs exactly one AI agent session per ticket: the real tool (Claude Code) in a PTY, in the ticket's workspace, observed through its hooks.

## Language

| Term | Meaning |
|---|---|
| Agent session | One running agent for one ticket, identified by a UUID that is also the tool's own session id (`claude --session-id`) |
| Workspace | `<AGENT_WORKSPACE_ROOT>/<TICKET>/`, the session's working folder. It holds one git worktree per repo and the context file `CLAUDE.md` |
| Session record | A ticket's session in `cache.sqlite` (`sessions`): session id, workspace, started, ended. The newest one per ticket counts |
| Resume | Starting `claude --resume <id>` for the newest record that hasn't ended, when Claude Code still has its transcript (`~/.claude/projects/<workspace path, non-alphanumerics as ->/<id>.jsonl`) |
| Checkpoint | A tick on a `prompt` block: done or reopened, with an optional note (`checkpoints` table). The newest one per ticket and block counts |
| Workspace preparation | The hook the app runs before a ticket's session starts (worktrees, context). It returns notes that are shown in the terminal |
| Session status | `starting` → `idle` / `working` / `waiting` → `ended`, derived from hook events |
| Hook event | A tool lifecycle callback (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SessionEnd`) posted to the app |
| Hook endpoint | The app's loopback URL and per-run token that the hooks post to |
| Agent prompt | Text the app types into the session as one bracketed paste, followed by Enter |
| Session bridge | The typed contract the renderer uses to talk to the session over IPC. Output and exit events carry the ticket key, so each terminal shows only its own session |

## Responsibilities

- Start the agent in the ticket's workspace, or re-attach to the running one, replaying its recent output. Several tickets can have running sessions at once.
- Before a new session starts, run the workspace preparation (at most once at a time per ticket, at most 60 s), and write its notes into the terminal.
- Write plain files into a ticket's workspace (mode 600), for the context file.
- Resume the ticket's last session after an app restart. If the resume exits with an error within 5 s, start a new session once and say so in the terminal.
- End a ticket's session on request (it reached Done): kill its PTY and mark the record ended. Quitting the app never ends records.
- Store and read prompt block checkpoints.
- Pass keystrokes and terminal resizes through to the PTY untouched.
- Type prompts as bracketed pastes, so multi-line prompts arrive as one prompt.
- Write per-session hook settings (`--settings <file>`, mode 600) that post every hook event to the hook endpoint.
- Turn hook events into the session status.
- Stop every session when the app quits.

## Invariants

- At most one active session per ticket.
- A session id is a UUID, and a ticket key looks like `ABC-123`.
- An ended session never changes status again.
- The hook endpoint listens on `127.0.0.1` only, and rejects requests without the run's token.
- A prompt is never empty, and never contains the bracketed paste terminator.
- A workspace file is a plain file name inside the workspace, never a path.
- A failed or slow preparation never stops the session from starting.
- If the session records can't be read or written, sessions start fresh, as if there were no record.

## Tool-specific code

Everything Claude Code-specific lives in two adapters: `agent_cli_claude_code` (launch arguments) and `hook_settings_claude_code` (the hooks JSON). Another tool means two new adapters behind the same ports.
