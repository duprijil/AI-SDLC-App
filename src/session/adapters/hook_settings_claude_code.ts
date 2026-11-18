import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { HookSettingsPort } from "@/session/adapters/hook_settings_port";
import { AGENT_TOOL_POLICY } from "@/session/models/agent_tool";
import { HookSettingsWriteError } from "@/session/models/errors";
import type { HookEndpoint } from "@/session/models/hook_endpoint";
import { HOOK_EVENT_NAMES, type HookEventName, TOOL_HOOK_EVENT_NAMES } from "@/session/models/hook_event";

const SETTINGS_FILE_MODE = 0o600;
const ALL_TOOLS_MATCHER = "*";
const HOOK_TIMEOUT_SECONDS = 2;

interface CommandHook {
  readonly type: "command";
  readonly command: string;
}

interface HookMatcherGroup {
  readonly matcher?: string;
  readonly hooks: readonly CommandHook[];
}

const shellQuote = (text: string): string => `'${text.replaceAll("'", "'\\''")}'`;

export class HookSettingsClaudeCode implements HookSettingsPort {
  readonly #settingsRootPath: string;

  constructor(settingsRootPath: string) {
    this.#settingsRootPath = settingsRootPath;
  }

  write(sessionId: string, hookEndpoint: HookEndpoint): string {
    const settingsFilePath = join(this.#settingsRootPath, `${sessionId}.json`);
    const settings = {
      hooks: this.#hooksFor(hookEndpoint),
      permissions: {
        allow: AGENT_TOOL_POLICY.allow,
        ask: AGENT_TOOL_POLICY.ask,
        deny: AGENT_TOOL_POLICY.deny,
      },
    };
    try {
      mkdirSync(this.#settingsRootPath, { recursive: true });
      writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), { mode: SETTINGS_FILE_MODE });
    } catch (cause) {
      throw new HookSettingsWriteError(`Could not write hook settings ${settingsFilePath}`, { cause });
    }
    return settingsFilePath;
  }

  #hooksFor(hookEndpoint: HookEndpoint): Record<HookEventName, readonly HookMatcherGroup[]> {
    const commandHook: CommandHook = { type: "command", command: this.#postCommand(hookEndpoint) };
    const entries = HOOK_EVENT_NAMES.map((eventName): [HookEventName, readonly HookMatcherGroup[]] => [
      eventName,
      [
        TOOL_HOOK_EVENT_NAMES.includes(eventName)
          ? { matcher: ALL_TOOLS_MATCHER, hooks: [commandHook] }
          : { hooks: [commandHook] },
      ],
    ]);
    return Object.fromEntries(entries) as Record<HookEventName, readonly HookMatcherGroup[]>;
  }

  #postCommand(hookEndpoint: HookEndpoint): string {
    return [
      "curl --silent --output /dev/null",
      `--max-time ${String(HOOK_TIMEOUT_SECONDS)}`,
      "--request POST",
      `--header ${shellQuote("Content-Type: application/json")}`,
      `--header ${shellQuote(`X-Cockpit-Token: ${hookEndpoint.token}`)}`,
      "--data-binary @-",
      shellQuote(hookEndpoint.url),
    ].join(" ");
  }
}
