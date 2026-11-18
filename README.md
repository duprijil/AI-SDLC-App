# AI-SDLC-App: Ticket Cockpit

A desktop app where one developer runs their sprint tickets from start to production: each ticket is a graph of the tracker's columns with flows of blocks, and has exactly one Claude Code session.

## Setup

Install Node.js 22.22.1 (see `.nvmrc`) and Claude Code (`claude` on your `PATH`), then:

```bash
make install-dev
make setup-env
```

Fill `JIRA_EMAIL`, `JIRA_API_TOKEN` and `GITHUB_TOKEN` in `.env.secrets`. The GitHub token is a fine-grained token on the project's repos with Pull requests (read and write), Contents (read and write), Commit statuses (read), Checks (read), Actions (read) and Metadata (read). Repos with a `github_actions` env need `path` pointing at your local clone; the app runs `git fetch` there. Create `projects/<your-project>/project.yaml` and `pipeline.yaml` (schema in [docs/specs/v1-scope.md](docs/specs/v1-scope.md) §4 and [docs/domains/pipeline.md](docs/domains/pipeline.md)), and set `ACTIVE_PROJECT` in `.env.config`. The `projects/` folder is gitignored. Then:

```bash
make run-desktop
make check
```

Run `make help` to list every command. Agents and contributors start from [AGENTS.md](AGENTS.md). Product scope is in [docs/specs/v1-scope.md](docs/specs/v1-scope.md).
