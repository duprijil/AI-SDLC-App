# Ticket-based AI SDLC desktop app: brainstorm starter

This brief is the starting point for designing a tool-agnostic desktop app. The app grew out of **PR Action Board**, a local dashboard built for one developer's own workflow. It covers:

1. The vision.
2. What the current app does and why.
3. What was learned building it.
4. How it might generalise.
5. Open questions.

---

## 1. Vision

A desktop app for a **full AI-assisted SDLC that is simple and ticket based**. The ticket is the unit of work. The app shows where each ticket is, from "not started" to "in production". At every step it gives the one next action: a click, a status change, or a ready-made prompt for an AI coding tool.

Setting up a project:

1. **Create a project** and pick its tools:
   - **Work management:** Jira, Notion, Linear, GitHub Issues, …
   - **Code hosting:** GitHub, GitLab, Bitbucket, … plus the list of repos.
   - **Deployment:** GitHub Actions, GitLab CI, Jenkins, Spinnaker, Argo CD, plain Kubernetes, …
   - **AI tool:** Claude Code, Codex, OpenCode, …
2. **The project builds a ticket pipeline from the board's columns.** For example, a Jira board's columns become the pipeline's stages.
3. **Each column gets a configurable list of actions.** These include checks that decide when a column is done, buttons, prompts and status moves.

Some things should stay the same as in today's board:

- It shows **one ticket at a time**, not a list of services or a metrics view for managers.
- **Nothing can skip ahead.** A column opens only when every piece of work has finished the previous one.
- **The tracker follows the work.** The ticket status moves with progress, and it moves back when work restarts.
- **AI is a step in the pipeline, not a chat window.** Each step can hand over a prompt that already holds the context: links, versions, review threads and comments.
- **It runs locally with the user's own credentials.** No admin installs, no Marketplace apps and no public webhooks are needed.

---

## 2. What the current app does

The current app is a zero-dependency Node server with one HTML page. It runs on `localhost:4577` and is started with `make run`.

Integrations:

| Tool | Used for | Access |
|---|---|---|
| GitHub | Pull requests and deploy runs | GraphQL and REST, using the `gh auth token` login |
| Jira Cloud | Tickets | REST API with an Atlassian API token |
| Kubernetes (GKE) | Checking deploys | `kubectl` |
| Spinnaker | Manual ST promotion | A deep link only |

### 2.1 Pull requests tab

- **Table across several repos.** One sortable, filterable table of open PRs, with these columns:
  - Status, Repo, PR #, Title, Ticket, Jira status
  - Created by (avatar), Reviewed by, Approvals
  - CI, Merge state, Threads, Active
- **Default order:** by status, then repo. The skeleton shows while it loads.
- **Repo list.** A popover lets you enable, disable, add and remove repos. They're saved in `config.json`.
- **Statuses from the viewer's point of view**, each with a copyable prompt:
  - **Needs review:** you haven't reviewed it and no human has reviewed it yet.
  - **Already reviewed:** someone else reviewed it. Clicking still copies a review prompt.
  - **Needs re-review:** new commits since your review. A short prompt for the same session.
  - **Needs reply:** someone answered your comment in a thread that is still open.
  - **Waiting on author:** you've reviewed it and nothing has changed since.
  - **Draft.**
  - **Address feedback** (your own PRs) applies when any of these is true:
    - changes were requested after the last commit
    - a thread is open where someone else spoke last
    - a human left new review comments since the last commit

    Bots are ignored unless they leave an open thread. An approved PR with no open threads isn't flagged.
- **Batch prompts.**
  - **Review all (N)** starts one session with a sub-agent for each PR that needs review.
  - **Re-review all (N)** is pasted into that same session afterwards.
- **Review prompt template.** It's based on the team's `ai/specs/prompt_template.md`. The review runs in a git worktree.
- **Jira column.** The ticket key comes from the PR title or branch name, and the column shows its live status.

### 2.2 My tickets tab: one pipeline graph (a DAG) per ticket

Each ticket in the current sprint (`assignee = currentUser() AND sprint in openSprints()`) gets a card. The card holds a graph with these columns:

```
Ticket → Pull requests → Dev deploy (NP) → Stage (ST) → PM review → Pending deployment → Done
```

**Layout:**
- Each PR for the ticket is a **lane** through Pull requests → Dev → Stage.
- PRs are found by the ticket key, among open PRs and PRs merged in the last 45 days.
- Lanes are sorted by merge order: dataform → backend → frontend → action service → others.
- Connectors are SVG elbows. They're dashed when the next node is locked or skipped.

**Column gating:**
- The current column is highlighted. Columns ahead of it are greyed out.
- The next step has a pulsing ring.

**Every node can be clicked:** it opens a link, copies a prompt, runs an action, or copies a command.

