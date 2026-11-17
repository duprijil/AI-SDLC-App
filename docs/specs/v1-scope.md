# Ticket Cockpit v1: scope and architecture

**Status:** draft for review · 2026-11-17
**Based on:** [brainstorm 01](../brainstorm/01-value-concepts-design.md) → [02](../brainstorm/02-board-model.md) → [03](../brainstorm/03-desktop-and-column-flows.md). The UI reference is [design/mockup.html](../design/mockup.html) (v0.4).

Where the brainstorm docs and this spec disagree, **this spec wins**.

---

## 1. Goal

A desktop app where **one developer** runs their own sprint tickets from start to production. Each ticket is shown as a **graph of the tracker's columns**. Each column holds a **flow of blocks** (PRs, deployments, checks). Each ticket has **exactly one Claude Code session**, embedded as its real terminal UI. You act in only two ways: **click a block or gate**, or **write to Claude Code**.

### v1 is done when

1. I open the app, and **My tickets** shows every ticket of my current Jira sprint with its graph. That data is refreshed when the app opens.
2. I click a ticket, and the **Cockpit** opens it with an animation: the graph plus the ticket's Claude Code session in the ticket's workspace.
3. **↻ Refresh** checks the columns in order, top to bottom, and stops at the first unfinished column. Columns after that make no API calls.
4. From the graph I can **merge**, **update a branch**, **post a drafted reply**, **tick an attestation**, **open a run**, **send a prompt to Claude Code**, and **move the Jira status** (gate). Each outward action asks me first.
5. Claude Code can do the same outward actions only through the app's `sdlc` MCP tools, and each of them goes through Claude Code's own permission prompt.
6. "In dev / in stage / in prod" is computed from **CI/CD runs + git ancestry**. It works with any git flow.
7. I can edit a column's block flow in the **Pipeline editor**, and it saves to `projects/<name>/pipeline.yaml`.
8. It works on the Deck Builder project, the PoC's real setup, and replaces the PoC for daily use.

---

## 2. Scope

### In v1

| Area | In scope |
|---|---|
| App | A desktop app with a single user and local credentials, built on **Electron** (decided in M0). |
| Config | `AI-SDLC-App/projects/<name>/` in this repo: `project.yaml`, `pipeline.yaml`, `harness/claude-code.yaml`, `prompts/*.md`, `guardrails.md`. One project open at a time, chosen with `ACTIVE_PROJECT`. All of `projects/` is gitignored. |
| Tracker | **Jira Cloud**: board columns (read-only), my sprint tickets, status, comments, transitions. |
| Code host | **GitHub**: PRs linked by the ticket key, reviews and threads from my point of view, CI state, merge state, merge, update branch, comment and resolve a thread. |
| Delivery | **GitHub Actions** (deploy runs and the commit they deployed). **kubectl** runtime check (deployed image → commit, rollout, pod errors). **Link-only** manual promotions (Spinnaker). |
| Git | Local checkouts (paths in `project.yaml`). Worktrees per ticket. Ancestry check with a patch-id fallback. |
| Agent | **Claude Code** only: real TUI in a PTY, one session per ticket, a harness (inject, hooks, permissions), the `sdlc` MCP server. |
| Graph | Columns = Jira board columns. Block flows with parallel "each change" levels and joins. One gate between columns. |
| Block types | `change`, `deploy`, `attest`, `tracker`, `prompt` |
| Actions | `tracker.move` (gate only), `code.merge`, `code.merge_all`, `code.update_branch`, `code.comment`, `attest`, `session.prompt`, `open`, `copy` |
| Screens | My tickets · Cockpit (slim list + graph + TUI) · Pipeline editor · ● Live popover · ? help popover |
| Refresh | Only on click (one ticket, or all) and when the app opens. Sequential, with early stop. Animated. |

### Not in v1

