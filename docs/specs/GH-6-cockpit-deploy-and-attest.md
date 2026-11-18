# Check deployments and attest them (M3, part 2)

**Ticket:** GH-6
**Status:** Implemented
**Domains:** delivery (new), attestation (new), change, pipeline, cockpit

## Context

GH-5 lets the developer move a ticket between columns. But after a merge, the graph still can't tell whether the change reached an environment: `deploy` and `attest` blocks show "checked from M3/M4" and never stop a refresh. This is the second part of milestone M3 of [v1-scope.md](v1-scope.md) §9. It reads deploy runs from GitHub Actions, decides with local git whether the deployed commit contains each merged change, and lets the developer tick "validated in dev", pinned to the commits that were deployed.

The kubectl runtime check is deferred until there's a cluster to test against (the engineer's choice, 2026-11-18). Without it, an environment promoted by hand (`delivery: manual`) can't be checked yet.

## User story

**As a** developer whose PRs are merged
**I want** each ticket's graph to show which environments already run my changes, and to record that I validated them there
**So that** I know when a ticket can move on without opening GitHub Actions or asking around

## Acceptance criteria

### Deploy blocks

- [ ] A `deploy` block names an environment (`env: dev`). It covers every merged change of the ticket in every repo that has that environment.
- [ ] For one repo, the environment **contains** a change when the commit of the newest successful run of the repo's workflow (`run.head_sha`) has the change's merge commit in its history, or holds a commit with the same patch (cherry-pick).
- [ ] The block shows the first state that applies:

  | State | Rule |
  |---|---|
  | **n/a** (done) | no repo with a merged change has this environment (`stage: none`) |
  | **done** | every covered change is contained |
  | **failed** | the newest finished run of some repo failed or was cancelled, and that repo's changes aren't contained |
  | **deploying** | a run is queued or in progress in some repo whose changes aren't contained |
  | **partial n/m** | some, but not all, repos contain their changes |
  | **waiting** | none of the above |
  | **manual** (not checked) | the repo's environment is `delivery: manual`; with no runtime check yet, it shows the promote link and never stops a refresh |
  | **could not check** | GitHub or git failed, or the repo has no checkout at `path`; the reason is shown |

- [ ] An environment written `prod: { same_as: dev }` is checked with dev's settings.
- [ ] Clicking a deploy block opens a popover: one line per repo (deployed commit, its run, contained or not), **Open run ↗** for each, **▶ diagnose the deploy failure** (prompt) when failed, and **Open promote link ↗** for manual environments.

### Attest blocks

- [ ] An `attest` block with `pin: 'env("dev").commits'` pins, for each repo that has dev and a merged change of the ticket, the commit dev runs now. Manual envs aren't pinned.
- [ ] It shows **open** (never ticked), **stale** (ticked, but a pinned commit changed since), or **done** (ticked, and the pins still match). Open and stale make the ticket "Needs you".
- [ ] Clicking an open or stale attest block offers **Tick: <block title>**, behind a confirm that lists the pinned commits (repo, short sha). A stale block also shows what it was ticked on. The tick is stored with the pins, my GitHub login and the time.
- [ ] If the pinned environment can't be checked (no run yet, could not check), the attest block shows "waits for the deployment" and can't be ticked.

### Refresh

- [ ] Deploy and attest blocks are checked during the refresh like other blocks, column by column, so a ticket in Code Review never reads stage or prod runs.
- [ ] `git fetch` runs at most once per repo per refresh, and only for repos with a change in a deploy block being checked.
- [ ] Run lists are read at most once per repo and workflow per refresh run, shared by every ticket.
- [ ] A failed deploy is a **Failure** in the attention rules. Waiting, deploying and partial are **Waiting**.

### Configuration

- [ ] `project.yaml` gains, per repo, `path` (a local checkout, `~` allowed) and `envs`, validated on load:

  ```yaml
  repos:
    - name: AI-SDLC-APP-TEST-REPO
      github: duprijil/AI-SDLC-APP-TEST-REPO
      path: ~/work/AI-SDLC-APP-TEST-REPO
      envs:
        dev:   { delivery: github_actions, workflow: deploy-dev.yaml, commit: run.head_sha }
        stage: { delivery: github_actions, workflow: promote-stage.yaml, commit: run.head_sha }
        prod:  { delivery: manual, promote_link: "https://example.com/promote" }
  ```

  - `delivery` is `github_actions` (needs `workflow`) or `manual` (`promote_link` optional), or the env is `none` or `{ same_as: <env> }`.
  - `commit` accepts only `run.head_sha` for now; `image_label`, `tag` and `endpoint` are rejected with "not supported yet".
  - `branch` is optional; the default is the change's base branch.
  - `runtime` is accepted and ignored (deferred).
