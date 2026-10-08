import { describe, expect, it } from "vitest";
import {
  createLineSplitter,
  createMcpSession,
  MCP_SERVER_NAME,
  type McpRoundTrip,
} from "../../tools/mcp-sidecar/src/session";
import { MCP_V1_TOOLS } from "@takenotes/core/mcp/tools";
import { MCP_APP_NOT_RUNNING, mcpSocketPath } from "@takenotes/core/mcp/transport";

function sessionWith(roundTrip: McpRoundTrip) {
  return createMcpSession(roundTrip);
}

async function init(session: ReturnType<typeof createMcpSession>, name = "claude-code") {
  const reply = await session.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { clientInfo: { name } },
  });
  expect(reply?.result).toBeDefined();
  expect(session.clientId).toBe(name);
}

describe("mcp sidecar session", () => {
  it("initialize captures the client name; tools/list exposes all 16", async () => {
    const session = sessionWith(async () => ({ requestId: "x", ok: true, result: {} }));
    await init(session);
    const list = await session.handle({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const tools = (list?.result as { tools: { name: string; inputSchema: { required: string[] } }[] }).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_V1_TOOLS].sort());
    const update = tools.find((t) => t.name === "note_update")!;
    expect(update.inputSchema.required).toEqual(["workspaceId", "path", "content", "expectedRevision"]);
  });

  it("tools/call forwards clientId and wraps ok/error idiomatically", async () => {
    const seen: { tool: string; clientId: string }[] = [];
    const session = sessionWith(async (tool, _params, clientId) => {
      seen.push({ tool, clientId });
      if (tool === "note_read") return { requestId: "x", ok: true, result: { content: "hi" } };
      return { requestId: "x", ok: false, error: { code: "PERMISSION_DENIED", message: "No grant." } };
    });
    await init(session, "codex");
    const hit = await session.handle({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "note_read", arguments: { workspaceId: "w", path: "a.md" } },
    });
    expect(hit?.result).toEqual({ content: [{ type: "text", text: '{"content":"hi"}' }] });
    const denied = await session.handle({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "note_list", arguments: { workspaceId: "w" } },
    });
    expect(denied?.result).toMatchObject({ isError: true });
    expect(JSON.stringify(denied?.result)).toMatch(/PERMISSION_DENIED/);
    expect(seen).toEqual([
      { tool: "note_read", clientId: "codex" },
      { tool: "note_list", clientId: "codex" },
    ]);
  });

  it("dead pipe becomes TAKENOTES_APP_NOT_RUNNING; unknown tool/method are protocol errors", async () => {
    const session = sessionWith(async () => {
      throw new Error("ECONNREFUSED");
    });
    await init(session);
    const dead = await session.handle({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "note_list", arguments: {} },
    });
    expect(dead?.error?.code).toBe(-32001);
    expect(dead?.error?.message).toMatch(MCP_APP_NOT_RUNNING);
    const unknownTool = await session.handle({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "note_delete", arguments: {} },
    });
    expect(unknownTool?.error?.code).toBe(-32602);
    const unknownMethod = await session.handle({ jsonrpc: "2.0", id: 7, method: "sync/everything" });
    expect(unknownMethod?.error?.code).toBe(-32601);
  });

  it("notifications get no reply; calls before initialize are rejected", async () => {
    const session = sessionWith(async () => ({ requestId: "x", ok: true, result: {} }));
    expect(await session.handle({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })).toBeNull();
    const early = await session.handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(early?.error?.code).toBe(-32002);
  });

  it("line splitter assembles chunks and reports garbage without throwing", () => {
    const lines: string[] = [];
    let errors = 0;
    const splitter = createLineSplitter(
      (text) => lines.push(text),
      () => {
        errors += 1;
      },
    );
    splitter.push('{"jsonrpc":"2.0","id":1');
    splitter.push(',"method":"ping"}\n');
    splitter.push('not json\n\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    expect(lines).toHaveLength(2);
    expect(errors).toBe(1);
  });

  it("socket path is IPC-only on every platform", () => {
    expect(mcpSocketPath("win32")).toBe("\\\\.\\pipe\\takenotes-mcp");
    expect(mcpSocketPath("linux", "/run/user/1000", "/tmp", "1000")).toBe("/run/user/1000/takenotes-mcp-1000.sock");
    expect(mcpSocketPath("darwin", "", "/tmp", "app")).toBe("/tmp/takenotes-mcp-app.sock");
    expect(mcpSocketPath("linux")).not.toMatch(/:\d/);
  });
});

describe("mcp server identity", () => {
  it("names the bundle", () => {
    expect(MCP_SERVER_NAME).toBe("takenotes-mcp");
  });
});
