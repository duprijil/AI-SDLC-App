# delivery

Normal domain. Finds out what an environment runs, and whether that contains a given commit: deploy runs from GitHub Actions, containment from the developer's local git checkout.

## Language

| Term | Meaning |
|---|---|
| Environment | A named target of a repo (`dev`, `stage`, `prod`), configured in `project.yaml` under `repos[].envs` |
| Deploy run | One run of the env's workflow: status (queued, in progress, completed), conclusion, head commit, URL |
| Deployed commit | `head_sha` of the newest successful run of the env's workflow on its branch |
| Environment target | What to check: repo, GitHub repository, checkout path, env, workflow, branch, and the commits that must be in it |
| Contains | The deployed commit has the commit in its history, or holds a commit with the same patch id (cherry-pick) |
| Environment state | The result for one repo × env: deployed commit and run, the newest run's state, how many commits it contains, and a note when `git fetch` failed |
| Checkout | A repo's local clone at `repos[].path`, whose `origin` must point at its GitHub repository |

## Responsibilities

- Read the newest 20 runs of a workflow on a branch, with an ETag per URL kept for the app run.
- Fetch a checkout at most once per refresh run, and check every commit against the deployed commit: `git merge-base --is-ancestor` first, then `git patch-id --stable` over at most 500 commits since the merge base.
- Read each run list at most once per refresh run (one `CheckEnvironment` instance per run).
- Check at startup that every checkout with a `github_actions` env exists and that its `origin` is the configured GitHub repository.

## Invariants

- Git runs through `execFile`, never a shell, with `GIT_TERMINAL_PROMPT=0` and timeouts (fetch 30 s, other commands 15 s).
- Every commit id passed to git matches `^[0-9a-f]{7,40}$`.
- A failed fetch never stops a check: the refs already there are used, and the state carries a "not fetched" note.
- 401/403 → `DeliveryAuthError`; 404 → `WorkflowNotFoundError`; rate limit → `DeliveryRateLimitError`; network and 5xx → `DeliveryUnavailableError`; git failures → `GitCommandError`; a commit missing from the checkout → `CommitNotFoundError`.
- The kubectl runtime check and the `image_label`, `tag` and `endpoint` commit sources aren't built yet. Only `run.head_sha` is accepted.
