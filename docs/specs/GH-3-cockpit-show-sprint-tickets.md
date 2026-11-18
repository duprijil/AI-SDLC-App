# Show my sprint tickets on the board (M1)

**Ticket:** GH-3
**Status:** Done
**Domains:** pipeline (new), ticket (new), cockpit, session, core

## Context

M0 proved that Claude Code runs inside the app. M1 is the first real screen from [v1-scope.md](v1-scope.md) §9: the developer's current Jira sprint, each ticket drawn as the board's columns with the block flows from `pipeline.yaml`. No block is checked yet; GitHub and the checks arrive in M2. Clicking a ticket opens the Cockpit with that ticket's own Claude Code session, reusing the M0 session code.

## User story

**As a** developer working on sprint tickets
**I want** the app to open on all my sprint tickets, each drawn as the board's columns and flows, and to open any ticket in the Cockpit with its own Claude Code session
**So that** I see where every ticket stands at a glance, and work on one ticket at a time with its agent

## Acceptance criteria

- [x] With `ACTIVE_PROJECT` pointing to a valid project and Jira credentials in `.env.secrets`, the app opens on **My tickets** and shows every ticket that matches the project's `tracker.scope` JQL, except tickets in `tracker.hide_statuses`.
- [x] Each card shows the key, the title, the Jira status as a pill, and a graph with the board's columns in Jira's order.
- [x] In each graph, the ticket's column is highlighted, earlier columns show "✓", and later columns show "not checked". Every column draws its block flow from `pipeline.yaml`, top to bottom. An `each_change` level is drawn as one stacked block marked "× each change". A board column with no entry in `pipeline.yaml` is drawn empty.
- [x] Cards are sorted by column, the furthest column first, then by key.
- [x] On the second launch, the list from the last successful fetch appears straight away, marked "From cache · hh:mm". The app then fetches from Jira and replaces it, marked "Refreshed · hh:mm".
- [x] **↻ Refresh** fetches from Jira again and updates the list and the time.
- [x] If Jira fails (bad credentials, no network, unknown board), a banner names the reason. The cached list stays visible.
- [x] If `.env.config`, `.env.secrets`, `project.yaml` or `pipeline.yaml` is missing a value or invalid, the app shows one error dialog listing every problem (file, field, reason), then quits. A `pipeline.yaml` column key that doesn't match any board column counts as a problem.
- [x] Clicking a card animates into the **Cockpit** for that ticket: a slim list on the left (key and title, current ticket selected), a header (← back, key, title, status pill, ↻, ↗), the graph, and a Claude Code terminal running in `~/.ticket-cockpit/workspaces/<KEY>`.
- [x] Choosing another ticket in the list switches the graph and terminal. Each ticket keeps its own running session, and coming back to it shows its recent output.
- [x] **←** animates back to My tickets, scrolled to the ticket that was open.
- [x] **↗** opens the ticket in Jira in the default browser.
- [x] Quitting the app stops every Claude Code session.
- [x] All of `projects/` is ignored by git.
- [x] `make check` passes.

## Out of scope

- GitHub, changes and every block check (M2). Blocks stay unchecked.
- The refresh animation, attention states and filters, popovers, gates and status moves (M2–M3).
- Worktrees, MCP tools, prompt templates and permissions for the session (M4). The session runs in an empty workspace folder, as in M0.
- The pipeline editor, a project picker and a first-run screen (M5). The project is chosen with `ACTIVE_PROJECT`.
- Storing the Jira token in the OS keychain. The engineer chose `.env.secrets` for now.
- Validating `code`, `repos[].envs`, `done_when` and `actions`. They're parsed loosely and validated in the milestones that use them.

## Technical aspects

### Flow

**Startup:** `src/main.ts` → `desktop_app` builds `CockpitContainer` → the `pipeline` domain's `LoadProject` reads and validates `projects/<ACTIVE_PROJECT>/project.yaml` and `pipeline.yaml` → `CockpitContainer` builds `TicketContainer` with the Jira site and the secrets → the window opens. Any configuration error → an error dialog and quit.

