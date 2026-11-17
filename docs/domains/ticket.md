# ticket

Normal domain. Reads tickets and board columns from the tracker (Jira), and keeps the last successful read in a local cache.

## Language

| Term | Meaning |
|---|---|
| Ticket | A tracker issue: key (`ABC-123`), title, status id and status name |
| Board | The tracker board's columns in order, each with its key, name and the status ids it holds |
| Sprint query | The project key, the board id, the scope JQL and the hidden status names |
| Sprint snapshot | The board and the visible tickets, captured at one moment (`fetchedAt`) |
| Sprint cache | The last snapshot per project, in `<APP_DATA_ROOT>/cache.sqlite` |

## Responsibilities

- Fetch the board's column configuration and every ticket matching the scope. The Jira search is paged with `nextPageToken`.
- Drop tickets whose status name is hidden (matched case-insensitively).
- Map tickets to columns by status id.
- Save a snapshot only after a fully successful fetch, and read it back for a fast start.

## Jira calls

| Call | Used for |
|---|---|
| `GET /rest/agile/1.0/board/{id}/configuration` | column names and their status ids |
| `POST /rest/api/3/search/jql` with `summary`, `status` | the tickets, 100 per page, at most 20 pages |

Auth is Basic with `JIRA_EMAIL` and `JIRA_API_TOKEN` from `.env.secrets`. Both are kept in `SecretText` until the request is built.

## Invariants

- 401/403 → `TrackerAuthError`; 404 → `BoardNotFoundError`; network errors, timeouts (15 s), 400 and 5xx → `TrackerUnavailableError`.
- A failed fetch never overwrites the cache.
- A cache that can't be read raises `SprintCacheError`. Callers treat that as "no cache".
- Board column names must give distinct, non-empty column keys.
