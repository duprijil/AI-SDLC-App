# Check pull requests, refresh column by column, act on changes (M2)

**Ticket:** GH-4
**Status:** Implemented
**Domains:** change (new), cockpit, ticket, pipeline, session

## Context

M1 shows each ticket as the board's columns with their block flows, but checks nothing. M2 is milestone 2 of [v1-scope.md](v1-scope.md) §9: read the ticket's pull requests from GitHub, give every `change` and `tracker` block a real state, refresh column by column with early stop (shown live on the graph), and let the developer act on a change from a popover: merge, update the branch, reply to a review thread, or send a built-in prompt to the ticket's Claude Code session. Attention states and the My tickets filters arrive with it.

## User story

**As a** developer with several tickets and pull requests in flight
**I want** each ticket's graph to show the real state of its PRs, refreshed the way the work flows, with the next action one click away
**So that** I see what needs me without opening GitHub, and act on it from the board or through Claude Code

## Acceptance criteria

### Changes

- [ ] A **change** is a PR in one of the project's repos (`repos[].github`) whose title or branch matches `code.link.key_pattern` and contains the ticket key. Open PRs count, and so do PRs merged in the last `code.link.merged_days` days.
- [ ] An `each_change` level shows one block per change, labelled `#<number> <repo>`. With no change yet, it shows one "No PR yet" block.
- [ ] A change block in a `change.ready` level (In Progress) shows one of: **none**, **draft**, **CI failing**, **ready** (done).
- [ ] A change block in a `change.merged` level (Code Review) shows the first state that applies, in this order:

  | State | Rule |
  |---|---|
  | **merged** (done) | the PR is merged |
  | **conflict** | GitHub reports merge conflicts |
  | **CI failing** | the head commit's checks failed or errored |
  | **feedback** | the PR is mine, and one of these is true: changes were requested after the last commit; a thread is open where someone else (not a bot) spoke last; a human left new review comments since the last commit |
  | **behind** | the branch is behind its base |
  | **approved** | the review decision is approved and checks pass |
  | **in review** | anything else |

- [ ] Bots never cause **feedback**, unless they have an open thread where they spoke last.
- [ ] A `tracker` block is done when the ticket's column is after the block's column, or when the ticket is in the last column and the block is there.
- [ ] `deploy`, `attest` and `prompt` blocks show "checked from M3/M4". They don't count as unfinished, so they never stop a refresh.

### Refresh

- [ ] **↻ Refresh** on a ticket checks its columns from left to right and, inside a column, its levels from top to bottom. The blocks of one level are checked in parallel.
- [ ] The refresh stops after the first column with an unfinished block, or after the ticket's status column, whichever comes first. Later columns show "not checked", and nothing is fetched for them.
- [ ] While it runs, the graph shows it live: blocks waiting to be checked are dimmed, the level being checked glows, and the header names the column and level. When it ends, the header shows "Stopped at <column> · hh:mm" or "Checked through <status column> · hh:mm".
- [ ] **Refresh all** on My tickets first refreshes the sprint from Jira (as in M1), then the tickets, at most 4 at a time, each card animating its own refresh.
- [ ] When the app opens, My tickets shows the last board and block states from the cache at once, then runs **Refresh all**.
- [ ] Each column header shows "<done> of <total> done". The gate after the ticket's status column shows the same count, turns blue ("ready") when its column is complete, and does nothing when clicked (status moves arrive in M3).
- [ ] If GitHub fails (bad token, no network, rate limit), the affected blocks show "could not check" with the reason, the refresh goes on with the other blocks, and ● Live turns amber.

### Actions

- [ ] Clicking a change block opens a popover with the actions for its state:

  | State | Actions |
  |---|---|
  | none | ▶ build the ticket (prompt) |
  | draft | open PR |
  | CI failing | open checks · ▶ fix CI (prompt) |
  | conflict | ▶ resolve the conflict (prompt) · open PR |
  | feedback | the open threads, each with a reply box and "resolve" · ▶ address the feedback (prompt) · open PR |
  | behind | update branch |
  | approved | merge |
  | in review / merged | open PR · copy link |

- [ ] **Merge**, **Update branch** and **Reply** need a confirm in the popover, which shows exactly what will happen. Merge uses `code.merge.method` and re-checks the PR live first. If it's no longer approved and clean, the merge is refused with the reason.
- [ ] A **▶ prompt** action opens the ticket in the Cockpit (starting its session if needed) and pastes the prompt into Claude Code once the session reports idle. The prompt contains the ticket key and title, the PR link, and (for feedback) the open threads' text.
- [ ] After an action, only that ticket is refreshed again.

### Attention

- [ ] Every ticket gets one attention state, shown as the list dot and the card badge:

  | State | When |
  |---|---|
  | **Failure** | any block is CI failing |
  | **Needs you** | any block is feedback, conflict, behind or approved, or a gate is ready, or the session is waiting |
  | **Agent working** | the session is working |
  | **Waiting** | none of the above, and the ticket isn't in the last column |
  | **Done** | the ticket is in the last column |

