# Brainstorm 01: value, base concepts, first design

Follows on from [ai-sdlc-app-brainstorm.md](../ai-sdlc-app-brainstorm.md). The UI draft is in [design/mockup.html](../design/mockup.html). Open it in a browser.

---

## Decisions so far (Q&A round 1)

| Topic | Decision |
|---|---|
| Parallelism | **Several agent sessions at once**, with a **"Needs you" inbox** of checkpoints. You focus one ticket at a time to decide. |
| Autonomy | **Always ask.** The agent works *inside* a column. Only a human crosses an arrow to the next column. |
| Audience | **Solo developer first**, with local credentials. A team view comes later, built on the same model. |
| Config | **`pipeline.yaml` in a repo, plus a visual editor** in the app that reads and writes it. |

## Decisions, round 1b (feedback on the first mockup)

| Topic | Decision |
|---|---|
| Distribution | **Open source.** A team **forks AI-SDLC-App or makes a branch**, puts its config in `projects/<name>/`, and pushes it. The config lives in the app's repo, not in any product repo. |
| Runtime | **A web app started from that repo in Docker** (`docker compose up` → `http://localhost:4577`). |
| Multi-repo | **One ticket often changes several repos.** Lanes can come from any repo in the project, and the ticket gets one workspace that holds a worktree for each repo it touches. |
| Tickets page | **A separate "My tickets" page** with every ticket's full graph, like the PoC. Clicking a card **animates into the Cockpit** for that ticket. |
| AI session | **Always exactly one session per ticket.** It runs **the configured tool itself** (Claude Code, Codex, …) in a terminal, not a CLI of our own. The app controls it **through tools (MCP) and a harness** (hooks, settings, permissions, injected guardrails). |

That gives the core rule of the product:

> **Agents work inside columns. Humans cross arrows.**

---

## 1. Will it be valuable?

**Short answer: yes, if v1 stays narrow and keeps the "one next action" discipline.** The risk isn't the idea. The risk is turning into a generic workflow engine with fifty half-built adapters.

### Why it's valuable

- **The bottleneck has moved.** With AI coding tools, writing the code is no longer the slow part. The slow part is coordination: feeding context to the agent, watching CI, answering threads, moving Jira, checking that the deploy really rolled out, and replying to the PM. Your PoC already automates the *seeing*. Adding the agent automates the *doing*, and you keep the *deciding*.
- **Agent tools stop at the PR.** Most AI tools for "ticket → agent" end when a PR is opened. Nobody follows the ticket through merge, dev rollout, stage promotion, PM feedback and back again. That post-merge loop is where your PoC is strongest, and nobody else has it.
- **The tracker drifts from reality.** Jira status always lags behind the real work. "The tracker follows the work", including moving backwards, is a quiet but real quality-of-life win.
- **It's proven on one user.** You built it, use it daily, and kept refining the viewer-side statuses. That's the best signal there is for a developer tool.

### Similar products (from memory, so check before relying on it)

| Kind | Examples | How this differs |
|---|---|---|
| Kanban for coding agents | Vibe Kanban | Has its own task board and stops at the PR. This app is tracker-native (Jira/Linear) and covers deploy and PM review |
| Managers for parallel agent sessions | Conductor, Crystal, Claude Squad | Manage sessions and worktrees with no SDLC model. This app is session-per-ticket inside a gated pipeline |
| Agents built into a platform | GitHub Copilot coding agent, Linear agents, Jira Rovo Dev | Each is tied to its own vendor and ends at the PR. This app is tool-agnostic and covers the full lifecycle |
| Cloud autonomous agents | Devin, Factory | Fully autonomous and remote. This app is local, with a human at every arrow |

**The position to own:** *the local cockpit that follows one ticket from start to production. AI agents do the work, and you approve each step.*

### Risks, and how to reduce them

