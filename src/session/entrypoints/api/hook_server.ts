import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { AgentActionsPort } from "@/session/adapters/agent_actions_port";
import { readJsonText } from "@/session/entrypoints/api/ipc_payload";
import { handleSdlcRequest } from "@/session/entrypoints/api/sdlc_mcp_server";
import type { SessionContainer } from "@/session/entrypoints/container";
import type { AgentSessionDTO } from "@/session/models/agent_session";
import { SessionError } from "@/session/models/errors";
import { HookEndpoint } from "@/session/models/hook_endpoint";
import { HookEvent } from "@/session/models/hook_event";

const LOOPBACK_HOST = "127.0.0.1";
const HOOK_PATH = "/hooks";
const MCP_PATH = "/mcp";
const TOKEN_HEADER = "x-cockpit-token";
const TOKEN_BYTES = 32;
const MAXIMUM_BODY_BYTES = 1_048_576;
const STATUS_NO_CONTENT = 204;
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_NOT_FOUND = 404;
const STATUS_PAYLOAD_TOO_LARGE = 413;

export interface HookServer {
  readonly endpoint: HookEndpoint;
  close(): void;
}

export type SessionChangedListener = (session: AgentSessionDTO) => void;

class HookRequestRejectedError extends SessionError {
  override readonly name: string = "HookRequestRejectedError";
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    receivedBytes += buffer.length;
    if (receivedBytes > MAXIMUM_BODY_BYTES) {
      throw new HookRequestRejectedError("Hook payload too large", STATUS_PAYLOAD_TOO_LARGE);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseHookEvent(body: string): HookEvent {
  const payload: unknown = JSON.parse(body);
  return HookEvent.create({
    sessionId: readJsonText(payload, "session_id"),
    eventName: readJsonText(payload, "hook_event_name"),
  });
}

function rejectionStatus(error: unknown): number {
  if (error instanceof HookRequestRejectedError) {
    return error.statusCode;
  }
  return error instanceof SessionError || error instanceof SyntaxError ? STATUS_BAD_REQUEST : STATUS_NOT_FOUND;
}

async function acceptMcp(
  request: IncomingMessage,
  response: ServerResponse,
  container: SessionContainer,
  actions: AgentActionsPort,
): Promise<void> {
  const ticketKey = container.resolveAgentTicket().execute(String(request.headers[TOKEN_HEADER] ?? ""));
  if (ticketKey === null) {
    throw new HookRequestRejectedError("Invalid MCP token", STATUS_UNAUTHORIZED);
  }
  const body: unknown = request.method === "POST" ? JSON.parse(await readBody(request)) : undefined;
  await handleSdlcRequest(request, response, body, { ticketKey, actions });
}

export async function startHookServer(
  container: SessionContainer,
  onSessionChanged: SessionChangedListener,
  agentActions: AgentActionsPort,
): Promise<HookServer> {
  const logger = container.logger("session.hook_server");
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  let endpoint: HookEndpoint | null = null;

  const acceptHook = async (request: IncomingMessage): Promise<void> => {
    if (request.method !== "POST" || request.url !== HOOK_PATH) {
      throw new HookRequestRejectedError("Unknown hook route", STATUS_NOT_FOUND);
    }
    if (endpoint?.acceptsToken(String(request.headers[TOKEN_HEADER] ?? "")) !== true) {
      throw new HookRequestRejectedError("Invalid hook token", STATUS_UNAUTHORIZED);
    }
    const session = container.applyHookEvent().execute(parseHookEvent(await readBody(request)));
    onSessionChanged(session.toDTO());
  };

  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const handled =
      request.url === MCP_PATH
        ? acceptMcp(request, response, container, agentActions)
        : acceptHook(request).then(() => {
            response.writeHead(STATUS_NO_CONTENT).end();
          });
    handled.catch((error: unknown) => {
      const statusCode = rejectionStatus(error);
      logger.error("Hook request rejected", {
        statusCode,
        reason: error instanceof Error ? error.message : "unknown",
      });
      if (!response.headersSent) {
        response.writeHead(statusCode).end();
      }
    });
  });

  await new Promise<void>((resolveListening) => {
    server.listen(0, LOOPBACK_HOST, resolveListening);
  });
  const address = server.address() as AddressInfo;
  endpoint = HookEndpoint.create({ url: `http://${LOOPBACK_HOST}:${String(address.port)}${HOOK_PATH}`, token });
  logger.info("Hook server listening", { port: address.port });

  return {
    endpoint,
    close: (): void => {
      server.close();
    },
  };
}