**Jira-status gates.** A column's nodes stay locked until the Jira ticket reaches that column's status. Pressing the column header moves the ticket:

| Column | Header button moves the ticket to |
|---|---|
| Ticket | In Progress |
| Pull requests | Code Review (Dev deploy unlocks with it) |
| Stage | End to End Testing |
| PM review | Ready for Demo |

Pending deployment has no button; it turns on when Jira says Pending Deployment.

**Rework (going back).**
- When work restarts behind the Jira status, that column and everything after it locks again. The header then offers **"← Back to Code Review"**.
- A common case is a new PR after PM feedback while Jira says Ready for Demo.

**The nodes, column by column:**

- **Ticket:**
  - Copies the "build this ticket" prompt. The prompt creates `ai/specs/<ticket>/` with the prompt and the Jira attachments.
  - A ticket that hasn't started shows a **ghost lane** made of skeleton boxes.
- **Pull requests (per PR):**
  - **States:** Draft, Merge conflict, Address feedback, CI failing, Behind main, Checking, In review, Approved (waiting for checks), Ready, Merged.
  - **Actions:**
    - Copy a conflict-resolution prompt.
    - Copy an address-feedback prompt.
    - **Update branch** with main.
  - **Merge all:**
    - It appears in the column header once every PR is ready.
    - It squash-merges in merge order.
    - Before each merge it re-checks the PR live and refuses one that is merged, a draft, conflicting, behind main or not clean.
    - It stops at the first failure.
- **Dev deploy (per PR):**
  - **How the deploy run is found:**
    - The run is a `meta-build.yaml` run, which triggers on `pull_request: closed`; it's found by the PR's head SHA.
    - For dataform, the run is the `deploy-np.yaml` run on the push, found by the merge SHA.
  - **How it's verified:**
    - The release tag (`vX.Y.Z` on the merge commit) is compared with the image tag that `kubectl` reads from the NP deployment.
    - The rollout is checked the way `kubectl rollout status` does it.
    - New pods that crash or can't pull their image show as failed straight away.
    - A deploy counts as "Not landed" only after a 20-minute grace period.
  - **What the node shows:**
    - **States:** waiting, a spinner while deploying or rolling out, failed (links to the failed run or to the GKE pods page), deployed, and could-not-verify (copies `gcloud auth login`).
    - **Versions:** two lines, "PR vX" (the version this PR shipped in) over "live vY". The live line is green when it includes the PR and amber when it doesn't.
  - **Repos with no deploy:** they follow any workflow that runs on main after the merge, such as docs publishing. Otherwise the node says "No deploy".
  - **Superseded PRs:** an older merged PR in the same repo whose version never went live is **Skipped, "Ships with #N"**.
  - **During a rollout:** a PR already included in the version the old pods run stays Deployed.
  - **"Validated in NP":**
    - It's a checkbox the user ticks.
    - It's required before Stage.
    - It's tied to the versions that were checked, so a new release asks for it again.
- **Stage (ST):**
  - **Promotion is a manual gate in Spinnaker.**
    - The node links to the ST pipeline (`…/executions?pipeline=<name>-st`) and copies the version to promote.
    - The board never clicks the promote button itself.
  - **Tracking:**
    - Rollout and failure are tracked like Dev: a spinner, pod progress, and a link to the GKE workload page when it fails.
  - **Dataform** follows its `deploy-stage.yaml` dispatch run.
- **PM review:**
  - **States:**
    - **With PM:** clicking copies a prompt that drafts a short note on what was done or fixed.
    - **PM feedback (yellow):** the latest comment isn't yours. Clicking copies a prompt to address it, with the comments quoted.
    - **Reply to PM (yellow):** a PR was merged after the feedback. Clicking copies a prompt that drafts the reply with the PRs and versions.
  - The board never posts comments itself.
- **Pending deployment:** waits for the production release.
- **Done:**
  - When Jira says Done, the ticket is done, and every node that never finished becomes **Skipped**.
  - Tickets that were Removed, Cancelled, Won't Do or Duplicate are hidden.

### 2.3 Live updates (webhooks without webhooks)

Real webhooks need a public URL and admin rights on the repo or Jira project, so the server watches cheaply and pushes changes to every open tab with **Server-Sent Events**. A **● Live** indicator shows the connection.

| Source | How it's watched |
|---|---|
| GitHub | Repo event feeds every 60s with ETags. A 304 answer is free. |
| CI and merge state | Not in the event feed, so the PR list is re-read every 90s while checks run. |
| Deploys | Graphs rebuilt every 30s while deploying, 2 min while waiting on a promotion, 10 min when idle. |
| Jira | REST every 60s. A Jira-only change is patched into the cached board without any GitHub call. |