| Risk | How to reduce it |
|---|---|
| **Too many adapters** (each tracker × code host × CI × deploy) | Use contracts based on **capabilities**, not tools. Ship one adapter per kind in v1. Add a **script adapter** as an escape hatch: any shell command that prints JSON in the contract's shape |
| **Config overload** kills the simplicity | Start from **presets** ("GitHub + Jira + GKE", "GitLab + Linear + Argo"). Discover columns from the tracker. The visual editor writes the YAML for you |
| **Agent state is opaque** (a terminal is just text) | The app runs an **MCP server for the agent**, so the agent reports progress through tools. See §2.6 |
| **Platforms move in** (GitHub or Atlassian ship something similar) | Win on working across tools, running locally, and the post-merge stretch. A platform rarely covers its competitors' tools |
| **Developer tools for one person are hard to sell** | Make the core open source and solo-first. Paid features would be team things: shared pipeline packs, a relay for webhooks, a team view |

---

## 2. Base concepts

There are three layers. **Configuration** says what the pipeline looks like. **Runtime** says where each ticket is now. **Experience** is what you see and click.

```
CONFIGURATION (pipeline.yaml)   RUNTIME (derived, live)              EXPERIENCE
-----------------------------   ----------------------------------   ------------------
Project                         Ticket run                           Inbox ("Needs you")
 ├─ Connectors (capabilities)    ├─ Lanes (units: PR, target, …)      Focus view
 ├─ Repos                        │   └─ Nodes (lane × stage)          ├─ Pipeline graph
 └─ Pipeline                     │        └─ State ← Facts            ├─ Agent console
     ├─ Stages (columns)         ├─ Agent session(s)                  └─ Checkpoint panel
     ├─ Arrows (transitions)     ├─ Checkpoints                       Pipeline editor
     ├─ Actions                  └─ Attestations (the only state      Connections
     └─ Prompt templates              stored locally)
```

### 2.1 Project and connectors

- A **project** is a set of connectors, a list of repos and one pipeline.
- A **connector** implements a **capability contract**. The app talks to capabilities, never to tool names:

| Capability | Contract (short) | v1 adapter |
|---|---|---|
| `tracker` | list my items in scope; status, comments, attachments; transitions; who "me" is; a cheap change check | Jira |
| `code` | changes per repo; reviews and threads; CI; mergeability; merge; update branch; link a change to an item by key | GitHub |
| `delivery` | per environment: started, running, failed (with a link), done, live version; manual or automatic | GitHub Actions + Spinnaker link |
| `runtime` | optional: version running where, rollout progress, pod errors | kubectl |
| `agent` | start or resume a session in a directory, send a prompt, stream output, report status | Claude Code (then Codex, OpenCode) |
| `script` | an escape hatch: any command that returns JSON matching one of the contracts above | built in |

### 2.2 Pipeline: stages and arrows

> **Replaced by [02-board-model.md](02-board-model.md):** columns are now the tracker's fixed board columns, with per-change and ticket rows. Going back is derived, not configured. This section is kept for history.

- A **stage** (a column) declares:
  - **Unit kind:** what one lane is: the ticket, a code change, a deploy target.
  - **Node states and completion check:** for example `merged`, `rolled_out`, `attested`, `last_comment_is_mine`.
  - **Actions per node state.**
  - **Skip rules:** no deploy for this repo, superseded by a newer change, ticket closed.
- An **arrow** (a transition) is the configurable handoff between stages. **This is where arrows become configurable:**

| Arrow field | Meaning | Example |
|---|---|---|
| `from` / `to` | The shape of the graph. Arrows can skip columns or point backwards | `pull_requests → dev_deploy` |
| `kind` | `forward`, `skip` or `rework` (backwards) | `rework: pm_review → pull_requests` |
| `guard` | What must be true before the arrow can be crossed, checked for every lane | `all(lanes).code.merged` |
| `on_cross` | Effects run **after you click** | Merge all in order; move the tracker to *Code Review* |
| `handoff` | The prompt or agent task that starts in the next column | `prompt: verify-dev-deploy` |
| `trigger` (rework only) | The fact that opens a backward arrow | a new change appears while the tracker is ahead |
| `crossing` | Who crosses. **v1: always `human`**; `auto` is kept for later | `human` |

So an arrow is a **contract between two columns**: what it needs, what happens when you cross it, and who picks up the work on the other side.

### 2.3 Ticket run, lanes, nodes

- A **ticket run** is one ticket flowing through the pipeline.
- A **lane** is one unit, usually a code change. Lanes **fan out** at Pull requests and **fan in** at PM review.
- A **node** is a lane in a stage. Its state is **derived** from facts, never stored.

### 2.4 Facts → state (no stored state, except attestations)

