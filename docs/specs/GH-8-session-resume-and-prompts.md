# Resume sessions, edit prompts, and run prompts from the pipeline (M4, part 2)

**Ticket:** GH-8
**Status:** Implemented
**Domains:** session, pipeline, cockpit

## Context

GH-7 gives each ticket's Claude Code session its worktrees and context. Three gaps remain from milestone M4 of [v1-scope.md](v1-scope.md) §6.4 and §4:

- **Sessions are lost on restart.** Quitting the app ends every Claude Code session, and reopening a ticket starts a new conversation, so Claude forgets what it did.
- **Prompts can't be edited.** The built-in prompts live in code (`change_prompt.ts`), so the developer can't adapt them to a project.
- **The pipeline can't send prompts.**
  - `pipeline.yaml` can't say "on this state, send this prompt".
  - A gate can't send the next column's first prompt after a move.
  - `prompt` blocks never finish.

The `sdlc` MCP server and the permission policy are the next M4 ticket. Until then, a `prompt` block is finished by the developer's own tick.

## User story

**As a** developer who works on a ticket over several days
**I want** the ticket's Claude Code conversation to survive app restarts, and the prompts the app sends to be mine to edit and wire into the pipeline
**So that** Claude keeps its context, and each step of my flow starts the right prompt in one click

## Acceptance criteria

### Session resume

- [ ] The app records each ticket's session (ticket key, session id, workspace, started, ended) in `<APP_DATA_ROOT>/cache.sqlite`.
- [ ] Opening a ticket whose last session hasn't ended runs `claude --resume <session id>` in its workspace, so the conversation continues. It doesn't start a new session.
- [ ] If Claude Code has no transcript for that session id, or the resume exits with an error within 5 s, the app starts a new session. It tells the developer in the terminal ("Couldn't resume the last session; started a new one") and records the new id.
- [ ] The workspace preparation from GH-7 still runs before a resumed session, so `CLAUDE.md` is fresh.
- [ ] When a ticket reaches the board's last column (moved from the app, or first seen there in a Refresh all), its running session is stopped and recorded as ended. The transcript is kept. Opening the ticket again starts a new session.
- [ ] Quitting the app stops the PTYs as today, but doesn't mark the sessions as ended.

### Editable prompts

- [ ] Prompts are Markdown templates in `projects/<name>/prompts/`. The app ships the current built-in prompts as defaults:
  - `build-ticket.md`
  - `fix-ci.md`
  - `resolve-conflict.md`
  - `address-review-feedback.md`
  - `diagnose-deploy-failure.md`
- [ ] **↓ Write default prompts** in the ● Live popover writes any default that's missing, and never overwrites a file.
- [ ] A template uses `{{placeholder}}` values:

  | Placeholder | Value |
  |---|---|
  | `{{ticket.key}}`, `{{ticket.title}}`, `{{ticket.url}}` | the ticket |
  | `{{ticket.description}}`, `{{ticket.comments}}` | from Jira, as in `CLAUDE.md` |
  | `{{repos}}` | the repo lines from the workspace (folder, branch, base, PR) |
  | `{{change.url}}`, `{{change.repo}}`, `{{change.branch}}`, `{{change.folder}}` | the block's PR, when there is one |
  | `{{threads}}` | the open review threads waiting for a reply |
  | `{{runs}}` | the failed deploy runs |

- [ ] An unknown placeholder, or a change placeholder used where the block has no PR, is a load problem shown in the startup dialog (for templates referenced by `pipeline.yaml`), or in the popover (for templates sent by hand).
- [ ] A template is read when it's sent, so an edit applies without a restart.

### Prompts in the pipeline

- [ ] A `change` or `deploy` block can map its states to prompts, as in v1-scope §4:

  ```yaml
  - each_change: { id: merged, type: change, done_when: change.merged,
                   actions: { conflict: [ { session: prompts/resolve-conflict.md } ],
                              feedback: [ { session: prompts/address-review-feedback.md } ] } }
  ```

  The popover's **▶** button sends that template instead of the default one. A state with no mapping keeps the default.