Other rules:

- Updates go out only when something changed, and nothing is polled while no tab is open.
- The server re-checks right away after the app's own actions: merge, branch update, Jira move, validation.

### 2.4 Prompt catalogue (all copy-to-clipboard, nothing auto-sent)

| Prompt | Where it comes from |
|---|---|
| Build ticket | Ticket node |
| Review PR (worktree) | PR table |
| Re-review (short, same session) | PR table |
| Review all, one sub-agent each | PR table |
| Re-review all | PR table |
| Address my PR feedback | PR table and PR node |
| Resolve merge conflict | PR node |
| Address PM feedback | PM review |
| Draft reply to PM after rework | PM review |
| Draft PM note on what was done | PM review |

The team guardrails are built into the prompts:

- No comments in the code.
- Unit tests are written once the ticket is manually tested.
- Draft PR, Jira and PM texts in code blocks, and don't post them.

---

## 3. What was learned

### 3.1 Integrations

- **GitHub GraphQL cost is priced on the worst case.** A query costs what it *could* return, not what it does, so 50 PRs × 50 threads × comments × 6 repos came to about 165 points per refresh. The limit was hit at 5,000 points an hour. The fix:
  - A cheap list query.
  - Heavy review data read **only for PRs whose `updatedAt` or head commit changed**, cached per PR and re-read every 10 minutes because resolving a thread doesn't always bump `updatedAt`.
  - One shared fetch for all tabs.
  - ETags on REST calls.

  The result is about 6 points when nothing changed and 0 points when quiet.
- **The node limit:** GraphQL's `MAX_NODE_LIMIT` forces small page sizes.
- **Event feeds and ETags are the cheapest way to watch without webhooks**, but CI and check state are missing from them.
- **Deploy triggers differ by repo.** Some run on `pull_request: closed` (head SHA), others on push (merge SHA). Release tags sit on the merge commit.
- **"Deployed" isn't "image tag matches".** The tag changes when the manifest is applied. A deploy is done only once the rollout is complete. While it's running, the old pods still serve the previous version.
- **Spinnaker's API needs an SSO session, and promotion is a deliberate human step.** The board deep-links and copies the version.
- **Jira through an MCP connector** (`claude -p` + Atlassian Rovo, Haiku) worked without an API token, but took about 30s and model cost per read. With an API token, REST reads take about 0.3s. Comments come as ADF and need converting to plain text.
- **The Jira workflow allowed moving to any status**, which made going back easy. Other workflows may not allow it, so the transition picks whichever transition leads to the target status and lists the available ones when there's none.

### 3.2 Product

- **Every status had to be from the viewer's side.** "Needs review" for others' PRs and "Address feedback" for your own needed many corrections:
  - only human feedback counts
  - only threads where someone else spoke last count
  - only changes requested after the last commit count
  - the latest verdict wins
- **One "magic button" was replaced by making every node clickable**, plus a pulsing "next" ring.
- **Finish the column first.** The next step always comes from the earliest unfinished column. Conflicts can appear even when everything looks ready, so Merge all re-checks each PR live.
- **The lifecycle isn't linear.** PM feedback brings back new PRs, statuses move back, and validation must be redone for new versions.
- **Several PRs in one repo for one ticket** need versions tracked per PR, and older PRs are carried by newer ones.
- **The AI tool belongs in the loop as prompts first.** Copy, don't post, keeps a human in control of Jira, GitHub and PM communication.

---

## 4. Mapping today's app to the tool-agnostic vision

### 4.1 Adapter interfaces (first sketch)

| Concept | Today | Adapter contract (draft) |
|---|---|---|
| **Work item source** | Jira REST | List items in the current scope (sprint, cycle, view); read status, comments and attachments; move status; know who "me" is; a cheap change check |
| **Board columns** | Hard-coded Jira statuses | Read the columns and statuses from the tool and map them to pipeline stages |
| **Code host** | GitHub GraphQL and REST | List open and merged changes per repo; reviews and threads; CI; mergeability; merge; update branch; link a change to its item by key |
| **CI / deploy** | GitHub Actions runs, kubectl, Spinnaker link | Per environment: deploy started, running, failed (with an error link), done, the version that's live, and whether it's manual (link, copy version) or automatic |
| **Runtime check** | `kubectl` rollout status | Optional: what version runs where, rollout progress, pod errors |
| **AI tool** | Claude Code prompts copied to the clipboard | Prompt templates per action; later perhaps launch a session or send a prompt into one |
| **Change watching** | Event feeds with ETags, polling, SSE | Per adapter: webhooks when reachable, cheap polling otherwise |

### 4.2 Per-column actions

Each pipeline column could declare:

