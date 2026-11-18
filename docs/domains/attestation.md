# attestation

Normal domain. Stores the developer's ticks ("validated in dev"), each pinned to the commits that were deployed when it was given.

## Language

| Term | Meaning |
|---|---|
| Attestation | A tick for one project, ticket and block: the pins, who ticked it (GitHub login) and when |
| Pins | Repo name → commit id, for every repo the tick covers |
| Status | `open` (never ticked), `done` (the newest tick's pins equal the current ones) or `stale` (they differ) |

## Responsibilities

- Find the newest tick for a block and compare its pins with the current ones.
- Record a tick, after checking that the pins the developer saw are still the current ones.

## Invariants

- Ticks are only added, never changed or deleted. The newest one per project, ticket and block counts; older ones are history.
- Pins are never empty, and every pinned commit is a commit id.
- A tick whose expected pins differ from the current ones is refused with `PinsChangedError`, and nothing is stored.
- Ticks live in the `attestations` table of `<APP_DATA_ROOT>/cache.sqlite`.
