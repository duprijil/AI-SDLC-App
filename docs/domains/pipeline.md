# pipeline

Normal domain. Loads and validates a project's configuration: `projects/<name>/project.yaml` and `pipeline.yaml`.

## Language

| Term | Meaning |
|---|---|
| Project | One configured product: its name, tracker settings and repos. Its key is its folder name under `projects/` |
| Tracker settings | Jira site URL, numeric board id, the scope JQL that selects "my tickets", and the status names to hide |
| Pipeline | For each board column (by key), its flow of blocks |
| Column key | The snake_case board column name: "Code Review" → `code_review` |
| Flow level | One step of a column's flow. Its blocks run in parallel. An `each_change` level holds one block that repeats once per change |
| Block template | A block's id, type (`change`, `deploy`, `attest`, `tracker`, `prompt`) and title. The title defaults to the humanized id |
| Project definition | A loaded project together with its pipeline |

## Responsibilities

- Read both files, and validate their shape with zod and their rules with the models.
- Report every problem at once, prefixed with the file it comes from.
- Parse `code`, `repos[].envs`, `done_when` and `actions` loosely. They're validated by the milestones that use them.

## Invariants

- The tracker site is an https URL, the board id is a positive integer, and the scope is not empty.
- Repo names are unique.
- Column keys and block ids are snake_case and unique. A block id is unique across the whole pipeline.
- Every level has at least one block, and an `each_change` level has exactly one.
- All of `projects/` is gitignored, because project files name real company systems. Nothing under it is committed.