- [ ] A gate can have `then: [ { session: prompts/<file>.md } ]`, and an open tracker block can have `actions: { open: [ { session: prompts/<file>.md } ] }`. After its move succeeds, the app opens the ticket in the Cockpit and sends those prompts in order, each one once the session is idle.
- [ ] Other action names (`open(...)`, `code.merge`, …) are accepted and ignored for now. The popover keeps its built-in buttons for them.
- [ ] A `prompt` block (`type: prompt`, `prompt: prompts/<file>.md`) shows **open** until it's ticked, then **done**. Its popover offers:
  - **▶ Send to Claude Code**;
  - **Mark done**, behind a confirm, with an optional note;
  - **Reopen**, once it's done.

  Open prompt blocks make the ticket "Needs you".
- [ ] `pipeline.yaml` is checked on load: every referenced prompt file exists, `actions` keys are states the block type can have, and a `prompt` block has `prompt`. A `done_when` of `session.checkpoint(...)` is accepted, and means "ticked" until the MCP server lands.

### Configuration

- [ ] No new secrets or config values. `projects/<name>/prompts/` is optional: without it, the built-in defaults are used.
- [ ] `make check` passes.

## Out of scope

- The `sdlc` MCP server (`get_context`, `draft`, `checkpoint`, `code_comment`, `merge`) and `.claude/settings.json` permissions (the next M4 ticket). Then `sdlc.checkpoint` will tick prompt blocks too.
- `harness/claude-code.yaml` (`launch`, `resume`, `inject`). The launch and resume commands stay in the Claude Code adapter.
- Asking whether to queue or interrupt when the session is working (v1-scope §6.4). Prompts wait for idle, as today.
- `code.merge_all` and other gate actions.
- Removing worktrees at Done.

## Technical aspects

### Flow

**Start or resume** (`session_ipc` `session:start`):
- `StartAgentSession` reads the ticket's last record from the `SessionRecordPort` (`session_record_sqlite`).
- **Not ended, and `AgentTranscriptPort` reports the transcript:** it launches `claude --resume <id> --settings <file>`. The transcript is `~/.claude/projects/<workspace path with every non-alphanumeric character turned into ->/<id>.jsonl`, checked by `agent_transcript_claude_code`.
- **Otherwise:** it launches `claude --session-id <new id>`, as today.
- If a resumed PTY exits with a non-zero code within 5 s, the use case starts a new session once, and writes the note into the terminal.

**End at Done** (cockpit):
- After a status move, and after each refresh, `EndFinishedSessions` asks the session domain to stop and end the sessions of tickets in the last column (`EndTicketSession`).

**Prompt templates** (pipeline + cockpit):
- `PromptTemplateSource` (pipeline, `prompt_template_files` adapter) lists and reads `projects/<name>/prompts/*.md`, and writes the defaults.
- `PromptTemplate` (pipeline model) parses placeholders.
- `RenderPrompt` (cockpit) fills them from the workspace brief (GH-7), the block's PR, threads and runs.
- `BuildChangePrompt` becomes `RenderBlockPrompt`: block state → the template from `actions`, or the default template → text.

**After a move:**
- `RunStatusMove` returns the gate's `then` (or the tracker block's `open`) template names.
- The renderer renders each one through `RenderBlockPrompt` and queues it in the existing prompt hand-off, one after another.

**Prompt block checkpoints:**
- A `checkpoints` table (session domain): ticket, block id, note, ticked at, reopened at.
- `RecordCheckpoint` and `FindCheckpoint` use cases.
- The `sdlc.checkpoint` tool of the next ticket writes to the same table.

### Files

