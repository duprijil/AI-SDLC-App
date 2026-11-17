# Brainstorm 02: the board model (Q&A round 2)

This replaces the "stages and arrows" model in [01 §2.2–2.3](01-value-concepts-design.md#22-pipeline-stages-and-arrows). Everything else in 01 still holds: the harness, the one session per ticket, the inbox, the checkpoints, "agents draft, humans send", and the open-source web app in Docker. The mockup that follows this model is frozen as [design/versions/mockup-v0.3.html](../design/versions/mockup-v0.3.html). The newer version is described in [03](03-desktop-and-column-flows.md).

---

## Decisions, round 2

| Topic | Decision |
|---|---|
| Repos | **Mount the host's checkouts.** Each ticket's worktrees are created from your existing clones, so your IDE, git config and SSH keys just work. |
| Columns | **Columns are the tracker board's own columns, and they're fixed.** The app reads them from Jira (or Linear, …). The app can't add or remove columns. |
| Moving on | **A ticket can move to the next status only when every row in its current column is done.** |
| Rows | **Two kinds of rows in a column:** *per-change rows* repeat once per PR or MR (for example "Merged · in dev"). *Ticket rows* appear once (for example "Validated in dev", "PM approved"). |
| Row click | **Clicking a row runs its action set**: one action or several, chosen by the row's current state. |
| Refine / Plan | **Dropped for now.** The first agent task is "build this ticket". |
| Git flow | **Independent of the git flow** (GitHub flow, gitflow, trunk-based). There are no version-tag or branch-name assumptions. Details below. |
| v1 actions | **Tracker:** change status. **Code host:** merge, update branch, comment. |
| Code over scripts | **Deterministic logic is built into the app as code** (connectors, checks). The harness is for the agent. User scripts are a last resort. |

---

## 1. The board

```
          To Do   In Progress    Code Review          E2E Testing        Ready for Demo   Pending Depl.   Done
          ─────   ───────────    ───────────          ───────────        ──────────────   ─────────────   ────
change 1          PR opened  →   merged · in dev  →   in stage       →                →  in prod
change 2          PR opened  →   merged · in dev  →   in stage       →                →  in prod
change 3          PR opened  →   ● review         →   🔒             →                →  🔒
ticket   Start                   ☐ Validated in dev   ☐ Tested on stage  PM approved                      Done
```

- **Columns** are synced from the tracker board (in Jira, the board columns; each can hold several statuses). The column matching the ticket's status is highlighted.
- **A change** is a PR or MR **linked to the ticket by its key** in the PR title or branch name. The pattern can be configured (`(?i)\bDIG1-\d+\b`). A change can be in any repo of the project.
- **Per-change rows** line up horizontally, one lane per change, as in the PoC graph. So the board still reads left to right.
- **Ticket rows** sit in a band under the lanes. When a column has only ticket rows, its row fills the whole column.
- **The gate between two columns** is the status change. It's green when every row in the current column is done, and crossing it is your click. The gate's action set always includes `tracker.move(next)` and can add more.
- **Going back is derived, not configured.** If a row in an earlier column stops being done (for example a new change appears after PM feedback), the ticket's *real* column becomes the earliest column with an unfinished row. The app then offers "← Move back to Code Review". There are no special rework arrows.

## 2. Rows: done-when check + action set

Each row is defined once per column in `pipeline.yaml`:

| Field | Meaning | Example: *In dev* (per change, Code Review) |
|---|---|---|
| `scope` | `change` or `ticket` | `change` |
| `done_when` | A **built-in check** (code, not a script) | `env("dev").contains(change)` |
| `states` | The labels it shows, derived from facts | waiting · deploying · failed · in dev |
| `actions` | Action set per state, run on click | `failed` → open the run; `waiting` → nothing |

Built-in checks for v1 (all deterministic, all in code):

| Check | Facts behind it |
|---|---|
| `change.opened`, `change.ready` | The PR exists, it isn't a draft, CI is green |
| `change.approved`, `change.merged` | Reviews, threads (from your point of view, as in the PoC), merge state |
| `env(E).contains(change)` | See §3 |
| `attested(name)` | A human checkbox, **pinned to the commits it covered** |
| `tracker.reply_from(role)` | The latest comment's author, for "PM approved" or "PM feedback" |
| `tracker.status_in(...)` | For columns the app doesn't drive, such as Pending Deployment → Done |

v1 action types: `tracker.move`, `code.merge`, `code.merge_all`, `code.update_branch`, `code.comment` (the agent drafts, you confirm), plus `open` (a link) and `copy`.

> **To confirm:** sending a prompt into the ticket's session wasn't on your v1 action list. I've assumed it's **built into every row**, not an action you configure: each row state can name a prompt template, and the harness types it into the session when you click "▶ in session". If you meant the agent should *not* be triggered from rows in v1, say so.

## 3. Independent of the git flow: CI/CD runs + commit ancestry

The question "is change X in environment E?" has to work for GitHub flow, gitflow and trunk-based, without knowing which one a team uses. It combines two facts that are true in every flow:

1. **The CI/CD tool says what's deployed.** A built-in delivery connector (GitHub Actions, Jenkins, GitLab CI, Argo CD …) reports the **latest successful deploy run for environment E** and **the commit it deployed**. It also gives a live state: queued, running, failed (with a link to the run), succeeded.
2. **Git says whether the change is part of that commit.** The change is in E when **its merge commit is an ancestor of the deployed commit** (`git merge-base --is-ancestor`, run on the mounted checkout). A patch-id fallback covers cherry-picks and squash-and-rebase release branches.

| Flow | Why it works without configuration |
|---|---|
| GitHub flow | PR → main → deploy runs on main. Ancestry is direct. |
| Trunk-based | The same, plus promotions that redeploy an older main commit to stage or prod. Ancestry still answers correctly. |
| gitflow | PR → develop → dev; release branch → stage; main → prod. The merge commit is carried through the merges, so ancestry holds. Cherry-picks use patch-id. |

Per repo and environment, `project.yaml` only says **where the deploy runs are** (workflow file, Jenkins job, Argo app) and, if needed, **how to read the deployed commit** (the run's head SHA by default, or an image label, a tag or a `/version` endpoint). An optional **runtime check** (kubectl rollout and pods, as in the PoC) can turn "run succeeded" into "rolled out".

**Attestations** ("Validated in dev", "Tested on stage") are pinned to the deployed commit of each repo at the moment you ticked them. If any of those commits changes, the attestation becomes stale and has to be ticked again. That's also flow-independent.

## 4. What this removes from the first design

- Configurable stages and arrows, and rework or skip arrows. Columns come from the tracker; going back is derived; "skip" is just a row state (`n/a`: no stage environment for this repo).
- Version tags as the source of truth. Versions are still *shown* when a repo has them, but decisions use commits.

## 5. Still open (round 3)

1. ~~**Notifications**~~: resolved in [03](03-desktop-and-column-flows.md). No notifications that carry actions.
2. **Stack:** TypeScript backend (node-pty, the MCP server, connectors) + React (or Svelte) + xterm.js + SQLite. Confirm, or choose something else.
3. **Columns the app doesn't drive** (Pending Deployment → Done is often moved by a release process): show their rows as read-only?
4. **Several tracker statuses in one board column:** is the gate move always to the column's *first* status?
