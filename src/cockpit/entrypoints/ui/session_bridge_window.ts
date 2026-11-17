import { SessionBridgeMissingError } from "@/cockpit/models/errors";
import { SESSION_BRIDGE_GLOBAL, type SessionBridge } from "@/session/models/session_bridge";

export function sessionBridge(): SessionBridge {
  const bridge: unknown = Reflect.get(window, SESSION_BRIDGE_GLOBAL);
  if (typeof bridge !== "object" || bridge === null) {
    throw new SessionBridgeMissingError("The preload script did not expose the session bridge");
  }
  return bridge as SessionBridge;
}
