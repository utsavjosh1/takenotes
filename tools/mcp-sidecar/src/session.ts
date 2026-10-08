/** takenotes-mcp JSON-RPC session (Phase 5d): MCP-over-stdio in front of
 * the app's private pipe.
 *
 * External clients (Claude/Codex) speak MCP JSON-RPC 2.0 over stdio
 * (newline-delimited); this session translates to `{requestId,
 * clientId, tool, params}` pipe calls and back. Pure except for the
 * injected `roundTrip` — stdio bytes and sockets live in `index.ts`,
 * so this module is fully logic-tested with a fake transport.
 *
 * Conventions:
 * - `clientId` is the client's self-reported `initialize.clientInfo`
 *   name (else `"unknown-client"`). The app grant-checks it; approval
 *   happens in takenotes Settings → Automation.
 * - Tool failures arrive as MCP `isError` results (agents see them as
 *   tool output), never as protocol errors — except a dead pipe, which
 *   is a JSON-RPC error (`TAKENOTES_APP_NOT_RUNNING`: start the app).
 * - stdout carries JSON-RPC only; diagnostics go to stderr (caller's job).
 */
import {
  isMcpTool,
  MCP_TOOL_PARAMS,
  MCP_TOOL_SCHEMAS,
  MCP_V1_TOOLS,
} from "@takenotes/core/mcp/tools";
import { MCP_APP_NOT_RUNNING, type McpPipeResponse } from "@takenotes/core/mcp/transport";

export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const MCP_SERVER_NAME = "takenotes-mcp";
export const MCP_SERVER_VERSION = "0.1.10";

export type JsonRpcId = string | number | null;

export type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/** App round-trip; throws only when the pipe itself is unreachable
 * (app closed). App-level denials arrive as `{ok:false}` data. */
export type McpRoundTrip = (tool: string, params: unknown, clientId: string) => Promise<McpPipeResponse>;

export function createMcpSession(roundTrip: McpRoundTrip): {
  clientId: string;
  handle(message: unknown): Promise<JsonRpcMessage | null>;
} {
  let initialized = false;
  let clientId = "unknown-client";

  const ok = (id: JsonRpcId | undefined, result: unknown): JsonRpcMessage => ({
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  });
  const err = (id: JsonRpcId | undefined, code: number, message: string, data?: unknown): JsonRpcMessage => ({
    jsonrpc: "2.0",
    id: id ?? null,
    error: data === undefined ? { code, message } : { code, message, data },
  });

  async function handle(message: unknown): Promise<JsonRpcMessage | null> {
    if (typeof message !== "object" || message === null) {
      return err(null, -32600, "Invalid Request: expected an object.");
    }
    const { id, method, params } = message as { id?: JsonRpcId; method?: unknown; params?: unknown };
    if (typeof method !== "string") {
      return err(typeof id === "string" || typeof id === "number" ? id : null, -32600, "Invalid Request: missing method.");
    }
    // Notifications (no id) never get a reply.
    const replyId = id === undefined ? undefined : id;
    const noReply = replyId === undefined ? true : false;

    switch (method) {
      case "initialize": {
        const name =
          typeof params === "object" && params !== null
            ? ((params as { clientInfo?: unknown }).clientInfo as { name?: unknown } | undefined)?.name
            : undefined;
        if (typeof name === "string" && name.trim()) clientId = name.trim().slice(0, 256);
        initialized = true;
        const result = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        };
        return noReply ? null : ok(replyId, result);
      }
      case "notifications/initialized":
        return null;
      case "ping":
        return noReply ? null : ok(replyId, {});
      case "tools/list": {
        if (!initialized) return noReply ? null : err(replyId, -32002, "Server not initialized.");
        return noReply
          ? null
          : ok(replyId, {
              tools: MCP_V1_TOOLS.map((name) => ({
                name,
                description: MCP_TOOL_SCHEMAS[name].description,
                inputSchema: {
                  type: "object",
                  properties: Object.fromEntries(
                    Object.entries(MCP_TOOL_SCHEMAS[name].properties).map(([key, schema]) => [
                      key,
                      { type: schema.type, description: schema.description },
                    ]),
                  ),
                  required: [...MCP_TOOL_PARAMS[name].required],
                },
              })),
            });
      }
      case "tools/call": {
        if (!initialized) return noReply ? null : err(replyId, -32002, "Server not initialized.");
        if (noReply) return null;
        const args =
          typeof params === "object" && params !== null
            ? (params as { name?: unknown; arguments?: unknown })
            : {};
        if (typeof args.name !== "string" || !isMcpTool(args.name)) {
          return err(replyId, -32602, `Unknown tool "${String(args.name ?? "")}".`);
        }
        let response: McpPipeResponse;
        try {
          response = await roundTrip(
            args.name,
            typeof args.arguments === "object" && args.arguments !== null ? args.arguments : {},
            clientId,
          );
        } catch {
          return err(replyId, -32001, `App is not running (${MCP_APP_NOT_RUNNING}): open takenotes first.`);
        }
        if (!response.ok) {
          return ok(replyId, {
            content: [{ type: "text", text: `${response.error.code}: ${response.error.message}` }],
            isError: true,
          });
        }
        return ok(replyId, { content: [{ type: "text", text: JSON.stringify(response.result) }] });
      }
      default:
        return noReply ? null : err(replyId, -32601, `Method not found: ${method}.`);
    }
  }

  return {
    get clientId() {
      return clientId;
    },
    handle,
  };
}

/** Split a stdin chunk stream into newline-delimited JSON texts.
 * Unparseable lines are reported via `onParseError`, never thrown. */
export function createLineSplitter(onLine: (text: string) => void, onParseError: () => void): {
  push(chunk: string): void;
} {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer += chunk;
      for (;;) {
        const nl = buffer.indexOf("\n");
        if (nl < 0) {
          if (buffer.length > 16 * 1024 * 1024) {
            buffer = "";
            onParseError();
          }
          return;
        }
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          JSON.parse(line);
        } catch {
          onParseError();
          continue;
        }
        onLine(line);
      }
    },
  };
}
