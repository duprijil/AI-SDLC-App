import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { McpConfigPort, McpConfigRequest } from "@/session/adapters/mcp_config_port";
import { SDLC_SERVER_NAME } from "@/session/models/agent_tool";
import { HookSettingsWriteError } from "@/session/models/errors";

const CONFIG_FILE_MODE = 0o600;
const TOKEN_HEADER = "x-cockpit-token";

export class McpConfigClaudeCode implements McpConfigPort {
  readonly #settingsRootPath: string;

  constructor(settingsRootPath: string) {
    this.#settingsRootPath = settingsRootPath;
  }

  write(request: McpConfigRequest): string {
    const configFilePath = join(this.#settingsRootPath, `${request.sessionId}.mcp.json`);
    const config = {
      mcpServers: {
        [SDLC_SERVER_NAME]: { type: "http", url: request.url, headers: { [TOKEN_HEADER]: request.token } },
      },
    };
    try {
      mkdirSync(this.#settingsRootPath, { recursive: true });
      writeFileSync(configFilePath, JSON.stringify(config, null, 2), { mode: CONFIG_FILE_MODE });
    } catch (cause) {
      throw new HookSettingsWriteError(`Could not write the MCP config ${configFilePath}`, { cause });
    }
    return configFilePath;
  }
}
