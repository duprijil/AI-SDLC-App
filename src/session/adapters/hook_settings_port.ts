import type { HookEndpoint } from "@/session/models/hook_endpoint";

export interface HookSettingsPort {
  write(sessionId: string, hookEndpoint: HookEndpoint): string;
}