- [ ] My tickets has the filters All, Needs you, Agent working, Waiting and Done, each with its count, and sorts cards by attention (Failure first), then by column.

### Configuration

- [ ] `GITHUB_TOKEN` in `.env.secrets` is required. Every repo in `project.yaml` needs `github: owner/name`. `code.link.key_pattern` must be a valid regular expression. Every `change` block needs `done_when: change.ready` or `change.merged`, and must sit in an `each_change` level. Problems show in the startup dialog, as in M1.
- [ ] `make check` passes.

## Out of scope

- `deploy`, `attest` and `prompt` checks, status moves, moving back, and `code.merge_all` (M3).
- Editable prompt templates, agent drafts, MCP tools and worktrees (M4). The built-in prompts move to `projects/<name>/prompts/` then.
- Background or scheduled refresh (decided: never).
- GitLab, Bitbucket and GitHub Enterprise hosts.

## Technical aspects

### Flow

**Refresh** (renderer → `cockpit_ipc` `refresh:ticket` / `refresh:all`):
- The `RefreshTicketFlow` use case walks the ticket's columns and levels, and emits a `RefreshProgress` event before each level.
- A change level asks the `change` domain's `FindTicketChanges` use case, once per refresh, for the ticket's changes and their review details.
- The use case then derives each block's state with the `BlockStateRules` model, and returns a `TicketFlow` model.
- Progress events stream to the renderer on `refresh:progress`. The final `TicketFlow` is cached and returned.

**GitHub reads** (`code_host_github` adapter):
- **List:** one GraphQL query per repo per refresh for open PRs, plus PRs merged within `merged_days` (number, title, branch, state, author, `updatedAt`, `headRefOid`). It's shared by every ticket refreshed in the same run.
- **Detail:** one GraphQL query per PR (`node(id)`) for `isDraft`, `mergeable`, `mergeStateStatus`, `reviewDecision`, the reviews, the review threads (with their last comments), and the head commit's `statusCheckRollup`. It runs only if the PR's `updatedAt` or `headRefOid` changed since the cached detail, or if the cached detail is over 10 minutes old.
- **Viewer:** `viewer { login }`, once per app run.

**Actions** (renderer → `cockpit_ipc` `change:action`):
- `RunChangeAction` dispatches to the `change` domain's `MergeChange`, `UpdateChangeBranch` and `ReplyToThread` use cases.
- They call the `code_host_github` adapter: the GraphQL mutations `mergePullRequest` and `updatePullRequestBranch` (both pinned to the expected head commit), `addPullRequestReviewThreadReply`, and optionally `resolveReviewThread`. Then the ticket is refreshed.

**Prompts:** the renderer navigates to the Cockpit, waits for the ticket's session status to be idle, then calls the existing `SendAgentPrompt` with the built-in prompt text that the `BuildChangePrompt` use case renders in the main process.

### Files

