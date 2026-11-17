# cockpit

Combined domain, named after the product. It starts the desktop app and owns the screens that span domains. In M0 it holds the desktop bootstrap and the spike screen. The refresh engine, block states, gates and the My tickets and Cockpit screens arrive in later milestones.

## Language

| Term | Meaning |
|---|---|
| Desktop app | The Electron main process: one window, the hook server and the IPC handlers |
| Renderer | The window's web page: React screens and the xterm.js terminal |
| Preload | The bridge script that exposes the session bridge to the renderer |
| Spike screen | The M0 screen: one Claude Code session in a terminal, its status from hooks, and a test-prompt button |

## How the Electron processes map to the layers

| Process | Files | Role |
|---|---|---|
| Main | `src/main.ts` → `entrypoints/ui/desktop_app.ts` | Builds `CockpitContainer`, opens the window, starts the hook server, registers the session IPC |
| Preload | `src/preload.ts` → `entrypoints/ui/cockpit_preload.ts` | Exposes the session bridge with `contextBridge` |
| Renderer | `src/renderer.ts` → `entrypoints/ui/cockpit_root.tsx` and the screens | Calls the session bridge, which runs the main process's use cases remotely |

The renderer's view of "the container" is the session bridge: each bridge call runs a use case from `SessionContainer` in the main process.

## Responsibilities

- Wire the session domain's entrypoints into the desktop app.
- Keep the renderer sandboxed: no Node, Electron or node-pty reachable from `src/renderer.ts`.
- Show the session's terminal and its status.

## Invariants

- The window has `contextIsolation` and `sandbox` on, and `nodeIntegration` off.
- Quitting the app stops every agent session and the hook server.
- Nothing imports `cockpit`, except the root files that delegate to it.