**My tickets:** the renderer calls the board bridge → `cockpit_ipc` → `ShowCachedSprintBoard`, then `RefreshSprintBoard`.
- `RefreshSprintBoard` uses `ticket`'s `FetchSprint` (tracker port → Jira, then saves the snapshot through the cache port → SQLite).
- It checks the pipeline's column keys against the board's columns, and combines the two into a `SprintBoard` model returned as a DTO.

**Cockpit:** the renderer calls the session bridge with the ticket key → `session_ipc` → `StartAgentSession`, which already starts or re-attaches one session per ticket.

**Jira calls** (Basic auth with email and API token):
- `GET /rest/agile/1.0/board/{board_id}/configuration`: the column names, and the status ids in each column
- `POST /rest/api/3/search/jql` with `fields: [summary, status]`, following `nextPageToken`: the tickets
- Tickets are mapped to columns by status id. Hidden statuses are matched by status name.

### Files

| File | Change |
|---|---|
| `.env.config` | add `ACTIVE_PROJECT`, `PROJECTS_ROOT`, `APP_DATA_ROOT`; remove `SPIKE_TICKET_KEY` |
| `.env.secrets.example` | new: `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| `.gitignore` | ignore `projects/` |
| `Makefile` | add `setup-env` |
| `package.json`, `package-lock.json` | add `yaml` 2.9.1, `zod` 4.6.7 |
| `.dependency-cruiser.cjs` | add `pipeline` and `ticket` to the normal domains |
| `src/config.ts` | add `activeProject`, `projectsRoot`, `appDataRoot`; add `ProjectSecrets` and `loadProjectSecrets()` |
| `src/core/models/secret_text.ts` | new: `SecretText`, which hides its value when printed and is unwrapped only inside adapters |
| `src/pipeline/models/errors.ts` | new: `PipelineError`, `InvalidProjectConfigError` (carries the list of problems) |
| `src/pipeline/models/project.ts` | new: `Project` (name, `TrackerSettings`, repo names) |
| `src/pipeline/models/pipeline.ts` | new: `Pipeline`, `PipelineColumn`, `FlowLevel`, `BlockTemplate` and their DTOs |
| `src/pipeline/adapters/project_source_port.ts` | new |
| `src/pipeline/adapters/project_source_yaml.ts` | new: reads both files, validates with zod, and returns models or every problem at once |
| `src/pipeline/use_cases/load_project.ts` | new |
| `src/pipeline/entrypoints/container.ts` | new |
| `src/ticket/models/errors.ts` | new: `TicketError`, `TrackerUnavailableError`, `TrackerAuthError`, `BoardNotFoundError` |
| `src/ticket/models/ticket.ts` | new: `Ticket` (key, title, status id, status name) |
| `src/ticket/models/board.ts` | new: `Board`, `BoardColumn` (key = snake_case of the name, status ids), `columnIndexFor(statusId)` |
| `src/ticket/models/sprint_query.ts` | new: `SprintQuery` (board id, scope JQL, hidden status names) |
| `src/ticket/models/sprint_snapshot.ts` | new: `SprintSnapshot` (board, visible tickets, fetched at) |
| `src/ticket/adapters/tracker_port.ts`, `tracker_jira.ts` | new |
| `src/ticket/adapters/sprint_cache_port.ts`, `sprint_cache_sqlite.ts` | new: one row per project in `<APP_DATA_ROOT>/cache.sqlite`, through `node:sqlite` |
| `src/ticket/use_cases/fetch_sprint.ts`, `read_cached_sprint.ts` | new |
| `src/ticket/entrypoints/container.ts` | new: `TicketContainer(trackerSiteUrl)`, which reads the secrets |
| `src/cockpit/models/sprint_board.ts` | new: `SprintBoard` + DTOs (columns with flows, cards with column index, source, fetched at) |
| `src/cockpit/models/sprint_board_bridge.ts` | new: IPC channels and the `SprintBoardBridge` contract |
| `src/cockpit/models/errors.ts` | add `PipelineBoardMismatchError` |
| `src/cockpit/use_cases/show_cached_sprint_board.ts`, `refresh_sprint_board.ts` | new |
| `src/cockpit/entrypoints/container.ts` | load the project, build `PipelineContainer` and `TicketContainer`, expose the new use cases; drop `spikeTicketKey` |
| `src/cockpit/entrypoints/api/cockpit_ipc.ts` | new: board handlers, and opening Jira links |
| `src/cockpit/entrypoints/ui/desktop_app.ts` | error dialog for configuration errors; register `cockpit_ipc` |
| `src/cockpit/entrypoints/ui/cockpit_preload.ts` | also expose the board bridge |
| `src/cockpit/entrypoints/ui/sprint_board_bridge_window.ts` | new |
| `src/cockpit/entrypoints/ui/cockpit_root.tsx` | switch between the two screens, with view transitions |
| `src/cockpit/entrypoints/ui/my_tickets_screen.tsx`, `ticket_card.tsx` | new |
| `src/cockpit/entrypoints/ui/ticket_graph.tsx`, `flow_column.tsx` | new: the column-flow graph from mockup v0.4 |
| `src/cockpit/entrypoints/ui/cockpit_screen.tsx`, `ticket_list.tsx` | new |
| `src/cockpit/entrypoints/ui/session_terminal.tsx` | take the ticket key as a prop |
| `src/cockpit/entrypoints/ui/spike_screen.tsx` | removed |
| `src/cockpit/resources/cockpit.css` | the v0.4 styles for cards, the graph, the list and the header |
| `src/session/models/session_bridge.ts` | `start(ticketKey, size)` |
| `src/session/entrypoints/api/session_ipc.ts` | read the ticket key from the renderer; drop the fixed spike key |
| `docs/domains/pipeline.md`, `docs/domains/ticket.md` | new |
| `docs/domains/cockpit.md`, `docs/domains/session.md`, `AGENTS.md` | updated |
| `docs/specs/v1-scope.md` | M1 secrets in `.env.secrets` instead of the keychain; gitignored real projects |

### Config and secrets

| Variable | File |
|---|---|
| `ACTIVE_PROJECT` (the folder name under `projects/`) | `.env.config` |
| `PROJECTS_ROOT` (`projects`) | `.env.config` |
| `APP_DATA_ROOT` (`~/.ticket-cockpit`) | `.env.config` |
| `JIRA_EMAIL` | `.env.secrets` |
| `JIRA_API_TOKEN` | `.env.secrets` |

The Jira site, board id, scope and hidden statuses live in `projects/<name>/project.yaml`.

### Failure handling

- **Invalid or missing configuration:** this covers either env file, `project.yaml`, `pipeline.yaml`, and column keys that aren't on the board. All the problems are collected and shown in one error dialog, then the app quits with exit code 1.
- **Jira 401 or 403** → `TrackerAuthError` ("Jira rejected the credentials in .env.secrets"). **404 on the board** → `BoardNotFoundError`. **Network errors, timeouts or 5xx** → `TrackerUnavailableError`. In each case the cached snapshot stays on screen with a banner, and nothing is written to the cache.
- **A broken or missing cache** is treated as empty, and the app fetches live.
- **The agent can't start** (for example `claude` isn't on the `PATH`): the terminal shows the reason, as in M0.

### Decisions

- **The Jira credentials go in `.env.secrets`, not the keychain.** The engineer chose this for simplicity. `SecretText` keeps the token out of logs, and moving to the keychain later only changes an adapter.
- **All project folders are gitignored.** AI-SDLC-App is open source, and project files name real company systems. During implementation the engineer dropped the committed example project, so nothing under `projects/` is committed.
- **A pipeline column key is the snake_case board column name** ("Code Review" → `code_review`). A key that's on no board column is an error. A board column with no key is drawn empty.
- **Tracker values flow from `pipeline` to `ticket` through `cockpit`** as plain values (`SprintQuery`, the site URL), because normal domains don't import each other.
- **`node:sqlite` is the cache store** (built into Electron 45's Node 24.22), so there's no extra native module.
- **`yaml` + `zod`** parse and validate the project files at the boundary. Models are still built through their own `create()` with invariants.
- **Sessions remain one per ticket key and in memory.** Resuming after an app restart stays in M4.