- [ ] `pipeline.yaml`: a `deploy` block needs `env`, and that env must exist on at least one repo; an `attest` block needs `pin: 'env("<env>").commits'` and `done_when: attested`.
- [ ] Repos with an env need `path`, and the path must be a git checkout whose `origin` points at `github`. This is checked at startup and reported in the startup dialog.
- [ ] `GITHUB_TOKEN` also needs **Actions: read**.
- [ ] `make check` passes.

## Out of scope

- The kubectl runtime check, `image_label`, `tag` and `endpoint` commit sources, and finished-rollout checks (deferred).
- Jenkins and other delivery connectors (v1.1).
- `code.merge_all` and `merge.order` on a gate.
- Worktrees per ticket (M4), even though `path` is now known.
- Triggering a deploy or a promotion from the app. The app only reads runs and opens links.

## Technical aspects

### Flow

**Refresh** (inside the existing `RefreshTicketFlows`, cockpit):
- A deploy level asks for the ticket's changes (already fetched once per refresh). For each repo with the block's env, it takes the merged changes' merge commits.
- It calls the `delivery` domain's `CheckEnvironment` use case once per repo × env, with plain values: GitHub repository, checkout path, env settings, base branch and merge commits.
- `CheckEnvironment` reads the run list (shared per refresh run), fetches the checkout (once per repo per refresh), and checks containment for each commit. It returns an `EnvironmentState` per repo.
- The `DeployBlockRules` model in cockpit folds the repo states into the block state above.
- An attest level reads the same env states (memoized per ticket refresh), builds the pins, and compares them with the stored attestation from the `attestation` domain's `FindAttestation` use case.

**Tick** (renderer → `cockpit_ipc` `attest:tick`):
- `RunAttestation` (cockpit) re-computes the pins live for that block, refuses if they differ from what the popover showed ("dev changed since you opened this"), then stores the attestation through the `attestation` domain's `RecordAttestation`, and refreshes the ticket.

### GitHub Actions reads (`deploy_run_github_actions` adapter, delivery)

| Call | Used for |
|---|---|
| `GET /repos/{owner}/{repo}/actions/workflows/{workflow}/runs?branch={branch}&per_page=20` | the newest runs: status, conclusion, `head_sha`, `html_url`, `created_at` |

- The newest successful run gives the deployed commit. The newest run of any status gives deploying or failed.
- ETag per URL, kept in memory for the app run; a 304 reuses the cached list.
- 401/403 → `DeliveryAuthError`; 404 → `WorkflowNotFoundError` (wrong `workflow` name); rate limit → `DeliveryRateLimitError`; network and 5xx → `DeliveryUnavailableError`.

The merge commit comes from GitHub: the change listing query (change domain) adds `mergeCommit { oid }` and `baseRefName` to the PR fields.

### Containment (`git_cli` adapter, delivery)

1. `git -C <path> fetch --quiet origin` (once per repo per refresh, 30 s timeout).
2. `git merge-base --is-ancestor <merge commit> <deployed sha>`: exit 0 → contained, 1 → not, anything else → could not check.
3. If not an ancestor: compare `git patch-id --stable` of the merge commit's diff with the patch ids of the commits in `<merge-base>..<deployed sha>` (at most 500 commits). A match → contained (cherry-picked).
4. A commit unknown to the checkout after the fetch → could not check ("commit not found in <path>").

Commands run with `execFile` (no shell), and every sha is checked against `^[0-9a-f]{7,40}$` first.

### Attestation store (`attestation_sqlite` adapter, attestation)

Table `attestations` in `<APP_DATA_ROOT>/cache.sqlite`: project key, ticket key, block id, pins (JSON `{repo: sha}`), GitHub login, ticked at. The newest tick per project, ticket and block wins. Earlier ticks are kept as history.

### Files