- **An entry status (gate):** the tracker status needed to unlock the column, and whether entering it is a button or happens automatically.
- **Units:** what one lane is (a PR, a deploy target, a single item).
- **A completion check per unit:** merged, deployed and rolled out, a checkbox ticked, the latest comment being mine, …
- **Actions per unit state**, each a link, prompt, command or API call. For example:
  - CI failing → open checks.
  - Conflict → conflict prompt.
  - Ready → merge.
- **The column's own actions:** Merge all, Validated, Move status.
- **Rules for skipping:** no deploy for this repo, superseded by a newer change, ticket closed.
- **Rules for going back:** a new unit appears while the tracker is ahead → move back to this column's status.

---

## 5. Open questions to brainstorm

**Product and scope**
- Who is it for: one developer (as today), a team, or both? Is there a shared or team view of all tickets?
- What does "full AI SDLC" include? Refinement and planning (splitting a story into PRs), building, review, testing, deploying, release notes, incident follow-up?
- Should the AI stay "prompt you copy", or launch and drive sessions? Where do humans have to approve: merges, status moves, posting comments, promotions?

**Configuration**
- How should a project be configured? With a UI wizard, a file in the repo (pipeline as code), or both?
- Can the board columns and their mapping be found automatically from the tracker?
- How are prompt templates stored, versioned and shared? Should they come from the team's repo, like `ai/specs/prompt_template.md`?
- How should per-repo deploy knowledge be described: workflow names, environments, runtime checks, manual gates?

**Architecture**
- Should it be a desktop shell (Electron or Tauri) with a local server, or a pure desktop app?
- Where are credentials stored? Options include the OS keychain and reusing existing CLI logins (`gh`, `glab`, `gcloud`, `kubectl`).
- How should adapters be built: as plugins? Is MCP the integration layer for trackers, or are direct APIs needed for speed and cost?
- Which events need webhooks or a relay and which can be polled? Is there an optional hosted relay for teams?
- Is there local state (validated flags, caches, history), and should it sync?

**Pipeline semantics**
- How general should gating be? Work in parallel across columns, required versus optional columns, per-repo pipelines inside one ticket?
- How are going back, partial releases and hotfixes modelled?
- How are versions tracked across tools that don't use semver tags?

**Business**
- Is there an open-source core with paid team features?
- What sets it apart from GitHub's PR dashboard, Jira's development panel, HCL Velocity, Swarmia, LinearB and Backstage or Port? (Section 6 has the details.)

---

## 6. Similar products (from a quick web search, Nov 2026)

| Category | Examples | Gap compared with this vision |
|---|---|---|
| PR dashboards | GitHub pulls dashboard, PR Radar, Pullp, reviews (terminal UI), Graphite, Harness | No ticket lifecycle, deploys or AI next steps |
| Ticket → PR → deploy tracking | HCL DevOps Velocity (the closest match), Jira development panel and deployments with GitHub for Jira | Shows progress but doesn't drive actions. Needs admin installs. No Spinnaker. No prompts |
| Engineering metrics | Jellyfish, LinearB, Swarmia | Aimed at managers and DORA metrics, not a developer's next action |
| Developer portals | Backstage or Port with Kubernetes, GitHub Deployments and Jira plugins | Shows each service, not each ticket. Needs a platform team |

Nothing combines a per-ticket gated pipeline, a tracker status that follows the work (including going back), rollout-level deploy checks and AI prompts for each step.

---

## 7. Current code layout (for reference)

`pr-action-board/` has no dependencies.

- `server.js` (about 590 lines):
  - GitHub list and detail queries with caches.
  - PR classification.
  - Merging and branch updates.
  - Jira REST wiring.
  - Routes: `/api/prs`, `/api/lifecycle`, `/api/events`, `/api/merge`, `/api/update-branch`, `/api/jira/transition`, `/api/ticket-state`, `/api/my-tickets(/refresh)`, `/api/repos`.
- `lifecycle.js` (about 520 lines):
  - Builds the per-ticket graph: lanes, PR, dev and stage nodes.
  - kubectl rollout checks, version tracking, superseded skips.
  - Jira gates, going back, PM review, the next action.
- `live.js` (about 155 lines): the change watcher and the SSE broadcaster.
- `jira.js` (about 75 lines): the Jira REST client (search, comments, transitions, ADF to text).
- `public/index.html` (about 1,100 lines): both tabs, the graph rendering, SVG connectors and the prompt templates.
- Data files:
  - `config.json`: repos, port, `staleDays`, Jira base URL, `jiraRefreshSeconds`.
  - `ticket-state.json`: NP validation flags with version signatures.
  - `jira-my-tickets.json`: the last sprint snapshot.
  - `.env`: the Jira token.
- `docs/My tickets app.drawio`: the original sketch of the ticket graph.
