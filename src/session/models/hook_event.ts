import { ensure } from "@/core/models/invariant";
import type { SessionStatus } from "@/session/models/agent_session";
import { UnknownHookEventError } from "@/session/models/errors";

const STATUS_BY_HOOK_EVENT = {
  SessionStart: "idle",
  UserPromptSubmit: "working",
  PreToolUse: "working",
  PostToolUse: "working",
  Notification: "waiting",
  Stop: "idle",
  SessionEnd: "ended",
} as const satisfies Record<string, SessionStatus>;

export type HookEventName = keyof typeof STATUS_BY_HOOK_EVENT;

export const HOOK_EVENT_NAMES: readonly HookEventName[] = Object.freeze(
  Object.keys(STATUS_BY_HOOK_EVENT).filter(
    (eventName): eventName is HookEventName => eventName in STATUS_BY_HOOK_EVENT,
  ),
);

export const TOOL_HOOK_EVENT_NAMES: readonly HookEventName[] = Object.freeze(["PreToolUse", "PostToolUse"]);

export interface HookEventDTO {
  readonly sessionId: string;
  readonly eventName: string;
}

const isHookEventName = (eventName: string): eventName is HookEventName => eventName in STATUS_BY_HOOK_EVENT;

export class HookEvent {
  readonly sessionId: string;
  readonly eventName: HookEventName;

  private constructor(sessionId: string, eventName: HookEventName) {
    this.sessionId = sessionId;
    this.eventName = eventName;
  }

  static create(hookEvent: HookEventDTO): HookEvent {
    const eventName = hookEvent.eventName;
    ensure(isHookEventName(eventName), () => new UnknownHookEventError(`Unknown hook event: ${eventName}`));
    return new HookEvent(hookEvent.sessionId, eventName);
  }

  sessionStatus(): SessionStatus {
    return STATUS_BY_HOOK_EVENT[this.eventName];
  }
}
