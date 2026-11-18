# cockpit

Combined domain, named after the product. It starts the desktop app, joins the `pipeline`, `ticket` and `session` domains, and owns the screens that span them: **My tickets** and the **Cockpit**.

## Language

| Term | Meaning |
|---|---|
| Sprint board | The board's columns, each with its flow from the pipeline, plus one card per visible ticket. It's either from the cache or live, and may carry a failure message |
| Card | A ticket on the board: key, title, status name, the index of its column (or none if its status is on no column), its last ticket flow and its attention |
| Ticket flow | The result of one refresh of one ticket: for each checked column, its levels and block states, the gate states, where it stopped, and the flow's attention |
| Block state | One block's kind (for example `feedback`, `approved`, `merged`, `tracker_done`, `not_checked_yet`), tone, caption, whether it's finished, and for changes the PR and its open threads |
| Refresh | Column by column, level by level, with early stop. Progress events stream to the renderer |
| Attention | `failure`, `needs_you`, `agent_working`, `waiting` or `done`, from the flow combined with the session's hook status |
| Column state | For one card: `passed` (before the ticket's column), `current`, or `unchecked` (after it; M1 checks nothing yet) |
| Desktop app | The Electron main process: the window, the hook server and the IPC handlers |
| Renderer | The window's web page: React screens and the xterm.js terminal |
| Preload | The script that exposes the session and sprint-board bridges to the renderer |

## How the Electron processes map to the layers

| Process | Files | Role |
|---|---|---|
| Main | `src/main.ts` → `entrypoints/ui/desktop_app.ts` | Builds `CockpitContainer`, opens the window, starts the hook server, and registers the session and cockpit IPC |
| Preload | `src/preload.ts` → `entrypoints/ui/cockpit_preload.ts` | Exposes `cockpitSession` and `cockpitBoard` with `contextBridge` |
| Renderer | `src/renderer.ts` → `entrypoints/ui/cockpit_root.tsx` and the screens | Calls the bridges, which run use cases in the main process |

The renderer's view of "the container" is the two bridges. Each bridge call runs a use case in the main process.

## Responsibilities

- Load the configuration at startup. `CockpitContainer` collects every problem from `.env.config`, `.env.secrets` and the project files, and `desktop_app` shows them in one dialog, then quits.
- Compose the sprint board from the pipeline and the latest snapshot. A pipeline column key that's on no board column is a configuration problem, reported the same way.
- Show the cached board and flows first, then refresh everything: Jira, then every ticket's flow, at most 4 tickets at a time.
- Refresh a ticket from left to right, and inside a column from top to bottom. Stop after the first column with an unfinished block, or after the ticket's status column. `deploy`, `attest` and `prompt` blocks are "not checked yet" (until M3/M4) and never stop a refresh.
- Run the change actions from the block popover (merge, update branch, reply), each behind a confirm, then refresh that ticket.
- Build the built-in prompts (build ticket, fix CI, resolve conflict, address feedback), and hand them to the ticket's session once it reports idle.
- Recompute a ticket's attention whenever its session's hook status changes.
- Sort cards by column, furthest first, then by key.
- Open a ticket in the Cockpit with a view transition (shared title and graph, list sliding in, terminal rising), and give every ticket its own Claude Code session.
- Keep the renderer sandboxed: nothing reachable from `src/renderer.ts` may load Node, Electron or node-pty.

## Invariants

- The window has `contextIsolation` and `sandbox` on, and `nodeIntegration` off.
- Quitting the app stops every agent session and the hook server.
- Nothing imports `cockpit`, except the root files that delegate to it.
- Tracker values reach the `ticket` domain as plain values (`SprintQuery`, site URL), because `ticket` can't import `pipeline`.