| Out | Why / when |
|---|---|
| Other trackers, code hosts and AI tools (Linear, GitLab, Codex, OpenCode, …) | The interfaces are designed for them (§5), but only one adapter of each kind ships |
| **Jenkins** delivery connector | **v1.1.** The first connector after GitHub Actions; the interface is ready |
| `notify` blocks and Slack | Later (decided) |
| Posting Jira comments (`tracker.comment`) | Not in the v1 action list. Drafts for the PM (for example "Note to PM") are copied and posted by you |
| Notifications that carry actions | Never (decided). Acting happens only on the graph or in the TUI |
| Background polling or scheduled refresh | Not wanted (decided) |
| Automatic status moves, or `crossing: auto` | v1 always has a human move the status |
| Refine and Plan stages | Dropped (decided) |
| Team view, sync, hosted relay, web app, Docker | Solo developer and desktop first |
| Mirroring a pending TUI permission onto the graph | v1.1 (§6.4) |
| Several projects open at once | v1.1 |

---

## 3. Architecture

```
┌──────────────────────────────── Desktop shell (Electron) ────────────────────────────────┐
│                                                                                          │
│  UI (renderer)                                   Core (TypeScript, one process)           │
│  ───────────────                                 ─────────────────────────────────────    │
│  My tickets ─┐                                   config     loads + validates projects/   │
│  Cockpit ────┼─ graph renderer      ◀── IPC ──▶  engine     refresh, block states, gates  │
│  Editor ─────┘  xterm.js (TUI)                   actions    action runner + confirmations │
│  popovers (Live, ?, confirm)                     connectors tracker · code · delivery ·   │
│                                                             runtime · git                 │
│                                                  sessions   PTY + harness (Claude Code)   │
│                                                  mcp        "sdlc" MCP server (stdio)     │
│                                                  hooks      127.0.0.1 endpoint + token    │
│                                                  store      SQLite (app data dir)         │
└──────────────────────────────────────────────────────────────────────────────────────────┘
        │ REST/GraphQL           │ git CLI               │ PTY                 │ kubectl / gcloud
        ▼                        ▼                       ▼                     ▼
   Jira · GitHub         your checkouts + worktrees   claude (installed)     clusters
```

- **The core is TypeScript** and runs in Electron's main process. It uses `node-pty` for the PTY and talks to the renderer over typed IPC, through a sandboxed preload bridge.
- **The UI framework is React** (decided in M0). The graph is plain DOM and CSS, as in the mockup.
- **No server and no ports open to the network.** The hook endpoint binds to `127.0.0.1` on a random port, and each session gets its own token.

### Repo layout

The repo follows the **engineer harness** (`Harness: engineer` in `AGENTS.md`). Code lives in domains, each with `models/`, `use_cases/`, `adapters/` and `entrypoints/`. UI screens are entrypoints. The "core" process above is the domains' use cases and adapters, not a separate folder.

```
AI-SDLC-App/
├─ src/
│  ├─ <config module>
│  ├─ core/          model convention, shared clients, business-free UI components
│  ├─ pipeline/      project.yaml + pipeline.yaml: load, validate, write; Pipeline editor screen
│  ├─ ticket/        Tracker port, jira adapter
│  ├─ change/        CodeHost port, github adapter; review state rules
│  ├─ delivery/      Delivery, Runtime and Git ports; github_actions, kubectl, git adapters
│  ├─ attestation/   pinned ticks, sqlite adapter
│  ├─ session/       AgentHarness port, claude_code adapter, PTY, workspaces, sdlc MCP server, hook endpoint
│  └─ cockpit/       combined: refresh engine, block states, gates, attention, actions;
│                    My tickets + Cockpit screens; desktop bootstrap
├─ projects/         gitignored: one folder per project, such as deck-builder/
├─ docs/
├─ AGENTS.md · CLAUDE.md · Makefile · .env.config · .env.secrets.example
└─ the shell's and stack's files, chosen in M0
```

These domains are a proposal and are confirmed in M1. The capability contracts in §5 are the domains' ports. The `sdlc` MCP server and the hook endpoint are entrypoints of `session`, and they reach `cockpit` through an `actions` port that `session` defines and `cockpit` implements, so `session` never imports `cockpit`.

---

## 4. Config schema (v1)

### `projects/<name>/project.yaml`