| File | Change |
|---|---|
| `.env.secrets.example`, `src/config.ts` | add `GITHUB_TOKEN` |
| `.dependency-cruiser.cjs` | add `change` to the normal domains |
| `src/pipeline/models/project.ts`, `src/pipeline/adapters/project_source_yaml.ts` | validate `repos[].github`, `code.link` (`key_pattern`, `merged_days`) and `code.merge.method`; expose `CodeSettings` |
| `src/change/models/errors.ts` | new: `ChangeError`, `CodeHostAuthError`, `CodeHostUnavailableError`, `CodeHostRateLimitError`, `MergeRefusedError` |
| `src/change/models/change.ts` | new: `Change` (repo, number, title, branch, URL, author, state, `updatedAt`, head commit) |
| `src/change/models/change_review.ts` | new: `ChangeReview` (draft, mergeable, merge state, review decision, reviews, threads, checks), with the viewer-side rules `hasFeedbackFor(viewer)`, `isApproved()`, `isCiFailing()` |
| `src/change/models/review_thread.ts` | new: `ReviewThread` (id, path, line, resolved, comments) |
| `src/change/models/change_query.ts` | new: `ChangeQuery` (repos, key pattern, merged days) |
| `src/change/models/ticket_changes.ts` | new: `ChangeListing` (one run's PRs, shared by every ticket) and `TicketChanges` |
| `src/change/adapters/code_host_port.ts`, `code_host_github.ts` | new: GraphQL only; maps 401/403 → auth, `X-RateLimit-Remaining: 0` or `RATE_LIMITED` → rate limit |
| `src/change/adapters/review_cache_port.ts`, `review_cache_sqlite.ts` | new: PR detail cache in `cache.sqlite` |
| `src/change/use_cases/list_recent_changes.ts`, `find_ticket_changes.ts`, `merge_change.ts`, `update_change_branch.ts`, `reply_to_thread.ts` | new |
| `src/change/entrypoints/container.ts` | new: `ChangeContainer(query, token)` |
| `src/cockpit/models/block_state.ts` | new: `BlockState` and its rules (change, tracker, not-yet-checked) |
| `src/cockpit/models/change_action.ts` | new: `ChangeActionDTO` (merge, update branch, reply) and its result |
| `src/cockpit/models/ticket_flow.ts` | new: `TicketFlow` (columns → levels → block states, stop column, gate states, attention) + DTOs |
| `src/cockpit/models/attention.ts` | new: `Attention` and its rules |
| `src/cockpit/models/refresh_progress.ts` | new: `RefreshProgress` events + DTO |
| `src/cockpit/models/change_prompt.ts` | new: the built-in prompts (build ticket, fix CI, resolve conflict, address feedback) |
| `src/cockpit/models/sprint_board.ts`, `sprint_board_bridge.ts` | cards carry their `TicketFlow`; new channels `refresh:ticket`, `refresh:all`, `refresh:progress`, `change:action`, `change:prompt` |
| `src/cockpit/use_cases/refresh_ticket_flows.ts` (one ticket or all), `run_change_action.ts`, `build_change_prompt.ts`, `reassess_attention.ts` | new |
| `src/cockpit/entrypoints/api/cockpit_payload.ts` | new: zod validation of IPC payloads, and GitHub-only external links |
| `src/session/use_cases/find_ticket_session.ts` | new: the ticket's active session, for attention |
| `src/cockpit/adapters/flow_cache_port.ts`, `flow_cache_sqlite.ts` | new: last `TicketFlow` per ticket |
| `src/cockpit/entrypoints/container.ts`, `entrypoints/api/cockpit_ipc.ts` | wire the `change` domain and the new use cases and channels |
| `src/cockpit/entrypoints/ui/flow_column.tsx`, `ticket_graph.tsx`, `ticket_card.tsx`, `ticket_list.tsx` | block states, scan animation, gate counts, attention |
| `src/cockpit/entrypoints/ui/block_popover.tsx`, `thread_reply.tsx`, `confirm_button.tsx` | new: the popover, the reply box and the confirm step |
| `src/cockpit/entrypoints/ui/use_sprint_board.ts` | new: board state, refresh calls, progress and attention events |
| `src/cockpit/entrypoints/ui/my_tickets_screen.tsx`, `cockpit_screen.tsx`, `cockpit_root.tsx` | filters, Refresh all, progress, prompt hand-off |
| `src/cockpit/entrypoints/ui/board_status.tsx` | refresh status lines, attention badge, and the ● Live popover (Jira, GitHub, Claude Code) |
| `src/cockpit/resources/cockpit.css` | state colours, popover, scan, filters |
| `docs/domains/change.md` | new |
| `docs/domains/cockpit.md`, `docs/domains/pipeline.md`, `AGENTS.md`, `README.md` | updated |

### Config and secrets

| Variable | File |
|---|---|
| `GITHUB_TOKEN` | `.env.secrets` |

**Token scopes:** a fine-grained token on the project's repos, with Pull requests read and write, Contents read and write (for merge and update branch), Commit statuses read, Checks read, and Metadata read.

`project.yaml` gains these fields (validated in M2):

```yaml
code:
  link: { key_pattern: '\bDIG1-\d+\b', merged_days: 45 }
  merge: { method: squash }
repos:
  - { name: ba-backend, github: org/ba-backend }
```

### Failure handling

- **GitHub 401 or 403** → `CodeHostAuthError`. The change blocks show "could not check: GitHub rejected GITHUB_TOKEN", and ● Live turns amber. **Rate limit** → `CodeHostRateLimitError`, with the reset time. **Network errors or 5xx** → `CodeHostUnavailableError`. In all three cases, cached details are used when they exist.
- **One PR detail fails:** only that block shows "could not check". The rest of the refresh continues.
- **The merge re-check fails, or GitHub refuses the merge** → `MergeRefusedError` with GitHub's reason, shown in the popover. Nothing changes.
- **Update branch refused** (for example a conflict): GitHub's GraphQL error becomes `BranchUpdateRefusedError`, and the popover shows the reason.
- **The prompt hand-off times out** (no idle status within 60 s): the prompt is kept in the popover with **Copy**.

### Decisions

- **One ticket for all of M2** (the engineer's choice). The out-of-scope list keeps M3 and M4 work out.
- **`GITHUB_TOKEN` in `.env.secrets`**, the same pattern as Jira. The `gh` CLI isn't required.
- **GraphQL only, under the PoC's cost rules:** a cheap list per repo per refresh run, and details only when a PR changed (or the cached details are over 10 minutes old). `updatePullRequestBranch` and `statusCheckRollup` made the planned REST calls unnecessary (changed during implementation).
- **`done_when` is required on change blocks**, because "PR opened" and "Review & merge" check different things (changed during implementation).
- **The final refresh line says "Checked through <column>"**, because "All columns done" was misleading for a ticket whose status column is complete but not yet moved (changed during implementation).
- **Reply text is typed in the popover** in M2. In M4 the agent's draft pre-fills the same box.
- **Built-in prompts live in code** (`change_prompt.ts`) until M4 moves them to editable templates.
- **Unchecked block types never stop a refresh.** Otherwise, every ticket past Code Review would stop at its deploy block until M3.
- **The refresh engine streams real progress**, so the animation shows exactly where the check is and where it stopped.
- **`change` is a normal domain.** The block states, which combine changes, tracker status and pipeline, live in `cockpit`.