- A **fact** is something a connector observed: a PR merged at a SHA, a tag, a rollout finished, a comment by someone.
- State = f(facts). So the app can always rebuild itself from the tools.
- The **only local state is attestations**: human claims such as "Validated in NP". Each is **tied to a version signature**, as in the PoC, so a new release asks again.

### 2.5 Actions

Every node action has a **type** and a **reach**:

| Type | Example |
|---|---|
| `link` | Open the failing CI run or the Spinnaker pipeline |
| `copy` | Copy the version to promote |
| `command` | `gcloud auth login` |
| `api` | Merge, update branch, move the tracker |
| `agent` | Send a prompt template into the ticket's agent session *(new, and it replaces copy-prompt)* |

| Reach | Who may run it |
|---|---|
| `read` / `local` | The agent can do it inside its session |
| `outward` (merge, post a comment, move the tracker, promote) | **Only the human**, from the app. The agent *drafts*; you *send* |

### 2.6 Agent session: the killer feature

- **Exactly one session per ticket**, for the whole life of the ticket. Every column's handoff prompt goes into that same session, so the agent keeps the ticket's history. Keeping the context small (compacting) is the tool's own job.
- **The session runs the configured tool itself**, with its own interface (TUI), in a PTY streamed to the browser (xterm.js over a WebSocket). There is **no CLI of our own**. You can type straight into the tool whenever you want.
- **The ticket workspace:** the session's working folder is `workspaces/<ticket>/`, holding one git worktree per repo the ticket touches (`ba-backend/`, `dtb-docs/`, …). That's how one session covers changes in several repos.
- **A harness wraps the tool.** It's the agent adapter, described in a `harness/<tool>.yaml` file per tool:

| Harness part | What it does | Claude Code example |
|---|---|---|
| `launch` / `resume` | Start the session with a fixed id, and resume it after a restart | `claude --session-id <uuid>` / `claude --resume <uuid>` |
| `inject` | Register the app's MCP server and add the guardrails | `.mcp.json` + `CLAUDE.md` at the workspace root, or `--append-system-prompt` |
| `observe` | Tool hooks call back to the app, which updates the session status | hooks such as `Stop`, `Notification`, `PreToolUse` |
| `control` | Type a prompt into the PTY (bracketed paste), interrupt, answer permission requests | Send `Esc`, paste a template, answer through the permission hook |
| `policy` | Generate the tool's permission settings from the pipeline's guardrails | Deny `gh pr merge`, posting to Jira, and promotion commands |

  A tool with no hooks still works: it falls back to the MCP `checkpoint` tool and to watching for idle output.
