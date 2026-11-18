import type { IncomingMessage, ServerResponse } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { AgentActionsPort } from "@/session/adapters/agent_actions_port";
import { SDLC_SERVER_NAME, SDLC_TOOLS } from "@/session/models/agent_tool";
import { DRAFT_KINDS } from "@/session/models/draft";
import { SessionError } from "@/session/models/errors";

const SERVER_VERSION = "1.0.0";

const textResult = (text: string): CallToolResult => ({ content: [{ type: "text", text }] });

async function guarded(run: () => Promise<string>): Promise<CallToolResult> {
  try {
    return textResult(await run());
  } catch (error) {
    if (error instanceof SessionError) {
      return { ...textResult(error.message), isError: true };
    }
    throw error;
  }
}

function sdlcServer(ticketKey: string, actions: AgentActionsPort): McpServer {
  const server = new McpServer({ name: SDLC_SERVER_NAME, version: SERVER_VERSION });
  server.registerTool(
    SDLC_TOOLS.getContext,
    {
      description: `The live state of ${ticketKey} from the Ticket Cockpit app: the ticket, its pull requests and open review threads, the pipeline's block states, deployments, worktrees and drafts.`,
    },
    () => guarded(async () => JSON.stringify(await actions.context(ticketKey), null, 2)),
  );
  server.registerTool(
    SDLC_TOOLS.draft,
    {
      description:
        "Store a draft for the developer instead of posting it. kind thread_reply: target is a review thread id from get_context. kind note: target is a prompt block id.",
      inputSchema: { kind: z.enum(DRAFT_KINDS), target: z.string().min(1), text: z.string().min(1) },
    },
    (input) => guarded(() => actions.draft(ticketKey, input)),
  );
  server.registerTool(
    SDLC_TOOLS.checkpoint,
    {
      description:
        "Mark a pipeline step as done: every prompt block whose done_when is session.checkpoint(<kind>) becomes done, with the summary as its note.",
      inputSchema: { kind: z.string().regex(/^[a-z][a-z0-9_]*$/), summary: z.string().min(1).max(2000) },
    },
    (input) => guarded(() => actions.checkpoint(ticketKey, input.kind, input.summary)),
  );
  server.registerTool(
    SDLC_TOOLS.codeComment,
    {
      description: `Post a reply to a review thread of one of ${ticketKey}'s pull requests, optionally resolving it. The developer approves every call.`,
      inputSchema: {
        repo: z.string().min(1),
        number: z.number().int().positive(),
        thread_id: z.string().min(1),
        body: z.string().min(1),
        resolve: z.boolean().default(false),
      },
    },
    (input) =>
      guarded(() =>
        actions.comment(ticketKey, {
          repo: input.repo,
          number: input.number,
          threadId: input.thread_id,
          body: input.body,
          shouldResolve: input.resolve,
        }),
      ),
  );
  server.registerTool(
    SDLC_TOOLS.merge,
    {
      description: `Merge one of ${ticketKey}'s pull requests after a live re-check that it's approved and clean. The developer approves every call.`,
      inputSchema: { repo: z.string().min(1), number: z.number().int().positive() },
    },
    (input) => guarded(() => actions.merge(ticketKey, input)),
  );
  return server;
}

export async function handleSdlcRequest(
  request: IncomingMessage,
  response: ServerResponse,
  body: unknown,
  binding: { readonly ticketKey: string; readonly actions: AgentActionsPort },
): Promise<void> {
  const server = sdlcServer(binding.ticketKey, binding.actions);
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  response.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(request, response, body);
}