| File | Change |
|---|---|
| `src/pipeline/models/project.ts`, `adapters/project_source_yaml.ts` | `repos[].path`, `repos[].envs` (`EnvironmentSettings`: github_actions, manual, none, same_as), validation |
| `src/pipeline/models/pipeline.ts` | `env` on deploy blocks, `pin` and `attested` on attest blocks; env names checked against the project |
| `src/change/adapters/code_host_github.ts`, `src/change/models/change.ts` | `mergeCommitId` and `baseBranchName` on `Change` |
| `src/delivery/models/deploy_run.ts`, `environment_state.ts`, `environment_target.ts`, `commit_id.ts`, `checkout.ts`, `errors.ts` | new |
| `src/delivery/adapters/deploy_run_port.ts`, `deploy_run_github_actions.ts` | new |
| `src/delivery/adapters/git_port.ts`, `git_cli.ts` | new: fetch, ancestry, patch-id, origin URL |
| `src/delivery/use_cases/check_environment.ts`, `verify_checkouts.ts` | new |
| `src/delivery/entrypoints/container.ts` | new |
| `src/attestation/models/attestation.ts`, `pins.ts`, `errors.ts` | new: pins equality and staleness |
| `src/attestation/adapters/attestation_store_port.ts`, `attestation_store_sqlite.ts` | new |
| `src/pipeline/models/project_definition.ts`, `use_cases/load_project.ts` | `ProjectDefinition.combine` checks block envs against the project |
| `src/attestation/use_cases/find_attestation.ts`, `record_attestation.ts` | new |
| `src/attestation/entrypoints/container.ts` | new |
| `.dependency-cruiser.cjs` | add `delivery` and `attestation` to the normal domains |
| `src/cockpit/models/block_state.ts`, `deploy_view.ts`, `attest_action.ts`, `project_queries.ts` | deploy and attest states, deploy lines and pins, the tick DTO |
| `src/cockpit/models/change_prompt.ts` | the "diagnose the deploy failure" prompt |
| `src/cockpit/use_cases/refresh_ticket_flows.ts`, new `check_ticket_environments.ts`, `run_attestation.ts` | deploy and attest levels, one environment check per ticket and env |
| `src/cockpit/adapters/flow_cache_sqlite.ts` | flow format version 3 |
| `src/cockpit/entrypoints/container.ts`, `api/cockpit_ipc.ts`, `api/cockpit_payload.ts`, `models/sprint_board_bridge.ts`, `ui/cockpit_preload.ts` | wire the domains, the `attest:tick` channel; startup checkout checks |
| `src/cockpit/entrypoints/ui/block_popover.tsx`, new `environment_parts.tsx`, `use_sprint_board.ts`, `cockpit_root.tsx`, `desktop_app.ts`, `resources/cockpit.css` | deploy and attest popovers, tick confirm, startup checkout check |
| `docs/domains/delivery.md`, `docs/domains/attestation.md` | new |
| `docs/domains/cockpit.md`, `change.md`, `pipeline.md`, `AGENTS.md`, `README.md` | updated |

### Failure handling

- **No checkout at `path`, not a git repo, or `origin` isn't the configured GitHub repo** → a startup problem in the dialog.
- **`git fetch` fails** (offline, auth) → the check goes on with the refs already there, and the block caption says "not fetched: <reason>".
- **Workflow not found** → that repo's line says "no workflow <name> in <repo>", and the block is "could not check".
- **GitHub auth or rate limit** → "could not check" with the reason, ● Live turns amber, and the rest of the refresh goes on.
- **The pins changed between opening the popover and confirming the tick** → `PinsChangedError`; nothing is stored, and the ticket is refreshed.

### Decisions

- **Local git for containment** (the engineer's choice): ancestry first, then a patch-id fallback, both in the checkout at `path`. GitHub's compare API can't detect cherry-picks.
- **The deployed commit is `run.head_sha` of the newest successful run.** It's the only commit source until the runtime check lands.
- **Manual environments are "not checked" and never stop a refresh**, like the unchecked blocks in M2. Otherwise stage and prod would block every ticket until the runtime check exists.
- **Attestations pin commits, not runs.** A re-run of the same commit keeps the tick, and a new commit in dev makes it stale.
- **The GitHub login is the "who"** of a tick, because the app already knows it.
- **Attestations pin only repos with a merged change of the ticket** (changed during implementation). A repo the ticket never touched has no base branch to look at, and its deploys say nothing about the ticket.
- **Promote links can be opened from the app** only when they're in `project.yaml`, next to GitHub links (changed during implementation).
- **A test pipeline lives in the test repo** (the engineer's choice): `deploy-dev.yaml` runs on every push to `main`, and `promote-stage.yaml` runs by hand.

## What to test

The test repo gets two fake workflows (written locally in `AI-SDLC-APP-TEST-REPO/.github/workflows/`, not pushed): `deploy-dev.yaml` "deploys" each push to `main` to dev (about 30 s, and fails when the commit message contains `[fail-deploy]`), and `promote-stage.yaml` runs from the Actions tab.

1. Merge a KAN-1 PR: dev shows **deploying** while the run is in progress, then **done**.
2. The attest block "Validated in dev" shows **open**. Tick it: the confirm lists the repo and short sha, then it's **done**.
3. Push another commit to `main`: after dev deploys it, the attest block is **stale** and the ticket is "Needs you".
4. Merge a PR whose squash commit message contains `[fail-deploy]`: dev is **failed**, the ticket is "Failure", and the popover offers the run and the diagnose prompt.
5. Run `promote-stage.yaml` by hand: the stage block goes from **waiting** to **done**.
6. Cherry-pick a merged commit onto another branch, and point an env's `branch` at it: the block is **done** through patch-id.
7. Set a wrong `workflow` name, then a wrong `path`: the block says why it can't check, and the startup dialog lists the bad path.