- **The app is an MCP server for the agent.** Every major CLI agent speaks MCP, so the app exposes tools like these:
  - `sdlc.get_context(ticket)`: the ticket, the specs, the lanes, the review threads, the versions
  - `sdlc.checkpoint(kind, summary, artifacts)`: "I'm done", "I need a decision", "I'm blocked"
  - `sdlc.draft(kind, text)`: a PR reply, a PM note or a Jira comment, shown in the panel and **never posted** by the agent

  This fixes the "terminal is opaque" problem without parsing text per tool. Tool-specific hooks (such as Claude Code's Stop and Notification hooks) and a fallback that watches for idle output fill in the rest.
- **Session status:** `working`, `needs input` (a permission request or a question), `checkpoint` (done, waiting for you), `error`, `idle`.

### 2.7 Checkpoints and the inbox

A **checkpoint** is any moment that needs a human:

| Kind | Example | Priority |
|---|---|---|
| `failure` | Pods in CrashLoopBackOff on stage | 1 |
| `permission` | The agent asks to run `make migrate` | 2 |
| `review` | The agent finished; check its diff or draft | 3 |
| `arrow_ready` | The guard is green; cross to the next column? | 4 |
| `external` | New PM feedback, or a reviewer replied | 5 |

The **inbox** lists every open checkpoint across your tickets, ordered by priority and then age. This generalises the PoC's viewer-side statuses: *every status is about what **you** need to do.*

Each ticket also gets one **attention state**: `Needs you`, `Agent working`, `Waiting on others`, `Blocked` or `Done`.

### 2.8 Next action

The rule from the PoC stays: **the next action comes from the earliest unfinished column**. It shows a pulsing ring on the graph and is the checkpoint's main button.

### 2.9 Prompt templates and guardrails

- Templates are versioned **next to `pipeline.yaml`**, in `projects/<name>/prompts/*.md`. They have variables like `{{ticket.key}}`, `{{lane.pr.threads}}` and `{{versions.live}}`.
- **Guardrails** are a project-level preamble added to every agent task, for example "no comments in code" and "draft, don't post". They're plain text.

### 2.10 Distribution, config and runtime

```
AI-SDLC-App/                      ← your fork or branch (open source upstream)
├─ app/                           the web app (upstream code)
├─ projects/
│  ├─ example/                    the only project shipped upstream
│  └─ deck-builder/               yours: never touched by upstream
│     ├─ project.yaml             connectors, repos, merge order, delivery per repo
│     ├─ pipeline.yaml            stages + arrows
│     ├─ harness/claude-code.yaml
│     ├─ prompts/*.md
│     └─ guardrails.md
├─ docker-compose.yml             docker compose up → http://localhost:4577
└─ .env.secrets                   gitignored (Jira token, …)
```

- **Getting upstream updates** is a normal `git merge upstream/main` into your branch. It doesn't conflict, because upstream only ever changes `app/` and `projects/example/`.
- **The pipeline editor writes to `projects/<name>/`** and commits to your branch. Pushing it is up to you.
- **Docker volumes** (draft):
  - `/repos`: clones of the project's repos (the app clones them, or you mount your existing checkouts)
  - `/workspaces`: one folder per ticket with its worktrees, mounted to the host so your IDE can open them
  - Credentials mounted read-only: `~/.config/gh`, `~/.kube`, `~/.config/gcloud`, and the AI tool's own login (for example `~/.claude`)
- **The AI tool is installed in the image** at the version the harness pins. A bonus: the agent runs inside a container, which is a natural sandbox.
- **Web app:** it binds to localhost only, for a single user. The browser gets live updates over SSE (as in the PoC) and terminals over WebSockets.

---

## 3. First design

The mockup has four screens:

0. **My tickets** (the landing page): every ticket in the sprint with its full graph, as in the PoC, plus filters by attention state. **Clicking a card animates into the Cockpit**: the card's graph moves into the Cockpit's graph, the inbox slides in from the left, and the console rises from below (the browser's View Transitions API). "← All tickets" plays it in reverse.
1. **Cockpit**: the inbox on the left. In the centre, the focused ticket's pipeline graph with configurable arrows drawn between the columns. At the bottom, the **agent console** (a terminal) next to the **checkpoint panel**, which holds the agent's summary, its drafts, the guard checklist for the next arrow, and the cross button.
2. **Pipeline editor**: the columns and arrows on a canvas, including rework and skip arrows. Click an arrow to edit its guard, effects and handoff. A live YAML preview sits alongside.
3. **Concepts**: the model above, as a diagram.

The visual language follows the PoC: a dark theme, green for done, amber for "you're needed", red for failures, blue for the current column, and dashed lines for locked or skipped.

What's new compared with the PoC:
- **Arrows are first-class.** Each gutter between columns shows the arrow's state: locked, guard pending, ready to cross, or crossed. Rework arrows are drawn as curves going back.
- **The agent shows on the graph.** A node the agent is working on has an animated agent badge.
- **No more clipboard.** Prompt actions say "▶ Run in agent" (sent into the session). "Copy" stays as a secondary option.

---

## 4. Q&A round 2 (next session)

1. **Repos in Docker:** should the app clone the repos itself into a volume, or mount your existing checkouts from the host?
2. **Pre-code stages:** should the pipeline start earlier, with *Refine* (the agent turns the ticket into a spec) and *Plan* (the agent splits it into PRs and lanes)? Or does it start at "Ticket"?
3. **Gating across lanes:** must *all* lanes finish a column before the next one opens, as today? Or can a lane go ahead on its own, for example a backend PR deploying while the frontend PR is still in review?
4. **Notifications:** desktop notifications for checkpoints? Only for priorities 1–2?
5. **Tech stack:** a web app in Docker is now decided. Still open: the backend language (TypeScript with node-pty is the natural fit), the frontend framework, and SQLite for caches and attestations.
6. **Rework semantics:** does crossing a rework arrow reset attestations only for the affected lanes, or for the whole column?
