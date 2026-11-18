# Move a ticket's status from the graph (M3, part 1)

**Ticket:** GH-5
**Status:** Implemented
**Domains:** ticket, cockpit

## Context

M2 gives every `change` and `tracker` block a real state and shows a gate as **ready** when its column is complete, but clicking the gate does nothing, and a ticket in To Do can never get started from the app. Milestone M3 of [v1-scope.md](v1-scope.md) §9 is split in two (the engineer's choice, 2026-11-18):

1. **GH-5 (this spec):** gates and Jira status moves, forward and back.
2. **Next ticket:** `deploy` blocks from GitHub Actions runs, git ancestry with a patch-id fallback, and `attest` blocks pinned to the deployed commits. The kubectl runtime check is deferred until a cluster is available to test against.

Gates come first because they finish the loop the app already draws, and they can be tested now on the KAN board.

## User story

**As a** developer whose ticket's column is complete
**I want** to move the ticket to the next Jira column from the graph, and to move it back when an earlier column is no longer complete
**So that** I never open Jira to keep the board in step with the work

## Acceptance criteria

### Forward moves

- [ ] Clicking a **ready** gate opens a popover: "Move <KEY> to <next column>?", the Jira transition it will run (name and target status), and a confirm button.
- [ ] Clicking an **open** `tracker` block in the ticket's status column opens the same popover for the next column. This is how a ticket leaves To Do: the "Ticket started" block is done only after the move.
- [ ] A move only goes one column forward. Gates that aren't ready (pending, locked, passed) show their count or ✓, and do nothing when clicked.
- [ ] The target status is the first status of the next column, in the board's order, that the ticket can reach with one of its current Jira transitions. If none can be reached, the popover says so, lists the transitions Jira allows from the current status, and offers **↗ Open in Jira** instead of the confirm.

### Moving back

- [ ] If a refresh stops at a column **before** the ticket's status column (for example a new PR appeared in In Progress while the ticket is in Code Review), the gate right after that column shows **←** and the popover offers "Move <KEY> back to <column>?". It uses the same transition rule and the same confirm.
- [ ] A ticket with a move-back gate gets the attention **Needs you**.

### Running a move

- [ ] On confirm, the app re-reads the ticket's status from Jira first. If the status changed since the last refresh, nothing is moved, and the popover shows "<KEY> is now in <status>" and the board is refreshed.
- [ ] Otherwise the app runs the transition. When it succeeds, the popover closes, the sprint is fetched from Jira again (so the card's pill updates, or the card leaves the list when it falls out of the scope), and the ticket's flow refreshes from the left.
- [ ] If Jira refuses the transition (for example a required field such as Resolution, a validator, or missing permission), the popover shows Jira's message and **↗ Open in Jira**. Nothing else changes.
- [ ] Moving into the last column (Done) works the same way. The ticket's Claude Code session keeps running (ending it at Done is M4).

### Configuration

- [ ] No new config. The board's columns and their statuses come from Jira, as in M1. The Jira token needs the *Transition issues* permission on the project.
- [ ] `make check` passes.

## Out of scope

- `gate.then` actions and a block's `actions.open` list from `pipeline.yaml` (for example "then send the next column's first prompt"). They need the editable prompts of M4. The parser keeps ignoring them.
- `tracker.status_in([...])` and `tracker.reply_from(role)` checks, and `roles` in `project.yaml`.
- `code.merge_all` on a gate (moves to the delivery ticket, with `merge.order`).
- `deploy` and `attest` blocks, ancestry and the kubectl runtime check (next ticket).
- The agent moving the status: the `sdlc` MCP tool `tracker_move` stays denied (M4).
- Jumping more than one column, and filling in transition screen fields from the app.

## Technical aspects

### Flow

**Gate state** (`TicketFlow`, cockpit):
- A gate gains a target: `{ direction: "forward" | "back", columnKey, columnName }`, and a new state `move_back`.
- `ready` stays as today (the status column is complete). `move_back` is set on the gate right after the stopped column when `stoppedAtColumn < ticketColumnIndex`. All other gates keep their state.
- An open `tracker` block in the status column carries the same forward target, so the popover can offer the move.

**Preview** (renderer → `cockpit_ipc` `ticket:move-preview`):
- `PreviewStatusMove` (cockpit) asks the `ticket` domain's `FindStatusTransition` for the ticket's transitions, and picks one with the `StatusMove` model.
- It returns a `StatusMovePreviewDTO`: from and to column and status, the transition's name, or "not reachable" with the allowed transitions.

**Move** (renderer → `cockpit_ipc` `ticket:move`):
- `RunStatusMove` (cockpit) calls the `ticket` domain's `MoveTicket` use case with the key, the status id the ticket is expected to be in, and the target column's status ids.
- `MoveTicket` reads the ticket live. If its status id isn't the expected one, it raises `TicketStatusChangedError` with the current status. Otherwise it picks the transition again (transitions can change) and runs it.
- `RunStatusMove` then fetches the sprint again (`RefreshSprintBoard`), keeps the other tickets' cached flows, and runs `RefreshTicketFlows` for the moved ticket only. It returns the whole board, or a failure message.

**Jira calls** (`tracker_jira` adapter):

| Call | Used for |
|---|---|
| `GET /rest/api/3/issue/{key}?fields=summary,status` | the live re-check, and the card after a move |
| `GET /rest/api/3/issue/{key}/transitions` | the transitions available from the current status, each with its target status id and name |
| `POST /rest/api/3/issue/{key}/transitions` with `{ transition: { id } }` | the move (Jira answers 204) |

### Picking the transition (`StatusMove` model, ticket)

1. Take the target column's status ids in the board's order.
2. For each, take the first transition whose target status id matches it. The first match wins.
3. No match → `StatusNotReachableError`, carrying the transitions that do exist (name → status), for the popover.

Global transitions ("any status → In Progress", as on KAN) and workflow-specific ones are handled the same way, because only the target status matters.

### Files

| File | Change |
|---|---|
| `src/ticket/models/transition.ts` | new: `Transition` (id, name, target status id and name) |
| `src/ticket/models/status_move.ts` | new: `StatusMove`, the rule that picks a transition for a column's status ids |
| `src/ticket/models/errors.ts` | add `StatusNotReachableError`, `TicketStatusChangedError`, `TransitionRefusedError` |
| `src/ticket/adapters/tracker_port.ts`, `tracker_jira.ts` | add `ticket(key)`, `transitions(key)`, `transition(key, transitionId)`; map Jira 400/409/422 on a transition to `TransitionRefusedError` with Jira's messages |
| `src/ticket/use_cases/find_status_transition.ts`, `move_ticket.ts` | new |
| `src/ticket/entrypoints/container.ts` | wire the new use cases |
| `src/cockpit/models/column_move.ts` | new: `ColumnMoveDTO` (direction and target column) |
| `src/cockpit/models/ticket_flow.ts` | gate `moveTo`, `move_back` state, attention for `move_back` |
| `src/cockpit/models/block_state.ts` | `moveTo` on an open tracker block in the status column |
| `src/cockpit/models/status_move_action.ts` | new: `StatusMovePlan` (resolves a request against the cached sprint) and the request, preview and result DTOs |
| `src/cockpit/adapters/flow_cache_sqlite.ts` | flow format version 2, so cached flows without move targets are dropped |
| `src/cockpit/models/sprint_board_bridge.ts` | channels `ticket:move-preview`, `ticket:move` |
| `src/cockpit/use_cases/preview_status_move.ts`, `run_status_move.ts` | new |
| `src/cockpit/entrypoints/api/cockpit_payload.ts`, `cockpit_ipc.ts` | validate and register the two channels |
| `src/cockpit/entrypoints/container.ts` | wire the use cases |
| `src/cockpit/entrypoints/ui/ticket_graph.tsx`, `ticket_card.tsx`, `my_tickets_screen.tsx`, `cockpit_screen.tsx`, `cockpit_root.tsx`, `block_popover.tsx`, new `status_move_popover.tsx` | clickable ready and move-back gates; the move popover, also opened by tracker blocks |
| `src/cockpit/entrypoints/ui/use_sprint_board.ts`, `cockpit_preload.ts` | the two bridge calls; replace the card after a move |
| `src/cockpit/resources/cockpit.css` | the `move_back` gate (← in amber), the move popover |
| `docs/domains/ticket.md`, `docs/domains/cockpit.md` | new Jira calls, errors, gate states and invariants |

### Failure handling

- **401/403** on any call → `TrackerAuthError`, as in M1. The popover names it, and ● Live turns amber.
- **Status changed** since the refresh → `TicketStatusChangedError`. Nothing moves, and the ticket is refreshed.
- **No transition reaches the column** → `StatusNotReachableError`. The popover lists the allowed transitions and links to Jira.
- **Jira refuses the transition** (400, 409 or 422, for example a required Resolution) → `TransitionRefusedError` with Jira's `errorMessages` and `errors`. Nothing else changes.
- **Network errors, timeouts or 5xx** → `TrackerUnavailableError`. The confirm stays available to retry.
- After a successful move, if fetching the sprint fails, the move still counts. The banner names the failure, and the next refresh fixes the card.

### Decisions

- **M3 is split; gates come first** (the engineer's choice). Deploy, ancestry and attest come next. The kubectl runtime check waits until there's a cluster to test against.
- **One column at a time.** Skipping columns would hide unfinished blocks.
- **The target is a column, not a status.** The app picks the column's first reachable status, because columns are what the graph shows.
- **Re-check, then move.** The live status check makes a double move (from the graph and from Jira, or from two clicks) a no-op, as in v1-scope §10.
- **An open tracker block offers the move.** Otherwise a To Do ticket could never leave To Do: its gate only opens once the "started" block is done, and that needs the move.
- **An open tracker block in To Do stays "Waiting", not "Needs you".** A sprint's not-started tickets would otherwise all ask for attention.
- **Move back is a confirm like any other move** (v1-scope §6.1), and it makes the ticket "Needs you".
- **The whole sprint is fetched again after a move, not just the ticket** (changed during implementation). A move can take the ticket out of the scope JQL (for example `statusCategory != Done`), and the sprint cache must hold the new status for the next move.

## What to test

1. KAN-1 in To Do: click **Ticket started** → the popover shows "Move KAN-1 to In Progress" with transition *In Progress* → confirm → the pill shows In Progress, and the flow refreshes into In Progress.
2. With KAN-1's In Progress column complete (a ready, merged PR on the test repo), the gate turns blue → click → move to Done.
3. Move KAN-1 in Jira by hand, then confirm a move from the stale popover → "KAN-1 is now in …", nothing moves.
4. Ticket in Done with a new open PR linked → the refresh stops at In Progress, and the gate after it shows ← "Move back to In Progress".
5. Add a required field or a validator on a transition in the Jira workflow → confirm → Jira's message shows in the popover.
6. Break `JIRA_API_TOKEN` → the popover names the auth failure, and ● Live is amber.
