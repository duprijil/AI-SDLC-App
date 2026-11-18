# cockpit

Combined domain, named after the product. It starts the desktop app, joins the `pipeline`, `ticket`, `change`, `delivery`, `attestation` and `session` domains, and owns the screens that span them: **My tickets** and the **Cockpit**.

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
| Gate | The arrow between two columns: `passed`, `pending` (n/m), `ready` (the status column is complete), `move_back` (an earlier column is no longer complete) or `locked`. Ready and move-back gates carry a column move |
| Deploy line | One repo of a deploy block: done, failed, running, waiting, manual or could not check, with its run or promote link |
| Deploy block state | n/a, deployed, deploy failed, deploying, partial n/m, waiting, manual (not checked, never stops a refresh), or could not check |
| Attest block state | waits for the deployment, open, stale or validated; the pins are the deployed commits of the repos with a merged change of the ticket |
| Workspace brief | What a ticket's session is told: the ticket's details, each repo's worktree (folder, branch, base, PR) or why it was skipped, and the conventions. Written as `CLAUDE.md`, kept in memory for the prompts |
| Column move | A direction (`forward` or `back`) and a target column index. Gates and the open tracker block in the status column carry one |
| Status move | Moving the ticket's Jira status to a column, from a gate or a tracker block, after a preview and a confirm |
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
- Refresh a ticket from left to right, and inside a column from top to bottom. Stop after the first column with an unfinished block, or after the ticket's status column. `prompt` blocks are "not checked yet" (until M4) and never stop a refresh. Deploy and attest blocks share one environment check per ticket and env.
- Run the change actions from the block popover (merge, update branch, reply), each behind a confirm, then refresh that ticket.
- Check deploy blocks per repo with a merged change, and attest blocks against the stored ticks. Ticking re-computes the pins live and refuses if they changed since the popover opened.
- At startup, check the configured checkouts and show any problem in the startup dialog.
- Move a ticket's status from a ready gate, a move-back gate, or the open tracker block of its status column. The popover previews the Jira transition; the move runs after a confirm, then the sprint is fetched again and that ticket's flow refreshes.
- Prepare a ticket's workspace before its session starts: read the details from Jira and the open PRs from GitHub, add or reuse one worktree per repo with a `path`, and write `CLAUDE.md`.
- Render prompt templates (the block state's `actions`, a prompt block's `prompt`, or the default for the button) with the ticket's details, repos, PR, threads and runs, and hand them to the ticket's session one by one, each once it reports idle.
- After a forward move, send the tracker block's `actions.open` and the gate's `then` prompts.
- Show `prompt` blocks as open until they're ticked, from the popover.
- End a ticket's session when it's moved to the last column, or first seen there in a Refresh all.
- Recompute a ticket's attention whenever its session's hook status changes.
- Sort cards by column, furthest first, then by key.
- Open a ticket in the Cockpit with a view transition (shared title and graph, list sliding in, terminal rising), and give every ticket its own Claude Code session.
- Keep the renderer sandboxed: nothing reachable from `src/renderer.ts` may load Node, Electron or node-pty.

## Invariants

- The window has `contextIsolation` and `sandbox` on, and `nodeIntegration` off.
- Quitting the app stops every agent session and the hook server.
- Nothing imports `cockpit`, except the root files that delegate to it.
- A status move goes one column forward, or back to an earlier column, never further forward. The target comes from the cached sprint, so the move acts on what the user saw.
- A failed deploy is a Failure. An open or stale attestation is "Needs you".
- Links opened from the app are GitHub links or promote links from `project.yaml`, nothing else.
- A ticket with a ready or move-back gate is "Needs you". An open tracker block alone (a not-started ticket) is not.
- Tracker values reach the `ticket` domain as plain values (`SprintQuery`, site URL), because `ticket` can't import `pipeline`.
