# AI-SDLC-App: Ticket Cockpit

A desktop app where one developer runs their sprint tickets from start to production: each ticket is a graph of the tracker's columns with flows of blocks, and has exactly one Claude Code session.

## Setup

Install Node.js 22.22.1 (see `.nvmrc`) and Claude Code (`claude` on your `PATH`), then:

```bash
make install-dev
make run-desktop
make check
```

Run `make help` to list every command. Agents and contributors start from [AGENTS.md](AGENTS.md). Product scope is in [docs/specs/v1-scope.md](docs/specs/v1-scope.md).
