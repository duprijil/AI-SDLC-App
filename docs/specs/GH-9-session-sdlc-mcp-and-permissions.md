# Let Claude Code act through the app: the `sdlc` MCP tools and permissions (M4, part 3)

**Ticket:** GH-9
**Status:** Implemented
**Domains:** session, change, pipeline, cockpit

## Context

After GH-7 and GH-8, a ticket's Claude Code session has its worktrees, its context and editable prompts. But it reaches the outside world only through its own tools: it can run `gh pr merge` or post a PR comment with nobody noticing. It also can't read the pipeline's state, or tell the app that a step is done.

This is the last part of milestone M4 of [v1-scope.md](v1-scope.md) §6.4, and it closes v1 "done when" item 5: Claude Code can do outward actions **only** through the app's `sdlc` MCP tools, and each one goes through Claude Code's own permission prompt.

## User story

**As a** developer who lets Claude Code work on a ticket
**I want** Claude to read the ticket's live state from the app, hand back drafts and checkpoints, and post or merge only with my approval
**So that** the agent does the legwork while every outward action stays mine, whether I approve it in the terminal or on the graph

## Acceptance criteria

### The `sdlc` tools

- [ ] Every ticket session gets an MCP server named `sdlc`, served by the app. Its tools always act on that session's ticket:

  | Tool | Permission | Does |
  |---|---|---|
  | `get_context()` | allow | the ticket (details as in `CLAUDE.md`), its PRs (state, checks, open threads with their ids), the last block states per column, the deployments (repo, env, deployed commit), the worktrees, and the drafts |
  | `draft(kind, target, text)` | allow | stores a draft. `kind` is `thread_reply` (target: a review thread id) or `note` (target: a `prompt` block id). The matching block shows **drafted** |
  | `checkpoint(kind, summary)` | allow | marks done every `prompt` block whose `done_when` is `session.checkpoint(<kind>)`, with the summary as its note |
  | `code_comment(repo, number, thread_id, body, resolve)` | **ask** | posts a reply to a review thread of one of the ticket's PRs, optionally resolving it (the same code path as the popover) |
  | `merge(repo, number)` | **ask** | merges one of the ticket's PRs after the live re-check of M2 |

- [ ] A tool call naming a PR, thread or block that doesn't belong to the session's ticket is refused with a clear error, and nothing happens.
- [ ] The tools have no `tracker_move`. Moving the status stays the developer's click.
- [ ] After `draft`, `checkpoint`, `code_comment` or `merge`, the app refreshes that ticket, so the graph shows the result.

### Permissions

- [ ] The session's settings (the `--settings` file the app already writes per session) add:
  - **ask:** `mcp__sdlc__code_comment`, `mcp__sdlc__merge`
  - **allow:** `mcp__sdlc__get_context`, `mcp__sdlc__draft`, `mcp__sdlc__checkpoint`
  - **deny:** `Bash(gh pr merge:*)`, `Bash(gh pr comment:*)`, `Bash(gh pr review:*)`, `Bash(gh api:*)`
- [ ] Claude Code's own permission prompt in the terminal is the approval for `code_comment` and `merge`. If the developer refuses, nothing is posted or merged.
- [ ] The developer's own Claude Code settings and MCP servers keep working. The app adds to them and changes nothing outside its session files.

### Drafts on the graph

- [ ] A change block in **feedback** whose thread has a `thread_reply` draft shows **drafted**. Its popover pre-fills that thread's reply box with the draft, which the developer can edit, then post (behind the confirm, as in M2).
- [ ] A `prompt` block with a `note` draft shows the note in its popover, with **Copy**.
- [ ] Posting a drafted reply, from the popover or through `code_comment`, marks the draft as used.
- [ ] Drafted counts as "Needs you" in the attention rules.

### Context and prompts

- [ ] `CLAUDE.md` (GH-7) and the default prompts say how to use the tools:
  - use `get_context` for the live state;
  - hand back replies with `draft` instead of posting them;
  - call `checkpoint` when a pipeline step is done;
  - `code_comment` and `merge` need the developer's approval.

### Configuration

- [ ] No new secrets. `pipeline.yaml` accepts `done_when: session.checkpoint(<kind>)` on `prompt` blocks, where `<kind>` is snake_case, and checks it on load.
- [ ] `make check` passes.

## Out of scope

- Mirroring a pending terminal permission prompt onto the graph (v1.1, v1-scope §6.4).
- `harness/claude-code.yaml` as a config file. The tool policy stays in the Claude Code adapters.
- Moving the status from the agent (denied in v1), posting Jira comments, `code.merge_all`.
- Other agent tools (Codex, …).

## Technical aspects

### Flow

**Serving the tools:**
- The hook server from M0 (`127.0.0.1`, random port) gains a `/mcp` route that speaks MCP's Streamable HTTP transport, through the official `@modelcontextprotocol/sdk` (a new dependency).
- Each session gets its own token, and its MCP config is written next to its hook settings (`<AGENT_SETTINGS_ROOT>/<session id>.mcp.json`, mode 600). The config holds `{ "mcpServers": { "sdlc": { "type": "http", "url": "http://127.0.0.1:<port>/mcp", "headers": { "x-cockpit-token": "…" } } } }`, and Claude is launched with `--mcp-config <that file>`.
- The token identifies the session, and the session gives the ticket. A request without a known token gets 401.