| File | Change |
|---|---|
| `src/session/models/session_record.ts`, `checkpoint.ts` | new |
| `src/session/adapters/session_record_port.ts`, `session_record_sqlite.ts`, `checkpoint_store_port.ts`, `checkpoint_store_sqlite.ts` | new |
| `src/session/adapters/agent_transcript_port.ts`, `agent_transcript_claude_code.ts` | new: does a transcript exist |
| `src/session/adapters/agent_cli_port.ts`, `agent_cli_claude_code.ts` | a resume command |
| `src/session/use_cases/start_agent_session.ts`, new `end_ticket_session.ts`, `record_checkpoint.ts`, `find_checkpoint.ts` | resume, fallback, end, checkpoints |
| `src/pipeline/models/pipeline.ts`, `adapters/project_source_yaml.ts` | `actions` per state, `gate.then`, `prompt` blocks, `session.checkpoint` |
| `src/pipeline/models/prompt_template.ts`, `adapters/prompt_template_port.ts`, `prompt_template_files.ts`, `use_cases/read_prompt_template.ts`, `write_default_prompts.ts` | new |
| `src/cockpit/models/change_prompt.ts`, `use_cases/build_change_prompt.ts` | removed: replaced by templates |
| `src/cockpit/models/prompt_request.ts`, `prompt_values.ts`, `checkpoint_action.ts` | new: the prompt request, the placeholder values, the checkpoint request |
| `src/pipeline/models/default_prompts.ts` | new: the five defaults, in code instead of `resources/` so the main bundle needs no file loader |
| `src/cockpit/entrypoints/ui/checkpoint_form.tsx` | new: Mark done with a note, and Reopen |
| `src/cockpit/models/block_state.ts`, `ticket_flow.ts` | prompt block states, gate and tracker prompts |
| `src/cockpit/use_cases/render_block_prompt.ts`, `end_finished_sessions.ts`, `run_status_move.ts`, `refresh_ticket_flows.ts` | templates, end at Done, prompts after a move, prompt blocks |
| `src/cockpit/entrypoints/api/cockpit_ipc.ts`, `cockpit_payload.ts`, `models/sprint_board_bridge.ts`, `ui/cockpit_preload.ts` | channels `prompt:render`, `prompt:checkpoint`, `prompts:write-defaults` |
| `src/cockpit/entrypoints/ui/block_popover.tsx`, `cockpit_root.tsx`, `board_status.tsx` | template prompts, the prompt queue, prompt blocks, the write-defaults button |
| `docs/domains/session.md`, `pipeline.md`, `cockpit.md` | updated |

### Failure handling

- **No transcript, or the resume fails fast:** a new session, with a note in the terminal.
- **A template is missing or has an unknown placeholder when it's sent:** the popover shows the problem and doesn't send. Templates referenced by `pipeline.yaml` are also checked at startup.
- **The session store can't be used:** sessions start fresh, as before GH-8, and ● Live names the problem.
- **A prompt after a move can't be delivered within 60 s:** it's kept with **Copy**, as today. The next prompts in the queue wait.

### Decisions

- **Resume only when the transcript exists.** Otherwise `claude --resume` fails with an unknown session.
- **End at Done, not at quit.** Quitting is routine, so resuming must be the default. Done is where v1-scope ends a session.
- **Templates are files the developer owns, and the app never overwrites them.** Defaults are written only on request.
- **Prompt blocks are ticked by hand until the MCP server lands.** The same table takes `sdlc.checkpoint` later, so nothing changes for the pipeline.
- **Unknown action names are ignored, not refused.** `pipeline.yaml` can already describe the v1 actions before each one is built.
- **A refresh ends a session only the first time it sees the ticket in the last column** (changed during implementation). Otherwise every refresh would stop the new session of a reopened Done ticket.
- **▶ sends every template mapped to the state, in order** (changed during implementation), using the same queue as the prompts after a move.
- **A shared SQLite helper in the session domain** (`sqlite_database.ts`) opens `cache.sqlite` for the sessions and checkpoints tables.

## What to test

1. Open KAN-2, ask Claude something, quit the app, and start it again. Opening KAN-2 should resume the same conversation.
2. Delete KAN-2's transcript under `~/.claude/projects/`, then open KAN-2. It should start fresh, with a note.
3. Click **↓ Write default prompts**. The five files should appear in `projects/AI-SDLC-APP/prompts/`, and clicking again should overwrite nothing.
4. Edit `build-ticket.md`, then click **▶ Build the ticket**. Your edit should be sent, without a restart.
5. Add `actions: { open: [ { session: prompts/build-ticket.md } ] }` to the To Do tracker block. Moving KAN-1 to In Progress should open the Cockpit and send the build prompt.
6. Add a `prompt` block ("Note to PM") to In Progress. It should block the column until you click **Mark done**, and **Reopen** should open it again.
7. Move a ticket to Done. Its session should stop, and opening it again should start a new one.
8. Put `{{nope}}` in a template referenced by `pipeline.yaml`. The startup dialog should name the file and the placeholder.
