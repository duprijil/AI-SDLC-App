# AI-SDLC-App: Ticket Cockpit

A desktop app where one developer runs their sprint tickets from start to production: each ticket is a graph of the tracker's columns with flows of blocks, and has exactly one Claude Code session.

Harness: engineer

## Stack

- Language: TypeScript 6.0 (strict), runtime Node.js 22.22.1 (`.nvmrc`), package manager npm
- App type: desktop app. Electron 45 built with electron-vite 6 (Vite 8), UI in React 19, terminal in xterm.js 6 over node-pty 1.1
- Source root: `src/`
- No DI library: each domain has a hand-written container in `entrypoints/container`

| Check | Tool | Config |
|---|---|---|
| format | Prettier 3.10 (120 columns) | `.prettierrc.json`, `.prettierignore` |
| lint | ESLint 10 + typescript-eslint 8 (strictTypeChecked), simple-import-sort, react-hooks | `eslint.config.mjs` |
| types | `tsc --noEmit` with strict and the extra strict flags | `tsconfig.json` |
| architecture | dependency-cruiser 18 | `.dependency-cruiser.cjs` |
| complexity | ESLint `complexity` rule, at most 20 per function | `eslint.complexity.config.mjs` |

## Commands

- `make install-dev`: install dependencies, download Electron and rebuild node-pty for it
- `make run-desktop`: start the app in development mode
- `make build`: build the main, preload and renderer bundles into `out/`
- `make format`: format and auto-fix
- `make check`: run all quality checks
- `make help`: list every command

## Ticket format

`GH-<number>`: GitHub issues of this repo. No work starts without a ticket. Branches are `<type>/<slug>/GH-<number>`, and commits are `type(GH-<number>): summary`.

## Domains

The full list is proposed in [docs/specs/v1-scope.md](docs/specs/v1-scope.md) §3 and confirmed in M1. A domain gets a folder and a doc when its first code lands.

| Domain | Type | Purpose | Details |
|---|---|---|---|
| core | shared kernel | Model convention, logging, business-free UI components | [docs/domains/core.md](docs/domains/core.md) |
| session | normal | One Claude Code session per ticket: workspace, PTY, hooks, prompts | [docs/domains/session.md](docs/domains/session.md) |
| cockpit | combined | Desktop bootstrap, renderer screens; later the refresh engine, block states, gates | [docs/domains/cockpit.md](docs/domains/cockpit.md) |
| pipeline | normal | Project and pipeline config: load, validate, edit | planned |
| ticket | normal | Tracker tickets, board columns, status moves | planned |
| change | normal | PRs linked to a ticket: review state, merge, update, comment | planned |
| delivery | normal | Deploy runs, runtime state, "environment contains change" | planned |
| attestation | normal | Human ticks pinned to deployed commits | planned |

## Rules

- Follow the engineer harness. Its skills are `/engineer:*`.
- Product decisions live in `docs/specs/v1-scope.md`. Where the brainstorm docs disagree with it, the spec wins.
- The UI follows `docs/design/mockup.html` (v0.4). Older versions in `docs/design/versions/` are history only.
- Code lives in `src/<domain>/`, using only `models/`, `use_cases/`, `adapters/`, `entrypoints/`, plus `resources/` for non-code assets.
- Layers point inward: entrypoints, use_cases, adapters, models.
- Use cases are `execute()` classes that receive ports through the constructor.
- Only `entrypoints/container` creates concrete adapters and reads config or secrets.
- Screens and components live in `entrypoints/ui/`, call use cases, and hold no business logic.
- Normal domains import only `core`. Combined domains may import others, and nothing imports them.
- Adapter files are named `<what>_<technology>`, and each adapter implements `<what>_port`.
- Imports are absolute, from `@/` (the source root).
- Electron processes:
  - The main process starts at `src/main.ts`, the preload at `src/preload.ts`, the renderer at `src/renderer.ts` + `src/index.html`. All four only delegate to `cockpit/entrypoints/ui/`.
  - The renderer never reaches Node, Electron or node-pty. It talks to the main process only through the bridge contract in `session/models/session_bridge.ts`, exposed by the preload. `make check-architecture` enforces this.
  - The window runs with `contextIsolation` and `sandbox` on, and `nodeIntegration` off.
- A user's own secrets (tokens) go in the OS keychain through an adapter, never in env files.
- Never write comments or doc comments. Only tool directives with a specific code are allowed.
- Type everything. `make check-types` runs the strictest checking available.
- Never create, edit or run tests. The engineer does the testing. End each task with a short list of what to test.
- Never commit or push unless asked.

## Docs

- `docs/specs/`: approved specs, starting with `v1-scope.md`. Features need an approved spec before any code.
- `docs/domains/<domain>.md`: each domain's language, responsibilities and invariants.
- `docs/brainstorm/`: the decision history, rounds 01 to 03.
- `docs/design/`: the HTML mockup, opened in a browser. `#cockpit/DIG1-440` style links open a screen.
- Update this file and the domain doc whenever a command, tool, domain or invariant changes.

## Known limits

- Banned names, the no-comments rule, and config being read only by the container aren't checked by any tool. Apply them yourself.
- Average complexity limits (at most 20 per module on average, at most 5 across all code) aren't checked by any tool. Only the per-function limit is. Apply the averages yourself.
- `make install-toolchain` can't install Node.js. It stops and asks you to install the version in `.nvmrc`. CI installs it with `actions/setup-node`.

## Known pitfalls

- TypeScript 7 isn't supported by typescript-eslint yet. Stay on 6.0 until it is.
- Electron 45 doesn't download its binary during `npm install`. The `postinstall` script runs `install-electron`, then rebuilds node-pty against Electron's ABI. If the app fails with a `NODE_MODULE_VERSION` error, run `npx electron-rebuild --force --only node-pty`.
- The dev server's React preamble is an inline script, so `index.html` allows `'unsafe-inline'` scripts. Tighten the CSP before packaging.
