# Give each ticket's Claude Code session its repos and context (M4, part 1)

**Ticket:** GH-7
**Status:** Implemented
**Domains:** session, ticket, delivery, pipeline, cockpit

## Context

A ticket's Claude Code session starts in an empty folder, `~/.ticket-cockpit/workspaces/<KEY>/`. The built-in prompts only carry the ticket key and title. So "▶ Build the ticket" asks Claude to build something it can't see, in a folder without code, with no idea where the repos are or how the project works. The engineer hit this on KAN-1 and KAN-2.

This ticket brings part of milestone M4 of [v1-scope.md](v1-scope.md) §6.4 forward (the engineer's choice, 2026-11-18):
- **Worktrees:** one git worktree per repo inside the ticket's workspace.
- **Context file:** a `CLAUDE.md` with the ticket and the repos, written before the session starts.
- **Prompts:** built-in prompts that include the ticket's text.

The `sdlc` MCP server, permissions, `prompt` blocks and editable prompt templates stay in M4.

## User story

**As a** developer who sends "▶ Build the ticket" to Claude Code
**I want** the session to start next to the ticket's code, knowing the ticket's description and the project's conventions
**So that** Claude can do the work without me pasting the ticket, the repo paths and the rules by hand

## Acceptance criteria

### Workspace and worktrees

- [ ] Before a ticket's session starts (not when re-attaching to a running one), the app prepares `<AGENT_WORKSPACE_ROOT>/<KEY>/`. It holds one folder per repo in `project.yaml` that has a `path`, and each folder is a git worktree of that checkout.
- [ ] A repo's worktree is on the ticket's branch:
  - **The ticket has an open PR in that repo:** the PR's branch (newest PR first).
  - **Otherwise:** a new branch named by `code.branch` (default `feat/{key}-{slug}`, for example `feat/KAN-2-add-a-main-py-entry-point`), created from `origin/<default branch>`.
- [ ] An existing worktree folder is reused as it is. The app never resets, checks out or deletes anything in it.
- [ ] If the branch is already checked out in the developer's main checkout, or `git worktree add` fails, that repo is skipped. The reason appears in `CLAUDE.md` and as a line in the terminal before Claude starts.
- [ ] `git fetch` runs once per repo before the worktrees are created. If it fails, the app goes on with the refs it has.

### Context file

- [ ] The app writes `<workspace>/CLAUDE.md` before every session start, replacing the earlier one. It sits outside the worktrees, so it's never committed. It holds:
  - **The ticket:** key, title, Jira status, link, the description as plain text, and the last 10 comments (author, date, text).
  - **The repos:** for each one, the worktree folder, the GitHub repository, the branch, the base branch, and the open PR link if there is one. Skipped repos are listed with the reason.
  - **The conventions:**
    - commit messages and PR titles start with the ticket key;
    - push the ticket branch and open the PR against the base branch;
    - don't move the Jira status, because the developer does that from the app;
    - don't merge PRs.
  - **What the app does:** it reads Jira and GitHub and shows the pipeline. Claude has no Jira access, so if something is missing, it asks the developer.
- [ ] If Jira can't be read, `CLAUDE.md` still gets the key, the title from the board, and a line saying the description couldn't be loaded.

### Prompts

- [ ] **▶ Build the ticket** includes the ticket's description and the list of repo folders and branches. The other built-in prompts (fix CI, resolve conflict, address feedback, diagnose deploy) include the worktree folder of their PR's repo.
- [ ] Every prompt ends with "Your workspace's CLAUDE.md has the full ticket and the conventions."

### Configuration

- [ ] `project.yaml` gains `code.branch`, optional, with the placeholders `{key}` and `{slug}` (the title in lower case, words joined with `-`, at most 40 characters). It must contain `{key}`, so the branch always links to the ticket.
- [ ] `make check` passes.

## Out of scope

- The `sdlc` MCP server and `get_context` (M4). In this ticket, context reaches Claude only through `CLAUDE.md` and the prompt.
- `.claude/settings.json` permissions, the `ask`/`deny` lists, and `guardrails.md` from the harness file (M4).
- Editable prompt templates in `projects/<name>/prompts/` (M4).
- Removing worktrees when a ticket reaches Done.
- Posting Jira comments, or opening PRs from the app.

## Technical aspects

### Flow

**Session start** (renderer → `session_ipc` `session:start`):
- `registerSessionIpc` gains a `prepareWorkspace(ticketKey)` option. `desktop_app` wires it to the cockpit's `PrepareTicketWorkspace` use case, so `session` never imports `cockpit`. It runs only when no session is running for the ticket.
- The handler becomes async: it waits for the preparation (at most 60 s), writes the preparation notes into the terminal, then starts Claude as today.

**`PrepareTicketWorkspace`** (cockpit):
1. In parallel, read the ticket's details from Jira (`ticket` domain, `FetchTicketDetails`) and the ticket's changes (`change` domain, from the cached listing or a fresh one).
2. Ask the `session` domain for the workspace path (`WorkspacePort.prepare`, as today).
3. For each repo with a `path`, ask the `delivery` domain's `PrepareWorktree` use case to fetch, then add or reuse `<workspace>/<repo name>` on the chosen branch.
4. Render the context with the `WorkspaceBrief` model (cockpit), and write it through the `session` domain's `WriteWorkspaceFile` use case.

**Prompts:** `BuildChangePrompt` gains the ticket details and the workspace's repo lines, read from the last `WorkspaceBrief` of that ticket (kept in memory per app run), or prepared on demand. The open PR's branch is used only when the ticket has an open PR in that repo; otherwise a new branch from `code.branch` starts from `origin/<default branch>` without upstream, so the first push sets it (`git push -u`).

### Jira calls (`tracker_jira` adapter)

| Call | Used for |
|---|---|
| `GET /rest/api/3/issue/{key}?fields=summary,status,description,comment` | the details: description and comments come as Atlassian Document Format and are flattened to plain text (paragraphs, headings, lists, code blocks, mentions and links) |

### Git commands (`git_cli` adapter, delivery)

| Command | Used for |
|---|---|
| `git -C <path> fetch --quiet origin` | fresh refs, once per repo per preparation |
| `git -C <path> symbolic-ref --short refs/remotes/origin/HEAD` | the default branch (falls back to `main`) |
| `git -C <path> worktree list --porcelain` | whether the folder is already a worktree, and which branches are checked out where |
| `git -C <path> worktree add <folder> <branch>` | a worktree for an existing branch (a local branch, or one created to track `origin/<branch>`) |
| `git -C <path> worktree add -b <branch> <folder> origin/<default>` | a worktree on a new ticket branch |

Every branch name is checked with `git check-ref-format --branch` first, and git runs through `execFile`.

### Files

| File | Change |
|---|---|
| `src/pipeline/models/project.ts`, `adapters/project_source_yaml.ts` | `code.branch` with its validation |
| `src/ticket/models/ticket_details.ts`, `models/rich_text.ts` | new: details (description, comments) and the ADF flattening |
| `src/ticket/adapters/tracker_port.ts`, `tracker_jira.ts`, `use_cases/fetch_ticket_details.ts` | the details call |
| `src/delivery/models/worktree.ts`, `adapters/git_port.ts`, `git_cli.ts`, `use_cases/prepare_worktree.ts` | worktree list, add, default branch |
| `src/session/models/workspace_file.ts`, `adapters/workspace_port.ts`, `workspace_folder.ts`, `use_cases/write_workspace_file.ts`, `open_workspace.ts` | write a file in the workspace (no paths outside it) |
| `src/session/entrypoints/api/session_ipc.ts` | the `prepareWorkspace` hook, notes in the terminal |
| `src/cockpit/models/workspace_brief.ts`, `branch_name.ts`, `change_prompt.ts` | the `CLAUDE.md` content, the branch name rule, prompts with context |
| `src/cockpit/use_cases/prepare_ticket_workspace.ts`, `build_change_prompt.ts` | new, and prompts with context |
| `src/cockpit/adapters/brief_store_port.ts`, `brief_store_memory.ts` | new: the last brief per ticket, for the prompts |
| `src/cockpit/entrypoints/container.ts`, `ui/desktop_app.ts` | wiring |
| `docs/domains/session.md`, `ticket.md`, `delivery.md`, `cockpit.md`, `pipeline.md` | updated |

### Failure handling

- **Jira fails:** `CLAUDE.md` gets the board's title and a "description couldn't be loaded: <reason>" line. The session still starts.
- **GitHub fails:** worktrees use the `code.branch` rule instead of the PR branches, and `CLAUDE.md` says why.
- **A worktree can't be created** (branch checked out elsewhere, dirty conflict, missing checkout): that repo is skipped and the reason is shown. The others go on.
- **Preparation takes over 60 s:** the session starts with what's ready, and a note says so.

### Decisions

- **Worktrees now, the rest of M4 later** (the engineer's choice). Without them, two tickets would fight over one checkout and its branch.
- **One worktree per configured repo, not only the repos the ticket already touches.** A ticket with no PR yet has to start somewhere, and the project's repos are few.
- **`CLAUDE.md` in the workspace root, outside the worktrees.** Claude Code reads it from the working folder, and it never ends up in a commit.
- **The context is rewritten at every session start**, so a restarted session sees the current ticket text. A running session isn't disturbed.
- **Never steal a branch** (v1-scope §6.4): if it's checked out in the main checkout, the repo is skipped with an explanation.

## What to test

1. Open KAN-2 in the Cockpit for the first time. `~/.ticket-cockpit/workspaces/KAN-2/` should hold `CLAUDE.md` and `AI-SDLC-APP-TEST-REPO/` on `feat/KAN-2-add-a-main-py-entry-point`, and `git worktree list` in your checkout should show it.
2. `CLAUDE.md` should show the ticket's acceptance criteria from Jira, the repo folder, the branch and the conventions.
3. Click **▶ Build the ticket**. The prompt should contain the description and the repo folder, and Claude should create `main.py` in the worktree and push the branch.
4. With a KAN-1 PR open, restart the app and open KAN-1. Its worktree should be on the PR's branch.
5. Check out KAN-1's branch in your main checkout, delete KAN-1's workspace folder, and open KAN-1. The terminal and `CLAUDE.md` should say the branch is checked out elsewhere, and nothing should be stolen.
6. Break `JIRA_API_TOKEN`. The session should still start, and `CLAUDE.md` should say the description couldn't be loaded.
