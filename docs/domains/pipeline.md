# pipeline

Normal domain. Loads and validates a project's configuration: `projects/<name>/project.yaml` and `pipeline.yaml`.

## Language

| Term | Meaning |
|---|---|
| Project | One configured product: its name, tracker settings and repos. Its key is its folder name under `projects/` |
| Code settings | `code.link.key_pattern` (a JavaScript regular expression matched case-insensitively), `code.link.merged_days` (default 45), `code.merge.method` (`squash` by default, or `merge`/`rebase`), and `code.branch` (the new ticket branch, default `feat/{key}-{slug}`, must contain `{key}`) |
| Repo | A name plus its GitHub repository (`github: owner/name`) |
| Change check | For a `change` block, `done_when: change.ready` (PR opened, not a draft, CI not failing) or `change.merged` |
| Tracker settings | Jira site URL, numeric board id, the scope JQL that selects "my tickets", and the status names to hide |
| Pipeline | For each board column (by key), its flow of blocks |
| Column key | The snake_case board column name: "Code Review" → `code_review` |
| Flow level | One step of a column's flow. Its blocks run in parallel. An `each_change` level holds one block that repeats once per change |
| Block template | A block's id, type (`change`, `deploy`, `attest`, `tracker`, `prompt`) and title. The title defaults to the humanized id |
| Prompt template | A Markdown file `projects/<name>/prompts/<file>.md` with `{{placeholder}}` values. Five defaults ship in code and are used when the file is missing |
| Prompt actions | `actions.<state>: [ { session: prompts/<file>.md } ]` on a block; other action names are kept for later milestones and ignored |
| Gate prompts | `gate.then: [ { session: prompts/<file>.md } ]` on a column, sent after a forward move out of it |
| Project definition | A loaded project together with its pipeline |

## Responsibilities

- Read both files, and validate their shape with zod and their rules with the models.
- Report every problem at once, prefixed with the file it comes from.
- Parse `repos[].path` (`~` expanded) and `repos[].envs`: `github_actions` (`workflow`, optional `branch`, `commit`), `manual` (optional `promote_link`), `none`, or `same_as: <env>`, resolved on load.
- Parse `done_when` and `actions` of other blocks loosely. They're validated by the milestones that use them.

## Invariants

- The tracker site is an https URL, the board id is a positive integer, and the scope is not empty.
- Repo names are unique, and every repo has `github: owner/name`.
- `code.link.key_pattern` compiles as a regular expression.
- A `change` block sits in an `each_change` level and has `done_when: change.ready` or `change.merged`.
- Column keys and block ids are snake_case and unique. A block id is unique across the whole pipeline.
- Every level has at least one block, and an `each_change` level has exactly one.
- A `deploy` block has `env`. An `attest` block has `pin: 'env("<env>").commits'` and `done_when: attested`. That env exists on at least one repo.
- A repo with a `github_actions` env has `path`. `commit` is `run.head_sha`; the other sources are refused as not supported yet.
- `same_as` points at an env of the same repo that has its own settings.
- `actions` keys with prompts are states the block type has. Prompt names are `prompts/<file>.md`, never a path outside the project.
- A `prompt` block has `prompt:`, and its `done_when` (if any) is `session.checkpoint(<kind>)`.
- Every referenced template exists (as a file or a default) and uses only known placeholders; `{{change.*}}` only on change blocks.
- Default templates are written only when missing, never over a file.
- All of `projects/` is gitignored, because project files name real company systems. Nothing under it is committed.