```yaml
name: Deck Builder
tracker:
  type: jira
  site: https://<org>.atlassian.net
  board_id: 42                      # numeric Jira board id; columns are read from this board
  scope: "assignee = currentUser() AND sprint in openSprints()"
  hide_statuses: [Won't Do, Duplicate, Cancelled, Removed]
  roles: { pm: ["<account-id>"] }   # used by tracker.reply_from("pm")
code:
  type: github
  link: { by: [pr_title, branch], key_pattern: '(?i)\bDIG1-\d+\b', merged_days: 45 }
  merge: { method: squash, order: [dataform, ba-backend, ba-frontend, dtb-action-service, dtb-docs] }
repos:
  - name: ba-backend
    github: org/ba-backend
    path: ~/code/ba-backend          # your checkout
    envs:
      dev:   { delivery: github_actions, workflow: meta-build.yaml, commit: run.head_sha,
               runtime: { kube_context: np, namespace: ba, deployment: ba-backend } }
      stage: { delivery: manual, promote_link: "https://spinnaker/.../executions?pipeline=ba-backend-st",
               runtime: { kube_context: st, namespace: ba, deployment: ba-backend } }
      prod:  { delivery: manual, runtime: { kube_context: prod, namespace: ba, deployment: ba-backend } }
  - name: dtb-docs
    github: org/dtb-docs
    path: ~/code/dtb-docs
    envs:
      dev:   { delivery: github_actions, workflow: publish.yaml, commit: run.head_sha }
      stage: none                    # deploy blocks show n/a for this repo
      prod:  { same_as: dev }
workspaces: ~/.ticket-cockpit/workspaces   # <dir>/<TICKET>/<repo> = worktrees
agent: harness/claude-code.yaml
```