**Reaching the cockpit:**
- The session domain defines an `AgentActionsPort` (`context`, `draft`, `checkpoint`, `comment`, `merge`, each with a ticket key). The cockpit implements it (`agent_actions_cockpit`) and hands it to the session IPC at startup, so `session` never imports `cockpit` (v1-scope §3).
- `comment` and `merge` reuse `RunChangeAction`. They check first that the PR or thread belongs to the ticket's changes.
- `checkpoint` writes the GH-8 `checkpoints` table for the matching blocks.
- `draft` writes a new `drafts` table (session domain): ticket, kind, target, text, created, used.

**Settings:** `hook_settings_claude_code` writes the `permissions` lists into the same per-session settings file as the hooks.

### Files

| File | Change |
|---|---|
| `package.json` | add `@modelcontextprotocol/sdk` |
| `src/session/models/agent_tool.ts`, `draft.ts` | new: the tool names, the permission policy, drafts |
| `src/session/adapters/agent_actions_port.ts` | new: the port the cockpit implements |
| `src/session/adapters/draft_store_port.ts`, `draft_store_sqlite.ts` | new |
| `src/session/adapters/hook_settings_claude_code.ts`, `agent_cli_claude_code.ts`, new `mcp_config_claude_code.ts` | permissions, `--mcp-config` |
| `src/session/entrypoints/api/hook_server.ts`, new `sdlc_mcp_server.ts` | the `/mcp` route and the tools |
| `src/session/use_cases/record_draft.ts`, `find_drafts.ts`, `use_draft.ts` | new |
| `src/pipeline/models/pipeline.ts`, `adapters/project_source_yaml.ts` | the checkpoint kind on `prompt` blocks |
| `src/cockpit/entrypoints/api/agent_actions_cockpit.ts` | new: implements the port with the cockpit's use cases (an entrypoint, because adapters may not call use cases) |
| `src/cockpit/models/agent_context.ts` | new: the `get_context` answer and the "belongs to this ticket" checks |
| `src/session/adapters/agent_token_port.ts`, `agent_token_memory.ts`, `mcp_config_port.ts`, `use_cases/resolve_agent_ticket.ts` | new: per-session tokens and their MCP config |
| `src/cockpit/models/block_state.ts`, `attention.ts`, `workspace_brief.ts`, `src/pipeline/models/default_prompts.ts` | drafted state, attention, tool hints |
| `src/cockpit/entrypoints/ui/thread_reply.tsx`, `block_popover.tsx`, `desktop_app.ts` | pre-filled replies, notes, wiring |
| `docs/domains/session.md`, `cockpit.md`, `pipeline.md`, `AGENTS.md` | updated |

### Failure handling

- **Unknown token:** 401, and the call fails in Claude Code.
- **A PR, thread or block of another ticket:** a tool error naming what isn't the ticket's.
- **GitHub refuses a comment or merge**, or the live re-check fails: the tool returns the reason (as the popover does), and nothing changes.
- **The developer denies the permission prompt:** Claude Code never calls the tool, so the app does nothing.
- **The app quits while Claude is running:** the MCP server is gone, so tool calls fail until the session resumes in the next app run, with a new port and token.

### Decisions

- **HTTP on the existing loopback server, not a stdio bridge process.** It needs no extra executable, uses the same token scheme as the hooks, and Claude Code supports HTTP MCP servers.
- **The official MCP SDK instead of hand-written JSON-RPC**, for protocol correctness. It's the only new dependency.
- **Tools are bound to the session's ticket.** An agent can't act on another ticket, even by naming it.
- **Deny the `gh` commands that post or merge**, so the `sdlc` tools are the only outward path. `gh` stays usable for reading (`gh pr view`, `gh run view`).
- **The agent actions live in the cockpit's `entrypoints/api`** (changed during implementation), because the architecture rules don't let an adapter call use cases.
- **`get_context` answers from the last refresh and the workspace brief**, so it makes no GitHub or Jira calls. `code_comment` and `merge` refresh the ticket first, then check the PR and thread against fresh data.
- **Permissions go in the per-session `--settings` file**, not in `.claude/settings.json` in the workspace. That file is written fresh at every start, and the developer's own settings stay untouched.

## What to test

1. Open KAN-2 and ask Claude "what's the state of this ticket?". It should call `sdlc.get_context` without a prompt, and answer from the app's data.
2. With a KAN-2 PR in feedback, ask Claude to draft replies. The block should show **drafted**, and the popover's reply box should hold the draft.
3. Ask Claude to post the reply. Claude Code should ask permission for `mcp__sdlc__code_comment`. Deny it: nothing is posted. Allow it: the reply appears on GitHub, and the block refreshes.
4. Ask Claude to merge an approved PR. Expect the permission prompt, then the merge, after the live re-check.
5. Ask Claude to run `gh pr merge` directly. Claude Code should refuse it (denied).
6. Add a `prompt` block with `done_when: session.checkpoint(pm_note)`, and ask Claude to write the PM note and checkpoint it. The block should turn **done**, with the summary as its note, and the note draft should appear in its popover.
7. Ask Claude to merge a PR of another ticket by number. The tool should refuse.
