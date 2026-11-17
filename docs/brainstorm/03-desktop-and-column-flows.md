# Brainstorm 03: desktop app, column flows, a simpler UI (v0.4)

This builds on [02-board-model.md](02-board-model.md). The resulting v1 scope is in [specs/v1-scope.md](../specs/v1-scope.md). The mockup is [design/mockup.html](../design/mockup.html) (v0.4). Earlier versions are frozen in [design/versions/](../design/versions/).

---

## Decisions, round 3

| Topic | Decision |
|---|---|
| App type | **A desktop app**, which can host an AI tool's own interface (TUI) directly. Electron or Tauri is **decided later**; the design doesn't depend on it. This replaces "web app in Docker". |
| Ticket view | **Graph + the pure Claude Code terminal.** No right-hand panel, no tabs, no harness bar, no prompt chips. **Changes happen through the AI tool or through the graph.** |
| Approvals | **In both places.** The harness sets outward actions (post a reply, merge, move the status) to *ask*. Claude Code's own permission prompt is then your approval. Clicking a block on the graph does the same thing through a small confirm popover. |
| Column content | **Each column holds a small flow of blocks**, read top to bottom with arrows. Blocks can run **in parallel** (for example one per PR, frontend and backend) and **join** into the next block (a deployment, a check, a notification, …). A block is more general than a PR or a deploy. |
| Refresh | **Column by column, in order.** Inside a column it follows the flow, so parallel blocks are checked together. The refresh **stops at the first unfinished column** (or at the ticket's status column). Later columns aren't checked, so they cost no API calls. **You move the status.** The refresh is shown live on the graph. |
| UI cleanup | Connected tools are hidden behind **● Live** (a popover; amber when one needs attention). There are no tags under the ticket name and no legend: a **?** button explains the states. The Cockpit's ticket list is just a status dot, the key and the title. |

### Follow-up decisions

| Topic | Decision |
|---|---|
| `notify` blocks (Slack) | **Later.** They're out of scope for now and removed from the mockup. |
| Notifications | **No notifications that carry actions.** You act in only two ways: **click a block or gate on the graph**, or **write to Claude Code**. |
| Config location | **In the AI-SDLC-App repo itself**, under `projects/<name>/`. There are no team or config branches. The desktop app reads it from there, and the editor saves into it. This replaces "your fork or branch" in [01 §2.10](01-value-concepts-design.md#210-distribution-config-and-runtime). |
| Refresh timing | **Only when you click ↻, or when the app opens.** There's no background polling and no schedule. |

---

## 1. Column flows (this replaces "rows")

```
 CODE REVIEW  (Jira column, fixed)
 ┌──────────────────────────────────────┐
 │ [#497 ✓]   [#510 ●]   [#34 ✓]        │  ← one per change, in parallel
 │      ╲        │        ╱             │
 │        [Deploy to dev  2/3]          │  ← joins when all are done
 │                │                     │
 │        [Validated in dev ☐]          │
 └──────────────────────────────────────┘
 (block types after a join can be a deployment, an attestation, a prompt, …)
        ──→ gate: move to End to End Testing (your click)
```

- **A block** has a *type*, a *done_when* check, and an *action set per state*. The v1 types:

| Type | Runs | Done when | Example |
|---|---|---|---|
| `change` | once per change, in parallel | `change.ready`, `change.merged` | "PR opened", "Review & merge" |
| `deploy` | once (it covers every change) | `env(E).contains(all changes)` (CI/CD run + commit ancestry) | "Deploy to dev", "Promote to stage" |
| `attest` | once | a human tick, pinned to the deployed commits | "Validated in dev" |
| `tracker` | once | a status or comment condition | "PM approved", "Done" |
| `prompt` | once | the agent called `sdlc.checkpoint` | "Note to PM" (the agent drafts it) |
| ~~`notify`~~ | — | — | **Later**: not in scope now |

- **Inside a column, the order comes from the flow.** A block starts only when every block above it is done. A level with several blocks runs in parallel.
- **Between columns there is one arrow: the gate.** It sits at the top, between the column headers. It opens when the column's last block is done. Moving it is your click (`tracker.move` plus any extra actions).

## 2. Refresh: column by column

```
refresh(ticket):
  for column in board (left → right):
      for level in column.flow (top → bottom):
          check all blocks of the level in parallel   (connector calls, git ancestry)
      if column not complete:  stop                  (later columns: not checked)
      if column == ticket's status column:  stop     (gate waits for you)
```

- On screen, the blocks being checked light up level by level and column by column. Columns that weren't checked stay grey and show only the shape of their flow.
- **Going back still works:** if an earlier column is no longer complete (a new PR appears), the refresh stops there, before the status column, and the gate offers "← move back".
- **It's cheap:** a ticket in Code Review never calls the stage or prod deploy APIs.

## 3. Approvals without a side panel

| Action | Through Claude Code | Through the graph |
|---|---|---|
| Post a drafted PR reply | The agent calls `sdlc.code_comment` → the permission prompt in the TUI | Click the change block → confirm popover |
| Merge | `sdlc.merge` → the permission prompt | Click "Review & merge" → confirm |
| Move the status | (not given to the agent in v1) | Click the gate → confirm |
| Validated / Tested | — | Click the attest block → tick |

The app's MCP server (`sdlc`) is the only way the agent can do outward actions. The harness policy marks those tools as **ask**, so every one of them goes through Claude Code's own permission prompt.

## 4. Still open

1. **Desktop shell:** Electron or Tauri (decided later).
2. ~~Config location~~ and ~~refresh timing~~: decided above.