**How the deployed commit is found** (`commit:`), in order of preference: `run.head_sha` (the run's commit) · `image_label` (an OCI label on the running image) · `tag` (an image tag that resolves to a git tag) · `endpoint` (a `/version` URL). With `runtime` set, the commit comes from the running pods, and "done" also needs a finished rollout.

### `projects/<name>/pipeline.yaml`

```yaml
columns:                      # keys must match the board's columns; the order comes from Jira
  to_do:
    flow:
      - [ { id: start, type: tracker, done_when: 'tracker.status_after("To Do")',
            actions: { open: [ 'tracker.move("In Progress")', { session: prompts/build-ticket.md } ] } } ]
  in_progress:
    flow:
      - each_change: { id: opened, type: change, done_when: change.ready,
                       actions: { none: [ { session: prompts/build-ticket.md } ],
                                  ci_failing: [ open(change.checks), { session: prompts/fix-ci.md } ] } }
  code_review:
    flow:
      - each_change: { id: merged, type: change, done_when: change.merged,
                       actions: { behind: [code.update_branch], conflict: [ { session: prompts/resolve-conflict.md } ],
                                  feedback: [ { session: prompts/address-review-feedback.md } ],
                                  drafted: [code.comment], approved: [code.merge] } }
      - [ { id: dev, type: deploy, env: dev, done_when: 'env("dev").contains(changes)',
            actions: { failed: [ open(run), { session: prompts/diagnose-deploy-failure.md } ] } } ]
      - [ { id: validated_dev, type: attest, pin: 'env("dev").commits', done_when: attested } ]
    gate:                     # → End to End Testing; tracker.move is implied and can't be removed
      then: [ { session: prompts/promote-checklist.md } ]
  # end_to_end_testing, ready_for_demo, pending_deployment, done …
```

- A **level** is a list of blocks (run in parallel) or `each_change` (one block per linked change, in parallel). A level starts when every block of the level above is done.
- **The gate rule is fixed:** it opens when every block in the column is done. `tracker.move(next)` always runs first. `then:` can add more actions.
- **Validation** on load: column keys exist on the board; `done_when` names a built-in check; action names exist; prompt files exist. Errors show in the editor and in ● Live.

### `projects/<name>/harness/claude-code.yaml`

```yaml
tool: claude-code
min_version: "2.0"
session: { per: ticket, cwd: "{{workspaces}}/{{ticket.key}}" }
launch:  "claude --session-id {{session.id}}"
resume:  "claude --resume {{session.id}}"
inject:
  mcp: sdlc                                  # written to <workspace>/.mcp.json
  instructions: guardrails.md                # written to <workspace>/CLAUDE.md
hooks: [SessionStart, UserPromptSubmit, PreToolUse, Notification, Stop]   # → status
permissions:                                  # written to <workspace>/.claude/settings.json
  ask:  [mcp__sdlc__code_comment, mcp__sdlc__merge]
  deny: ["Bash(gh pr merge*)", "Bash(gh pr comment*)", mcp__sdlc__tracker_move]
```

---

## 5. Core interfaces

These are capability contracts. v1 ships one adapter for each; the next adapters (Jenkins, Linear, GitLab, Codex) plug in here.

```ts
interface Tracker {
  me(): Promise<User>
  boardColumns(board: string): Promise<Column[]>             // name, statuses[], order
  myTickets(scope: string): Promise<TicketRef[]>             // key, title, status, updated
  ticket(key: string): Promise<Ticket>                       // + comments (plain text), attachments
  transitions(key: string): Promise<Transition[]>
  move(key: string, toStatus: string): Promise<void>         // picks the transition that leads there
}

interface CodeHost {
  changesFor(key: string, repos: Repo[], since: Date): Promise<Change[]>   // open + merged, linked by key
  review(change: Change, viewer: User): Promise<ReviewState>               // the PoC's viewer-side rules
  merge(change: Change, method: MergeMethod): Promise<void>                // re-checks live first
  updateBranch(change: Change): Promise<void>
  comment(change: Change, threadId: string | null, body: string, resolve: boolean): Promise<void>
}

interface Delivery {                                          // per repo × env
  latest(repo: Repo, env: EnvConfig): Promise<DeployRun | null>   // status, commit, url, finishedAt
}

interface Runtime {
  observe(repo: Repo, env: EnvConfig): Promise<RuntimeState>  // commit, rollout {ready,total}, podErrors[]
}

interface Git {
  fetch(repo: Repo): Promise<void>
  contains(repo: Repo, deployed: Sha, change: Change): Promise<boolean>   // ancestry, then patch-id
  worktree(repo: Repo, branch: string, path: string): Promise<void>
}

interface AgentHarness {
  start(ticket: Ticket, workspace: string): Promise<Session>  // launch or resume; writes inject files
  write(session: Session, data: string): void                 // raw keystrokes from xterm.js
  prompt(session: Session, text: string): Promise<void>       // bracketed paste + Enter
  interrupt(session: Session): void
  status(session: Session): SessionStatus                     // from hooks: working | waiting | idle | ended
}
```

### Built-in checks (`done_when` and state)

| Check | Block type | States it produces |
|---|---|---|
| `change.ready` | change | none · draft · ci_failing · ready |
| `change.merged` | change | behind · conflict · ci_failing · feedback · drafted · in_review · approved · merged |
| `env(E).contains(changes)` | deploy | waiting · deploying · failed · partial (n/m) · done · n/a |
| `attested` (+ `pin`) | attest | open · stale · done |
| `tracker.status_after(s)`, `tracker.status_in([...])` | tracker | open · done |
| `tracker.reply_from(role)` | tracker | waiting · feedback · done (or an attestation) |
| `session.checkpoint(kind)` | prompt | open · drafted · done |

`feedback` and `in_review` follow the PoC's viewer-side rules: only human feedback counts, only threads where someone else spoke last, only changes requested after the last commit, and the latest verdict wins.

---

## 6. Behaviour

### 6.1 Refresh (on click, or when the app opens)

```
refresh(ticket):
  ticket   = tracker.ticket(key)                     # status → status column
  changes  = code.changesFor(key, repos)             # cached per change by updatedAt / head sha
  for col in columns (left → right):
    for level in col.flow (top → bottom):
      evaluate all blocks of level in parallel       # each check fetches only its own facts
      if a block is not done: later levels = "waits"
    emit(col)                                        # UI animates this column
    if col not done: stop
    if col == status column: stop                    # the gate waits for you
  later columns = "not checked"
```

- "Refresh all" runs tickets in parallel, at most 4 at a time.
- `git fetch` runs only for repos that have a change being checked in a deploy block, at most once per refresh.
- GitHub cost rules carried over from the PoC: a cheap list query; detailed review data only for changes whose `updatedAt` or head commit changed; ETags on REST calls.
- **Moving back:** if the first unfinished column is *before* the status column, the gate before it shows "← Move back to <column>". It's a confirm like any other move.

### 6.2 Attention state (the list dot and My tickets filter)

| State | When |
|---|---|
| **Failure** | any block is `failed` |
| **Needs you** | any block is in a state with a confirmable action (drafted, approved, open attestation, PM feedback), or the gate is ready, or the session is `waiting` (permission or question) |
| **Agent working** | the session is `working` (from hooks) |
| **Waiting on others** | none of the above, and the ticket isn't Done |
| **Done** | the ticket is in the Done column |

### 6.3 Actions and confirmation

- **Clicking a block** opens a popover with the action set for that block's current state.
- **Outward actions** (merge, merge all, update branch, comment, move) and **attestation ticks** need a confirm in the popover. The popover shows exactly what will run (the target, and the text for comments).
- **Local actions run without a confirm:** open, copy, and session prompt.
- After an action, the app refreshes only the affected column, then continues the normal order.
- `code.merge_all` merges in `merge.order`, re-checks each PR live first, and stops at the first failure (as in the PoC).

### 6.4 The Claude Code session

- **Workspace:** `<workspaces>/<TICKET>/` with one git worktree per repo the ticket touches. Each worktree is created from your checkout at `path` on the change's branch.
  - If that branch is already checked out in your main checkout, the app tells you, and doesn't steal the branch.
  - Before starting, it writes `.mcp.json`, `CLAUDE.md` (the guardrails) and `.claude/settings.json` (permissions and hooks).
- **Lifecycle:**
  - Started the first time you open the ticket in the Cockpit, or when a block runs `session.prompt`.
  - Resumed with the same session id after an app restart.
  - Ended when the ticket reaches Done. The transcript is kept.
- **Terminal:** xterm.js connected to the PTY. Keystrokes go straight to Claude Code. There is no CLI of our own.
- **Prompts from blocks:** the template is rendered with the ticket context and pasted into the PTY as a bracketed paste, then Enter. If the session is `working`, the app asks whether to queue the prompt or interrupt the agent.
- **`sdlc` MCP tools:**

| Tool | Permission | Does |
|---|---|---|
| `get_context(ticket)` | allow | ticket, comments, changes, open threads, block states, versions/commits |
| `draft(kind, text, target)` | allow | stores a draft; the matching block shows *drafted* |
| `checkpoint(kind, summary)` | allow | marks a `prompt` block done, or flags "needs you" |
| `code_comment(change, thread, body, resolve)` | **ask** | posts a reply (same code path as the graph action) |
| `merge(change)` | **ask** | merges after a live re-check |
| `tracker_move` | **deny** in v1 | the status move stays yours |

- **Two approval paths in v1.** The same outward action can happen from the graph (popover) or from Claude Code (its permission prompt). After either one, a refresh shows the result. Mirroring a pending TUI permission onto the graph is v1.1.

### 6.5 Local state (SQLite, app data dir)

| Table | Holds |
|---|---|
| `attestations` | ticket, block id, pinned `{repo: sha}`, who and when. Stale when a pin no longer matches |
| `sessions` | ticket → session id, workspace, status, started/ended |
| `drafts` | from `sdlc.draft`: ticket, kind, target, text, state |
| `cache` | ETags, per-change review snapshots, last block states (so My tickets draws right away when the app opens) |

Config never goes into SQLite. Secrets go in the **OS keychain** (Jira API token); until then (from M1), `JIRA_EMAIL` and `JIRA_API_TOKEN` live in the gitignored `.env.secrets`. GitHub reuses `gh auth token`. Kubernetes uses your `kubectl`/`gcloud` login.

---

## 7. Screens (v1)

| Screen | Content | Reference |
|---|---|---|
| My tickets | Filters (All, Needs you, Agent working, Waiting, Done), "Refreshed when the app opened · hh:mm", ↻ Refresh all, ?, cards (key, title, attention, status, graph) | mockup *My tickets* |
| Cockpit | Slim list (dot, key, title) · header (←, key + title, last refresh, status, ↻, ?, ↗ Jira) · graph · Claude Code terminal | mockup *Cockpit* |
| Pipeline editor | Read-only columns · block flows (stacked = each change) · + block · side panel (type, runs, done_when, action set, YAML) · gate panel · Save & commit | mockup *Pipeline editor* |
| ● Live | Connector health; amber when one needs action (for example `gcloud auth login`), with a copy button for the fix command | popover |
| First run | Pick a project from `projects/`, check connections (Jira token, `gh` login, kube contexts, `claude` version), then the first refresh | not in the mockup yet |

Transitions: card → Cockpit (shared graph and title, the list slides in, the terminal rises), and back. Switching tickets in the Cockpit crossfades.

---

## 8. Non-functional

- **Speed:** opening the app shows My tickets from the cache in under 1 s, then refreshes. Refreshing a ticket in Code Review takes under 3 s with warm caches.
- **API cost:** a refresh of a ticket in Code Review makes no delivery or runtime calls for stage or prod. Refresh all for about 10 tickets stays within GitHub's limits (well under 100 GraphQL points).
- **Safety:** no outward action without a confirm (popover or TUI permission). The agent can't move the status. Hooks and MCP accept only localhost connections with a token.
- **Resilience:** a failing connector marks only its own blocks as "could not check" (with the reason in ● Live). The rest of the refresh keeps going.

---

## 9. Milestones

| # | Milestone | Delivers | Exit check |
|---|---|---|---|
| **M0** | **Scaffold + embed spike** (GH-1) | Electron was chosen without a Tauri prototype. `/engineer:new-project` scaffolds the repo (tools, Makefile, CI, Stack section). The spike embeds `claude` in xterm.js with a PTY, resize, colours, bracketed paste and hooks posting to the core. | Claude Code is fully usable in the app; `make check` passes |
| M1 | Skeleton + Jira (GH-3, [spec](GH-3-cockpit-show-sprint-tickets.md)) | Config loader and validation · Jira connector · board columns · My tickets with graphs from the template (no checks yet) · SQLite cache · Cockpit with one session per ticket | My sprint shows with the right columns |
| M2 | Changes + engine | GitHub connector · `change` blocks · refresh engine with early stop + animation · popovers · merge, update branch, comment | The Code Review column is fully correct for real tickets |
| M3 | Delivery | GitHub Actions + kubectl runtime · ancestry and patch-id · `deploy` blocks · `attest` with pins · gates and status moves (forward and back) | "In dev / in stage" is correct across the Deck Builder repos |
| M4 | Sessions | Workspaces and worktrees · Claude Code PTY · harness (inject, hooks, permissions) · `sdlc` MCP server · `prompt` blocks · Cockpit terminal · attention from hooks | A real ticket runs from build to merge through the Cockpit |
| M5 | Editor + polish | Pipeline editor (read/write YAML, validation) · first-run screen · ● Live · ? help · transitions | The PoC can be retired |
| v1.1 | Next | Jenkins connector · mirror TUI permissions onto the graph · several projects | — |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Embedding the Claude Code TUI has quirks (resize, key bindings, paste) | M0 tests exactly this before anything else |
| The hook or permission format changes between Claude Code versions | Pin `min_version` in the harness; one adapter file per tool version range |
| The ancestry check needs fresh refs and history | A targeted `git fetch` per refresh; a patch-id fallback; "could not check" instead of guessing |
| Worktrees clash with branches checked out in your main checkout | Detect it and explain; never force-checkout |
| The Jira workflow forbids some transitions | Pick the transition that leads to the target; otherwise list the allowed ones (as in the PoC) |
| GitHub rate limits | Reuse the PoC's cheap-list + changed-only detail + ETag approach |
| Two approval paths race (graph and TUI) | Every outward action re-checks live state first, so a duplicate becomes a no-op ("already merged" or "already replied") |

---

## 11. Open questions

1. ~~Electron or Tauri, React or Svelte~~: **Electron + React**, decided in M0.
2. **Default workspace location:** `~/.ticket-cockpit/workspaces` (proposed), or `.worktrees/` next to each checkout?
3. **Which prompt templates to carry over from the PoC** for v1: build-ticket, address-review-feedback, resolve-conflict, fix-ci, diagnose-deploy-failure, promote-checklist, draft-pm-note, address-pm-feedback?
