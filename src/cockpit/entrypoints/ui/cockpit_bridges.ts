import { CockpitError } from "@/cockpit/models/errors";
import { SPRINT_BOARD_BRIDGE_GLOBAL, type SprintBoardBridge } from "@/cockpit/models/sprint_board_bridge";
import { SESSION_BRIDGE_GLOBAL, type SessionBridge } from "@/session/models/session_bridge";

function exposedBridge(globalName: string): object {
  const bridge: unknown = Reflect.get(window, globalName);
  if (typeof bridge !== "object" || bridge === null) {
    throw new CockpitError(`The preload script did not expose ${globalName}`);
  }
  return bridge;
}

export function sessionBridge(): SessionBridge {
  return exposedBridge(SESSION_BRIDGE_GLOBAL) as SessionBridge;
}

export function sprintBoardBridge(): SprintBoardBridge {
  return exposedBridge(SPRINT_BOARD_BRIDGE_GLOBAL) as SprintBoardBridge;
}
