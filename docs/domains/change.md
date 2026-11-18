# change

Normal domain. Reads a project's pull requests from GitHub, judges their review state from the developer's point of view, and acts on them: merge, update the branch, reply to a review thread.

## Language

| Term | Meaning |
|---|---|
| Change | A pull request in one of the project's repos, linked to a ticket because its title or branch mentions the ticket key (matched with `code.link.key_pattern`, case-insensitive) |
| Change listing | Every open PR, plus every PR merged in the last `merged_days`, across the project's repos, read once per refresh run and shared by every ticket |
| Change review | A PR's details: merge state, checks, review decision, reviews and review threads |
| Viewer | The GitHub user who owns `GITHUB_TOKEN`. Every judgment is made from their point of view |
| Feedback | On the viewer's own PR: changes requested after the last commit, an open thread where someone else spoke last, or new human review comments since the last commit |
| Change ref | What an action needs: PR id, repository, number, and the head commit it expects |
| Merge commit | The commit a merged PR put on its base branch (`mergeCommit.oid`), used to check deployments |

## Responsibilities

- List open and recently merged PRs per repo, in one GraphQL query per repo.
- Read a PR's details only when its `updatedAt` or head commit changed, or the cached details are over 10 minutes old.
- Merge after a live re-check: the head commit is unchanged, the PR is approved with passing checks, and its merge state is clean.
- Update the branch, reply to a thread, and optionally resolve it.

## GitHub calls

All of them go to GraphQL (`https://api.github.com/graphql`), with `Authorization: Bearer GITHUB_TOKEN`.

| Call | Used for |
|---|---|
| `viewer { login }` | the viewer, once per app run |
| `repository.pullRequests` (open, merged) | the change listing |
| `node(id) { ... on PullRequest }` | review details |
| `mergePullRequest`, `updatePullRequestBranch` | merge, update branch (both pinned to the expected head commit) |
| `addPullRequestReviewThreadReply`, `resolveReviewThread` | reply, resolve |

## Invariants

- Only human reviews count for "changes requested" and "new comments". The latest verdict per reviewer wins.
- A bot counts only through an open thread where it spoke last.
- Feedback exists only on the viewer's own PRs.
- 401/403 → `CodeHostAuthError`. A used-up rate limit → `CodeHostRateLimitError` (with the reset time). Network errors and other failures → `CodeHostUnavailableError`.
- One PR's failure affects only that PR. A listing failure affects every change block of the run.
- The review cache is an optimization: a cache that can't be read or written is treated as a miss.
